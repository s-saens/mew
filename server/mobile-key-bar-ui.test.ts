import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { chromium } from 'playwright-core'
import { domBrowserExecutable } from './browser-dom-executable.ts'

function colorAlpha(color: string) {
  if (color === 'transparent') return 0
  const slash = color.match(/\/\s*([\d.]+)(%)?\s*\)$/)
  if (slash) return Number(slash[1]) / (slash[2] ? 100 : 1)
  const rgba = color.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)$/)
  return rgba ? Number(rgba[1]) : 1
}

test('floating editor keys keep an inverted-T arrow cluster, touch targets, selection, actions and modifiers', { skip: !domBrowserExecutable(), timeout: 30_000 }, async () => {
  const root = path.resolve(import.meta.dirname, '..')
  const source = `import React from 'react';import {createRoot} from 'react-dom/client';
import {MobileKeyBar} from '${root}/packages/mobile-keys/src/MobileKeyBar.tsx';
import {setUiLocale} from '@mew/ui/i18n-core';
setUiLocale('ko');window.keyActions=[];
function Fixture(){
 const [ctrl,setCtrl]=React.useState(false),[shift,setShift]=React.useState(false),[options,setOptions]=React.useState({});
 window.configureKeys=setOptions;window.setLocale=setUiLocale;
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
      const actionLabels = ['Esc', 'Tab', 'Ctrl', 'Shift', '선택한 곳에 댓글', '코드블럭', '표 삽입', '되돌리기', '다시 실행']
      const arrowLabels = ['↑', '←', '↓', '→']
      for (const width of [320, 360, 390, 767]) {
        await page.setViewportSize({ width, height: 700 })
        const wrapper = await bar.evaluate(el => {
          const style = el.ownerDocument.defaultView!.getComputedStyle(el)
          const box = el.getBoundingClientRect()
          return {
            left: box.left, top: box.top, right: box.right, bottom: box.bottom,
            background: style.backgroundColor, image: style.backgroundImage, shadow: style.boxShadow,
            borders: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth],
            overflowX: style.overflowX, fits: el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight,
          }
        })
        assert.ok(wrapper.left >= 0 && wrapper.right <= width, `floating keys stay inside the ${width}px viewport`)
        assert.equal(colorAlpha(wrapper.background), 0, 'the layout wrapper has no bar surface')
        assert.equal(wrapper.image, 'none')
        assert.equal(wrapper.shadow, 'none', 'elevation belongs to the individual keys')
        assert.ok(wrapper.borders.every(border => parseFloat(border) === 0), 'the layout wrapper has no enclosing border')
        assert.ok(!['auto', 'scroll'].includes(wrapper.overflowX), 'editor keys do not use a horizontal scrolling bar')
        assert.equal(wrapper.fits, true, `all Hotview actions fit without clipping at ${width}px`)
        const keys = await buttons.evaluateAll(els => els.map(el => {
          const box = el.getBoundingClientRect()
          const style = el.ownerDocument.defaultView!.getComputedStyle(el)
          return {
            label: el.getAttribute('aria-label'), left: box.left, top: box.top, right: box.right, bottom: box.bottom,
            width: box.width, height: box.height, background: style.backgroundColor, shadow: style.boxShadow,
            radii: [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius],
            blur: style.backdropFilter,
          }
        }))
        for (const key of keys) {
          assert.ok(key.height >= 32 && key.width >= 24, `${key.label} keeps a usable touch target at ${width}px`)
          assert.ok(key.left >= wrapper.left && key.right <= wrapper.right && key.top >= wrapper.top && key.bottom <= wrapper.bottom, `${key.label} fits inside the layout`)
          assert.ok(key.radii.every(radius => parseFloat(radius) >= 8), `${key.label} has rounded corners`)
          assert.ok(colorAlpha(key.background) > 0 && colorAlpha(key.background) < 1, `${key.label} has a translucent surface`)
          assert.notEqual(key.shadow, 'none', `${key.label} has its own elevation`)
          assert.match(key.blur, /blur\(/, `${key.label} blurs the surface beneath it`)
        }
        for (let index = 0; index < keys.length; index++) for (const other of keys.slice(index + 1)) {
          const key = keys[index]
          assert.ok(Math.min(key.right, other.right) - Math.max(key.left, other.left) <= 0.5 || Math.min(key.bottom, other.bottom) - Math.max(key.top, other.top) <= 0.5, `${key.label} and ${other.label} never overlap`)
        }
        assert.deepEqual(keys.slice(-4).map(key => key.label).sort(), [...arrowLabels].sort(), 'all arrow keys follow the editor actions in DOM order')
        const named = (label: string) => keys.find(key => key.label === label)!
        const up = named('↑'), left = named('←'), down = named('↓'), right = named('→')
        assert.ok(Math.abs((up.left + up.right) / 2 - (down.left + down.right) / 2) < 0.5, 'Up is centered above Down')
        assert.ok(up.bottom <= down.top && left.right <= down.left && down.right <= right.left, 'arrows form an inverted T')
        assert.ok(Math.abs(left.top - down.top) < 0.5 && Math.abs(right.top - down.top) < 0.5, 'Left, Down and Right share the lower row')
        const actions = actionLabels.map(named)
        assert.ok(actions.every(key => Math.abs(key.bottom - down.bottom) < 0.5), 'non-arrow actions remain in one bottom-aligned row')
        assert.ok(actions.every(key => key.right <= left.left), 'the arrow cluster stays at the far right')
        if (width <= 360) for (let index = 1; index < actions.length; index++) {
          assert.ok(Math.abs(actions[index].left - actions[index - 1].right - 2) < 0.5, 'narrow editor actions retain 2px gaps')
        }
        if (process.env.MEW_KEYBAR_SCREENSHOTS) await page.screenshot({ path: path.join(process.env.MEW_KEYBAR_SCREENSHOTS, `keys-${dark ? 'dark' : 'light'}-${width}.png`) })
      }
      await page.setViewportSize({ width: 390, height: 700 })
      const input = page.getByRole('textbox')
      await input.focus()
      await input.evaluate(el => (el as unknown as { setSelectionRange: (start: number, end: number) => void }).setSelectionRange(0, 8))
      const ctrl = bar.getByRole('button', { name: 'Ctrl', exact: true })
      await ctrl.tap()
      assert.equal(await ctrl.getAttribute('aria-pressed'), 'true')
      const activeBackground = await ctrl.evaluate(el => el.ownerDocument.defaultView!.getComputedStyle(el).backgroundColor)
      const shift = bar.getByRole('button', { name: 'Shift', exact: true })
      await shift.tap()
      assert.equal(await shift.getAttribute('aria-pressed'), 'true')
      if (process.env.MEW_KEYBAR_SCREENSHOTS) await page.screenshot({ path: path.join(process.env.MEW_KEYBAR_SCREENSHOTS, `keys-${dark ? 'dark' : 'light'}-active.png`) })
      await ctrl.tap()
      assert.equal(await ctrl.getAttribute('aria-pressed'), 'false')
      assert.notEqual(await ctrl.evaluate(el => el.ownerDocument.defaultView!.getComputedStyle(el).backgroundColor), activeBackground, 'latched modifiers have a distinct surface')
      for (const label of ['Esc', 'Tab', '←', '↑', '↓', '→', '선택한 곳에 댓글', '코드블럭', '표 삽입', '되돌리기', '다시 실행']) await bar.getByRole('button', { name: label, exact: true }).tap()
      assert.deepEqual(await page.evaluate('window.keyActions'), ['esc', 'tab', 'left', 'up', 'down', 'right', 'comment', 'code', 'table', 'undo', 'redo'])
      assert.deepEqual(await input.evaluate(el => {
        const selection = el as unknown as { selectionStart: number; selectionEnd: number }
        return { focused: el === el.ownerDocument.activeElement, start: selection.selectionStart, end: selection.selectionEnd }
      }), { focused: true, start: 0, end: 8 })
      await ctrl.focus()
      await page.keyboard.press('Space')
      assert.equal(await ctrl.getAttribute('aria-pressed'), 'true', 'keyboard activation remains available')
      assert.equal(await ctrl.evaluate(el => el.ownerDocument.defaultView!.getComputedStyle(el).outlineStyle !== 'none'), true, 'keyboard focus is visible')
      await page.evaluate('window.setLocale("en")')
      await bar.getByRole('button', { name: 'Redo', exact: true }).waitFor()
      assert.equal(await bar.getByRole('button', { name: 'Redo', exact: true }).getAttribute('data-tip'), 'Redo')
      await bar.getByRole('button', { name: 'Redo', exact: true }).dispatchEvent('pointerover', { pointerType: 'mouse' })
      const tip = page.getByRole('tooltip')
      await tip.waitFor()
      assert.equal(await tip.textContent(), 'Redo')
      assert.ok((await tip.boundingBox())!.y + (await tip.boundingBox())!.height <= (await bar.getByRole('button', { name: 'Redo', exact: true }).boundingBox())!.y, 'tooltip opens above its floating key')
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
      assert.deepEqual(await buttons.evaluateAll(els => els.map(el => el.getAttribute('aria-label'))), ['Esc', 'Tab', 'Ctrl', 'Shift', '←', '↑', '↓', '→', 'Home', 'End', '^C'], 'terminal flow layout preserves its key order')
      assert.ok(await buttons.evaluateAll(els => Math.max(...els.map(el => el.getBoundingClientRect().top)) - Math.min(...els.map(el => el.getBoundingClientRect().top)) < 0.5), 'terminal keys remain in one row')
      assert.deepEqual(errors, [])
      await page.close()
    }
  } finally { await browser.close() }
})
