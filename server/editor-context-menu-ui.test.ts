import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { chromium, type Locator, type Page } from 'playwright-core'
import { domBrowserExecutable } from './browser-dom-executable.ts'

const markdown = '# Context fixture\n\nAlpha selected text omega.\n\nSecond paragraph target.\n\n<br/>\n'
const code = 'const selected = "value";\nconst next = "target";\n'
const labels = ['주석 추가', '댓글 달기', '복사', '잘라내기', '붙여넣기', '삭제', '전체 선택']

async function control(page: Page, action: 'reset' | 'set' | 'clipboard' | 'release', values: Record<string, unknown> = {}) {
  await page.locator('[data-context-fixture]').evaluate((el, { action, values }) => {
    const fixture = el.ownerDocument.defaultView as unknown as { contextFixtureControl: (action: string, values: Record<string, unknown>) => void }
    fixture.contextFixtureControl(action, values)
  }, { action, values })
}

async function value(page: Page) { return (await page.locator('[data-context-fixture]').getAttribute('data-value'))! }
function surface(page: Page) { return page.locator('.ProseMirror, .cm-content') }
function menu(page: Page) { return page.getByRole('menu', { name: '에디터 메뉴', exact: true }) }
function item(page: Page, label: string) { return menu(page).getByRole('menuitem', { name: label, exact: true }) }

async function reset(page: Page, values: Record<string, unknown> = {}) {
  const previous = await page.locator('[data-context-fixture]').getAttribute('data-generation')
  await control(page, 'reset', values)
  await page.waitForFunction(({ el, previous }) => el.getAttribute('data-generation') !== previous, { el: await page.locator('[data-context-fixture]').elementHandle(), previous })
  await surface(page).waitFor()
}

async function point(page: Page, text: string, offset = 0) {
  return surface(page).evaluate((el, { text, offset }) => {
    const doc = el.ownerDocument, walker = doc.createTreeWalker(el, 4)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const at = node.textContent?.indexOf(text) ?? -1
      if (at < 0) continue
      const range = doc.createRange()
      range.setStart(node, at + offset)
      range.collapse(true)
      const rect = range.getBoundingClientRect()
      return { x: rect.left + .2, y: rect.top + rect.height / 2 }
    }
    throw new Error(`Context text not found: ${text}`)
  }, { text, offset })
}

async function select(page: Page, text: string, click = true) {
  const editor = surface(page)
  if (click) await editor.click()
  await editor.evaluate((el, text) => {
    const doc = el.ownerDocument, walker = doc.createTreeWalker(el, 4)
    el.focus({ preventScroll: true })
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const at = node.textContent?.indexOf(text) ?? -1
      if (at < 0) continue
      const range = doc.createRange()
      range.setStart(node, at)
      range.setEnd(node, at + text.length)
      const selection = doc.defaultView!.getSelection()!
      selection.removeAllRanges()
      selection.addRange(range)
      doc.dispatchEvent(new doc.defaultView!.Event('selectionchange'))
      return
    }
    throw new Error(`Selection text not found: ${text}`)
  }, text)
  await page.waitForFunction(({ el, text }) => {
    const fixture = el.ownerDocument.defaultView as unknown as { contextFixtureSelection: () => string | null }
    return fixture.contextFixtureSelection() === text
  }, { el: await editor.elementHandle(), text })
}

async function touchPointer(page: Page, type: 'pointerdown' | 'pointerup' | 'pointercancel', text: string) {
  const at = await point(page, text, 2)
  await surface(page).evaluate((el, { type, at }) => {
    const win = el.ownerDocument.defaultView!
    el.dispatchEvent(new win.PointerEvent(type, { bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 7, isPrimary: true, clientX: at.x, clientY: at.y, buttons: type === 'pointerdown' ? 1 : 0 }))
  }, { type, at })
}

async function touchContextMenu(page: Page, text: string, pointerEvent = true) {
  const at = await point(page, text, 2)
  return surface(page).evaluate((el, { at, pointerEvent }) => {
    const doc = el.ownerDocument, win = doc.defaultView!
    let bubbled = false
    const observe = () => { bubbled = true }
    doc.addEventListener('contextmenu', observe)
    const options = { bubbles: true, cancelable: true, clientX: at.x, clientY: at.y, button: 2 }
    const event = pointerEvent ? new win.PointerEvent('contextmenu', { ...options, pointerType: 'touch', pointerId: 7 }) : new win.MouseEvent('contextmenu', options)
    el.dispatchEvent(event)
    doc.removeEventListener('contextmenu', observe)
    return { prevented: event.defaultPrevented, bubbled }
  }, { at, pointerEvent })
}

async function assertSelectionContextMenu(page: Page, text: string) {
  for (const pointerEvent of [true, false]) {
    const focused = await surface(page).evaluateHandle(el => el.ownerDocument.activeElement)
    assert.deepEqual(await touchContextMenu(page, text, pointerEvent), { prevented: true, bubbled: false },
      `selected text suppresses the native menu for ${pointerEvent ? 'touch' : 'mouse-compatible'} context events`)
    assert.equal(await surface(page).evaluate(el => el.ownerDocument.defaultView!.getSelection()?.toString()), text,
      'suppressing the native menu preserves the selected range')
    assert.equal(await surface(page).evaluate((el, focused) => el.ownerDocument.activeElement === focused, focused), true,
      'suppressing the native menu preserves focus, including in readonly bodies')
    await focused.dispose()
  }
}

