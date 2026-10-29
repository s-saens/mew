import './test-isolated-data.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { chromium } from 'playwright-core'
import { domBrowserExecutable } from './browser-dom-executable.ts'
import { DocumentPages } from './document-pages.ts'

const repo = path.resolve(import.meta.dirname, '..')

test('/page names children inline and preserves editing across path changes on desktop and mobile', { skip: !domBrowserExecutable(), timeout: 90_000 }, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-page-command-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const source = `
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {EditorPane} from '${repo}/src/components/EditorPane.tsx';
    import {useTabs} from '${repo}/src/hooks/useTabs.ts';
    import {I18nProvider} from '${repo}/src/i18n.tsx';
    import {editorTabPath} from '${repo}/src/utils/editor-files.ts';
    const noop=()=>{};
    function Fixture(){
      const [notice,setNotice]=React.useState(''),[guest,setGuest]=React.useState(false);
      const tabs=useTabs('.workspace',noop,setNotice,'fixture');
      const callbacks=Object.fromEntries(['registerHandle','registerElement','registerTabBar','onPin','onCloseTab','onReorder','onOpenHistory','onSetTocOpen','onOpenSidebar','onTabDragMove','onTabDrop'].map(key=>[key,noop]));
      return <div className="flex h-dvh flex-col">
        <nav><button onClick={()=>tabs.openFile(editorTabPath('docs','abc.md'),{preview:false})}>Docs</button>
          <button onClick={()=>tabs.openFile('notes.md',{preview:false})}>Workspace</button>
          <button onClick={()=>tabs.openFile(editorTabPath('docs','readonly.md'),{preview:false})}>Readonly</button>
          <button onClick={()=>setGuest(value=>!value)}>Guest</button></nav>
        <div data-active={tabs.activePath||''} data-tabs={JSON.stringify(tabs.tabs.map(tab=>tab.path))}/>
        {tabs.panes.map(pane=><EditorPane key={pane.id} {...callbacks} pane={pane} role={guest?'guest':'owner'} authEmail={null} project=".workspace"
          tree={[]} presence={{}} focused isGuest={guest} canCollaborate={location.search.includes('collab')} showSidebarButton={false} tocOpen={false} dropZone={null}
          onFocus={()=>tabs.focusPane(pane.id)} onActivate={path=>tabs.setActivePath(path,pane.id)} onSetViewMode={tabs.setTabViewMode}
          onChangeContent={tabs.updateTabContent} onOpenLink={path=>tabs.openFile(path,{preview:false,paneId:pane.id})}
          onCreateChildPage={async (path,name,onCreated)=>{await tabs.createChildPage(path,name,onCreated)}}/>)}
        <span role="status">{notice}</span>
      </div>
    }
    createRoot(document.getElementById('root')).render(<I18nProvider><Fixture/></I18nProvider>);
  `
  const candidates = [source], styles: string[] = []
  const bundle = await build({
    onLog(level, log, handler) { if (log.code !== 'MODULE_LEVEL_DIRECTIVE') handler(level, log) }, input: 'virtual:page-command.tsx', write: false, platform: 'browser',
    output: { format: 'esm' }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
    plugins: [{ name: 'page-command-fixture', resolveId(id) {
        if (id === 'virtual:page-command.tsx') return id
        if (id === '@mew/editor') return path.join(repo, 'packages/editor/src/index.ts')
        if (id === '@mew/editor/frontmatter') return path.join(repo, 'packages/editor/src/utils/frontmatter.ts')
      },
      load(id) {
        if (id === 'virtual:page-command.tsx') return source
        if (id.endsWith('.tsx')) candidates.push(fs.readFileSync(id, 'utf8'))
        if (id.endsWith('.css')) { styles.push(fs.readFileSync(id, 'utf8')); return { code: '', moduleType: 'js' } }
      },
    }],
  })
  const chunks = bundle.output.filter(item => item.type === 'chunk')
  const entry = chunks.find(item => item.isEntry)!
  const scripts = new Map(chunks.map(item => [`/${item.fileName}`, item.code]))
  const compiler = await compile(fs.readFileSync(`${repo}/src/index.css`, 'utf8'), { base: `${repo}/src`, onDependency() {} })
  const css = compiler.build([...new Set(candidates.join('\n').match(/[A-Za-z0-9_@!:/.[\]()%,-]+/g))]) + styles.join('\n')
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  t.after(() => browser.close())
  for (const collaborative of [false, true]) for (const width of [1100, 390]) {
    const workspace = path.join(root, `${width}-${collaborative}`), docs = path.join(workspace, 'docs')
    fs.mkdirSync(docs, { recursive: true })
    fs.writeFileSync(path.join(docs, 'abc.md'), '# ABC\n\n[참고](readonly.md)\n\n' + Array.from({ length: 30 }, (_, i) => `Earlier paragraph ${i}`).join('\n\n') + '\n\nOriginal body\n\nAfter command\n')
    fs.writeFileSync(path.join(docs, 'readonly.md'), 'Readonly body')
    fs.writeFileSync(path.join(workspace, 'notes.md'), 'Workspace body')
    const pages = { docs: new DocumentPages(docs), '.workspace': new DocumentPages(workspace) }
    const page = await browser.newPage({ viewport: { width, height: 800 }, hasTouch: width < 768 })
    page.setDefaultTimeout(5000)
    const errors: string[] = [], requests: { path: string; project: string }[] = []
    let deny = false, releaseCreation: (() => void) | undefined
    page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(() => { localStorage.setItem('mew:locale', 'ko'); localStorage.setItem('mew:ui-locale', 'ko') })
    await page.route('http://mew-page-command.test/**', async route => {
      const url = new URL(route.request().url()), method = route.request().method()
      const json = (value: unknown) => route.fulfill({ json: value })
      if (url.pathname === '/api/docs/pages/create') {
        const body = route.request().postDataJSON() as { path: string; project: keyof typeof pages; name: string; unique: boolean }
        requests.push(body)
        if (deny) return route.fulfill({ status: 403, json: { error: '하위 페이지를 만들 권한이 없습니다' } })
        const result = pages[body.project].create(body.path, body.name, body.unique)
        if (requests.length === 1) await new Promise<void>(resolve => { releaseCreation = resolve })
        return json(result)
      }
      if (url.pathname === '/api/file') {
        const body = method === 'PUT' ? route.request().postDataJSON() : null
        const rel = body?.path ?? url.searchParams.get('path')!
        const project = body?.project ?? url.searchParams.get('project') ?? 'docs'
        const file = path.join(project === 'docs' ? docs : workspace, rel)
        if (body) { fs.writeFileSync(file, body.content); return json({ ok: true, commit: null }) }
        if (!fs.existsSync(file)) return route.fulfill({ status: 404, json: { error: 'Missing file' } })
        return json({ path: rel, content: fs.readFileSync(file, 'utf8'), editable: rel !== 'readonly.md' })
      }
      if (url.pathname === '/api/rules') return json({ violations: [], archived: false })
      if (url.pathname === '/api/file-access') return json({ view: true, edit: true })
      if (url.pathname === '/api/comments') return json({ threads: [] })
      if (url.pathname === '/api/members') return json({ members: [] })
      if (url.pathname === '/api/table-layout') return json({ tables: [] })
      if (url.pathname.startsWith('/api/')) return json([])
      if (url.pathname === '/app.js' || scripts.has(url.pathname)) return route.fulfill({ contentType: 'text/javascript', body: url.pathname === '/app.js' ? entry.code : scripts.get(url.pathname)! })
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html class="${width > 768 ? 'dark' : ''}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script type="module" src="/app.js"></script></html>` })
    })
    await page.routeWebSocket('**/api/collab?**', ws => {
      ws.onMessage(message => {
        if (typeof message !== 'string' && message[0] === 0 && message[1] === 0) ws.send(Buffer.from([0, 1, 2, 0, 0]))
      })
    })
    await page.goto(`http://mew-page-command.test/${collaborative ? '?collab' : ''}`)
    await page.getByRole('button', { name: 'Docs', exact: true }).click()
    const editor = page.locator('.tiptap')
    await editor.getByText('Original body', { exact: true }).waitFor()
    await editor.evaluate(el => new Promise<void>(resolve => {
      const win = el.ownerDocument.defaultView!
      win.requestAnimationFrame(() => win.requestAnimationFrame(() => resolve()))
    }))
    await editor.getByText('Original body', { exact: true }).click()
    assert.equal(await editor.evaluate(el => el.ownerDocument.getSelection()?.anchorNode?.textContent), 'Original body')
    await page.keyboard.press('End')
    assert.equal(await editor.evaluate(el => el.ownerDocument.getSelection()?.anchorOffset), 'Original body'.length)
    await page.keyboard.press('Enter')
    await page.keyboard.type('Draft before command'); await page.keyboard.press('Enter'); await page.keyboard.type('/page')
    const command = page.getByRole('button', { name: '하위 페이지 새 하위 페이지 만들기', exact: true })
    await command.waitFor()
    await page.screenshot({ path: `/tmp/mew-page-command-${width}.png` })
    if (width > 768) await page.keyboard.press('Enter')
    else await command.tap()
    const nameInput = page.getByRole('textbox', { name: '새 문서 이름', exact: true })
    await nameInput.waitFor()
    assert.equal(await editor.getByRole('textbox', { name: '새 문서 이름', exact: true }).count(), 1, 'the field is inline at the command position')
    assert.equal(await nameInput.evaluate(el => el.ownerDocument.activeElement === el), true, 'inline entry receives focus')
    assert.equal(await page.getByRole('dialog').count(), 0, 'naming does not open a popup')
    const inputBounds = await nameInput.boundingBox()
    const paragraphBounds = await editor.getByText('Draft before command', { exact: true }).boundingBox()
    assert.ok(inputBounds && paragraphBounds && inputBounds.y > paragraphBounds.y, 'the field appears in the command paragraph')
    assert.ok(inputBounds.x >= 0 && inputBounds.x + inputBounds.width <= width, 'inline controls fit the viewport')
    await page.screenshot({ path: `/tmp/mew-page-name-${width}.png` })
    assert.equal(requests.length, 0, 'opening the inline name field does not create a page')
    assert.equal(await page.getByRole('button', { name: '만들기', exact: true }).isDisabled(), true)
    await nameInput.press('Enter')
    await nameInput.fill('   ')
    assert.equal(await page.getByRole('button', { name: '만들기', exact: true }).isDisabled(), true)
    await nameInput.press('Enter')
    assert.equal(requests.length, 0, 'empty and whitespace-only names cannot be submitted')
    await nameInput.fill('회의 기록')
    await nameInput.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true })
    assert.equal(requests.length, 0, 'Enter while composing Korean does not create a page')
    await nameInput.dispatchEvent('keydown', { key: 'Enter', keyCode: 229 })
    assert.equal(requests.length, 0, 'legacy IME confirmation does not create a page')
    await editor.getByText('Earlier paragraph 29', { exact: true }).click()
    await page.keyboard.press('Home'); await page.keyboard.insertText('Before naming ')
    await nameInput.click()
    assert.equal(await nameInput.inputValue(), '회의 기록', 'body edits retain the unfinished name and track its position')
    await nameInput.press('Enter')
    await page.locator('[data-active$="abc.md"]').waitFor({ state: 'attached' })
    while (!releaseCreation) await page.waitForTimeout(20)
    await nameInput.waitFor({ state: 'hidden' })
    await page.waitForTimeout(100)
    assert.match(fs.readFileSync(path.join(docs, 'abc/_abc.md'), 'utf8'), /Draft before command/)
    assert.match(fs.readFileSync(path.join(docs, 'abc/_abc.md'), 'utf8'), /Original body/)
    assert.match(fs.readFileSync(path.join(docs, 'abc/_abc.md'), 'utf8'), /Before naming Earlier paragraph 29/)
    assert.doesNotMatch(fs.readFileSync(path.join(docs, 'abc/_abc.md'), 'utf8'), /\/page/)
    await editor.getByText('Original body', { exact: true }).click(); await page.keyboard.press('Home'); await page.keyboard.insertText('Before insertion ')
    await editor.getByText('After command', { exact: true }).click(); await page.keyboard.press('End'); await page.keyboard.insertText('During creation')
    await page.waitForTimeout(600)
    const scrollBefore = await page.locator('.editor-root').evaluate(el => el.scrollTop)
    assert.ok(scrollBefore > 200, 'the fixture exercises promotion away from the top of a document')
    assert.equal(fs.existsSync(path.join(docs, 'abc.md')), false, 'pending autosave does not recreate the old path')
    releaseCreation!()
    await page.locator('[data-active$="abc/_abc.md"]').waitFor({ state: 'attached' })
    await page.waitForTimeout(650)
    assert.match(fs.readFileSync(path.join(docs, 'abc/_abc.md'), 'utf8'), /During creation/)
    assert.equal(fs.existsSync(path.join(docs, 'abc.md')), false)
    assert.equal(fs.existsSync(path.join(docs, 'abc/회의 기록.md')), true)
    const childLink = editor.getByRole('link', { name: '회의 기록', exact: true })
    await childLink.waitFor()
    assert.equal(await childLink.getAttribute('href'), '%ED%9A%8C%EC%9D%98%20%EA%B8%B0%EB%A1%9D.md')
    assert.match(fs.readFileSync(path.join(docs, 'abc/_abc.md'), 'utf8'), /\[회의 기록\]\(%ED%9A%8C%EC%9D%98%20%EA%B8%B0%EB%A1%9D\.md\)/)
    assert.match((await editor.innerText()).replace(/\u200b/g, ''), /Before insertion Original body\s+Draft before command\s+회의 기록\s+After command/)
    assert.equal(await editor.getByRole('link', { name: '참고', exact: true }).getAttribute('href'), '../readonly.md')
    assert.equal(await editor.evaluate(el => el.ownerDocument.activeElement === el), true, 'path changes retain editor focus')
    assert.ok(Math.abs(await page.locator('.editor-root').evaluate(el => el.scrollTop) - scrollBefore) < 2, 'path changes retain scroll position')
    await page.keyboard.insertText(' after creation')
    await page.waitForTimeout(650)
    assert.match(fs.readFileSync(path.join(docs, 'abc/_abc.md'), 'utf8'), /During creation after creation/, 'typing resumes at the same caret after promotion')
    assert.equal(await page.getByRole('tab').count(), 1, 'creation does not open a child tab')
    async function createNamed(name: string, clickConfirm = false) {
      await editor.click(); await page.keyboard.press('ControlOrMeta+End'); await page.keyboard.press('Enter')
      await page.keyboard.type('/page'); await command.click()
      await nameInput.fill(name)
      if (clickConfirm) await page.getByRole('button', { name: '만들기', exact: true }).click()
      else await nameInput.press('Enter')
    }
    await createNamed('회의 기록', true)
    await page.waitForTimeout(650)
    assert.equal(fs.existsSync(path.join(docs, 'abc/회의 기록 2.md')), true)
    await editor.getByRole('link', { name: '회의 기록 2', exact: true }).waitFor()
    assert.equal(requests.length, 2)
    assert.match((await page.locator('[data-active]').getAttribute('data-active'))!, /abc\/_abc.md$/)
    // A document opens only after an explicit link click.
    await childLink.click({ modifiers: ['ControlOrMeta'] })
    await page.waitForTimeout(300)
    assert.match((await page.locator('[data-active]').getAttribute('data-active'))!, /abc\/회의 기록.md$/, JSON.stringify({errors}))
    await page.locator('[data-editor-loading]').waitFor({ state: 'hidden' })
    await createNamed('중첩 페이지')
    await page.waitForTimeout(650)
    assert.equal(fs.existsSync(path.join(docs, 'abc/회의 기록/중첩 페이지.md')), true)
    assert.match((await page.locator('[data-active]').getAttribute('data-active'))!, /회의 기록\/_회의 기록.md$/)
    await page.getByRole('button', { name: 'Workspace', exact: true }).click()
    await editor.getByText('Workspace body', { exact: true }).waitFor()
    await createNamed('작업 메모')
    await page.locator('[data-active="notes/_notes.md"]').waitFor({ state: 'attached' })
    assert.equal(fs.existsSync(path.join(workspace, 'notes/작업 메모.md')), true)
    const beforeCancel = requests.length
    await editor.click(); await page.keyboard.press('ControlOrMeta+End'); await page.keyboard.press('Enter')
    await page.keyboard.type('/page'); await command.click()
    await nameInput.fill('취소할 페이지'); await page.keyboard.press('Escape')
    await nameInput.waitFor({ state: 'hidden' })
    assert.equal(requests.length, beforeCancel)
    assert.equal(await editor.evaluate(el => el.ownerDocument.activeElement === el), true, 'Esc restores focus to the document')
    await page.keyboard.type('/page'); await command.click()
    await nameInput.fill('버튼으로 취소할 페이지')
    await page.getByRole('button', { name: '취소', exact: true }).click()
    await nameInput.waitFor({ state: 'hidden' })
    assert.equal(requests.length, beforeCancel, 'the inline cancel button creates nothing')
    assert.equal(await editor.evaluate(el => el.ownerDocument.activeElement === el), true, 'cancel button restores editor focus immediately')
    await page.keyboard.type('/page'); await command.click()
    await nameInput.fill('키보드로 취소할 페이지')
    await nameInput.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Enter')
    await nameInput.waitFor({ state: 'hidden' })
    assert.equal(requests.length, beforeCancel, 'Enter on the cancel button cancels instead of submitting')
    await page.keyboard.type('/page'); await command.click()
    await nameInput.fill('이동 중인 페이지')
    await page.waitForTimeout(650)
    assert.doesNotMatch(fs.readFileSync(path.join(workspace, 'notes/_notes.md'), 'utf8'), /이동 중인 페이지|새 문서 이름/, 'unfinished names and input controls never enter autosave')
    await page.getByRole('button', { name: 'Readonly', exact: true }).click()
    await editor.getByText('Readonly body', { exact: true }).waitFor()
    await nameInput.waitFor({ state: 'hidden' })
    assert.equal(requests.length, beforeCancel, 'navigation cancels unfinished entry')
    await page.getByRole('tab').filter({ has: page.locator('[title="_notes.md"]') }).click()
    await page.locator('[data-active="notes/_notes.md"]').waitFor({ state: 'attached' })
    assert.equal(await nameInput.count(), 0, 'returning to the source does not restore an unfinished field')
    deny = true
    await createNamed('거부할 페이지')
    await page.getByText('하위 페이지를 만들 권한이 없습니다', { exact: true }).waitFor()
    assert.equal(await page.locator('[data-active]').getAttribute('data-active'), 'notes/_notes.md')
    assert.equal(fs.existsSync(path.join(workspace, 'notes/거부할 페이지.md')), false)
    await page.getByRole('button', { name: 'Readonly', exact: true }).click()
    await editor.getByText('Readonly body', { exact: true }).waitFor()
    assert.equal(await editor.getAttribute('contenteditable'), 'false')
    await page.getByRole('tab').filter({ has: page.locator('[title="_notes.md"]') }).click()
    await editor.click(); await page.keyboard.press('ControlOrMeta+End'); await page.keyboard.press('Enter'); await page.keyboard.type('/page')
    await command.click(); await nameInput.fill('권한 변경으로 취소할 페이지')
    const beforeGuest = requests.length
    await page.getByRole('button', { name: 'Guest', exact: true }).click()
    await nameInput.waitFor({ state: 'hidden' })
    assert.equal(requests.length, beforeGuest, 'losing creation access cancels unfinished entry')
    await editor.click(); await page.keyboard.press('ControlOrMeta+End'); await page.keyboard.press('Enter'); await page.keyboard.type('/page')
    await page.getByText('일치하는 명령 없음', { exact: true }).waitFor()
    assert.equal(await command.count(), 0)
    assert.deepEqual(errors, [])
    await page.close()
  }
})
