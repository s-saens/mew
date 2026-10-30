import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { chromium } from 'playwright-core'
import { domBrowserExecutable } from './browser-dom-executable.ts'

test('mobile editor keyboard button preserves selection, follows keyboard visibility, and excludes noneditable views', {
  skip: !domBrowserExecutable(), timeout: 60_000,
}, async t => {
  const repo = path.resolve(import.meta.dirname, '..')
  const source = `
import React from 'react';import {createRoot} from 'react-dom/client';
import {EditorPane} from ${JSON.stringify(path.join(repo, 'src/components/EditorPane.tsx'))};
import {I18nProvider} from ${JSON.stringify(path.join(repo, 'src/i18n.tsx'))};
import {setUiLocale} from '@mew/ui/i18n-core';
const noop=()=>{},defaults={path:'fixture.md',content:'Alpha selected text omega.',viewMode:'hotview',editable:true};
const callbacks=Object.fromEntries(['registerElement','registerTabBar','onFocus','onActivate','onPin','onCloseTab','onReorder','onOpenLink','onOpenHistory','onSetTocOpen','onOpenSidebar','onTabDragMove','onTabDrop'].map(key=>[key,noop]));
function Fixture(){const [state,setState]=React.useState(defaults);const handle=React.useRef(null);
 window.resetFixture=values=>setState({...defaults,...values});window.selectFixture=()=>handle.current?.getSelectedText();window.language=setUiLocale;
 return <div data-fixture data-value={state.content} className="flex h-dvh flex-col"><EditorPane {...callbacks}
 registerHandle={(_,value)=>handle.current=value} pane={{id:'main',tabs:[{...state,preview:false}],activePath:state.path}}
 onChangeContent={(_,content)=>setState(old=>({...old,content}))} onSetViewMode={(_,viewMode)=>setState(old=>({...old,viewMode}))}
 role="owner" authEmail="fixture@example.test" project="docs" focused tree={[]} presence={{}} canCollaborate={false}
 showSidebarButton={false} tocOpen={false} dropZone={null}/></div>;
}createRoot(document.getElementById('root')).render(<I18nProvider><Fixture/></I18nProvider>);`
  const candidates = [source], styles: string[] = []
  const bundle = await build({ input: 'virtual:mobile-editor-keyboard.tsx', write: false, platform: 'browser', output: { format: 'esm', codeSplitting: false },
    onwarn(warning, warn) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning) },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
    plugins: [{ name: 'fixture', resolveId(id) { if (id === 'virtual:mobile-editor-keyboard.tsx') return id }, async load(id) {
      if (id === 'virtual:mobile-editor-keyboard.tsx') return source
      if (id.endsWith('.tsx')) candidates.push(await fs.readFile(id, 'utf8'))
      if (id.endsWith('.css')) { styles.push(await fs.readFile(id, 'utf8')); return { code: '', moduleType: 'js' } }
    } }],
  })
  const compiler = await compile(await fs.readFile(path.join(repo, 'src/index.css'), 'utf8'), { base: path.join(repo, 'src'), onDependency() {} })
  const css = compiler.build([...new Set(candidates.join('\n').match(/[A-Za-z0-9_@!:/.[\]()%,-]+/g))]) + styles.join('\n')
  const entry = bundle.output.find(item => item.type === 'chunk' && item.isEntry)!
  assert.ok(entry.type === 'chunk')
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  t.after(() => browser.close())

  for (const [width, theme, nativeApi] of [[390, 'dark', true], [320, 'light', false], [1280, 'dark', true]] as const) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, hasTouch: width < 768 })
    page.setDefaultTimeout(5000)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(`localStorage.setItem('mew:locale','ko');localStorage.setItem('mew:ui-locale','ko');
      window.keyboardCalls=[];
      Object.defineProperty(navigator,'virtualKeyboard',{configurable:true,value:${nativeApi ? `Object.assign(new EventTarget(),{overlaysContent:false,boundingRect:new DOMRect(),show(){if(window.keyboardFailure)throw Error('Unavailable');const el=document.activeElement;window.keyboardCalls.push({active:el?.matches('.ProseMirror,.cm-content'),policy:el?.getAttribute('virtualkeyboardpolicy'),activation:navigator.userActivation.isActive})}})` : 'undefined'}});`)
    await page.route('http://mew-mobile-editor-keyboard.test/**', route => {
      const url = new URL(route.request().url())
      if (url.pathname === '/api/comments') return route.fulfill({ json: { threads: [] } })
      if (url.pathname === '/api/members') return route.fulfill({ json: { members: [] } })
      if (url.pathname.startsWith('/api/')) return route.fulfill({ json: [] })
      return route.fulfill(url.pathname === '/app.js' ? { contentType: 'text/javascript', body: entry.code }
        : { contentType: 'text/html', body: `<!doctype html><html class="${theme === 'dark' ? 'dark' : ''}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script type="module" src="/app.js"></script></html>` })
    })
    await page.goto('http://mew-mobile-editor-keyboard.test/')
    const button = page.getByRole('button', { name: '키보드 열기', exact: true })
    for (const mode of [{}, { viewMode: 'plain' }, { path: 'fixture.ts', viewMode: 'plain' }]) {
      await page.evaluate(`window.resetFixture(${JSON.stringify(mode)})`)
      const content = page.locator('.ProseMirror, .cm-content')
      await content.waitFor()
      if (width >= 768) { assert.equal(await button.count(), 0); continue }
      await button.waitFor()
      const box = (await button.boundingBox())!
      const host = (await content.locator('xpath=ancestor::div[contains(@class,"relative")][1]').boundingBox())!
      assert.equal(box.width, 44)
      assert.equal(box.height, 44)
      assert.ok(Math.abs(box.x + box.width / 2 - width / 2) <= 1, 'button is centered within the editor')
      assert.ok(box.y + box.height <= host.y + host.height, 'button stays inside the editor above its status and modifier bars')
      const appearance = await button.evaluate(el => {
        const style = el.ownerDocument.defaultView!.getComputedStyle(el)
        return { background: style.backgroundColor, radius: style.borderRadius, tip: el.getAttribute('data-tip') }
      })
      assert.match(appearance.background, /0\.7\)/, 'surface is translucent')
      assert.ok(parseFloat(appearance.radius) >= box.width / 2, 'button is circular')
      assert.equal(appearance.tip, '키보드 열기')
      await content.evaluate(el => {
        el.setAttribute('inputmode', 'none')
        el.focus()
        const doc = el.ownerDocument, node = doc.createTreeWalker(el, 4).nextNode()!
        const range = doc.createRange(); range.setStart(node, 6); range.setEnd(node, 14)
        const selection = doc.getSelection()!; selection.removeAllRanges(); selection.addRange(range)
        doc.dispatchEvent(new doc.defaultView!.Event('selectionchange'))
      })
      await page.waitForFunction('window.selectFixture() === "selected"')
      await button.tap()
      assert.equal(await content.getAttribute('inputmode'), null, 'explicit input releases touch-selection suppression')
      assert.equal(await content.evaluate(el => el === el.ownerDocument.activeElement), true)
      assert.equal(await page.evaluate('window.selectFixture()'), 'selected', 'opening the keyboard preserves the selected range')
      assert.equal(await page.locator('[data-fixture]').getAttribute('data-value'), 'Alpha selected text omega.')
      if (nativeApi) {
        assert.deepEqual(await page.evaluate('window.keyboardCalls.at(-1)'), { active: true, policy: 'manual', activation: true })
        assert.equal(await content.getAttribute('virtualkeyboardpolicy'), null, 'restores automatic keyboard policy')
        await page.evaluate('window.keyboardFailure = true')
        await button.tap()
        assert.equal(await content.evaluate(el => el === el.ownerDocument.activeElement), true, 'a rejected keyboard API request falls back to native focus')
        assert.equal(await content.getAttribute('virtualkeyboardpolicy'), null)
        await page.evaluate('window.keyboardFailure = false')
      }
      // Headless Chromium cannot open the OS keyboard; exercise its viewport signal separately.
      await content.evaluate(el => {
        const win = el.ownerDocument.defaultView!
        Object.defineProperty(win.visualViewport!, 'height', { configurable: true, value: 440 })
        win.visualViewport!.dispatchEvent(new win.Event('resize'))
      })
      await button.waitFor({ state: 'hidden' })
      await content.evaluate(el => {
        const win = el.ownerDocument.defaultView!
        Reflect.deleteProperty(win.visualViewport!, 'height')
        win.visualViewport!.dispatchEvent(new win.Event('resize'))
      })
      await button.waitFor()
      await button.tap()
      assert.equal(await page.evaluate('window.selectFixture()'), 'selected', 'reopening with the editor still focused preserves selection')
      await page.keyboard.type('typed')
      await page.waitForFunction('document.querySelector("[data-fixture]").dataset.value.includes("typed")')
      if (process.env.MEW_KEYBOARD_BUTTON_SCREENSHOT_DIR) {
        await fs.mkdir(process.env.MEW_KEYBOARD_BUTTON_SCREENSHOT_DIR, { recursive: true })
        await page.screenshot({ path: `${process.env.MEW_KEYBOARD_BUTTON_SCREENSHOT_DIR}/${width}-${theme}-${'viewMode' in mode ? mode.path ?? 'plain' : 'hotview'}.png` })
      }
    }
    if (width < 768) {
      for (const state of [{ editable: false }, { loading: true }, { revalidating: true }, { anchorPreview: { lineStart: 1, lineEnd: 1 } }, { path: 'preview.svg', content: '<svg/>', viewMode: 'hotview' }, { path: 'image.png' }]) {
        await page.evaluate(`window.resetFixture(${JSON.stringify(state)})`)
        await page.waitForTimeout(50)
        assert.equal(await button.count(), 0, JSON.stringify(state))
      }
      await page.evaluate('window.resetFixture({}); window.language("en")')
      await page.getByRole('button', { name: 'Open keyboard', exact: true }).waitFor()
    }
    assert.deepEqual(errors, [])
    await page.close()
  }
})
