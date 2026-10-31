import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { chromium } from 'playwright-core'
import { domBrowserExecutable } from './browser-dom-executable.ts'

const root = path.resolve(import.meta.dirname, '..')

test('project picker preserves path drafts, validates the selected folder and selects created projects', { skip: !domBrowserExecutable(), timeout: 45_000 }, async () => {
  const source = `import React,{useState} from '${root}/node_modules/react/index.js';
import {createRoot} from '${root}/node_modules/react-dom/client.js';
import {OpenProjectDialog} from '${root}/src/components/OpenProjectDialog.tsx';
import {I18nProvider} from '${root}/src/i18n.tsx';
localStorage.setItem('mew:locale','ko');
function Fixture(){const [open,setOpen]=useState(false);const [opened,setOpened]=useState('');return <><button onClick={()=>{setOpened('');setOpen(true)}}>프로젝트 추가</button><output aria-label='열린 프로젝트'>{opened}</output>{open&&<OpenProjectDialog basePath='/home/test' onClose={()=>setOpen(false)} onOpen={p=>{setOpened(p);setOpen(false)}}/>}</>}
createRoot(document.getElementById('root')).render(<I18nProvider><Fixture/></I18nProvider>);`
  const bundle = await build({ input: 'virtual:project-picker.tsx', write: false, platform: 'browser', onLog(level, log, handler) { if (log.code !== 'MODULE_LEVEL_DIRECTIVE') handler(level, log) }, output: { format: 'iife' }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } }, plugins: [{
    name: 'project-picker-fixture',
    resolveId(id) { if (id === 'virtual:project-picker.tsx') return id; if (id.endsWith('.css')) return 'virtual:style' },
    load(id) { if (id === 'virtual:project-picker.tsx') return source; if (id === 'virtual:style') return '' },
  }] })
  const chunk = bundle.output.find(item => item.type === 'chunk')!
  const files = ['src/components/OpenProjectDialog.tsx', 'src/components/file-browser.tsx', 'src/components/file-browser-path.tsx', 'src/components/file-browser-favorites.tsx', 'src/components/file-action-menu.tsx', 'src/hooks/use-external-file-actions.tsx', 'packages/ui/src/dialog-frame.tsx', 'packages/ui/src/ConfirmDialog.tsx', 'packages/ui/src/prompt-dialog.tsx']
  const content = (await Promise.all(files.map(file => fs.readFile(path.join(root, file), 'utf8')))).join('\n')
  const compiler = await compile(await fs.readFile(`${root}/src/index.css`, 'utf8'), { base: `${root}/src`, onDependency() {} })
  const css = compiler.build([...new Set((source + content).match(/[A-Za-z0-9_@!:/.[\]()%,-]+/g))])
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  let releaseInitial: (() => void) | undefined
  let releaseSelected: (() => void) | undefined
  try {
    const context = await browser.newContext({ viewport: { width: 1100, height: 800 } })
    const browsed: string[] = []
    const mutations: { endpoint: string; body: Record<string, string> }[] = []
    let holdInitial = true
    const selectedPath = '/home/test/typed-before-load'
    const createdPath = '/home/test/new-project'
    const clonedPath = `${createdPath}/cloned`
    await context.route('http://mew-project-picker.test/**', async route => {
      const url = new URL(route.request().url())
      if (url.pathname === '/app.js') return route.fulfill({ contentType: 'text/javascript', body: chunk.code })
      if (url.pathname === '/api/fs/favorites') return route.fulfill({ json: { folders: [{ path: '/home/test', name: 'test', kind: 'home' }] } })
      if (url.pathname === '/api/agent-cwd/suggestions') return route.fulfill({ json: { dirs: [] } })
      if (url.pathname === '/api/fs/entries') {
        const current = url.searchParams.get('path') || '/home/test'
        browsed.push(current)
        if (holdInitial) { holdInitial = false; await new Promise<void>(resolve => { releaseInitial = resolve }) }
        if (current === selectedPath) await new Promise<void>(resolve => { releaseSelected = resolve })
        const entries = current === '/home/test'
          ? ['mew', 'research', 'a-very-long-project-folder-name-that-must-stay-inside-the-dialog', ...Array.from({ length: 20 }, (_, index) => `project-${index + 1}`)].map(name => ({ name, path: `${current}/${name}`, type: 'dir', git: name === 'mew', size: null }))
          : []
        return route.fulfill({ json: { path: current, parent: current.slice(0, current.lastIndexOf('/')) || '/', entries } })
      }
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON()
        mutations.push({ endpoint: url.pathname, body })
        if (url.pathname === '/api/fs/folder') return route.fulfill({ json: { ok: true, path: createdPath } })
        if (url.pathname === '/api/fs/git/clone') return route.fulfill({ json: { ok: true, path: clonedPath } })
      }
      if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 404, json: { error: 'Unexpected fixture request' } })
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script src="/app.js"></script></html>` })
    })
    const page = await context.newPage()
    page.setDefaultTimeout(4_000)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto('http://mew-project-picker.test/')
    const trigger = page.getByRole('button', { name: '프로젝트 추가', exact: true })
    const dialog = page.getByRole('dialog', { name: '새 프로젝트 열기' })
    const address = dialog.getByRole('combobox', { name: '프로젝트 경로', exact: true })
    const primary = dialog.getByRole('button', { name: '이 프로젝트 열기', exact: true })
    const heading = dialog.getByRole('heading', { name: '새 프로젝트 열기', exact: true })
    const opened = page.getByLabel('열린 프로젝트', { exact: true })

    const initialRequest = page.waitForRequest(request => new URL(request.url()).pathname === '/api/fs/entries')
    await trigger.click()
    await initialRequest
    assert.equal(await heading.evaluate(el => el === el.ownerDocument.activeElement), true, 'opening the dialog focuses its title without opening the keyboard')
    await address.fill(selectedPath)
    assert.ok(releaseInitial)
    releaseInitial()
    await dialog.getByRole('button', { name: 'mew Git', exact: true }).waitFor()
    assert.equal(await address.inputValue(), selectedPath, 'a late folder listing preserves an edited path')
    const validationRequest = page.waitForRequest(request => new URL(request.url()).pathname === '/api/fs/entries' && new URL(request.url()).searchParams.get('path') === selectedPath)
    await primary.click()
    await validationRequest
    assert.equal(await opened.textContent(), '', 'the path must validate before opening a project')
    assert.equal(await dialog.getAttribute('aria-busy'), 'true')
    assert.ok(releaseSelected)
    releaseSelected()
    await dialog.waitFor({ state: 'detached' })
    assert.equal(await opened.textContent(), selectedPath, 'the primary action opens the typed folder instead of the previous listing')

    for (const width of [1100, 320]) {
      await page.setViewportSize({ width, height: 800 })
      for (const dark of [false, true]) {
        await trigger.evaluate((el, enabled) => el.ownerDocument.documentElement.classList.toggle('dark', enabled), dark)
        await trigger.click()
        await dialog.getByRole('button', { name: 'mew Git', exact: true }).waitFor()
        assert.equal(await heading.evaluate(el => el === el.ownerDocument.activeElement), true)
        assert.equal(await address.getAttribute('aria-expanded'), 'false', 'path suggestions stay closed until the user focuses the field')
        const bounds = await dialog.boundingBox()
        assert.ok(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width && bounds.y + bounds.height <= 800)
        assert.equal(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth), true, `the ${width}px dialog has no horizontal overflow`)
        assert.equal(await dialog.evaluate(el => {
          const footer = el.querySelector('footer')!
          const bounds = footer.getBoundingClientRect()
          const descendants = footer.querySelectorAll('*')
          for (let index = 0; index < descendants.length; index++) {
            if (descendants[index].getBoundingClientRect().right > bounds.right + 1) return false
          }
          return true
        }), true, 'the selected folder and primary action stay within the footer')
        const primaryBounds = await primary.boundingBox()
        assert.ok(primaryBounds && bounds && primaryBounds.x >= bounds.x && primaryBounds.y >= bounds.y && primaryBounds.x + primaryBounds.width <= bounds.x + bounds.width && primaryBounds.y + primaryBounds.height <= bounds.y + bounds.height)
        assert.equal(await primary.isEnabled(), true)
        if (dark) await page.screenshot({ path: `/tmp/mew-project-picker-${width === 1100 ? 'desktop' : 'mobile'}.png` })
        await dialog.getByRole('button', { name: '닫기', exact: true }).click()
        await dialog.waitFor({ state: 'detached' })
      }
    }

    await page.setViewportSize({ width: 1100, height: 800 })
    await trigger.click()
    await dialog.getByRole('button', { name: 'mew Git', exact: true }).waitFor()
    await dialog.getByRole('button', { name: '새 폴더', exact: true }).click()
    await dialog.getByRole('textbox', { name: '폴더 이름', exact: true }).fill('new-project')
    await dialog.getByRole('button', { name: '새 폴더', exact: true }).click()
    await address.waitFor()
    await primary.waitFor({ state: 'visible' })
    assert.equal(await address.inputValue(), createdPath)
    assert.equal(await primary.isEnabled(), true)
    assert.equal(browsed.at(-1), createdPath, 'folder creation navigates to the API result path')
    assert.equal(await dialog.locator('footer').getByText(createdPath, { exact: true }).count(), 1)
    assert.deepEqual(mutations.at(-1), { endpoint: '/api/fs/folder', body: { parent: '/home/test', name: 'new-project' } })
    const requestsBeforeBlank = browsed.length
    await address.fill('')
    assert.equal(await primary.isDisabled(), true, 'an empty path cannot open a different folder from the footer target')
    await primary.evaluate(el => { if ('click' in el && typeof el.click === 'function') el.click() })
    assert.equal(browsed.length, requestsBeforeBlank, 'a disabled blank-path action cannot navigate to server home')
    assert.equal(await opened.textContent(), '')
    await address.fill('../relative-project')
    assert.equal(await dialog.locator('footer').getByText('/home/test/relative-project', { exact: true }).count(), 1, 'the footer resolves the same relative path as Open')
    await address.fill(createdPath)
    await address.press('Escape')

    await dialog.getByRole('button', { name: 'Git 복제', exact: true }).click()
    await dialog.getByRole('textbox', { name: 'Git 저장소 주소', exact: true }).fill('https://github.com/team/cloned.git')
    await dialog.getByRole('button', { name: 'Git 복제', exact: true }).click()
    await address.waitFor()
    await primary.waitFor({ state: 'visible' })
    assert.equal(await address.inputValue(), clonedPath)
    assert.equal(await primary.isEnabled(), true)
    assert.equal(browsed.at(-1), clonedPath, 'cloning navigates to the API result path')
    assert.equal(await dialog.locator('footer').getByText(clonedPath, { exact: true }).count(), 1)
    assert.deepEqual(mutations.at(-1), { endpoint: '/api/fs/git/clone', body: { parent: createdPath, url: 'https://github.com/team/cloned.git', name: 'cloned' } })
    await primary.click()
    await dialog.waitFor({ state: 'detached' })
    assert.equal(await opened.textContent(), clonedPath)
    assert.deepEqual(errors, [])
  } finally {
    releaseInitial?.()
    releaseSelected?.()
    await browser.close()
  }
})
