import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { connectTestBrowser } from './test-browser.ts'

test('editor body taps allow native keyboard focus and typing without a floating button', {
  timeout: 60_000,
}, async t => {
  const repo = path.resolve(import.meta.dirname, '..')
  const source = `
import React from 'react';import {createRoot} from 'react-dom/client';
import {EditorPane} from ${JSON.stringify(path.join(repo, 'src/components/EditorPane.tsx'))};
import {I18nProvider} from ${JSON.stringify(path.join(repo, 'src/i18n.tsx'))};
const noop=()=>{},defaults={path:'fixture.md',content:'Alpha selected text omega.',viewMode:'hotview',editable:true};
const callbacks=Object.fromEntries(['registerElement','registerTabBar','onFocus','onActivate','onPin','onCloseTab','onReorder','onOpenLink','onOpenHistory','onSetTocOpen','onOpenSidebar','onTabDragMove','onTabDrop'].map(key=>[key,noop]));
function Fixture(){const [state,setState]=React.useState(defaults);const handle=React.useRef(null);
 window.resetFixture=values=>setState({...defaults,...values});window.selectFixture=()=>handle.current?.getSelectedText();
 return <div data-fixture data-value={state.content} className="flex h-dvh flex-col"><button data-outside onClick={()=>window.outsideClicks=(window.outsideClicks??0)+1}>Outside editor</button><EditorPane {...callbacks}
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
  const browser = await connectTestBrowser()
  t.after(() => browser.close())

  for (const [width, theme, nativeApi] of [[390, 'dark', true], [320, 'light', false], [1280, 'dark', true]] as const) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, hasTouch: width < 768 })
    page.setDefaultTimeout(5000)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(`localStorage.setItem('mew:locale','ko');localStorage.setItem('mew:ui-locale','ko');
      window.keyboardCalls=0;window.keyboardHides=0;window.bodyFocus=[];window.bodyFocusRequests=[];
      const nativeFocus=HTMLElement.prototype.focus;
      HTMLElement.prototype.focus=function(...args){if(this.matches('.ProseMirror,.cm-content'))window.bodyFocusRequests.push(this.className);return nativeFocus.apply(this,args)};
      addEventListener('focusin',event=>{const el=event.target;if(el.matches('.ProseMirror,.cm-content'))window.bodyFocus.push({policy:el.getAttribute('virtualkeyboardpolicy'),mode:el.getAttribute('inputmode'),activation:navigator.userActivation.isActive})});
      Object.defineProperty(navigator,'virtualKeyboard',{configurable:true,value:${nativeApi ? `Object.assign(new EventTarget(),{overlaysContent:false,boundingRect:new DOMRect(),show(){window.keyboardCalls++},hide(){window.keyboardHides++}})` : 'undefined'}});`)
    await page.route('http://mew-mobile-editor-keyboard.test/**', route => {
      const url = new URL(route.request().url())
      if (url.pathname === '/api/comments') return route.fulfill({ json: { threads: [] } })
      if (url.pathname === '/api/members') return route.fulfill({ json: { members: [] } })
      if (url.pathname.startsWith('/api/')) return route.fulfill({ json: [] })
      return route.fulfill(url.pathname === '/app.js' ? { contentType: 'text/javascript', body: entry.code }
        : { contentType: 'text/html', body: `<!doctype html><html class="${theme === 'dark' ? 'dark' : ''}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script type="module" src="/app.js"></script></html>` })
    })
    await page.goto('http://mew-mobile-editor-keyboard.test/')
    const button = page.locator('[data-mobile-editor-keyboard-button]')
    const pressBody = (content: ReturnType<typeof page.locator>, x: number) => width < 768
      ? content.tap({ position: { x, y: 10 } })
      : content.click({ position: { x, y: 10 } })
    for (const mode of [{}, { viewMode: 'plain' }, { path: 'fixture.ts', viewMode: 'plain' }]) {
      await page.evaluate(`window.resetFixture(${JSON.stringify(mode)})`)
      const content = page.locator('.ProseMirror, .cm-content')
      await content.waitFor()
      assert.equal(await button.count(), 0, 'the editor has no floating keyboard control')
      assert.equal(await content.getAttribute('virtualkeyboardpolicy'), null)
      assert.equal(await content.getAttribute('inputmode'), null)
      await page.locator('[data-outside]').click()
      await pressBody(content, 40)
      assert.equal(await content.evaluate(el => el === el.ownerDocument.activeElement), true, 'a body tap immediately focuses the editor')
      assert.deepEqual(await page.evaluate('window.bodyFocus.at(-1)'), { policy: null, mode: null, activation: true }, 'native keyboard input is allowed during the original user gesture')
      const focusCount = Number(await page.evaluate('window.bodyFocus.length'))
      await pressBody(content, 65)
      assert.equal(await content.evaluate(el => el === el.ownerDocument.activeElement), true)
      assert.equal(await page.evaluate('window.bodyFocus.length'), focusCount, 'moving the cursor does not blur and refocus the editor')
      await content.evaluate(el => {
        const doc = el.ownerDocument, node = doc.createTreeWalker(el, 4).nextNode()!
        const range = doc.createRange(); range.setStart(node, 6); range.setEnd(node, 14)
        const selection = doc.getSelection()!; selection.removeAllRanges(); selection.addRange(range)
        doc.dispatchEvent(new doc.defaultView!.Event('selectionchange'))
      })
      await page.waitForFunction('window.selectFixture() === "selected"')
      assert.equal(await page.locator('[data-fixture]').getAttribute('data-value'), 'Alpha selected text omega.')
      await page.keyboard.type('typed')
      await page.waitForFunction('document.querySelector("[data-fixture]").dataset.value.includes("typed")')
      assert.equal((await page.locator('[data-fixture]').getAttribute('data-value'))!.trimEnd(), 'Alpha typed text omega.')
      // Headless Chromium cannot show an OS keyboard; exercise the viewport signal separately.
      await content.evaluate(el => {
        const win = el.ownerDocument.defaultView!
        Object.defineProperty(win.visualViewport!, 'height', { configurable: true, value: 440 })
        win.visualViewport!.dispatchEvent(new win.Event('resize'))
      })
      assert.equal(await button.count(), 0)
      await content.evaluate(el => {
        const win = el.ownerDocument.defaultView!
        Reflect.deleteProperty(win.visualViewport!, 'height')
        win.visualViewport!.dispatchEvent(new win.Event('resize'))
      })
      const clicks = Number(await page.evaluate('window.outsideClicks ?? 0'))
      await page.locator('[data-outside]').click()
      assert.equal(await page.evaluate('window.outsideClicks'), clicks + 1, 'outside controls retain their action')
      assert.equal(await content.getAttribute('inputmode'), null, 'outside presses do not reinstall keyboard suppression')
      assert.equal(await content.getAttribute('virtualkeyboardpolicy'), null)
      assert.equal(await page.evaluate('window.keyboardCalls'), 0, 'native focus works without explicit keyboard API requests')
      assert.equal(await page.evaluate('window.keyboardHides'), 0, 'body and outside taps do not force API dismissal')
    }
    if (width < 768) for (const mode of [{}, { viewMode: 'plain' }, { path: 'fixture.ts', viewMode: 'plain' }]) {
      await page.evaluate(`window.resetFixture(${JSON.stringify(mode)})`)
      const content = page.locator('.ProseMirror, .cm-content')
      await content.waitFor()
      await pressBody(content, 40)
      const keys = page.locator('[data-mobile-key-bar]')
      await keys.waitFor()
      // Dismissing an OS keyboard can leave editing focus in place. A repeated
      // focus() request can reopen it even without another focusin event.
      for (const label of ['Tab', '←', '→', '↑', '↓', 'Ctrl', 'Ctrl', 'Shift', 'Tab', '되돌리기', '다시 실행',
        ...(mode.viewMode ? [] : ['코드블럭', '코드블럭', '표 삽입'])]) {
        const before = await page.locator('[data-fixture]').getAttribute('data-value')
        await page.evaluate('window.bodyFocusRequests=[]')
        await keys.getByRole('button', { name: label, exact: true }).tap()
        await page.waitForTimeout(80)
        assert.deepEqual(await page.evaluate('window.bodyFocusRequests'), [], `${JSON.stringify(mode)} ${label} never requests editing focus`)
        assert.equal(await content.evaluate(el => el === el.ownerDocument.activeElement), true, `${label} retains existing editing focus`)
        if (label === 'Tab') assert.notEqual(await page.locator('[data-fixture]').getAttribute('data-value'), before, 'indentation still changes the document')
        if (label === '표 삽입') assert.equal(await content.locator('table').count(), 1, 'table insertion still executes')
      }
      await keys.getByRole('button', { name: 'Esc', exact: true }).tap()
      await page.locator('[data-outside]').tap()
      assert.equal(await content.evaluate(el => el === el.ownerDocument.activeElement), false)
      for (const label of ['Tab', '←', '→', '↑', '↓', '되돌리기', '다시 실행',
        ...(mode.viewMode ? [] : ['코드블럭', '코드블럭', '표 삽입'])]) {
        await page.evaluate('window.bodyFocusRequests=[]')
        await keys.getByRole('button', { name: label, exact: true }).tap()
        await page.waitForTimeout(80)
        assert.deepEqual(await page.evaluate('window.bodyFocusRequests'), [], `unfocused ${label} never requests editing focus`)
        assert.equal(await content.evaluate(el => el === el.ownerDocument.activeElement), false, `${label} does not focus a blurred body`)
      }
      await pressBody(content, 40)
      assert.equal(await content.evaluate(el => el === el.ownerDocument.activeElement), true, 'body taps still activate native editing after auxiliary keys')
      await page.keyboard.type('after-keys')
      await page.waitForFunction('document.querySelector("[data-fixture]").dataset.value.includes("after-keys")')
      assert.equal(await content.getAttribute('inputmode'), null)
      assert.equal(await content.getAttribute('virtualkeyboardpolicy'), null)
      assert.equal(await page.evaluate('window.keyboardCalls'), 0)
      assert.equal(await page.evaluate('window.keyboardHides'), 0)
    }
    for (const state of [{ editable: false }, { loading: true }, { revalidating: true }, { anchorPreview: { lineStart: 1, lineEnd: 1 } }, { path: 'preview.svg', content: '<svg/>', viewMode: 'hotview' }, { path: 'image.png' }]) {
      await page.evaluate(`window.resetFixture(${JSON.stringify(state)})`)
      await page.waitForTimeout(50)
      assert.equal(await button.count(), 0, JSON.stringify(state))
    }
    await page.evaluate('window.resetFixture({})')
    await page.locator('.ProseMirror').waitFor()
    await page.setViewportSize({ width: width < 768 ? 1280 : 390, height: 844 })
    await pressBody(page.locator('.ProseMirror'), 40)
    assert.equal(await page.locator('.ProseMirror').getAttribute('inputmode'), null, 'layout changes keep native input enabled')
    assert.equal(await page.locator('.ProseMirror').getAttribute('virtualkeyboardpolicy'), null)
    assert.equal(await button.count(), 0)
    assert.deepEqual(errors, [])
    await page.close()
  }
})
