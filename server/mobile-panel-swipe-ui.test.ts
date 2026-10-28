import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { chromium } from 'playwright-core'
import { domBrowserExecutable } from './browser-dom-executable.ts'

const root = path.resolve(import.meta.dirname, '..')

test('mobile swipes separate dock panels, body tabs and source-editor key bars', { skip: !domBrowserExecutable(), timeout: 45_000 }, async () => {
  const source = `import React from 'react';
import {createRoot} from 'react-dom/client';
import {EditorView} from '@codemirror/view';
import {I18nProvider} from '${root}/src/i18n.tsx';
import {EditorPane} from '${root}/src/components/EditorPane.tsx';
import {MobileDock} from '${root}/src/components/mobile-dock.tsx';
import {adjacentDockPanel} from '${root}/src/utils/mobile-dock.ts';
import {useMobilePanelSwipe} from '${root}/src/hooks/use-mobile-panel-swipe.ts';
const noop=()=>{};
const callbacks=Object.fromEntries(['registerHandle','registerElement','registerTabBar','onFocus','onPin','onCloseTab','onReorder','onOpenLink','onOpenHistory','onSetTocOpen','onOpenSidebar','onTabDragMove','onTabDrop'].map(key=>[key,noop]));
const initial=['first.md','code.js','second.md'].map(path=>({id:path,path,content:path.endsWith('.md')?'# Heading\\n\\n'+('A paragraph for swiping.\\n\\n'.repeat(80)):'const value = "'+('long source '.repeat(100))+'";\\n',savedContent:'',committedContent:'',rules:null,status:'saved',preview:false,editable:true,viewMode:path.endsWith('.md')?'hotview':'plain'}));
function Fixture(){
  const [panel,setPanel]=React.useState('editor'),[tabs,setTabs]=React.useState(initial),[active,setActive]=React.useState('code.js'),[index,setIndex]=React.useState(0);
  const navigate=(direction)=>panel==='editor'?setActive(previous=>tabs[(tabs.findIndex(tab=>tab.path===previous)+direction+tabs.length)%tabs.length].path):setIndex(value=>(value+direction+3)%3);
  const swipe=useMobilePanelSwipe((target,direction)=>{if(target===panel)navigate(direction)});
  window.swipeFixture={panel,active,index,tabs,setPanel,select:path=>{setPanel('editor');setActive(path)},plain:()=>setTabs(tabs=>tabs.map(tab=>tab.path===active?{...tab,viewMode:'plain'}:tab)),single:()=>setTabs(tabs=>tabs.filter(tab=>tab.path===active)),readonly:()=>setTabs(tabs=>tabs.map(tab=>({...tab,editable:false}))),view:()=>EditorView.findFromDOM(swipe.current.querySelector('.cm-content'))};
  return <div className="mew-workspace" style={{height:'100dvh',display:'flex',flexDirection:'column'}}>
    <div ref={swipe} style={{position:'relative',display:'flex',flex:1,minHeight:0,paddingBottom:48}}>
      <section data-workspace-panel="editor" style={{display:panel==='editor'?'flex':'none',flex:1,minWidth:0,minHeight:0}}>
        <EditorPane {...callbacks} pane={{id:'main',tabs,activePath:active,activeTabId:active}} role="guest" authEmail={null} project="docs" tree={[]} presence={{}} focused isGuest showSidebarButton={false} tocOpen={false} dropZone={null}
          onActivate={setActive} onSetViewMode={(path,viewMode)=>setTabs(tabs=>tabs.map(tab=>tab.path===path?{...tab,viewMode}:tab))} onChangeContent={(path,content)=>setTabs(tabs=>tabs.map(tab=>tab.path===path?{...tab,content}:tab))}/>
      </section>
      {['sidebar','agent','terminal','git','tasks','memo'].map(id=><section key={id} data-workspace-panel={id} style={{display:panel===id?'flex':'none',flex:1,flexDirection:'column'}}>
        <div data-dock-tab-bar style={{height:40}}>Tabs {index}</div>
        <div data-panel-body style={{flex:1}}>Body
          <div className="task-swipe" style={{height:40}}>Task deletion</div><div className="task-gantt-scroller" style={{height:40}}>Gantt scrolling</div><div data-gantt-grab style={{height:40}}>Gantt editing</div>
          <div role="dialog" style={{height:40}}>Dialog</div>
          <div data-scroll-zone style={{width:280,height:80,overflowX:'auto'}}>
            <table style={{width:960,tableLayout:'fixed'}}><tbody><tr><td><span data-scroll-target style={{display:'block',height:56}}>Wide table</span></td></tr></tbody></table>
          </div>
        </div>
      </section>)}
    </div>
    <MobileDock active={panel} available={['sidebar','editor','agent','terminal','git','memo','tasks']} hidden={false} onSelect={setPanel} onNavigate={(direction,order)=>{const next=adjacentDockPanel(order,panel,direction);if(next)setPanel(next)}}/>
  </div>
}
createRoot(document.getElementById('root')).render(<React.StrictMode><I18nProvider><Fixture/></I18nProvider></React.StrictMode>);`
  const bundle = await build({ input: 'virtual:swipes.tsx', write: false, platform: 'browser', output: { format: 'esm' }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } }, plugins: [{ name: 'fixture', resolveId(id) {
    if (id === 'virtual:swipes.tsx') return id
    if (id.endsWith('.css')) return 'virtual:style'
  }, async load(id) {
    if (id === 'virtual:swipes.tsx') return source
    if (id === 'virtual:style') return ''
    if (id.endsWith('?raw')) return `export default ${JSON.stringify(await fs.readFile(id.slice(0, -4), 'utf8'))}`
  } }] })
  const chunks = bundle.output.filter(item => item.type === 'chunk')
  const chunk = chunks.find(item => item.isEntry)!
  const scripts = new Map(chunks.map(item => [`/${item.fileName}`, item.code]))
  const files = ['src/components/EditorPane.tsx', 'src/components/CodePane.tsx', 'src/components/TabBar.tsx', 'src/components/mobile-dock.tsx', 'packages/mobile-keys/src/MobileKeyBar.tsx']
  const content = (await Promise.all(files.map(file => fs.readFile(path.join(root, file), 'utf8')))).join('\n')
  const compiler = await compile(await fs.readFile(`${root}/src/index.css`, 'utf8'), { base: `${root}/src`, onDependency() {} })
  const css = compiler.build([...new Set((source + content).match(/[A-Za-z0-9_@!:/.[\]()%,-]+/g))])
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true })
    page.setDefaultTimeout(3000)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('http://mew-swipes.test/**', route => {
      const pathname = new URL(route.request().url()).pathname
      return route.fulfill(pathname.startsWith('/api/') ? { json: [] }
        : pathname === '/app.js' || scripts.has(pathname) ? { contentType: 'text/javascript', body: pathname === '/app.js' ? chunk.code : scripts.get(pathname) }
        : { contentType: 'text/html', body: `<!doctype html><html class="dark"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script type="module" src="/app.js"></script></html>` })
    })
    await page.goto('http://mew-swipes.test/')
    await page.locator('.cm-content').waitFor().catch(error => { throw new Error(`${error.message}; browser errors: ${errors.join('; ')}`) })
    const cdp = await page.context().newCDPSession(page)
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', points: Array<{ x: number; y: number; id?: number }>) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points })
    const swipe = async (selector: string, dx = -100, dy = 0, y?: number) => {
      await page.locator(selector).waitFor({ state: 'visible' })
      const box = (await page.locator(selector).boundingBox())!
      const start = { x: dx < 0 ? box.x + Math.min(box.width - 8, 270) : box.x + 70, y: y ?? box.y + box.height / 2 }
      await touch('touchStart', [start])
      for (let step = 1; step <= 6; step++) await touch('touchMove', [{ x: start.x + dx * step / 6, y: start.y + dy * step / 6 }])
      await touch('touchEnd', [])
    }
    const state = () => page.evaluate<{ panel: string; active: string; index: number }>('({panel:window.swipeFixture.panel,active:window.swipeFixture.active,index:window.swipeFixture.index})')
    const selectPanel = async (panel: string) => { await page.evaluate(`window.swipeFixture.setPanel(${JSON.stringify(panel)})`); await page.waitForFunction(`window.swipeFixture.panel===${JSON.stringify(panel)}`) }
    const select = async (path: string) => { await page.evaluate(`window.swipeFixture.select(${JSON.stringify(path)})`); await page.waitForFunction(`window.swipeFixture.active===${JSON.stringify(path)}`) }
    const contents = await page.evaluate('window.swipeFixture.tabs.map(tab=>tab.content)')

    // Source content scrolls natively; only the key bar changes tabs.
    await swipe('.cm-scroller')
    assert.equal((await state()).active, 'code.js')
    assert.ok(await page.locator('.cm-scroller').evaluate(el => el.scrollLeft) > 0, 'source text retains native horizontal scrolling')
    await swipe('[data-mobile-key-bar]')
    assert.equal((await state()).active, 'second.md')
    assert.equal((await state()).panel, 'editor')
    for (const y of [90, 420, 720]) {
      await select('first.md')
      await swipe('.editor-root', -100, 0, y)
      assert.equal((await state()).active, 'code.js', `Hotview body swipes work at y=${y}`)
    }
    await select('first.md')
    await page.evaluate('window.swipeFixture.plain()')
    await page.locator('.cm-content').waitFor()
    await swipe('.cm-scroller')
    assert.equal((await state()).active, 'first.md', 'Markdown Plain body does not change tabs')
    await swipe('[data-mobile-key-bar]', 100)
    assert.equal((await state()).active, 'second.md', 'key-bar tab navigation wraps')
    await select('code.js')
    await swipe('[data-workspace-panel="editor"] [data-dock-tab-bar]')
    assert.equal((await state()).active, 'code.js', 'tab strips retain their own scrolling')
    await swipe('.mobile-dock', 65)
    assert.equal((await state()).panel, 'sidebar')
    assert.equal((await state()).active, 'code.js', 'dock leaves the editor tab unchanged')
    await swipe('.mobile-dock', 65)
    assert.equal((await state()).panel, 'sidebar', 'dock navigation stops at the first panel')
    await swipe('.mobile-dock', -65)
    assert.equal((await state()).panel, 'editor')

    for (const panel of ['sidebar', 'agent', 'terminal', 'git', 'tasks']) {
      await selectPanel(panel)
      const before = (await state()).index
      const body = `[data-workspace-panel="${panel}"] [data-panel-body]`
      await swipe(body, -100, 0, 400)
      assert.equal((await state()).index, (before + 1) % 3, `${panel} body selects the next tab`)
      await swipe(body, 100, 0, 400)
      assert.equal((await state()).index, before, `${panel} body selects the previous tab`)
      assert.equal((await state()).panel, panel)
    }
    for (const selector of ['.task-swipe', '.task-gantt-scroller', '[data-gantt-grab]', '[role="dialog"]']) {
      const before = await state()
      await swipe(`[data-workspace-panel="tasks"] ${selector}`)
      assert.deepEqual(await state(), before, `${selector} retains its existing gestures`)
    }
    for (const panel of ['sidebar', 'agent', 'terminal', 'git', 'tasks']) {
      await selectPanel(panel)
      const zone = `[data-workspace-panel="${panel}"] [data-scroll-zone]`
      const before = await state()
      for (const [offset, dx] of [[0, -100], [300, 100], [0, 100], [680, -100]]) {
        await page.locator(zone).evaluate((el, offset) => { el.scrollLeft = offset }, offset)
        await swipe(zone, dx)
        assert.deepEqual(await state(), before, `${panel} table scroll and edge gestures preserve the active tab`)
        if (offset === 0 && dx < 0) assert.ok(await page.locator(zone).evaluate(el => el.scrollLeft) > 0, `${panel} table scrolls natively`)
        if (offset === 300) assert.ok(await page.locator(zone).evaluate(el => el.scrollLeft) < offset, `${panel} table scrolls back natively`)
      }
    }
    const zone = '[data-workspace-panel="tasks"] [data-scroll-zone]'
    for (const mode of ['rtl', 'scroll', 'fitting', 'vertical', 'hidden']) {
      await page.locator(zone).evaluate((el, mode) => {
        el.setAttribute('style', `width:280px;height:80px;direction:${mode === 'rtl' ? 'rtl' : 'ltr'};overflow-x:${mode === 'hidden' ? 'hidden' : mode === 'scroll' ? 'scroll' : 'auto'};overflow-y:${mode === 'vertical' ? 'auto' : 'hidden'}`)
        el.querySelector('table')!.setAttribute('style', `table-layout:fixed;width:${mode === 'fitting' || mode === 'vertical' ? 200 : 960}px;height:${mode === 'vertical' ? 500 : 56}px`)
        el.scrollLeft = 0
      }, mode)
      const before = await state()
      await swipe(zone, mode === 'rtl' ? 100 : -100)
      if (mode === 'rtl' || mode === 'scroll') {
        assert.deepEqual(await state(), before, `${mode} overflow keeps its native horizontal gesture`)
        assert.notEqual(await page.locator(zone).evaluate(el => el.scrollLeft), 0, `${mode} overflow scrolls natively`)
      } else {
        assert.equal((await state()).index, (before.index + 1) % 3, `${mode} content still allows body tab swipes`)
      }
    }
    await selectPanel('memo')
    const memo = await state()
    await swipe('[data-workspace-panel="memo"] [data-panel-body]', -100, 0, 400)
    assert.deepEqual(await state(), memo, 'panels without tabs do not fall back to editor navigation')
    assert.deepEqual(await page.evaluate('window.swipeFixture.tabs.map(tab=>tab.content)'), contents, 'swiping never edits a document')

    await select('code.js')
    const bar = '[data-mobile-key-bar]'
    for (const [dx, dy] of [[-30, 0], [-100, 150]]) {
      await swipe(bar, dx, dy)
      assert.equal((await state()).active, 'code.js', 'short and vertical swipes keep the current tab')
    }
    const ctrl = page.locator(bar).getByRole('button', { name: 'Ctrl', exact: true })
    const ctrlBox = (await ctrl.boundingBox())!
    const point = { x: ctrlBox.x + ctrlBox.width / 2, y: ctrlBox.y + ctrlBox.height / 2 }
    await touch('touchStart', [point])
    await touch('touchMove', [{ x: point.x + 110, y: point.y }])
    await touch('touchCancel', [])
    assert.equal((await state()).active, 'code.js', 'touch cancellation does not change tabs')
    assert.equal(await ctrl.getAttribute('aria-pressed'), 'false')
    await touch('touchStart', [point])
    await touch('touchStart', [{ ...point, id: 0 }, { x: point.x + 40, y: point.y, id: 1 }])
    await touch('touchMove', [{ x: point.x + 110, y: point.y, id: 0 }, { x: point.x + 150, y: point.y, id: 1 }])
    await touch('touchEnd', [])
    assert.equal((await state()).active, 'code.js', 'multi-touch never changes tabs')
    await page.evaluate('window.swipeFixture.single()')
    await touch('touchStart', [point])
    await touch('touchMove', [{ x: point.x + 110, y: point.y }])
    await touch('touchEnd', [])
    assert.equal((await state()).active, 'code.js', 'a single-tab swipe keeps the current panel and tab')
    await ctrl.dispatchEvent('click', { detail: 1 })
    assert.equal(await ctrl.getAttribute('aria-pressed'), 'false', 'a swipe does not press its starting key')
    await ctrl.tap()
    assert.equal(await ctrl.getAttribute('aria-pressed'), 'true', 'a short tap still operates the modifier')
    await page.locator('.cm-content').evaluate(el => el.dispatchEvent(new el.ownerDocument.defaultView!.InputEvent('beforeinput', { inputType: 'insertText', data: 'a', bubbles: true, cancelable: true })))
    assert.equal(await ctrl.getAttribute('aria-pressed'), 'false')
    assert.equal(await page.evaluate('window.swipeFixture.view().state.selection.main.empty'), false, 'Ctrl+A runs the CodeMirror command')
    await page.locator(bar).getByRole('button', { name: '→', exact: true }).tap()
    assert.equal(await page.evaluate('window.swipeFixture.view().state.selection.main.empty'), true, 'arrow keys move the caret')
    const beforeIndent = await page.evaluate('window.swipeFixture.view().state.doc.toString()')
    await page.locator(bar).getByRole('button', { name: 'Tab', exact: true }).tap()
    const indented = await page.evaluate('window.swipeFixture.view().state.doc.toString()')
    assert.notEqual(indented, beforeIndent, 'the Tab key runs indentation')
    await page.locator(bar).getByRole('button', { name: /되돌리기|Undo/ }).tap()
    assert.equal(await page.evaluate('window.swipeFixture.view().state.doc.toString()'), beforeIndent, 'Undo uses editor history')
    await page.locator(bar).getByRole('button', { name: /다시 실행|Redo/ }).tap()
    assert.equal(await page.evaluate('window.swipeFixture.view().state.doc.toString()'), indented, 'Redo uses editor history')
    await page.screenshot({ path: '/tmp/mew-mobile-panel-swipe-dark.png' })
    await page.locator('html').evaluate(el => el.classList.remove('dark'))
    await page.screenshot({ path: '/tmp/mew-mobile-panel-swipe-light.png' })
    await page.evaluate('window.swipeFixture.readonly()')
    await page.locator('.cm-content[contenteditable="true"]').waitFor({ state: 'detached' })
    assert.equal(await page.locator(bar).getByRole('button', { name: /되돌리기|다시 실행|Undo|Redo/ }).count(), 0, 'read-only files omit editing actions')
    await swipe(bar)
    assert.equal((await state()).active, 'code.js', 'read-only files keep a key-bar swipe surface')
    await page.setViewportSize({ width: 1100, height: 844 })
    await page.locator(bar).waitFor({ state: 'detached' })
    assert.equal(await page.locator(bar).count(), 0, 'the source key bar is mobile only')
    await selectPanel('tasks')
    const desktop = await state()
    await swipe('[data-workspace-panel="tasks"] [data-panel-body]', -100, 0, 400)
    assert.deepEqual(await state(), desktop, 'desktop touch retains its existing behavior')
    assert.deepEqual(errors, [])
  } finally { await browser.close() }
})
