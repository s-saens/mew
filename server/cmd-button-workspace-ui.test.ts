import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { chromium } from 'playwright-core'
import { domBrowserExecutable } from './browser-dom-executable.ts'

test('root command menus pin reads, execution, editing and ordering while only the active row owns shortcuts', { skip: !domBrowserExecutable(), timeout: 30_000 }, async t => {
  const root = path.resolve(import.meta.dirname, '..')
  const source = `
import React from 'react';import {createRoot} from 'react-dom/client';
import {I18nProvider} from '${root}/src/i18n.tsx';
import {CommandButtonMenu} from '${root}/src/components/CommandButtonMenu.tsx';
localStorage.setItem('mew:locale','ko');
createRoot(document.getElementById('root')).render(<I18nProvider>
  <CommandButtonMenu project=".workspace" workspacePath="/workspace/a" title="A 명령"/>
  <CommandButtonMenu project=".workspace" workspacePath="/workspace/b" title="B 명령" shortcutEnabled={false}/>
  <div id="project-scroll" style={{position:'fixed',top:80,bottom:8,left:12,width:300,overflowY:'auto'}}>
    <div style={{height:1100}}/>
    <CommandButtonMenu project=".workspace" workspacePath="/workspace/c" title="C 명령" shortcutEnabled={false}/>
    <div style={{height:200}}/>
  </div>
</I18nProvider>);`
  const bundle = await build({ input: 'virtual:command-scopes.tsx', write: false, platform: 'browser', onwarn(warning, warn) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning) }, output: { format: 'iife', codeSplitting: false }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } }, plugins: [{
    name: 'command-scopes-fixture',
    resolveId(id) {
      if (id === 'virtual:command-scopes.tsx') return id
      if (id === '@mew/tmux-term') return 'virtual:terminal.tsx'
      if (id.endsWith('.css')) return 'virtual:style'
    },
    load(id) {
      if (id === 'virtual:command-scopes.tsx') return source
      if (id === 'virtual:terminal.tsx') return 'export const isHiddenTmuxSession=()=>false; export function TmuxTerminal(){return <div>Terminal fixture</div>}'
      if (id === 'virtual:style') return ''
    },
  }] })
  const content = (await Promise.all(['src/components/CommandButtonMenu.tsx', 'src/components/SessionTerminalPopup.tsx'].map(file => fs.readFile(path.join(root, file), 'utf8')))).join('\n')
  const compiler = await compile(await fs.readFile(path.join(root, 'src/index.css'), 'utf8'), { base: path.join(root, 'src'), onDependency() {} })
  const css = compiler.build([...new Set((source + content).match(/[A-Za-z0-9_@:/.[\]()%,-]+/g))])
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } })
  page.setDefaultTimeout(5_000)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const requests: Array<{ method: string; workspacePath: string; name?: string }> = []
  let entries = [{ name: 'Build', command: 'echo build' }, { name: 'Test', command: 'echo test' }]
  let releaseBottom!: () => void
  const bottomResponse = new Promise<void>(resolve => { releaseBottom = resolve })
  await page.route('http://mew-command-scopes.test/**', async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method()
    if (url.pathname.startsWith('/api/cmd-buttons')) {
      const body = method === 'GET' ? undefined : request.postDataJSON()
      const workspacePath = method === 'GET' ? url.searchParams.get('workspacePath')! : body.workspacePath
      assert.equal(method === 'GET' ? url.searchParams.get('project') : body.project, '.workspace')
      requests.push({ method, workspacePath, ...(body?.name ? { name: body.name } : {}) })
      if (workspacePath === '/workspace/c') {
        await bottomResponse
        return route.fulfill({ json: { buttons: Array.from({ length: 20 }, (_, index) => ({ name: `Bottom ${index}`, command: 'echo bottom', session: `bottom-${index}`, running: false })) } })
      }
      if (method === 'PUT') entries = body.buttons
      if (url.pathname.endsWith('/run')) return route.fulfill({ json: { ok: true, session: 'fixture' } })
      return route.fulfill({ json: { buttons: entries.map(button => ({ ...button, session: `${workspacePath}:${button.name}`, running: false })) } })
    }
    return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="ko"><meta charset="utf-8"><style>${css}body{margin:12px}button{color:inherit}</style><div id="root"></div><script>${bundle.output.find(item => item.type === 'chunk')!.code}</script></html>` })
  })
  await page.goto('http://mew-command-scopes.test/')
  const active = page.getByRole('button', { name: 'A 명령', exact: true }), inactive = page.getByRole('button', { name: 'B 명령', exact: true })
  assert.equal(await active.getAttribute('aria-keyshortcuts'), 'Alt+R Control+E')
  assert.equal(await inactive.getAttribute('aria-keyshortcuts'), null)
  await page.keyboard.press('Alt+r')
  const menu = page.locator('[data-command-menu]')
  await menu.getByRole('button', { name: 'Build', exact: true }).waitFor()
  assert.equal(await active.getAttribute('aria-expanded'), 'true')
  assert.equal(await inactive.getAttribute('aria-expanded'), 'false')
  assert.ok(requests.every(request => request.workspacePath === '/workspace/a'))
  await page.keyboard.press('Escape')
  await menu.waitFor({ state: 'hidden' })

  await inactive.click()
  await menu.getByRole('button', { name: 'Build', exact: true }).waitFor()
  assert.equal(requests.at(-1)?.workspacePath, '/workspace/b')
  await Promise.all([
    page.waitForResponse(response => response.request().method() === 'POST'),
    menu.getByRole('button', { name: 'Build 실행', exact: true }).click(),
  ])
  assert.deepEqual(requests.find(request => request.method === 'POST'), { method: 'POST', workspacePath: '/workspace/b', name: 'Build' })
  await menu.locator('[data-command-drag-handle]').first().focus()
  await Promise.all([
    page.waitForResponse(response => response.request().method() === 'PUT'),
    page.keyboard.press('ArrowDown'),
  ])
  assert.equal(requests.find(request => request.method === 'PUT')?.workspacePath, '/workspace/b')
  assert.deepEqual(entries.map(button => button.name), ['Test', 'Build'])

  await menu.getByRole('button', { name: '명령 추가', exact: true }).click()
  const editor = page.getByRole('dialog', { name: '명령 추가', exact: true })
  await editor.waitFor()
  assert.match(await editor.textContent() ?? '', /실행 폴더: \/workspace\/b/)
  await editor.getByPlaceholder('빌드', { exact: true }).fill('Preview')
  await editor.getByPlaceholder('npm run build', { exact: true }).fill('echo preview')
  await editor.getByRole('button', { name: '저장', exact: true }).click()
  await editor.waitFor({ state: 'hidden' })
  assert.equal(requests.filter(request => request.method === 'PUT').at(-1)?.workspacePath, '/workspace/b')
  assert.equal(entries.at(-1)?.name, 'Preview')

  await inactive.click()
  await menu.getByRole('button', { name: 'Preview 터미널 세션', exact: true }).click()
  const popup = page.getByRole('dialog', { name: 'Preview', exact: true })
  await popup.getByRole('button', { name: '실행', exact: true }).click()
  await popup.getByText('Terminal fixture', { exact: true }).waitFor()
  assert.deepEqual(requests.filter(request => request.method === 'POST').at(-1), { method: 'POST', workspacePath: '/workspace/b', name: 'Preview' })
  await popup.getByRole('button', { name: '닫기', exact: true }).click()
  await page.keyboard.press('Control+e')
  await menu.getByRole('button', { name: 'Preview', exact: true }).waitFor()
  assert.equal(await active.getAttribute('aria-expanded'), 'true')
  assert.equal(await inactive.getAttribute('aria-expanded'), 'false')
  assert.equal(requests.at(-1)?.workspacePath, '/workspace/a')
  await page.keyboard.press('Escape')
  await menu.waitFor({ state: 'hidden' })

  const bottomTrigger = page.getByRole('button', { name: 'C 명령', exact: true })
  await page.locator('#project-scroll').evaluate(el => {
    const button = el.querySelector('button')!
    el.scrollTop = button.offsetTop + button.offsetHeight - el.clientHeight + 2
  })
  await bottomTrigger.click()
  await menu.getByText('불러오는 중…', { exact: true }).waitFor()
  const loadingBox = await menu.boundingBox(), triggerBox = await bottomTrigger.boundingBox()
  assert.ok(loadingBox && triggerBox)
  assert.ok(loadingBox.y >= 8 && loadingBox.y + loadingBox.height <= triggerBox.y, 'the bottom-row loading menu flips above its trigger')
  releaseBottom()
  await menu.getByRole('button', { name: 'Bottom 0', exact: true }).waitFor()
  const settleLayout = () => menu.evaluate(el => new Promise<void>(resolve => {
    const view = el.ownerDocument.defaultView!
    view.requestAnimationFrame(() => view.requestAnimationFrame(() => resolve()))
  }))
  await settleLayout()
  const loadedBox = await menu.boundingBox()
  assert.ok(loadedBox && loadedBox.height > loadingBox.height)
  assert.ok(loadedBox.y >= 8 && loadedBox.y + loadedBox.height <= triggerBox.y, 'asynchronous command loading keeps the expanded menu above the row')
  assert.ok(loadedBox.y + loadedBox.height <= 792)
  await page.locator('#project-scroll').evaluate(el => { el.scrollTop += 60 })
  await settleLayout()
  const scrolledBox = await menu.boundingBox()
  assert.ok(scrolledBox && Math.abs(scrolledBox.y - loadedBox.y + 60) < 1, 'sidebar scrolling moves the anchored menu with its row')
  await page.setViewportSize({ width: 390, height: 500 })
  await bottomTrigger.scrollIntoViewIfNeeded()
  await settleLayout()
  const narrowBox = await menu.boundingBox()
  assert.ok(narrowBox && narrowBox.x >= 8 && narrowBox.x + narrowBox.width <= 382)
  assert.ok(narrowBox.y >= 8 && narrowBox.y + narrowBox.height <= 492, 'viewport resizing clamps the menu within the visible screen')
  assert.deepEqual(errors, [])
})