async function assertNoAutomaticMenu(page: Page, message: string) {
  await page.waitForTimeout(400)
  assert.equal(await menu(page).count(), 0, message)
}

async function open(page: Page, text: string, offset = 0) {
  const at = await point(page, text, offset)
  await page.mouse.click(at.x, at.y, { button: 'right' })
  await menu(page).waitFor()
}

async function clipboardWaiting(page: Page, kind: 'readWaiting' | 'writeWaiting') {
  await page.waitForFunction(({ el, kind }) => {
    const fixture = el.ownerDocument.defaultView as unknown as { contextClipboard: Record<string, unknown> }
    return fixture.contextClipboard[kind] === true
  }, { el: await page.locator('[data-context-fixture]').elementHandle(), kind })
}

async function settle(page: Page) {
  await page.locator('[data-context-fixture]').evaluate(el => new Promise<void>(resolve => el.ownerDocument.defaultView!.requestAnimationFrame(() => el.ownerDocument.defaultView!.requestAnimationFrame(() => resolve()))))
}

async function assertMenu(menu: Locator, width: number, height: number) {
  assert.equal(await menu.getByRole('menuitem').count(), labels.length)
  for (const label of labels) {
    const row = menu.getByRole('menuitem', { name: label, exact: true })
    assert.equal(await row.count(), 1)
    assert.equal(await row.evaluate(el => {
      const nodes = el.childNodes as ArrayLike<{ nodeType: number; textContent: string | null }>
      const icon = el.querySelector('svg'), text = Array.from(nodes).find(node => node.nodeType === 3 && node.textContent?.trim())
      if (!icon || !text) return false
      const range = el.ownerDocument.createRange()
      range.selectNodeContents(text)
      return icon.getBoundingClientRect().right < range.getBoundingClientRect().left
    }), true, `${label} has its icon before its text`)
  }
  const box = await menu.boundingBox()
  assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= height)
}

