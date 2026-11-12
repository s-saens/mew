import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { connectTestBrowser } from './test-browser.ts'

test('command menu executes and reorders commands at compact widths', { timeout: 60_000 }, async t => {
  const root = path.resolve(import.meta.dirname, '..')
  const source = `
import React from 'react';import {createRoot} from 'react-dom/client';
import {I18nProvider} from '${root}/src/i18n.tsx';
import {CommandButtonMenu} from '${root}/src/components/CommandButtonMenu.tsx';
import {BrowserContext} from '${root}/src/workspace/workspace-browser-context.ts';
localStorage.setItem('mew:locale','ko');window.opened=[];window.browserRequests=[];
window.addEventListener('mew:open-local-browser',event=>window.browserRequests.push(event.detail.url));
window.open=(url,target,features)=>{window.opened.push({url,target,features});return null};
function Fixture(){const [enabled,setEnabled]=React.useState(true);return <BrowserContext.Provider value={enabled ? url=>window.browserRequests.push(url) : null}><I18nProvider><button onClick={()=>setEnabled(!enabled)}>Browser access</button><CommandButtonMenu project=".workspace" title="명령 목록"/></I18nProvider></BrowserContext.Provider>}
createRoot(document.getElementById('root')).render(<Fixture/>);`
  const bundle = await build({ input: 'virtual:commands.tsx', write: false, platform: 'browser', onwarn(warning, warn) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning) }, output: { format: 'iife' }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } }, plugins: [{
    name: 'fixture', resolveId(id) { if (id === 'virtual:commands.tsx') return id; if (id.endsWith('.css')) return 'virtual:style' },
    load(id) { if (id === 'virtual:commands.tsx') return source; if (id === 'virtual:style') return '' },
  }] })
  const content = await fs.readFile(path.join(root, 'src/components/CommandButtonMenu.tsx'), 'utf8')
  const compiler = await compile(await fs.readFile(path.join(root, 'src/index.css'), 'utf8'), { base: path.join(root, 'src'), onDependency() {} })
  const css = compiler.build([...new Set((source + content).match(/[A-Za-z0-9_@:/.[\]()%,-]+/g))])
  const browser = await connectTestBrowser()
  t.after(() => browser.close())
  for (const width of [1100, 390, 320]) for (const dark of [false, true]) {
    const page = await browser.newPage({ viewport: { width, height: 700 }, hasTouch: width <= 390 })
    page.setDefaultTimeout(5_000)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    let running = false, ports: number[] = [], runs = 0, stops = 0, writes = 0, failSave = false
    let releaseStop: (() => void) | undefined
    const runNames: string[] = []
    let entries = [
      { name: '개발 서버 이름이 길어도 동작', command: 'npm run dev', oneShot: false, session: 'mewcmd-dev' },
      { name: '종료된 서버', command: 'echo http://localhost:4444', oneShot: true, session: 'mewcmd-stopped' },
      { name: '이전 서버', command: 'npm test', oneShot: false, session: 'mewcmd-old' },
    ]
    const states = () => entries.map(button => ({ ...button, running: button.session === 'mewcmd-dev' ? running : button.session === 'mewcmd-old',
      ports: button.session === 'mewcmd-dev' ? ports : button.session === 'mewcmd-stopped' ? [4444] : undefined,
      previewUrls: button.session === 'mewcmd-dev' && running ? ['http://localhost:3333/path', 'http://localhost:5555/', 'http://localhost:3333/path', 'https://example.com/', 'javascript:alert(1)', 'http://localhost:3333/?token=secret'] : button.session === 'mewcmd-stopped' ? ['http://localhost:4444/'] : undefined }))
    await page.route('http://mew-command.test/**', async route => {
      const url = new URL(route.request().url())
      if (url.pathname === '/api/cmd-buttons/run') {
        runNames.push(route.request().postDataJSON().name)
        runs++; running = true; ports = [3333, 5555, 12345, 65535]
        return route.fulfill({ json: { ok: true, session: 'mewcmd-dev' } })
      }
      if (url.pathname === '/api/tmux/sessions/mewcmd-dev' && route.request().method() === 'DELETE') {
        stops++; running = false; ports = []
        await new Promise<void>(resolve => { releaseStop = resolve })
        return route.fulfill({ json: { ok: true } })
      }
      if (url.pathname === '/api/cmd-buttons') {
        if (route.request().method() === 'PUT') {
          writes++
          if (failSave) { failSave = false; return route.fulfill({ status: 500, json: { error: 'Order save failed' } }) }
          await new Promise(resolve => setTimeout(resolve, 80))
          const next = route.request().postDataJSON().buttons as typeof entries
          entries = next.map(button => ({ ...entries.find(entry => entry.name === button.name)!, ...button }))
        }
        return route.fulfill({ json: { buttons: states() } })
      }
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="ko" class="${dark ? 'dark' : ''}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}
      :root{--color-surface:${dark ? '#14151a' : '#fff'};--color-surface-solid:var(--color-surface);--color-surface-raised:${dark ? '#202228' : '#f8f8fa'};--color-surface-raised-solid:var(--color-surface-raised);--color-surface-hover:${dark ? '#30343e' : '#e4e7ef'};--color-surface-hover-solid:var(--color-surface-hover);--color-ink:${dark ? '#f4f4f6' : '#202128'};--color-ink-muted:${dark ? '#bbc0cd' : '#5b6170'};--color-accent:${dark ? '#a0baff' : '#234db3'};--color-accent-strong:var(--color-accent);--color-edge:#707789;--color-edge-bright:#707789;--color-danger-strong:${dark ? '#ffacac' : '#a31616'}}
      body{background:var(--color-surface);color:var(--color-ink);font:14px sans-serif;margin:0;padding:8px}button{color:inherit}
      </style><div id="root"></div><script>${bundle.output.find(item => item.type === 'chunk')!.code}</script></html>` })
    })
    await page.goto('http://mew-command.test/')
    await page.getByRole('button', { name: '명령 목록', exact: true }).waitFor()
    await page.keyboard.press('Alt+r')
    const menu = page.locator('[data-cmd-overlay]'), row = menu.locator('[data-command-name]').first()
    const command = row.getByRole('button', { name: '개발 서버 이름이 길어도 동작', exact: true })
    await command.waitFor()
    assert.equal(await command.evaluate(el => el === el.ownerDocument.activeElement), true)
    for (const name of ['배포', '빌드', '결과·출시']) {
      await page.keyboard.press('ArrowUp')
      assert.equal(await menu.getByRole('button', { name, exact: true }).evaluate(el => el === el.ownerDocument.activeElement), true)
    }
    await page.keyboard.press('Control+e')
    assert.equal(await command.evaluate(el => el === el.ownerDocument.activeElement), true)
    assert.deepEqual(await menu.locator('kbd').allTextContents(), ['1', '2', '3'])
    assert.equal(await command.getAttribute('aria-keyshortcuts'), '1')
    assert.equal(await menu.locator('.mew-action-menu-port').count(), 0)
    await page.keyboard.press('1')
    await page.waitForTimeout(150)
    assert.equal(runs, 1)
    assert.equal(await menu.locator('.mew-action-menu-port').count(), 0, 'legacy port data does not create preview buttons')
    const preview = menu.getByRole('button', { name: '웹 미리보기 · 개발 서버 이름이 길어도 동작 · http://localhost:3333/path', exact: true })
    await preview.waitFor()
    assert.equal(await menu.getByText('찾은 서버', { exact: true }).count(), 1)
    assert.equal(await menu.locator('[data-command-preview]').count(), 2, 'deduplicate addresses and reject untrusted URLs')
    await preview.focus()
    assert.equal(await preview.evaluate(el => el === el.ownerDocument.activeElement), true, 'keyboard can focus the found server')
    await page.keyboard.press('Control+e')
    assert.equal(await command.evaluate(el => el === el.ownerDocument.activeElement), true, 'preview links do not change command shortcuts')
    assert.equal(await menu.getByRole('button', { name: /종료된 서버.*localhost:4444/ }).count(), 0, 'stopped commands do not expose stale addresses')
    await preview.click()
    assert.deepEqual(await page.locator('#root').evaluate(el => (el.ownerDocument.defaultView as unknown as { browserRequests: string[] }).browserRequests), ['http://localhost:3333/path'])
    assert.equal(runs, 1, 'opening a preview does not rerun the command')
    await menu.waitFor({ state: 'hidden' })
    await page.getByRole('button', { name: 'Browser access', exact: true }).click()
    await page.keyboard.press('Alt+r')
    await preview.waitFor()
    assert.equal(await preview.isDisabled(), true, 'preview requires Browser access')
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Browser access', exact: true }).click()
    await page.keyboard.press('Alt+r')
    await preview.waitFor()
    assert.equal(await row.getAttribute('data-active'), 'true')
    const bounds = await menu.boundingBox(); assert.ok(bounds)
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width)
    assert.equal(await menu.evaluate(el => el.scrollWidth <= el.clientWidth), true)
    if (process.env.MEW_COMMAND_PORT_SCREENSHOTS) {
      await fs.mkdir(process.env.MEW_COMMAND_PORT_SCREENSHOTS, { recursive: true })
      await menu.screenshot({ path: path.join(process.env.MEW_COMMAND_PORT_SCREENSHOTS, `commands-${width}-${dark ? 'dark' : 'light'}.png`) })
    }
    if (width === 1100) {
      await page.setViewportSize({ width: 240, height: 700 })
      const narrow = await menu.boundingBox(); assert.ok(narrow)
      assert.ok(Math.abs(narrow.width - 216) < 1, 'resize respects 90vw below the old minimum width')
      assert.ok(narrow.x >= 0 && narrow.x + narrow.width <= 240)
    }
    await row.getByRole('button', { name: '개발 서버 이름이 길어도 동작 정지', exact: true }).click()
    assert.equal(stops, 1)
    assert.equal(await menu.locator('.mew-action-menu-port').count(), 0)
    await page.keyboard.press('Escape')
    await menu.waitFor({ state: 'hidden' })
    await page.keyboard.press('Alt+r')
    await command.waitFor()
    assert.equal(await command.isDisabled(), true, 'reopening preserves the pending stop request')
    assert.ok(releaseStop)
    releaseStop()
    const commandElement = await command.elementHandle()
    assert.ok(commandElement)
    await page.waitForFunction(element => element === element.ownerDocument.activeElement, commandElement)
    await commandElement.dispose()
    assert.equal(await command.evaluate(el => el === el.ownerDocument.activeElement), true)
    await menu.getByRole('button', { name: '명령 추가', exact: true }).focus()
    await page.keyboard.press('Control+e')
    assert.equal(await command.evaluate(el => el === el.ownerDocument.activeElement), true)
    assert.equal(runs, 1); assert.equal(stops, 1)
    if (width === 1100) await page.setViewportSize({ width, height: 700 })
    const commandOrder = () => menu.locator('[data-command-name]').evaluateAll(elements => elements.map(el => el.getAttribute('data-command-name')))
    const handle = menu.locator('[data-command-drag-handle]').first()
    await handle.focus()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowUp')
    await page.waitForResponse(response => response.request().method() === 'PUT' && response.url().includes('/api/cmd-buttons'))
    await page.waitForTimeout(150)
    assert.deepEqual(await commandOrder(), ['종료된 서버', '개발 서버 이름이 길어도 동작', '이전 서버'])
    assert.deepEqual(entries.map(button => button.name), await commandOrder(), 'rapid moves are saved in order')
    assert.equal(entries[0].oneShot, true, 'reordering preserves command options')
    assert.deepEqual(await menu.locator('kbd').allTextContents(), ['1', '2', '3'])
    const from = await menu.locator('[data-command-drag-handle]').last().boundingBox()
    const to = await menu.locator('[data-command-name]').first().boundingBox()
    assert.ok(from && to)
    if (width <= 390) {
      const cdp = await page.context().newCDPSession(page)
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x + from.width / 2, y: from.y + from.height / 2, id: 3 }] })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + from.width / 2, y: to.y + 2, id: 3 }] })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await cdp.detach()
    } else {
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
      await page.mouse.down()
      await page.mouse.move(from.x + from.width / 2, to.y + 2, { steps: 8 })
      await page.mouse.up()
    }
    await page.waitForTimeout(150)
    assert.deepEqual(await commandOrder(), ['이전 서버', '종료된 서버', '개발 서버 이름이 길어도 동작'])
    assert.deepEqual(entries.map(button => button.name), await commandOrder(), 'dragged order persists')
    assert.equal(runs, 1, 'handles never execute commands')
    const previousWrites = writes
    failSave = true
    await menu.locator('[data-command-drag-handle]').first().focus()
    await page.keyboard.press('ArrowDown')
    await menu.getByText('Order save failed', { exact: true }).waitFor()
    assert.equal(writes, previousWrites + 1)
    assert.deepEqual(await commandOrder(), entries.map(button => button.name), 'failed saves restore the last saved order')
    await page.keyboard.press('1')
    await page.waitForTimeout(150)
    assert.equal(runNames.at(-1), '이전 서버', 'numeric selection follows the reordered list')
    await page.keyboard.press('Escape')
    await page.keyboard.press('Alt+r')
    await menu.locator('[data-command-choice]').first().waitFor()
    assert.deepEqual(await commandOrder(), entries.map(button => button.name))
    assert.deepEqual(errors, [])
    await page.close()
  }
})
