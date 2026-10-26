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
import { changeTaskList, readTaskList } from './task-list.ts'
import { taskDocumentsNeedMigration } from './task-markdown.ts'
import { mergeTaskFrontmatter } from '../packages/editor/src/utils/task-frontmatter-merge.ts'

test('document titles stay synchronized after explorer, editor, and task edits across open panes', { skip: !domBrowserExecutable(), timeout: 60_000 }, async t => {
  const repo = path.resolve(import.meta.dirname, '..')
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-title-sync-ui-'))
  const docs = path.join(workspace, 'docs')
  fs.mkdirSync(path.join(docs, 'tasks'), { recursive: true })
  changeTaskList(workspace, [{ id: 'promotion', before: null, after: { id: 'promotion', text: '가까운 주변에 홍보하기', done: false }, afterId: null }])
  fs.appendFileSync(path.join(docs, 'tasks/가까운 주변에 홍보하기.md'), '\nOriginal body\n')
  fs.writeFileSync(path.join(docs, 'other.md'), 'Other document')
  const pages = new DocumentPages(docs)
  const source = `
import React from 'react';import {createRoot} from 'react-dom/client';
import {FileTree} from '${repo}/src/components/FileTree.tsx';
import {EditorPane} from '${repo}/src/components/EditorPane.tsx';
import {useTabs} from '${repo}/src/hooks/useTabs.ts';
import {useTaskList} from '${repo}/src/hooks/use-task-list.ts';
import {I18nProvider} from '${repo}/src/i18n.tsx';
import {editorFile,editorTabPath} from '${repo}/src/utils/editor-files.ts';
const noop=()=>{},callbacks=Object.fromEntries(['registerHandle','registerElement','registerTabBar','onOpenHistory','onSetTocOpen','onOpenSidebar','onTabDragMove','onTabDrop'].map(k=>[k,noop]));
function Fixture(){
 const tabs=useTabs('.workspace',noop,noop,'/fixture',undefined,undefined,true,'/fixture/docs');
 const tasks=useTaskList('/fixture','owner@example.test',true);
 const [tree,setTree]=React.useState([]),[revision,setRevision]=React.useState(0);
 const refresh=React.useCallback(()=>fetch('/api/tree?path=').then(r=>r.json()).then(r=>{setTree(r.entries);setRevision(n=>n+1)}),[]);
 React.useEffect(()=>{refresh()},[refresh,JSON.stringify(tasks.tasks)]);
 const loadChildren=React.useCallback(p=>fetch('/api/tree?path='+encodeURIComponent(p)).then(r=>r.json()).then(r=>r.entries),[]);
 window.tabs=tabs;window.tasks=tasks;
 return <div className="flex h-dvh bg-surface text-ink">
  <aside style={{width:270,flexShrink:0}} className="flex min-h-0"><FileTree tree={tree} project="docs" documentPages stateKey="title-sync" workspacePath="/fixture" accountState={{openDirs:['tasks']}}
   selectedPath={tabs.activePath?editorFile(tabs.activePath).path:null} readOnly={false} presence={{}} loadChildren={loadChildren}
   searchFocusSignal={0} newFileSignal={{n:0,parentPath:null}} revealSignal={0} treeInvalidation={{n:revision,project:'docs',version:revision,parents:['','tasks']}}
   onOpenGraph={noop} onSelect={(p,o)=>tabs.openFile(editorTabPath('docs',p),o)} onBeforePageMutation={tabs.prepareDocumentPageMutation}
   onPageMutation={async r=>{await tabs.applyDocumentPageMutation(r);refresh();window.dispatchEvent(new Event('focus'))}}
   onFileCreated={noop} onFolderCreated={refresh} onRenamed={noop} onDeleted={noop} onNotice={noop} onOpenGit={noop} registerSearchCancel={noop}/></aside>
  <main className="flex min-w-0 flex-1">{tabs.panes.map(pane=><section key={pane.id} data-pane={pane.id} className="flex min-w-0 flex-1 flex-col">
   <EditorPane {...callbacks} pane={pane} role="owner" authEmail="owner@example.test" project=".workspace" workspace={{path:'/fixture',docsPath:'/fixture/docs'}}
    tree={tree} presence={{}} focused={pane.id===tabs.focusedPaneId} canCollaborate={false} isGuest={false} showSidebarButton={false} tocOpen={false} dropZone={null}
    onFocus={()=>tabs.focusPane(pane.id)} onActivate={(p,id)=>tabs.setActivePath(p,pane.id,id)} onPin={p=>tabs.pinTab(p,pane.id)}
    onCloseTab={(p,id)=>tabs.closeTab(p,pane.id,id)} onReorder={(a,b)=>tabs.reorderTabs(a,b,pane.id)} onSetViewMode={(p,m)=>tabs.setTabViewMode(p,m,pane.id)}
    onChangeContent={tabs.updateTabContent} onOpenLink={noop}/></section>)}</main>
  <aside style={{width:220,flexShrink:0}} aria-label="태스크">{tasks.tasks.map(task=><input key={task.id} aria-label="태스크 제목" value={task.text} onChange={e=>tasks.edit(tasks.tasks.map(item=>item.id===task.id?{...item,text:e.target.value}:item))}/>)}<output>{tasks.error}</output></aside>
 </div>
}
createRoot(document.getElementById('root')).render(<I18nProvider><Fixture/></I18nProvider>);`
  const styles: string[] = []
  const bundle = await build({ input: 'virtual:title-sync.tsx', write: false, platform: 'browser', output: { format: 'esm', codeSplitting: false },
    onLog(level, log, handler) { if (log.code !== 'MODULE_LEVEL_DIRECTIVE') handler(level, log) },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
    plugins: [{ name: 'title-sync-fixture', resolveId: id => id === 'virtual:title-sync.tsx' ? id : undefined, load(id) {
      if (id === 'virtual:title-sync.tsx') return source
      if (id.endsWith('.css')) { styles.push(fs.readFileSync(id, 'utf8')); return { code: '', moduleType: 'js' } }
    } }],
  })
  const compiler = await compile(fs.readFileSync(path.join(repo, 'src/index.css'), 'utf8'), { base: path.join(repo, 'src'), onDependency() {} })
  const cssSources = ['src/components/FileTree.tsx', 'src/components/EditorPane.tsx', 'src/components/TabBar.tsx', 'packages/editor/src/Editor.tsx', 'packages/editor/src/editor/FrontmatterPanel.tsx'].map(file => fs.readFileSync(path.join(repo, file), 'utf8')).join('\n')
  const css = compiler.build([...new Set((source + cssSources).match(/[A-Za-z0-9_@!:/.[\]()%,-]+/g))]) + styles.join('\n')
  const script = bundle.output.find(item => item.type === 'chunk')!.code
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 } })
  page.setDefaultTimeout(6000)
  const errors: string[] = [], saves: string[] = []
  let releaseTaskSave: (() => void) | undefined
  let markTaskSave: (() => void) | undefined
  const taskSaveStarted = new Promise<void>(resolve => { markTaskSave = resolve })
  let holdTaskRead = false
  let releaseTaskRead: (() => void) | undefined
  let markTaskRead: (() => void) | undefined
  const taskReadStarted = new Promise<void>(resolve => { markTaskRead = resolve })
  t.after(async () => {
    releaseTaskSave?.(); releaseTaskRead?.()
    await page.unrouteAll({ behavior: 'wait' })
    await browser.close()
    fs.rmSync(workspace, { recursive: true, force: true })
  })
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript("localStorage.setItem('mew:locale','ko')")
  await page.route('http://mew-title-sync.test/**', async route => {
    const url = new URL(route.request().url()), method = route.request().method()
    const json = (value: unknown) => route.fulfill({ json: value })
    if (url.pathname === '/api/tree') {
      const relative = url.searchParams.get('path') || ''
      const entries = fs.readdirSync(path.join(docs, relative), { withFileTypes: true }).map(entry => ({ name: entry.name, path: relative ? `${relative}/${entry.name}` : entry.name, type: entry.isDirectory() ? 'dir' : 'file' }))
      return json({ entries, state: 'ready', version: Date.now() })
    }
    if (url.pathname === '/api/docs/pages/rename') {
      const body = route.request().postDataJSON()
      return json(pages.rename(body.path, body.name))
    }
    if (url.pathname === '/api/task-list/events') return route.fulfill({ contentType: 'text/event-stream', body: '' })
    if (url.pathname === '/api/task-list') {
      if (method === 'PATCH') {
        const body = route.request().postDataJSON()
        changeTaskList(workspace, body.changes, body.tagColorChanges, body.deletedTags)
        markTaskSave!()
        await new Promise<void>(resolve => { releaseTaskSave = resolve })
      } else if (taskDocumentsNeedMigration(readTaskList(workspace), workspace)) {
        changeTaskList(workspace, [])
        if (holdTaskRead) {
          holdTaskRead = false
          markTaskRead!()
          await new Promise<void>(resolve => { releaseTaskRead = resolve })
        }
      }
      return json({ tasks: readTaskList(workspace), canEdit: true, tags: [], tagColors: {} })
    }
    if (url.pathname === '/api/file') {
      const body = method === 'PUT' ? route.request().postDataJSON() : null
      const relative = body?.path ?? url.searchParams.get('path') ?? ''
      const file = path.join(url.searchParams.get('project') === 'docs' || body?.project === 'docs' ? docs : workspace, relative)
      if (body) {
        const saved = fs.existsSync(file) ? mergeTaskFrontmatter(body.expectedContent, body.content, fs.readFileSync(file, 'utf8')) : body.content
        fs.writeFileSync(file, saved); saves.push(relative)
        return json({ ok: true, commit: null, ...(saved !== body.content ? { content: saved } : {}) })
      }
      if (!fs.existsSync(file)) return route.fulfill({ status: 404, json: { error: `Missing fixture: ${relative}` } })
      return json({ content: fs.readFileSync(file, 'utf8'), editable: true })
    }
    if (url.pathname === '/api/comments') return json({ threads: [] })
    if (url.pathname === '/api/members') return json({ members: [] })
    if (url.pathname === '/api/table-layout') return json({ tables: [] })
    if (url.pathname === '/api/docs/backlinks') return json({ parents: [], backlinks: [] })
    if (url.pathname === '/api/rules') return json({ violations: [], archived: false })
    if (url.pathname.startsWith('/api/')) return json([])
    return route.fulfill(url.pathname === '/app.js' ? { contentType: 'text/javascript', body: script } : { contentType: 'text/html', body: `<!doctype html><html class="dark"><meta charset="utf-8"><style>${css}</style><div id="root"></div><script type="module" src="/app.js"></script></html>` })
  })
  await page.goto('http://mew-title-sync.test/')
  const taskTitle = page.getByRole('textbox', { name: '태스크 제목', exact: true })
  await taskTitle.waitFor()
  const explorer = (title: string) => page.locator(`[data-path="tasks/${title}.md"]`)
  const editorTitle = () => page.getByRole('textbox', { name: '제목', exact: true })
  const tab = (title: string) => page.getByRole('tab', { name: `${title} ×`, exact: true })
  const refreshTasks = () => page.evaluate("window.dispatchEvent(new Event('focus'))")
  const synchronized = async (title: string, count = 1) => {
    await page.waitForFunction(`window.tasks.tasks[0]?.text===${JSON.stringify(title)} && window.tasks.tasks[0]?.path===${JSON.stringify(`docs/tasks/${title}.md`)} && window.tabs.panes.flatMap(p=>p.tabs).filter(t=>t.path===${JSON.stringify(`mew:file:docs/tasks/${title}.md`)}).length===${count}`)
    await explorer(title).waitFor()
    assert.equal(await tab(title).count(), count)
    for (const input of await editorTitle().all()) assert.equal(await input.inputValue(), title)
    assert.equal(await taskTitle.inputValue(), title)
  }
  await explorer('가까운 주변에 홍보하기').click()
  await editorTitle().waitFor()
  await explorer('가까운 주변에 홍보하기').focus()
  await page.keyboard.press('F2')
  const rename = page.locator('aside').first().getByRole('textbox').last()
  await rename.fill('주변에 홍보하기')
  await rename.press('Enter')
  await synchronized('주변에 홍보하기')
  await refreshTasks()
  await synchronized('주변에 홍보하기')
  assert.equal(await explorer('가까운 주변에 홍보하기').count(), 0, 'refresh never brings back the old explorer name')

  holdTaskRead = true
  await editorTitle().fill('동네에 홍보하기')
  assert.equal(await tab('동네에 홍보하기').count(), 1, 'the tab follows the edited YAML title before autosave moves the file')
  await page.waitForFunction('window.tabs.activeTab.status === "saved" && window.tabs.activeTab.content === window.tabs.activeTab.savedContent && window.tabs.activeTab.savedContent.includes("동네에 홍보하기")')
  await refreshTasks()
  await taskReadStarted
  await page.evaluate("window.tabs.updateTabContent(window.tabs.activePath,window.tabs.activeTab.content+'Typed during task GET\\n')")
  await page.waitForTimeout(650)
  await page.evaluate('window.tabs.saveCurrentTab()')
  assert.equal(fs.existsSync(path.join(docs, 'tasks/주변에 홍보하기.md')), false, 'autosave and explicit save remain paused while GET moves the document')
  releaseTaskRead!()
  await synchronized('동네에 홍보하기')
  await page.waitForFunction('window.tabs.activeTab.content.includes("Typed during task GET") && window.tabs.activeTab.content===window.tabs.activeTab.savedContent')
  assert.ok(fs.readFileSync(path.join(docs, 'tasks/동네에 홍보하기.md'), 'utf8').includes('Typed during task GET'))

  await page.evaluate("(()=>{const p=window.tabs;p.pinTab(p.activePath);p.splitEmptyPane(p.focusedPaneId,'right')})()")
  await page.waitForFunction('window.tabs.panes.length===2')
  await page.evaluate("window.tabs.openFile('mew:file:docs/tasks/동네에 홍보하기.md',{preview:false,paneId:window.tabs.panes[1].id})")
  await page.waitForFunction('window.tabs.panes[1].tabs[0]?.editable && !window.tabs.panes[1].tabs[0]?.revalidating')
  await page.evaluate("window.tabs.openFile('mew:file:docs/other.md',{preview:false,paneId:'main'})")
  await page.waitForFunction('window.tabs.panes[0].activePath==="mew:file:docs/other.md"')
  await page.evaluate("(()=>{const p=window.tabs;p.updateTabContent('mew:file:docs/tasks/동네에 홍보하기.md',p.panes[1].tabs[0].content+'Before task rename\\n',p.panes[1].id)})()")
  await taskTitle.fill('이웃에 홍보하기')
  await taskSaveStarted
  await page.evaluate("(()=>{const p=window.tabs;p.updateTabContent('mew:file:docs/tasks/동네에 홍보하기.md',p.panes[1].tabs[0].content+'Typed during rename\\n',p.panes[1].id)})()")
  releaseTaskSave!()
  await synchronized('이웃에 홍보하기', 2)
  await page.waitForFunction('window.tabs.panes.flatMap(p=>p.tabs).filter(t=>t.path.includes("이웃에 홍보하기")).every(t=>t.content.includes("Before task rename")&&t.content.includes("Typed during rename")&&t.content===t.savedContent)')
  assert.equal(fs.existsSync(path.join(docs, 'tasks/동네에 홍보하기.md')), false)
  assert.ok(fs.readFileSync(path.join(docs, 'tasks/이웃에 홍보하기.md'), 'utf8').includes('Typed during rename'))
  assert.equal(saves.at(-1), 'tasks/이웃에 홍보하기.md', 'pending autosave follows the confirmed document path')

  const closingSaveStarted = new Promise<void>(resolve => { markTaskSave = resolve })
  await taskTitle.fill('마을에 홍보하기')
  await closingSaveStarted
  const closingTab = await page.evaluate<string>('window.tabs.panes[0].tabs.find(t=>t.path.includes("이웃에 홍보하기")).id')
  await page.evaluate("(()=>{const p=window.tabs;p.updateTabContent('mew:file:docs/tasks/이웃에 홍보하기.md',p.panes[1].tabs[0].content+'Typed before close\\n',p.panes[1].id)})()")
  await page.locator(`[data-editor-tab-id="${closingTab}"]`).getByRole('button').click()
  await page.waitForTimeout(650)
  assert.equal(await page.locator(`[data-editor-tab-id="${closingTab}"]`).count(), 1, 'a dirty tab stays open until the ongoing move preserves its draft')
  releaseTaskSave!()
  await synchronized('마을에 홍보하기')
  await page.waitForFunction('window.tabs.panes.flatMap(p=>p.tabs).filter(t=>t.path.includes("마을에 홍보하기")).every(t=>t.content.includes("Typed before close")&&t.content===t.savedContent)')
  assert.equal(await page.locator(`[data-editor-tab-id="${closingTab}"]`).count(), 0)
  assert.equal(fs.existsSync(path.join(docs, 'tasks/이웃에 홍보하기.md')), false)
  assert.ok(fs.readFileSync(path.join(docs, 'tasks/마을에 홍보하기.md'), 'utf8').includes('Typed before close'))

  changeTaskList(workspace, [{ id: 'second', before: null, after: { id: 'second', text: '다른 홍보', done: false }, afterId: 'promotion' }])
  fs.appendFileSync(path.join(docs, 'tasks/다른 홍보.md'), '\nSecondary identity\n')
  await refreshTasks()
  await page.waitForFunction('window.tasks.tasks.length===2')
  await page.evaluate("window.tabs.openFile('mew:file:docs/tasks/다른 홍보.md',{preview:false,paneId:'main'})")
  await page.waitForFunction('window.tabs.panes[0].tabs.some(t=>t.path.includes("다른 홍보")&&t.editable&&!t.revalidating)')
  const identities = await page.evaluate<Record<string, string>>('Object.fromEntries(window.tabs.panes.flatMap(p=>p.tabs).filter(t=>t.path.includes("홍보")).map(t=>[t.path,t.id]))')
  const swapSaveStarted = new Promise<void>(resolve => { markTaskSave = resolve })
  await page.evaluate("window.tasks.edit(window.tasks.tasks.map(t=>({...t,text:t.id==='promotion'?'다른 홍보':'마을에 홍보하기'})))")
  await swapSaveStarted
  releaseTaskSave!()
  await page.waitForFunction('window.tasks.tasks.find(t=>t.id==="promotion")?.path==="docs/tasks/다른 홍보.md" && window.tasks.tasks.find(t=>t.id==="second")?.path==="docs/tasks/마을에 홍보하기.md" && !window.tasks.saving')
  const swapped = await page.evaluate<Record<string, { path: string; content: string }>>('Object.fromEntries(window.tabs.panes.flatMap(p=>p.tabs).filter(t=>t.path.includes("홍보")).map(t=>[t.id,{path:t.path,content:t.content}]))')
  assert.equal(swapped[identities['mew:file:docs/tasks/마을에 홍보하기.md']].path, 'mew:file:docs/tasks/다른 홍보.md')
  assert.ok(swapped[identities['mew:file:docs/tasks/마을에 홍보하기.md']].content.includes('Typed before close'))
  assert.equal(swapped[identities['mew:file:docs/tasks/다른 홍보.md']].path, 'mew:file:docs/tasks/마을에 홍보하기.md')
  assert.ok(swapped[identities['mew:file:docs/tasks/다른 홍보.md']].content.includes('Secondary identity'))
  assert.equal(await tab('다른 홍보').count(), 1)
  assert.equal(await tab('마을에 홍보하기').count(), 1)
  const completionStarted = new Promise<void>(resolve => { markTaskSave = resolve })
  await page.evaluate("window.tasks.edit(window.tasks.tasks.map(t=>t.id==='promotion'?{...t,done:true}:t))")
  await completionStarted
  releaseTaskSave!()
  await page.waitForFunction('window.tasks.tasks.find(t=>t.id==="promotion")?.path==="docs/tasks/Done/다른 홍보.md" && !window.tasks.saving')
  const completed = await page.evaluate<Record<string, { path: string; content: string }>>('Object.fromEntries(window.tabs.panes.flatMap(p=>p.tabs).map(t=>[t.id,{path:t.path,content:t.content}]))')
  assert.equal(completed[identities['mew:file:docs/tasks/마을에 홍보하기.md']].path, 'mew:file:docs/tasks/Done/다른 홍보.md')
  assert.ok(completed[identities['mew:file:docs/tasks/마을에 홍보하기.md']].content.includes('Typed before close'))
  assert.equal(fs.existsSync(path.join(docs, 'tasks/다른 홍보.md')), false)
  assert.deepEqual(errors, [])
})
