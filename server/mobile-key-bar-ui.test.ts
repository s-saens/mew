import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { chromium } from 'playwright-core'
import { domBrowserExecutable } from './browser-dom-executable.ts'

test('auxiliary keys share touch targets and preserve editor selection, actions and modifier state', { skip: !domBrowserExecutable(), timeout: 30_000 }, async () => {
  const root = path.resolve(import.meta.dirname, '..')
  const source = `import React from 'react';import {createRoot} from 'react-dom/client';
import {MobileKeyBar} from '${root}/packages/mobile-keys/src/MobileKeyBar.tsx';
import {setUiLocale} from '@mew/ui/i18n-core';
function Fixture(){
 const [ctrl,setCtrl]=React.useState(false),[shift,setShift]=React.useState(false),[options,setOptions]=React.useState({});
 window.configureKeys=setOptions;window.setLocale=setUiLocale;window.keyActions=[];
 const action=name=>()=>window.keyActions.push(name);
 return <><main className="p-4 text-ink"><h1>Editor</h1><textarea aria-label="Document" defaultValue="Selected document text" className="mt-4 h-48 w-full resize-none bg-transparent text-ink outline-none"/></main>
 <MobileKeyBar ctrlActive={ctrl} shiftActive={shift} onToggleCtrl={()=>setCtrl(v=>!v)} onToggleShift={()=>setShift(v=>!v)}
 onEsc={action('esc')} onTab={action('tab')} onArrow={d=>window.keyActions.push(d)}
 onComment={action('comment')} onCodeBlock={action('code')} onTable={action('table')} onUndo={action('undo')} onRedo={action('redo')} {...options}/></>
}createRoot(document.getElementById('root')).render(<Fixture/>);`
  const candidates = [source]
  const bundle = await build({ input: 'virtual:keys.tsx', write: false, platform: 'browser', logLevel: 'silent', output: { format: 'iife' },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
    plugins: [{ name: 'key-bar-fixture', resolveId(id) { if (id === 'virtual:keys.tsx') return id }, async load(id) {
      if (id === 'virtual:keys.tsx') return source
      if (id.endsWith('.tsx')) candidates.push(await fs.readFile(id, 'utf8'))
      if (id.endsWith('.css')) return { code: '', moduleType: 'js' }
    } }],
  })
  const compiler = await compile(await fs.readFile(`${root}/src/index.css`, 'utf8'), { base: `${root}/src`, onDependency() {} })
  const css = compiler.build([...new Set(candidates.join('\n').match(/[A-Za-z0-9_@!:/.[\]()%,-]+/g))])
  const chunk = bundle.output.find(item => item.type === 'chunk')!
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  try {
    for (const dark of [true, false]) {
      const page = await browser.newPage({ viewport: { width: 390, height: 700 }, hasTouch: true })
      page.setDefaultTimeout(3000)
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('http://mew-key-bar.test/**', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html class="${dark ? 'dark' : ''}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><body class="bg-surface-deep"><div id="root"></div><script>${chunk.code}</script></body></html>` }))
      await page.goto('http://mew-key-bar.test/')
      const bar = page.locator('[data-mobile-key-bar]')
      await bar.waitFor()
      if (process.env.MEW_KEYBAR_SCREENSHOTS) {
        await fs.mkdir(process.env.MEW_KEYBAR_SCREENSHOTS, { recursive: true })
        await page.screenshot({ path: path.join(process.env.MEW_KEYBAR_SCREENSHOTS, `keys-${dark ? 'dark' : 'light'}.png`) })
      }
      const buttons = bar.getByRole('button')
      assert.equal(await buttons.count(), 13)
      const sizes = await buttons.evaluateAll(els => els.map(el => ({ width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height })))
      assert.ok(sizes.every(size => size.height >= 32 && size.width >= 24), 'all keys have consistent, usable touch targets')
      assert.ok(await bar.evaluate(el => el.scrollWidth <= el.clientWidth), 'all Hotview actions fit at 390px')
      const input = page.getByRole('textbox')
      await input.focus()
      await input.evaluate(el => (el as unknown as { setSelectionRange: (start: number, end: number) => void }).setSelectionRange(0, 8))
      const ctrl = bar.getByRole('button', { name: 'Ctrl', exact: true })
      await ctrl.tap()
      assert.equal(await ctrl.getAttribute('aria-pressed'), 'true')
      const shift = bar.getByRole('button', { name: 'Shift', exact: true })
      await shift.tap()
      assert.equal(await shift.getAttribute('aria-pressed'), 'true')
      if (process.env.MEW_KEYBAR_SCREENSHOTS) await page.screenshot({ path: path.join(process.env.MEW_KEYBAR_SCREENSHOTS, `keys-${dark ? 'dark' : 'light'}-active.png`) })
      await ctrl.tap()
      assert.equal(await ctrl.getAttribute('aria-pressed'), 'false')
      for (const index of [0, 1, 4, 5, 6, 7, 8, 9, 10, 11, 12]) await buttons.nth(index).tap()
      assert.deepEqual(await page.evaluate('window.keyActions'), ['esc', 'tab', 'left', 'up', 'down', 'right', 'comment', 'code', 'table', 'undo', 'redo'])
      assert.deepEqual(await input.evaluate(el => {
        const selection = el as unknown as { selectionStart: number; selectionEnd: number }
        return { focused: el === el.ownerDocument.activeElement, start: selection.selectionStart, end: selection.selectionEnd }
      }), { focused: true, start: 0, end: 8 })
      await ctrl.focus()
      await page.keyboard.press('Space')
      assert.equal(await ctrl.getAttribute('aria-pressed'), 'true', 'keyboard activation remains available')
      assert.equal(await ctrl.evaluate(el => el.ownerDocument.defaultView!.getComputedStyle(el).outlineStyle !== 'none'), true, 'keyboard focus is visible')
      for (const width of [320, 767]) {
        await page.setViewportSize({ width, height: 700 })
        assert.ok(await bar.evaluate(el => el.getBoundingClientRect().right <= el.ownerDocument.defaultView!.innerWidth), 'bar stays within viewport')
        assert.ok(await bar.evaluate(el => el.scrollWidth <= el.clientWidth), 'all Hotview actions remain visible on narrow screens')
        await buttons.last().scrollIntoViewIfNeeded()
        await buttons.last().tap()
        if (process.env.MEW_KEYBAR_SCREENSHOTS) await page.screenshot({ path: path.join(process.env.MEW_KEYBAR_SCREENSHOTS, `keys-${dark ? 'dark' : 'light'}-${width}.png`) })
      }
      await page.setViewportSize({ width: 390, height: 700 })
      await page.evaluate('window.setLocale("en")')
      await bar.getByRole('button', { name: 'Redo', exact: true }).waitFor()
      assert.equal(await bar.getByRole('button', { name: 'Redo', exact: true }).getAttribute('data-tip'), 'Redo')
      await bar.getByRole('button', { name: 'Redo', exact: true }).dispatchEvent('pointerover', { pointerType: 'mouse' })
      const tip = page.getByRole('tooltip')
      await tip.waitFor()
      assert.equal(await tip.textContent(), 'Redo')
      assert.ok((await tip.boundingBox())!.y + (await tip.boundingBox())!.height <= (await bar.boundingBox())!.y, 'tooltip opens above the bottom bar')
      await bar.getByRole('button', { name: 'Redo', exact: true }).tap()
      await tip.waitFor({ state: 'hidden' })
      await page.evaluate('window.configureKeys({onComment:undefined,onCodeBlock:undefined,onTable:undefined,onUndo:undefined,onRedo:undefined})')
      await page.waitForFunction('document.querySelectorAll("[data-mobile-key-bar] button").length===8')
      await page.setViewportSize({ width: 320, height: 700 })
      await page.evaluate('window.configureKeys({placement:"flow",stretch:true,onComment:undefined,onCodeBlock:undefined,onTable:undefined,onUndo:undefined,onRedo:undefined,extraKeys:[{label:"Home",onClick:()=>window.keyActions.push("home")},{label:"End",onClick:()=>{}},{label:"^C",onClick:()=>{}}]})')
      await bar.getByRole('button', { name: 'Home', exact: true }).tap()
      assert.equal(await bar.evaluate(el => el.ownerDocument.defaultView!.getComputedStyle(el).position), 'relative')
      assert.equal(await page.evaluate('window.keyActions.at(-1)'), 'home')
      assert.equal(await buttons.count(), 11)
      assert.ok(await buttons.evaluateAll(els => Math.max(...els.map(el => el.getBoundingClientRect().width)) - Math.min(...els.map(el => el.getBoundingClientRect().width)) < 1), 'terminal stretch keys retain equal widths')
      assert.deepEqual(errors, [])
      await page.close()
    }
  } finally { await browser.close() }
})
