import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { Editor as TiptapEditor } from '@tiptap/core'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { chromium, type CDPSession, type Page } from 'playwright-core'
import { domBrowserExecutable } from './browser-dom-executable.ts'

const markdown = 'Alpha selected text omega.\n\n[문서홈](./home.md)\n\nBefore [다른 문서](./other.md) after.\n\n[첫 문서](./first.md)[둘째 문서](./second.md)\n\n**Bold [굵은 링크](./bold.md) rest**\n\n```ts\nconst value = 1\n```\n'
const code = 'const selected = "value";\nconst next = "target";\n'
const composed = '한글'

function surface(page: Page) { return page.locator('.ProseMirror, .cm-content') }
function keyboard(page: Page) { return page.getByRole('button', { name: '키보드 열기', exact: true }) }
async function value(page: Page) { return (await page.locator('[data-ime-fixture]').getAttribute('data-value'))! }

async function selectText(page: Page, text: string, collapsed = false) {
  await surface(page).evaluate((el, { text, collapsed }) => {
    const doc = el.ownerDocument, walker = doc.createTreeWalker(el, 4)
    el.focus({ preventScroll: true })
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const at = node.textContent?.indexOf(text) ?? -1
      if (at < 0) continue
      const range = doc.createRange()
      range.setStart(node, at + (collapsed ? text.length : 0))
      range.setEnd(node, at + text.length)
      const selection = doc.getSelection()!
      selection.removeAllRanges(); selection.addRange(range)
      doc.dispatchEvent(new doc.defaultView!.Event('selectionchange'))
      return
    }
    throw new Error(`IME target not found: ${text}`)
  }, { text, collapsed })
  await page.waitForTimeout(30)
}

async function compose(client: CDPSession) {
  for (const text of ['ㅎ', '하', '한', '한ㄱ', '한그', composed]) {
    await client.send('Input.imeSetComposition', { text, selectionStart: text.length, selectionEnd: text.length })
  }
  await client.send('Input.insertText', { text: composed })
}

