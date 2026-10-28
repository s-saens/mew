import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { chromium } from 'playwright-core'
import { domBrowserExecutable } from './browser-dom-executable.ts'

test('command ports open local and public device previews without executing commands and stay usable at compact widths', { skip: !domBrowserExecutable(), timeout: 60_000 }, async t => {
  const root = path.resolve(import.meta.dirname, '..')
  const source = `
import React from 'react';import {createRoot} from 'react-dom/client';
import {I18nProvider} from '${root}/src/i18n.tsx';
import {CommandButtonMenu} from '${root}/src/components/CommandButtonMenu.tsx';
import {configurePortPreviewBaseUrl} from '${root}/src/utils/port-preview-url.ts';
localStorage.setItem('mew:locale','ko');window.opened=[];
window.open=(url,target,features)=>{window.opened.push({url,target,features});return null};
window.configurePortPreviewBaseUrl=configurePortPreviewBaseUrl;
createRoot(document.getElementById('root')).render(<I18nProvider><CommandButtonMenu project=".workspace" title="명령 목록"/></I18nProvider>);`
  const bundle = await build({ input: 'virtual:commands.tsx', write: false, platform: 'browser', onwarn(warning, warn) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning) }, output: { format: 'iife' }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } }, plugins: [{
    name: 'fixture', resolveId(id) { if (id === 'virtual:commands.tsx') return id; if (id.endsWith('.css')) return 'virtual:style' },
    load(id) { if (id === 'virtual:commands.tsx') return source; if (id === 'virtual:style') return '' },
  }] })
  const content = await fs.readFile(path.join(root, 'src/components/CommandButtonMenu.tsx'), 'utf8')
  const compiler = await compile(await fs.readFile(path.join(root, 'src/index.css'), 'utf8'), { base: path.join(root, 'src'), onDependency() {} })
  const css = compiler.build([...new Set((source + content).match(/[A-Za-z0-9_@:/.[\]()%,-]+/g))])
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  t.after(() => browser.close())
  for (const width of [1100, 390, 320]) for (const dark of [false, true]) {
    const page = await browser.newPage({ viewport: { width, height: 700 }, hasTouch: width <= 390 })
    page.setDefaultTimeout(5_000)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    let running = false, ports: number[] = [], runs = 0, stops = 0, writes = 0, failSave = false
    const runNames: string[] = []
    let entries = [
      { name: '개발 서버 이름이 길어도 동작', command: 'npm run dev', oneShot: false, session: 'mewcmd-dev' },
      { name: '종료된 서버', command: 'echo http://localhost:4444', oneShot: true, session: 'mewcmd-stopped' },
      { name: '이전 서버', command: 'npm test', oneShot: false, session: 'mewcmd-old' },
    ]
    const states = () => entries.map(button => ({ ...button, running: button.session === 'mewcmd-dev' ? running : button.session === 'mewcmd-old',
      ports: button.session === 'mewcmd-dev' ? ports : button.session === 'mewcmd-stopped' ? [4444] : undefined }))
    await page.route('http://mew-command.test/**', async route => {
      const url = new URL(route.request().url())
      if (url.pathname === '/api/cmd-buttons/run') {
        runNames.push(route.request().postDataJSON().name)
        runs++; running = true; ports = [3333, 5555, 12345, 65535]
        return route.fulfill({ json: { ok: true, session: 'mewcmd-dev' } })
      }
      if (url.pathname === '/api/tmux/sessions/mewcmd-dev' && route.request().method() === 'DELETE') {
        stops++; running = false; ports = []
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
    await page.keyboard.press('Alt+r')
    const menu = page.locator('[data-cmd-overlay]'), row = menu.locator('[data-command-row]').first()
    const command = row.getByRole('button', { name: '개발 서버 이름이 길어도 동작', exact: true })
    await command.waitFor()
    assert.equal(await command.evaluate(el => el === el.ownerDocument.activeElement), true)
    assert.deepEqual(await menu.locator('kbd').allTextContents(), ['1', '2', '3'])
    assert.equal(await command.getAttribute('aria-keyshortcuts'), '1')
    assert.equal(await menu.locator('.mew-action-menu-port').count(), 0)
    await page.keyboard.press('1')
    const preview = row.getByRole('button', { name: '개발 서버 이름이 길어도 동작: 포트 5555 미리보기 열기', exact: true })
    await preview.waitFor()
    assert.equal(runs, 1)
    assert.equal(await menu.locator('.mew-action-menu-port').count(), 4, 'stale ports on stopped commands and old API responses do not add buttons')
    const order = await row.locator('button').allTextContents()
    assert.deepEqual(order.slice(2, 6), ['3333', '5555', '12345', '65535'], 'the handle precedes the command and its port actions')
    assert.equal(await row.getAttribute('data-active'), 'true', 'running state highlights the row')
    const positions = await row.evaluate(el => {
      const handle = el.querySelector('[data-command-drag-handle]')!.getBoundingClientRect()
      const name = el.querySelector('[data-command-choice]')!.getBoundingClientRect()
      const hint = el.querySelector('kbd')!.getBoundingClientRect()
      const terminal = el.querySelector('button:last-of-type')!.getBoundingClientRect()
      const port = el.querySelector('.mew-action-menu-port')!.getBoundingClientRect()
      return { handleBeforeName: handle.right <= name.left, hintAfterActions: terminal.right <= hint.left, portsBelow: port.top >= name.bottom }
    })
    assert.deepEqual(positions, { handleBeforeName: true, hintAfterActions: true, portsBelow: true })
    const bounds = await menu.boundingBox(); assert.ok(bounds)
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width)
    assert.ok(Math.abs(bounds.width - Math.min(308, width * 0.9)) < 1, 'menu is 40% wider than 220px and never exceeds 90vw')
    assert.equal(await menu.evaluate(el => el.scrollWidth <= el.clientWidth), true, 'port list scrolls without widening the dropdown')
    const density = await row.evaluate(el => {
      const view = el.ownerDocument.defaultView!, name = el.querySelector('[data-command-choice]')!, port = el.querySelector('.mew-action-menu-port')!
      const text = name.querySelector('span')!, icon = el.querySelector('.mew-action-menu-icon')!
      const item = view.getComputedStyle(name), badge = view.getComputedStyle(port)
      return { font: item.fontSize, padding: item.padding, height: name.getBoundingClientRect().height,
        textWidth: text.getBoundingClientRect().width, iconWidth: icon.getBoundingClientRect().width,
        portFont: badge.fontSize, border: badge.borderTopWidth, radius: badge.borderRadius, background: badge.backgroundColor,
        portHeight: port.getBoundingClientRect().height }
    })
    assert.equal(density.font, '14px'); assert.equal(density.padding, '6px 10px')
    assert.equal(density.height, width <= 390 ? 40 : 32)
    assert.ok(density.textWidth >= 80, 'long command names retain usable width even with four ports')
    assert.equal(density.iconWidth, 32)
    assert.equal(density.portFont, '12px'); assert.equal(density.border, '1px'); assert.equal(density.radius, '4px')
    assert.notEqual(density.background, 'rgba(0, 0, 0, 0)', 'port numbers have their own visible surface')
    assert.equal(density.portHeight, width <= 390 ? 32 : 26)
    await preview.click()
    assert.deepEqual(await page.evaluate('window.opened.at(-1)'), { url: 'http://mew-command.test/5555', target: '_blank', features: 'noopener,noreferrer' })
    assert.equal(runs, 1); assert.equal(stops, 0)
    await row.getByRole('button', { name: '개발 서버 이름이 길어도 동작', exact: true }).focus()
    await page.keyboard.press('ArrowRight')
    assert.equal(await row.getByRole('button', { name: /포트 3333 미리보기 열기/ }).evaluate(el => el === el.ownerDocument.activeElement), true)
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter')
    assert.equal(await page.evaluate('window.opened.at(-1).url'), 'http://mew-command.test/5555')
    await page.evaluate("window.configurePortPreviewBaseUrl('https://mew.run/saens/windows')")
    await preview.click()
    assert.equal(await page.evaluate('window.opened.at(-1).url'), 'https://mew.run/saens/windows/5555')
    await page.evaluate('window.configurePortPreviewBaseUrl(null)')
    await preview.click()
    await menu.getByText('Mewlink 기기 주소를 확인하지 못했습니다. 페이지를 다시 열어 주세요.', { exact: true }).waitFor()
    assert.equal(await page.evaluate('window.opened.length'), 3, 'invalid remote context never opens the installed app origin')
    assert.equal(runs, 1); assert.equal(stops, 0)
    await page.evaluate('window.configurePortPreviewBaseUrl()')
    await preview.click()
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
    await preview.waitFor({ state: 'hidden' })
    assert.equal(stops, 1)
    assert.equal(await menu.locator('.mew-action-menu-port').count(), 0)
    await page.keyboard.press('Escape')
    await menu.waitFor({ state: 'hidden' })
    await page.keyboard.press('Alt+r')
    await command.waitFor()
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