test('editor context menus preserve native selections and apply scoped actions in Hotview, Plain, and code', {
  skip: !domBrowserExecutable(), timeout: 120_000,
}, async t => {
  const repo = path.resolve(import.meta.dirname, '..')
  const source = `
import React from 'react';import {createRoot} from 'react-dom/client';
import {EditorPane} from ${JSON.stringify(path.join(repo, 'src/components/EditorPane.tsx'))};
import {I18nProvider} from ${JSON.stringify(path.join(repo, 'src/i18n.tsx'))};
const noop=()=>{},defaults={path:'fixture.md',value:${JSON.stringify(markdown)},viewMode:'hotview',editable:true,access:true,workspace:'/fixture/workspace-a'};
const clip=window.contextClipboard={text:'PASTED',writes:[],failRead:false,failWrite:false,holdRead:false,holdWrite:false,readWaiting:false,writeWaiting:false};
Object.defineProperty(navigator,'clipboard',{configurable:true,value:{
 async readText(){if(clip.failRead)throw Error('read denied');if(clip.holdRead){clip.readWaiting=true;await new Promise(resolve=>clip.releaseRead=resolve);clip.readWaiting=false}return clip.text},
 async writeText(text){if(clip.failWrite)throw Error('write denied');if(clip.holdWrite){clip.writeWaiting=true;await new Promise(resolve=>clip.releaseWrite=resolve);clip.writeWaiting=false}clip.text=text;clip.writes.push(text)}
}});
const exec=document.execCommand.bind(document);document.execCommand=(name,...args)=>name==='copy'&&clip.failWrite?false:exec(name,...args);
const callbacks=Object.fromEntries(['registerElement','registerTabBar','onFocus','onActivate','onPin','onCloseTab','onReorder','onOpenLink','onOpenHistory','onSetTocOpen','onOpenSidebar','onTabDragMove','onTabDrop'].map(key=>[key,noop]));
function Fixture(){const [state,setState]=React.useState({...defaults,generation:0});const handle=React.useRef(null);
 window.contextFixtureSelection=()=>handle.current?.getSelectedText()??null;
 window.contextFixtureControl=(action,values)=>{if(action==='reset')setState(old=>({...defaults,...values,generation:old.generation+1}));else if(action==='set')setState(old=>({...old,...values}));else if(action==='clipboard')Object.assign(clip,values);else{clip.releaseRead?.();clip.releaseWrite?.()}};
 const register=React.useCallback((_,next)=>handle.current=next,[]);
 return <div className="flex h-dvh flex-col bg-surface-deep text-ink" data-context-fixture data-value={state.value} data-generation={state.generation} data-workspace={state.workspace} data-editable={state.editable}>
 <EditorPane key={state.generation} {...callbacks} registerHandle={register} workspace={{path:state.workspace}} canCollaborate={state.access}
 pane={{id:'fixture',activePath:state.path,tabs:[{path:state.path,content:state.value,viewMode:state.viewMode,editable:state.editable,preview:false}]}}
 onChangeContent={(_,value)=>setState(old=>({...old,value}))} onSetViewMode={(_,viewMode)=>setState(old=>({...old,viewMode}))}
 role="guest" authEmail="saens@example.test" project="docs" tree={[]} presence={{}} focused isGuest={false} showSidebarButton={false} tocOpen={false} dropZone={null}/></div>;
}createRoot(document.getElementById('root')).render(<React.StrictMode><I18nProvider><Fixture/></I18nProvider></React.StrictMode>);`
  const candidates = [source], styles: string[] = []
  const bundle = await build({ input: 'virtual:editor-context.tsx', write: false, platform: 'browser', output: { format: 'esm', codeSplitting: false },
    onwarn(warning, warn) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning) },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
    plugins: [{ name: 'editor-context-fixture', resolveId(id) { if (id === 'virtual:editor-context.tsx') return id }, async load(id) {
      if (id === 'virtual:editor-context.tsx') return source
      if (id.endsWith('.tsx')) candidates.push(await fs.readFile(id, 'utf8'))
      if (id.endsWith('.css')) { styles.push(await fs.readFile(id, 'utf8')); return { code: '', moduleType: 'js' } }
    } }],
  })
  const compiler = await compile(await fs.readFile(path.join(repo, 'src/index.css'), 'utf8'), { base: path.join(repo, 'src'), onDependency() {} })
  const css = compiler.build([...new Set(candidates.join('\n').match(/[A-Za-z0-9_@!:/.[\]()%,-]+/g))]) + styles.join('\n')
  const entry = bundle.output.find(item => item.type === 'chunk' && item.isEntry)!
  assert.ok(entry.type === 'chunk')
  const javascript = entry.code
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  t.after(() => browser.close())
  const captures = process.env.MEW_CONTEXT_MENU_SCREENSHOT_DIR
  if (captures) await fs.mkdir(captures, { recursive: true })
  async function createPage(width: number, theme: string, nativeCodeSelection = false) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, hasTouch: width < 768, locale: 'ko-KR' })
    page.setDefaultTimeout(5000)
    await page.addInitScript(() => { localStorage.setItem('mew:locale', 'ko'); localStorage.setItem('mew:ui-locale', 'ko') })
    if (nativeCodeSelection) await page.addInitScript(() => {
      // Exercise CodeMirror's native-selection branch in Chromium; this does not emulate WebKit rendering.
      Object.defineProperty(navigator, 'vendor', { get: () => 'Apple Computer, Inc.' })
      Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 })
    })
    await page.route('http://mew-editor-context.test/**', route => {
      const url = new URL(route.request().url())
      if (url.pathname === '/api/comments') return route.fulfill({ json: { threads: [] } })
      if (url.pathname === '/api/members') return route.fulfill({ json: { members: [] } })
      if (url.pathname.startsWith('/api/')) return route.fulfill({ json: [] })
      return route.fulfill(url.pathname === '/app.js' ? { contentType: 'text/javascript', body: javascript }
        : { contentType: 'text/html', body: `<!doctype html><html class="${theme === 'dark' ? 'dark' : ''}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script type="module" src="/app.js"></script></html>` })
    })
    await page.goto('http://mew-editor-context.test/')
    await surface(page).getByText('Alpha selected text omega.', { exact: true }).waitFor()
    return page
  }

  await t.test('editor selections follow the current accent in Hotview, drawn code ranges and native code ranges', async () => {
    for (const width of [1280, 390]) for (const theme of ['light', 'dark']) {
      for (const nativeCodeSelection of width === 390 ? [false, true] : [false]) {
        const themed = await createPage(width, theme, nativeCodeSelection)
        try {
          for (const fixture of [{}, { viewMode: 'plain' }, { path: 'fixture.ts', value: code, viewMode: 'plain' }]) for (const editable of [true, false]) {
            await reset(themed, { ...fixture, editable })
            const text = 'path' in fixture ? 'value' : 'selected text'
            await select(themed, text)
            const foreground = await surface(themed).evaluate(el => {
              const node = el.ownerDocument.defaultView!.getSelection()!.anchorNode!
              return el.ownerDocument.defaultView!.getComputedStyle(node.nodeType === 1 ? node as typeof el : node.parentElement!).color
            })
            for (const [accent, rgb] of [['#d9468e', [217, 70, 142]], ['#16a077', [22, 160, 119]]] as const) {
              await surface(themed).evaluate((el, accent) => el.ownerDocument.documentElement.style.setProperty('--color-accent', accent), accent)
              await settle(themed)
              const colors = await surface(themed).evaluate((el, nativeCodeSelection) => {
                const doc = el.ownerDocument, win = doc.defaultView!
                const selection = win.getSelection()!
                const node = selection.anchorNode!
                const selected = node.nodeType === 1 ? node as typeof el : node.parentElement!
                const painted = el.closest('.cm-editor')?.querySelector('.cm-selectionBackground')
                const useNative = el.matches('.ProseMirror') || nativeCodeSelection
                const style = useNative ? win.getComputedStyle(selected, '::selection') : painted && win.getComputedStyle(painted)
                const canvas = doc.createElement('canvas')
                canvas.width = canvas.height = 1
                const ctx = canvas.getContext('2d')!
                ctx.fillStyle = style?.backgroundColor ?? 'transparent'
                ctx.fillRect(0, 0, 1, 1)
                return { rgba: Array.from(ctx.getImageData(0, 0, 1, 1).data, channel => Number(channel)),
                  textColor: win.getComputedStyle(selected).color,
                  text: selection.toString(), native: useNative,
                  background: style?.backgroundColor,
                  accent: win.getComputedStyle(selected).getPropertyValue('--color-accent'),
                  nativeBackground: win.getComputedStyle(selected, '::selection').backgroundColor }
              }, nativeCodeSelection)
              colors.rgba.slice(0, 3).forEach((channel, i) => assert.ok(Math.abs(channel - rgb[i]) <= 2, `selection follows ${accent}, ${width}/${theme}/${JSON.stringify(fixture)}/${nativeCodeSelection}/${editable}: ${JSON.stringify(colors)}`))
              assert.ok(Math.abs(colors.rgba[3] - 255 * .3) <= 1, 'selection tint uses 30% opacity')
              assert.equal(colors.textColor, foreground, 'changing the selection tint preserves document and syntax text colors')
              assert.equal(colors.text, text, 'changing the accent preserves the selected text')
              if (!colors.native) assert.equal(colors.nativeBackground, 'rgba(0, 0, 0, 0)', 'drawn code selections keep the native highlight transparent')
            }
            if (captures && editable && !nativeCodeSelection && (!('viewMode' in fixture) || 'path' in fixture)) await themed.screenshot({ path: path.join(captures, `editor-${'path' in fixture ? 'code-' : ''}selection-${width}-${theme}.png`) })
          }
        } finally { await themed.close() }
      }
    }
  })

  await t.test('touch text selection opens a scoped menu only after the gesture settles', async () => {
    const mobile = await createPage(390, 'light')
    const selectionMarkdown = markdown.replace('\n<br/>\n', '')
    try {
      for (const fixture of [
        { viewMode: 'hotview', path: 'fixture.md', value: selectionMarkdown, selected: 'selected text', next: 'paragraph target' },
        { viewMode: 'plain', path: 'fixture.md', value: selectionMarkdown, selected: 'selected text', next: 'paragraph target' },
        { viewMode: 'plain', path: 'fixture.ts', value: code, selected: 'selected', next: 'target' },
      ]) {
        await reset(mobile, fixture)
        await touchPointer(mobile, 'pointerdown', fixture.selected)
        assert.deepEqual(await touchContextMenu(mobile, fixture.selected, fixture.viewMode === 'hotview'), { prevented: false, bubbled: false }, `${fixture.path}/${fixture.viewMode}: long press preserves browser text selection and stays inside the editor`)
        await assertNoAutomaticMenu(mobile, 'long press without a selected range does not open the menu')
        await select(mobile, fixture.selected, false)
        await assertSelectionContextMenu(mobile, fixture.selected)
        await assertNoAutomaticMenu(mobile, 'the menu waits while a finger is still selecting text')
        await touchPointer(mobile, 'pointerup', fixture.selected)
        await menu(mobile).waitFor()
        await assertMenu(menu(mobile), 390, 844)
        assert.equal(await surface(mobile).evaluate(el => el.ownerDocument.defaultView!.getSelection()?.toString()), fixture.selected, 'opening the automatic menu preserves the native selected range')
        assert.equal(await surface(mobile).evaluate(el => el === el.ownerDocument.activeElement || el.contains(el.ownerDocument.activeElement)), true, 'opening the automatic menu keeps focus in the editor')
        if (captures && fixture.viewMode === 'hotview') await mobile.screenshot({ path: path.join(captures, 'editor-touch-selection-390-light.png') })
        await item(mobile, '복사').click()
        assert.equal(await mobile.locator('[data-context-fixture]').evaluate(el => (el.ownerDocument.defaultView as unknown as { contextClipboard: { text: string } }).contextClipboard.text), fixture.selected, 'automatic menu copies the exact native selection')

        const at = await point(mobile, fixture.selected, 2)
        await mobile.touchscreen.tap(at.x, at.y)
        await mobile.touchscreen.tap(at.x, at.y)
        // Supply the resulting native range because Chromium emulation does not expose OS selection handles.
        await select(mobile, fixture.selected, false)
        await menu(mobile).waitFor()
        await touchPointer(mobile, 'pointerdown', fixture.next)
        await select(mobile, fixture.next, false)
        await assertSelectionContextMenu(mobile, fixture.next)
        await assertNoAutomaticMenu(mobile, 'selection handles hide the old menu while the range changes')
        await touchPointer(mobile, 'pointerup', fixture.next)
        await menu(mobile).waitFor()
        await item(mobile, '삭제').click()
        assert.equal(await value(mobile), fixture.value.replace(fixture.next, ''), 'the reopened menu deletes only the updated range')

        await reset(mobile, { ...fixture, editable: false })
        await touchPointer(mobile, 'pointerdown', fixture.selected)
        await select(mobile, fixture.selected, false)
        await assertSelectionContextMenu(mobile, fixture.selected)
        await touchPointer(mobile, 'pointerup', fixture.selected)
        await menu(mobile).waitFor()
        assert.equal(await item(mobile, '복사').isDisabled(), false, 'readonly touch selection still supports copy')
        for (const label of ['주석 추가', '댓글 달기', '잘라내기', '붙여넣기', '삭제']) assert.equal(await item(mobile, label).isDisabled(), true, `readonly selection disables ${label}`)
        await item(mobile, '복사').click()
        assert.equal(await value(mobile), fixture.value)
      }

      await reset(mobile, { value: '| H1 | H2 |\n|---|---|\n| A1 | A2 |\n' })
      await touchPointer(mobile, 'pointerdown', 'A2')
      assert.deepEqual(await touchContextMenu(mobile, 'A2'), { prevented: false, bubbled: false })
      await assertNoAutomaticMenu(mobile, 'a cell long press does not trigger the table context menu before selection')
      await select(mobile, 'A2', false)
      await assertSelectionContextMenu(mobile, 'A2')
      await touchPointer(mobile, 'pointerup', 'A2')
      await menu(mobile).waitFor()
      assert.equal(await item(mobile, '복사').isDisabled(), false)
      for (const name of ['행 추가', '열 추가', 'csv로 복사', '이미지로 복사']) await menu(mobile).getByRole('menuitem', { name, exact: true }).waitFor()
      await mobile.keyboard.press('Escape')

      for (const change of [{ path: 'other.md' }, { viewMode: 'plain' }, { workspace: '/fixture/workspace-b' }]) {
        await reset(mobile)
        await touchPointer(mobile, 'pointerdown', 'selected text')
        await select(mobile, 'selected text', false)
        await touchPointer(mobile, 'pointerup', 'selected text')
        await control(mobile, 'set', change)
        await assertNoAutomaticMenu(mobile, `a pending selection menu is discarded after ${JSON.stringify(change)}`)
      }
      await reset(mobile)
      await touchPointer(mobile, 'pointerdown', 'selected text')
      await select(mobile, 'selected text', false)
      await touchPointer(mobile, 'pointercancel', 'selected text')
      await assertNoAutomaticMenu(mobile, 'a cancelled gesture does not open the menu')
      await touchPointer(mobile, 'pointerdown', 'selected text')
      await touchPointer(mobile, 'pointerup', 'selected text')
      await menu(mobile).waitFor()
      await mobile.keyboard.press('Escape')
      await assertNoAutomaticMenu(mobile, 'Escape keeps the automatically opened menu dismissed')
    } finally {
      await mobile.close()
    }
  })

  await t.test('selection menus survive scrolling and dragging and dismiss on actual outside clicks', async () => {
    for (const width of [390, 1280]) {
      const page = await createPage(width, width === 390 ? 'light' : 'dark')
      const client = await page.context().newCDPSession(page)
      try {
        await surface(page).evaluate(el => {
          const doc = el.ownerDocument
          const outside = doc.createElement('button')
          outside.textContent = 'Outside selection menu'
          outside.setAttribute('data-selection-outside', '')
          outside.style.cssText = 'position:fixed;right:0;top:0;width:150px;height:32px;z-index:100'
          outside.dataset.clicks = '0'
          outside.onclick = () => { outside.dataset.clicks = String(Number(outside.dataset.clicks) + 1) }
          const scroll = doc.createElement('aside')
          scroll.setAttribute('data-selection-scroll', '')
          scroll.style.cssText = 'position:fixed;right:0;top:430px;width:70px;height:160px;overflow:auto;z-index:100;background:#777'
          const inner = doc.createElement('div')
          inner.style.height = '1500px'
          inner.textContent = 'Scroll outside editor'
          scroll.append(inner)
          doc.body.append(outside, scroll)
        })
        const drag = async (x: number, from: number, to: number) => {
          await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: from }] })
          await menu(page).waitFor()
          for (let i = 1; i <= 5; i++) {
            await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: from + (to - from) * i / 5 }] })
            await page.waitForTimeout(20)
          }
          await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
        }
        for (const mode of ['hotview', 'plain', 'code']) {
          const longMarkdown = markdown + Array.from({ length: 100 }, (_, i) => `Paragraph ${i}`).join('\n\n')
          const fixture = mode === 'code'
            ? { path: 'fixture.ts', viewMode: 'plain', value: code + 'const line = 1;\n'.repeat(100), selected: 'selected' }
            : { path: 'fixture.md', viewMode: mode, value: longMarkdown, selected: 'selected text' }
          await reset(page, fixture)
          const scroller = page.locator(mode === 'hotview' ? '.editor-root' : '.cm-scroller')
          const openSelection = async () => {
            if (width === 390) {
              await touchPointer(page, 'pointerdown', fixture.selected)
              await select(page, fixture.selected, false)
              await touchPointer(page, 'pointerup', fixture.selected)
            } else {
              await select(page, fixture.selected, false)
              await open(page, fixture.selected)
            }
            await menu(page).waitFor()
          }
          await openSelection()
          if (width === 390) await drag(45, 620, 420)
          else { await page.mouse.move(45, 620); await page.mouse.wheel(0, 200) }
          await page.waitForFunction(el => el.scrollTop > 50, await scroller.elementHandle())
          await menu(page).waitFor()
          const external = page.locator('[data-selection-scroll]')
          if (width === 390) await drag(width - 35, 570, 470)
          else { await page.mouse.move(width - 35, 500); await page.mouse.wheel(0, 100) }
          await page.waitForFunction(el => el.scrollTop > 20, await external.elementHandle())
          await menu(page).waitFor()
          // Include a browser-compatible click after a drag; it must not dismiss the menu.
          await external.evaluate(el => {
            const win = el.ownerDocument.defaultView!
            el.dispatchEvent(new win.PointerEvent('pointerdown', { bubbles: true, pointerId: 4, clientX: 10, clientY: 500, pointerType: 'touch' }))
            el.dispatchEvent(new win.PointerEvent('pointermove', { bubbles: true, pointerId: 4, clientX: 10, clientY: 450, pointerType: 'touch' }))
            el.dispatchEvent(new win.PointerEvent('pointercancel', { bubbles: true, pointerId: 4, pointerType: 'touch' }))
            el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }))
          })
          assert.equal(await menu(page).isVisible(), true, `${mode}/${width}: scrolling and canceled drags retain the menu`)
          await surface(page).evaluate(el => {
            const doc = el.ownerDocument, win = doc.defaultView!, outside = doc.querySelector('[data-selection-scroll]')!
            el.dispatchEvent(new win.PointerEvent('pointerdown', { bubbles: true, pointerId: 5, clientX: 10, clientY: 500, pointerType: 'touch' }))
            outside.dispatchEvent(new win.PointerEvent('pointermove', { bubbles: true, pointerId: 5, clientX: 350, clientY: 450, pointerType: 'touch' }))
            outside.dispatchEvent(new win.PointerEvent('pointercancel', { bubbles: true, pointerId: 5, pointerType: 'touch' }))
            outside.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }))
          })
          assert.equal(await menu(page).isVisible(), true, `${mode}/${width}: drags starting inside the editor and ending outside do not dismiss`)
          await item(page, '복사').click()
          await assertNoAutomaticMenu(page, 'a menu action after dragging does not reopen the menu')
          assert.equal(await page.locator('[data-context-fixture]').evaluate(el => (el.ownerDocument.defaultView as unknown as { contextClipboard: { text: string } }).contextClipboard.text), fixture.selected, 'copy after scrolling uses the original selection')

          await scroller.evaluate(el => { el.scrollTop = 0 })
          await settle(page)
          await openSelection()
          await page.locator('[data-selection-outside]').click()
          await menu(page).waitFor({ state: 'hidden' })
          assert.equal(await page.locator('[data-selection-outside]').getAttribute('data-clicks'), '0', 'outside click dismissal still consumes the underlying action')
          await assertNoAutomaticMenu(page, 'a real outside click leaves the menu closed')
          await openSelection()
          // A body tap is handled by the selection hook without blocking native cursor placement.
          await surface(page).evaluate(el => {
            const win = el.ownerDocument.defaultView!
            el.dispatchEvent(new win.PointerEvent('pointerdown', { bubbles: true, pointerId: 8, pointerType: 'touch' }))
            el.dispatchEvent(new win.PointerEvent('pointerup', { bubbles: true, pointerId: 8, pointerType: 'touch' }))
            el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }))
          })
          await menu(page).waitFor({ state: 'hidden' })
          await assertNoAutomaticMenu(page, 'a body click closes the menu without reopening it')
        }
      } finally { await client.detach(); await page.close() }
    }
  })

  await t.test('mobile body taps and touch selection keep keyboard control exclusive to the button', async () => {
    const mobile = await createPage(390, 'light')
    try {
      await surface(mobile).evaluate(el => {
        const doc = el.ownerDocument, win = doc.defaultView!, metrics = doc.documentElement.dataset
        metrics.keyboardShows = '0'
        metrics.keyboardHides = '0'
        const keyboard = Object.assign(new win.EventTarget(), {
          overlaysContent: false, boundingRect: new win.DOMRect(),
          show() {
            metrics.keyboardShows = String(Number(metrics.keyboardShows) + 1)
            metrics.keyboardPolicyAtShow = doc.activeElement?.getAttribute('virtualkeyboardpolicy') ?? ''
          },
          hide() { metrics.keyboardHides = String(Number(metrics.keyboardHides) + 1) },
        })
        Object.defineProperty(win.navigator, 'virtualKeyboard', { configurable: true, value: keyboard })
      })
      const shows = () => mobile.locator('html').getAttribute('data-keyboard-shows')
      for (const fixture of [
        { path: 'fixture.md', viewMode: 'hotview', value: markdown, selected: 'selected text' },
        { path: 'fixture.md', viewMode: 'plain', value: markdown, selected: 'selected text' },
        { path: 'fixture.ts', viewMode: 'plain', value: code, selected: 'selected' },
      ]) {
        await reset(mobile, fixture)
        const previous = Number(await shows())
        await touchPointer(mobile, 'pointerdown', fixture.selected)
        assert.equal(await surface(mobile).getAttribute('virtualkeyboardpolicy'), 'manual', 'suppress keyboard before native focus')
        await select(mobile, fixture.selected, false)
        await touchPointer(mobile, 'pointerup', fixture.selected)
        await menu(mobile).waitFor()
        await item(mobile, '복사').click()
        await mobile.waitForTimeout(350)
        assert.equal(Number(await shows()), previous, 'selecting and copying never request the keyboard')
        assert.equal(await surface(mobile).getAttribute('virtualkeyboardpolicy'), 'manual')

        await reset(mobile, fixture)
        const at = await point(mobile, fixture.selected, 2)
        await mobile.touchscreen.tap(at.x, at.y)
        await mobile.waitForTimeout(350)
        assert.equal(Number(await shows()), previous, 'a settled single tap no longer opens the keyboard')
        assert.equal(await surface(mobile).getAttribute('virtualkeyboardpolicy'), 'manual')
        assert.equal(await surface(mobile).getAttribute('inputmode'), 'none')
        await mobile.getByRole('button', { name: '키보드 열기', exact: true }).tap()
        assert.equal(Number(await shows()), previous + 1, 'only the explicit keyboard button requests input')
        assert.equal(await mobile.locator('html').getAttribute('data-keyboard-policy-at-show'), 'manual')
        await touchPointer(mobile, 'pointerdown', fixture.selected)
        assert.equal(await surface(mobile).getAttribute('inputmode'), 'none', 'touching the editor again dismisses the keyboard')
        await touchPointer(mobile, 'pointercancel', fixture.selected)

        await reset(mobile, fixture)
        const beforeDoubleTap = Number(await shows())
        const next = await point(mobile, fixture.selected, 2)
        await mobile.touchscreen.tap(next.x, next.y)
        await mobile.touchscreen.tap(next.x, next.y)
        await select(mobile, fixture.selected, false)
        await menu(mobile).waitFor()
        assert.equal(Number(await shows()), beforeDoubleTap, 'the first tap does not open a keyboard before double-tap selection')
        const old = await surface(mobile).elementHandle()
        await control(mobile, 'set', { path: 'other.md' })
        await mobile.waitForTimeout(350)
        assert.equal(await old!.getAttribute('virtualkeyboardpolicy'), null, 'file changes restore the previous policy')
        await old!.dispose()

        await reset(mobile, fixture)
        await surface(mobile).evaluate(el => el.setAttribute('virtualkeyboardpolicy', 'auto'))
        await touchPointer(mobile, 'pointerdown', fixture.selected)
        await touchPointer(mobile, 'pointercancel', fixture.selected)
        assert.equal(await surface(mobile).getAttribute('virtualkeyboardpolicy'), 'manual', 'gesture cancellation keeps the mobile keyboard policy')
      }
      assert.ok(Number(await mobile.locator('html').getAttribute('data-keyboard-hides')) >= 3, 'body taps dismiss each explicitly opened keyboard')
      await reset(mobile)
      await surface(mobile).evaluate(el => {
        Object.defineProperty(el.ownerDocument.defaultView!.navigator, 'virtualKeyboard', { configurable: true, value: undefined })
        el.setAttribute('inputmode', 'text')
      })
      await touchPointer(mobile, 'pointerdown', 'selected text')
      await select(mobile, 'selected text', false)
      await touchPointer(mobile, 'pointerup', 'selected text')
      await menu(mobile).waitFor()
      assert.equal(await surface(mobile).getAttribute('inputmode'), 'none', 'unsupported browsers retain keyboard suppression during selection')
      await touchPointer(mobile, 'pointerdown', 'paragraph target')
      assert.equal(await surface(mobile).getAttribute('inputmode'), 'none', 'the next native tap also keeps the keyboard closed')
      await touchPointer(mobile, 'pointercancel', 'paragraph target')
    } finally { await mobile.close() }
  })

  await t.test('desktop text selection does not automatically open the menu', async () => {
    const desktop = await createPage(1280, 'light')
    try {
      for (const fixture of [{}, { viewMode: 'plain' }, { path: 'fixture.ts', value: code, viewMode: 'plain' }]) {
        await reset(desktop, fixture)
        await select(desktop, fixture.path ? 'selected' : 'selected text')
        await assertNoAutomaticMenu(desktop, 'ordinary mouse selection keeps the editor menu closed')
      }
    } finally {
      await desktop.close()
    }
  })

  for (const width of [1280, 390]) for (const theme of ['light', 'dark']) {
    const page = await createPage(width, theme)
    await select(page, 'selected text')
    await open(page, 'selected text', 3)
    await assertMenu(menu(page), width, 844)
    if (captures) await page.screenshot({ path: path.join(captures, `editor-menu-${width}-${theme}.png`) })
    await item(page, '복사').click()
    assert.equal(await page.locator('[data-context-fixture]').evaluate(el => (el.ownerDocument.defaultView as unknown as { contextClipboard: { text: string } }).contextClipboard.text), 'selected text', 'right clicking inside a selection preserves the copied text')
    await control(page, 'set', { editable: false })
    await page.locator('[data-editable="false"]').waitFor()
    await open(page, 'selected text', 3)
    assert.equal(await menu(page).getByRole('menuitem').count(), 7)
    for (const label of ['주석 추가', '댓글 달기', '잘라내기', '붙여넣기', '삭제']) assert.equal(await item(page, label).isDisabled(), true, `readonly disables ${label}`)
    await page.close()
  }

  const page = await createPage(1280, 'light')
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await select(page, 'selected text')
  await open(page, 'Second paragraph target.', 6)
  for (const label of ['복사', '잘라내기', '삭제']) assert.equal(await item(page, label).isDisabled(), true, `a right click outside the old selection clears ${label}`)
  await item(page, '주석 추가').click()
  const annotation = page.getByRole('dialog', { name: '주석 1)', exact: true })
  await annotation.waitFor()
  assert.match(await value(page), /Second.*\^\[1\].*paragraph target\./)
  assert.match(await value(page), /Alpha selected text omega\./)
  await annotation.getByRole('button', { name: '닫기', exact: true }).click()
  await reset(page)
  await surface(page).locator('p').filter({ hasText: /^$/ }).last().click({ button: 'right', position: { x: 12, y: 6 } })
  await menu(page).waitFor()
  assert.equal(await item(page, '댓글 달기').isDisabled(), true, 'an empty paragraph has no comment target')
  await page.keyboard.press('Escape')

  for (const viewMode of ['hotview', 'plain']) {
    await reset(page, { viewMode })
    await open(page, 'Second paragraph target.', 6)
    await item(page, '댓글 달기').click()
    const comment = page.getByRole('dialog', { name: '댓글', exact: true })
    await comment.getByTitle('Second paragraph target.', { exact: true }).waitFor()
    await comment.getByRole('button', { name: '댓글 닫기', exact: true }).click()
    await select(page, 'selected text')
    await open(page, 'selected text', 3)
    await control(page, 'clipboard', { failWrite: true })
    const unchanged = await value(page)
    await item(page, '복사').click()
    await page.getByText('복사하지 못했습니다. Ctrl/Cmd+C로 다시 시도하세요.', { exact: true }).waitFor()
    await open(page, 'selected text', 3)
    await item(page, '잘라내기').click()
    await page.getByText('잘라내지 못했습니다. Ctrl/Cmd+X로 다시 시도하세요.', { exact: true }).waitFor()
    assert.equal(await value(page), unchanged, 'a denied clipboard write never cuts the selection')
    await control(page, 'clipboard', { failWrite: false })
    await open(page, 'selected text', 3)
    await item(page, '잘라내기').click()
    await page.waitForFunction(el => !el.getAttribute('data-value')?.includes('selected text'), await page.locator('[data-context-fixture]').elementHandle())
    await reset(page, { viewMode })
    await select(page, 'selected text')
    await open(page, 'selected text', 3)
    await control(page, 'clipboard', { failRead: true })
    await item(page, '붙여넣기').click()
    await page.getByText('붙여넣지 못했습니다. Ctrl/Cmd+V로 다시 시도하세요.', { exact: true }).waitFor()
    await control(page, 'clipboard', { failRead: false })
    await open(page, 'selected text', 3)
    await control(page, 'clipboard', { text: 'PASTED' })
    await item(page, '붙여넣기').click()
    await page.waitForFunction(el => el.getAttribute('data-value')?.includes('Alpha PASTED omega.'), await page.locator('[data-context-fixture]').elementHandle())
    await reset(page, { viewMode })
    await select(page, 'selected text')
    await open(page, 'selected text', 3)
    await item(page, '삭제').click()
    assert.doesNotMatch(await value(page), /selected text/)
    await open(page, 'Second paragraph target.', 6)
    await item(page, '전체 선택').click()
    const all = await page.locator('[data-context-fixture]').evaluate(el => (el.ownerDocument.defaultView as unknown as { contextFixtureSelection: () => string | null }).contextFixtureSelection())
    assert.match(all ?? '', /Context fixture[\s\S]*Alpha[\s\S]*Second paragraph target/)
    await open(page, 'Second paragraph target.', 6)
    assert.equal(await item(page, '복사').isDisabled(), false)
    await page.keyboard.press('Escape')
  }

  await reset(page, { path: 'fixture.ts', value: code, viewMode: 'plain' })
  await select(page, 'selected')
  await open(page, 'selected', 3)
  assert.equal(await item(page, '주석 추가').isDisabled(), true)
  await item(page, '복사').click()
  assert.equal(await page.locator('[data-context-fixture]').evaluate(el => (el.ownerDocument.defaultView as unknown as { contextClipboard: { text: string } }).contextClipboard.text), 'selected')
  await open(page, 'next', 2)
  await item(page, '댓글 달기').click()
  await page.getByRole('dialog', { name: '댓글', exact: true }).getByTitle('const next = "target";', { exact: true }).waitFor()
  await page.getByRole('button', { name: '댓글 닫기', exact: true }).click()
  const blank = await page.locator('.cm-scroller').boundingBox()
  assert.ok(blank)
  await page.mouse.click(blank.x + 100, blank.y + blank.height - 16, { button: 'right' })
  await menu(page).waitFor()
  assert.equal(await item(page, '복사').isDisabled(), true)
  await control(page, 'clipboard', { text: 'TAIL' })
  await item(page, '붙여넣기').click()
  await page.waitForFunction(({ el, expected }) => el.getAttribute('data-value') === expected, { el: await page.locator('[data-context-fixture]').elementHandle(), expected: code + 'TAIL' })

  for (const scope of [{ workspace: '/fixture/workspace-b' }, { path: 'other.md' }, { viewMode: 'plain' }, { editable: false }]) {
    await reset(page)
    await open(page, 'Second paragraph target.', 6)
    await control(page, 'clipboard', { text: 'LATE PASTE', holdRead: true })
    await item(page, '붙여넣기').click()
    await clipboardWaiting(page, 'readWaiting')
    await control(page, 'set', scope)
    await settle(page)
    await control(page, 'release')
    await settle(page)
    assert.equal(await value(page), markdown, `pending paste is discarded after ${JSON.stringify(scope)}`)
    await control(page, 'clipboard', { holdRead: false })
  }
  await reset(page)
  await select(page, 'selected text')
  await open(page, 'selected text', 3)
  await control(page, 'clipboard', { holdWrite: true })
  await item(page, '잘라내기').click()
  await clipboardWaiting(page, 'writeWaiting')
  await control(page, 'set', { editable: false })
  await page.locator('[data-editable="false"]').waitFor()
  await control(page, 'release')
  await settle(page)
  assert.equal(await value(page), markdown, 'pending clipboard write cannot cut after edit access is revoked')
  await control(page, 'clipboard', { holdWrite: false })

  await reset(page, { value: '| H1 | H2 |\n|---|---|\n| A1 | A2 |\n' })
  await surface(page).getByText('A2', { exact: true }).click({ button: 'right' })
  await menu(page).waitFor()
  for (const name of ['행 추가', '열 추가', 'csv로 복사', '이미지로 복사']) await menu(page).getByRole('menuitem', { name, exact: true }).waitFor()
  await menu(page).getByRole('menuitem', { name: /^md로 복사/ }).waitFor()
  if (captures) await page.screenshot({ path: path.join(captures, 'editor-menu-table-1280-light.png') })
  await menu(page).getByRole('menuitem', { name: '행 추가', exact: true }).click()
  assert.equal(await surface(page).locator('tr').count(), 3)
  assert.deepEqual(errors, [])
  await page.close()
})