test('trusted Korean IME commits in mobile editors after menu actions and at file-link caret boundaries', {
  skip: !domBrowserExecutable(), timeout: 120_000,
}, async t => {
  const repo = path.resolve(import.meta.dirname, '..')
  const source = `
import React from 'react';import {createRoot} from 'react-dom/client';
import {EditorPane} from ${JSON.stringify(path.join(repo, 'src/components/EditorPane.tsx'))};
import {I18nProvider} from ${JSON.stringify(path.join(repo, 'src/i18n.tsx'))};
const noop=()=>{},defaults={path:'fixture.md',content:${JSON.stringify(markdown)},viewMode:'hotview',editable:true};
Object.defineProperty(navigator,'clipboard',{configurable:true,value:{async writeText(text){window.copied=text}}});
Object.defineProperty(navigator,'virtualKeyboard',{configurable:true,value:Object.assign(new EventTarget(),{overlaysContent:false,boundingRect:new DOMRect(),show(){},hide(){}})});
const callbacks=Object.fromEntries(['registerElement','registerTabBar','onFocus','onActivate','onPin','onCloseTab','onReorder','onOpenLink','onOpenHistory','onSetTocOpen','onOpenSidebar','onTabDragMove','onTabDrop'].map(key=>[key,noop]));
function Fixture(){const [state,setState]=React.useState({...defaults,generation:0});const handle=React.useRef(null);
 window.resetFixture=values=>setState(old=>({...defaults,...values,generation:old.generation+1}));window.fixtureSelection=()=>handle.current?.getSelectedText();
 return <div data-ime-fixture data-value={state.content} data-generation={state.generation} className="flex h-dvh flex-col"><EditorPane key={state.generation} {...callbacks}
 registerHandle={(_,value)=>handle.current=value} pane={{id:'main',tabs:[{...state,preview:false}],activePath:state.path}}
 onChangeContent={(_,content)=>setState(old=>({...old,content}))} onSetViewMode={(_,viewMode)=>setState(old=>({...old,viewMode}))}
 role="owner" authEmail="fixture@example.test" project="docs" focused tree={[]} presence={{}} canCollaborate={false}
 showSidebarButton={false} tocOpen={false} dropZone={null}/></div>;
}createRoot(document.getElementById('root')).render(<I18nProvider><Fixture/></I18nProvider>);`
  const candidates = [source], styles: string[] = []
  const bundle = await build({ input: 'virtual:editor-ime.tsx', write: false, platform: 'browser', output: { format: 'esm', codeSplitting: false },
    onwarn(warning, warn) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning) },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
    plugins: [{ name: 'editor-ime-fixture', resolveId(id) { if (id === 'virtual:editor-ime.tsx') return id }, async load(id) {
      if (id === 'virtual:editor-ime.tsx') return source
      if (id.endsWith('.tsx')) candidates.push(await fs.readFile(id, 'utf8'))
      if (id.endsWith('.css')) { styles.push(await fs.readFile(id, 'utf8')); return { code: '', moduleType: 'js' } }
    } }],
  })
  const compiler = await compile(await fs.readFile(path.join(repo, 'src/index.css'), 'utf8'), { base: path.join(repo, 'src'), onDependency() {} })
  const css = compiler.build([...new Set(candidates.join('\n').match(/[A-Za-z0-9_@!:/.[\]()%,-]+/g))]) + styles.join('\n')
  const entry = bundle.output.find(item => item.type === 'chunk' && item.isEntry)!
  assert.ok(entry.type === 'chunk')
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true })
  page.setDefaultTimeout(5000)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(`localStorage.setItem('mew:locale','ko');localStorage.setItem('mew:ui-locale','ko');`)
  await page.route('http://mew-editor-ime.test/**', route => {
    const url = new URL(route.request().url())
    if (url.pathname === '/api/comments') return route.fulfill({ json: { threads: [] } })
    if (url.pathname === '/api/members') return route.fulfill({ json: { members: [] } })
    if (url.pathname.startsWith('/api/')) return route.fulfill({ json: [] })
    return route.fulfill(url.pathname === '/app.js' ? { contentType: 'text/javascript', body: entry.code }
      : { contentType: 'text/html', body: `<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script type="module" src="/app.js"></script></html>` })
  })
  await page.goto('http://mew-editor-ime.test/')
  const client = await page.context().newCDPSession(page)
  t.after(async () => { await client.detach(); await browser.close() })
  let viewportWidth = 390
  async function reset(values: Record<string, string> = {}) {
    const generation = await page.locator('[data-ime-fixture]').getAttribute('data-generation')
    await page.evaluate(`window.resetFixture(${JSON.stringify(values)})`)
    await page.waitForFunction(({ el, generation }) => el.getAttribute('data-generation') !== generation, { el: await page.locator('[data-ime-fixture]').elementHandle(), generation })
    await surface(page).waitFor()
    if (viewportWidth < 768) await keyboard(page).waitFor()
  }
  async function assertCommitted(expected: string, label: string) {
    await compose(client)
    await page.waitForTimeout(100)
    assert.equal(await value(page), expected, label)
    assert.doesNotMatch(await value(page), /\u200b|mew-file-link-caret/)
  }
  async function selectLinkBoundary(index: number, side: 'before' | 'after') {
    const link = page.locator('.ProseMirror a[data-file-link]').nth(index)
    if (viewportWidth < 768) await keyboard(page).tap()
    else await surface(page).focus()
    await link.evaluate((el, side) => {
      const root = el.closest('.ProseMirror') as typeof el & { editor: TiptapEditor }
      const pos = root.editor.view.posAtDOM(el, 0) + (side === 'before' ? el.textContent!.length : 0)
      root.editor.commands.setTextSelection(pos)
      root.focus()
    }, side)
    await page.keyboard.press(side === 'before' ? 'ArrowLeft' : 'ArrowRight')
    return link
  }

  for (const mode of [
    { name: 'Hotview', path: 'fixture.md', viewMode: 'hotview', content: markdown, selected: 'selected text', caret: 'omega.' },
    { name: 'Markdown Plain', path: 'fixture.md', viewMode: 'plain', content: markdown, selected: 'selected text', caret: 'omega.' },
    { name: 'code', path: 'fixture.ts', viewMode: 'plain', content: code, selected: 'selected', caret: 'target' },
  ]) {
    await t.test(`${mode.name}: initial composition`, async () => {
      await reset(mode)
      await selectText(page, mode.caret, true)
      await keyboard(page).tap()
      assert.equal(await surface(page).getAttribute('inputmode'), null)
      await assertCommitted(mode.content.replace(mode.caret, mode.caret + composed), mode.name)
    })
    await t.test(`${mode.name}: composition after native selected-range menu copy`, async () => {
      await reset(mode)
      await surface(page).evaluate(el => el.dispatchEvent(new el.ownerDocument.defaultView!.PointerEvent('pointerdown', { bubbles: true, pointerId: 7, pointerType: 'touch', isPrimary: true })))
      await selectText(page, mode.selected)
      await surface(page).evaluate(el => {
        const win = el.ownerDocument.defaultView!
        el.dispatchEvent(new win.PointerEvent('pointerup', { bubbles: true, pointerId: 7, pointerType: 'touch', isPrimary: true }))
        const event = new win.PointerEvent('contextmenu', { bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 7, button: 2 })
        el.dispatchEvent(event)
        if (!event.defaultPrevented) throw new Error('Native menu was not suppressed')
      })
      await page.getByRole('menu', { name: '에디터 메뉴', exact: true }).getByRole('menuitem', { name: '복사', exact: true }).click()
      assert.equal(await page.evaluate('window.copied'), mode.selected)
      await keyboard(page).tap()
      assert.equal(await page.evaluate('window.fixtureSelection()'), mode.selected)
      await assertCommitted(mode.content.replace(mode.selected, composed), mode.name)
    })
    await t.test(`${mode.name}: composition after body tap and keyboard reopening`, async () => {
      await reset(mode)
      await selectText(page, mode.caret, true)
      await keyboard(page).tap()
      await surface(page).tap({ position: { x: 20, y: 10 } })
      assert.equal(await surface(page).getAttribute('inputmode'), 'none')
      await selectText(page, mode.caret, true)
      await keyboard(page).tap()
      await assertCommitted(mode.content.replace(mode.caret, mode.caret + composed), mode.name)
    })
  }

  await t.test('Hotview: canceling a boundary composition preserves the document and permits the next composition', async () => {
    await reset()
    await selectLinkBoundary(0, 'before')
    await client.send('Input.imeSetComposition', { text: 'ㅎ', selectionStart: 1, selectionEnd: 1 })
    await client.send('Input.imeSetComposition', { text: '', selectionStart: 0, selectionEnd: 0 })
    await page.waitForTimeout(100)
    assert.equal(await value(page), markdown)
    assert.doesNotMatch(await value(page), /\u200b|mew-file-link-caret/)
    await assertCommitted(markdown.replace('[문서홈]', composed + '[문서홈]'), 'new composition after cancellation')
  })

  for (viewportWidth of [390, 1280]) {
    await page.setViewportSize({ width: viewportWidth, height: 844 })
    for (const index of [0, 1, 2, 3, 4]) {
      for (const side of ['before', 'after'] as const) {
        await t.test(`Hotview ${viewportWidth}px: composition ${side} file link ${index}`, async () => {
          await reset()
          const link = await selectLinkBoundary(index, side)
          const label = (await link.textContent())!, href = (await link.getAttribute('href'))!
          const originalLink = `[${label}](${href})`
          await assertCommitted(markdown.replace(originalLink, side === 'before' ? composed + originalLink : originalLink + composed), `${side} link ${index}`)
          assert.equal(await link.textContent(), label)
        })
      }
    }
  }
  await t.test('Hotview: composition in code block', async () => {
    viewportWidth = 390
    await page.setViewportSize({ width: viewportWidth, height: 844 })
    await reset()
    await selectText(page, 'const value = 1', true)
    await keyboard(page).tap()
    await assertCommitted(markdown.replace('const value = 1', 'const value = 1' + composed), 'Hotview code block')
  })
  assert.deepEqual(errors, [])
})
