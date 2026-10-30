import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { build } from 'rolldown'
import { chromium } from 'playwright-core'
import { parse, stringify } from 'yaml'
import { domBrowserExecutable } from './browser-dom-executable.ts'

test('database page titles preview in the explorer and open tabs, then follow confirmed paths without losing newer edits', { skip: !domBrowserExecutable(), timeout: 45_000 }, async t => {
  const root = path.resolve(import.meta.dirname, '..')
  const source = `
import React from 'react';import {createRoot} from 'react-dom/client';
import {FileTree} from '${root}/src/components/FileTree.tsx';
import {EditorPane} from '${root}/src/components/EditorPane.tsx';
import {useTabs} from '${root}/src/hooks/useTabs.ts';
import {useDatabaseView} from '${root}/packages/editor/src/database/useDatabaseView.ts';
import {DatabaseTable} from '${root}/packages/editor/src/database/DatabaseTable.tsx';
import {createEditorApi} from '${root}/src/api/client.ts';
import {I18nProvider} from '${root}/src/i18n.tsx';
import {titlePreviews} from '${root}/src/utils/document-title-preview.ts';
const noop=()=>{},callbacks=Object.fromEntries(['registerHandle','registerElement','registerTabBar','onOpenHistory','onSetTocOpen','onOpenSidebar','onTabDragMove','onTabDrop'].map(k=>[k,noop]));
function Fixture(){
 const tabs=useTabs('docs',noop,noop,'/fixture',undefined,undefined,true,'/fixture/.mew/docs');
 const api=React.useMemo(()=>({...createEditorApi('docs').db,subscribe:(_,listener)=>{window.emitDatabaseEvent=listener;return()=>{}}}),[]);
 const ctrl=useDatabaseView(api,'database');
 const [tree,setTree]=React.useState([]),[revision,setRevision]=React.useState(0);
 React.useEffect(()=>{fetch('/api/tree').then(r=>r.json()).then(r=>{setTree(r.entries);setRevision(n=>n+1)})},[ctrl.view?.rows[0]?.pagePath]);
 window.tabs=tabs;window.database=ctrl;window.titlePreviews=titlePreviews;
 return <div style={{display:'flex',gap:12}}>
  <aside style={{width:250}}><FileTree tree={tree} project="docs" documentPages stateKey="database-title" workspacePath="/fixture" documentsPath="/fixture/.mew/docs"
   selectedPath={tabs.activePath} readOnly={false} presence={{}} searchFocusSignal={0} newFileSignal={{n:0,parentPath:null}} revealSignal={0}
   treeInvalidation={{n:revision,project:'docs',version:revision,parents:['']}} onSelect={(p,o)=>tabs.openFile(p,o)}
   onFileCreated={noop} onFolderCreated={noop} onRenamed={noop} onDeleted={noop} onNotice={noop} registerSearchCancel={noop}/></aside>
  <main style={{width:450}}>{tabs.panes.map(pane=><EditorPane key={pane.id} {...callbacks} pane={pane} role="owner" authEmail="owner@example.test" project="docs" workspace={{path:'/fixture',docsPath:'/fixture/.mew/docs'}}
   tree={tree} presence={{}} focused canCollaborate={false} isGuest={false} showSidebarButton={false} tocOpen={false} dropZone={null}
   onFocus={()=>tabs.focusPane(pane.id)} onActivate={(p,id)=>tabs.setActivePath(p,pane.id,id)} onPin={p=>tabs.pinTab(p,pane.id)}
   onCloseTab={(p,id)=>tabs.closeTab(p,pane.id,id)} onReorder={(a,b)=>tabs.reorderTabs(a,b,pane.id)} onSetViewMode={(p,m)=>tabs.setTabViewMode(p,m,pane.id)}
   onChangeContent={tabs.updateTabContent} onOpenLink={noop}/>)}</main>
  <section aria-label="Database"><DatabaseTable ctrl={ctrl} onOpenPage={p=>{window.openedPage=p}}/><button onClick={noop}>Leave cell</button></section>
 </div>
}
createRoot(document.getElementById('root')).render(<I18nProvider><Fixture/></I18nProvider>);`
  const bundle = await build({ input: 'virtual:database-title.tsx', write: false, platform: 'browser', output: { format: 'esm', codeSplitting: false },
    onLog(level, log, handler) { if (log.code !== 'MODULE_LEVEL_DIRECTIVE') handler(level, log) },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
    plugins: [{ name: 'database-title-fixture', resolveId(id) {
      if (id === 'virtual:database-title.tsx') return id
      if (id === '@mew/editor') return path.join(root, 'packages/editor/src/index.ts')
      if (id === '@mew/editor/frontmatter') return path.join(root, 'packages/editor/src/utils/frontmatter.ts')
      if (id.endsWith('.css')) return 'virtual:style'
    }, load(id) { if (id === 'virtual:database-title.tsx') return source; if (id === 'virtual:style') return '' } }],
  })
  const script = bundle.output.find(item => item.type === 'chunk')!.code
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  const page = await browser.newPage({ viewport: { width: 1300, height: 850 } })
  page.setDefaultTimeout(6000)
  let currentPath = 'Old.md', currentTitle = 'Old', holdSave = true, holdRead = true, holdFailure = true
  let releaseSave!: () => void, releaseRead!: () => void, markSave!: () => void, markRead!: () => void
  let releaseFailure!: () => void, markFailure!: () => void
  const saveStarted = new Promise<void>(resolve => { markSave = resolve })
  const readStarted = new Promise<void>(resolve => { markRead = resolve })
  const failureStarted = new Promise<void>(resolve => { markFailure = resolve })
  const disk = new Map([['Old.md', '---\ntitle: Old\ndescription: Custom\n_mew_database: database\n_mew_row: row\n---\nOriginal body\n']])
  const errors: string[] = [], writes: string[] = []
  t.after(async () => { releaseSave?.(); releaseRead?.(); releaseFailure?.(); await page.unrouteAll({ behavior: 'wait' }); await browser.close() })
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript("localStorage.setItem('mew:locale','en')")
  await page.route('http://mew-database-title.test/**', async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method()
    const view = () => ({ id: 'database', title: 'Projects', kind: 'managed', editable: true,
      columns: [{ id: 'title', name: 'Name', type: 'page', primary: true }], rows: [{ id: 'row', pos: 0, cells: { title: currentTitle }, pagePath: currentPath }] })
    if (url.pathname === '/api/tree') return route.fulfill({ json: { entries: [...disk.keys()].map(file => ({ name: file, path: file, type: 'file' })), state: 'ready', version: Date.now() } })
    if (url.pathname === '/api/db/database') return route.fulfill({ json: view() })
    if (url.pathname === '/api/db/database/rows/row') {
      const { value } = request.postDataJSON() as { value: string }
      if (holdSave) { holdSave = false; markSave(); await new Promise<void>(resolve => { releaseSave = resolve }) }
      if (value === 'Duplicate') {
        if (holdFailure) { holdFailure = false; markFailure(); await new Promise<void>(resolve => { releaseFailure = resolve }) }
        return route.fulfill({ status: 409, json: { error: 'Duplicate title' } })
      }
      const oldPath = currentPath, nextPath = `${value.trim()}.md`, content = disk.get(oldPath)!
      const header = /^---\n([\s\S]*?)\n---\n/.exec(content)!
      disk.delete(oldPath)
      disk.set(nextPath, `---\n${stringify({ ...parse(header[1]), title: value.trim() })}---\n${content.slice(header[0].length)}`)
      currentPath = nextPath; currentTitle = value.trim()
      return route.fulfill({ json: { value: currentTitle, documentPageMutations: [{ path: nextPath, moves: [{ from: oldPath, to: nextPath }], changed: [oldPath, nextPath] }] } })
    }
    if (url.pathname === '/api/file') {
      const input = method === 'PUT' ? request.postDataJSON() as { path: string; content: string } : null
      const file = input?.path ?? url.searchParams.get('path')!
      if (input) { writes.push(file); disk.set(file, input.content); return route.fulfill({ json: { ok: true, commit: null } }) }
      if (file === 'First.md' && holdRead) { holdRead = false; markRead(); await new Promise<void>(resolve => { releaseRead = resolve }) }
      const content = disk.get(file)
      return route.fulfill(content === undefined ? { status: 404, json: { error: `Missing ${file}` } } : { json: { content, editable: true } })
    }
    if (url.pathname === '/api/comments') return route.fulfill({ json: { threads: [] } })
    if (url.pathname === '/api/table-layout') return route.fulfill({ json: { tables: [] } })
    if (url.pathname === '/api/docs/backlinks') return route.fulfill({ json: { parents: [], backlinks: [] } })
    if (url.pathname === '/api/rules') return route.fulfill({ json: { violations: [], archived: false } })
    if (url.pathname.startsWith('/api/')) return route.fulfill({ json: [] })
    return route.fulfill(url.pathname === '/app.js' ? { contentType: 'text/javascript', body: script } : { contentType: 'text/html', body: '<!doctype html><html><div id="root"></div><script type="module" src="/app.js"></script></html>' })
  })
  await page.goto('http://mew-database-title.test/')
  await page.locator('[data-path="Old.md"]').click()
  const titleInput = page.getByRole('textbox', { name: 'Title', exact: true })
  await titleInput.waitFor()
  const originalTabId = await page.evaluate<string>('window.tabs.activeTab.id')
  const cell = page.getByRole('region', { name: 'Database' }).getByRole('textbox', { name: 'Name', exact: true })
  await cell.fill('First')
  assert.match(await page.locator('[data-path="Old.md"]').innerText(), /First/)
  assert.equal(await titleInput.inputValue(), 'First')
  assert.equal(await page.evaluate('window.tabs.activeTab.path'), 'Old.md')
  await page.getByRole('button', { name: 'Leave cell', exact: true }).click()
  await saveStarted
  await cell.fill('Second')
  releaseSave()
  await readStarted
  await cell.fill('Third')
  assert.equal(await titleInput.inputValue(), 'Third', 'typing follows the remapped preview while the cell still uses its old path')
  await page.evaluate("window.tabs.updateTabContent(window.tabs.activePath,window.tabs.activeTab.content+'Typed during rename\\n')")
  releaseRead()
  await page.waitForFunction('window.database.view.rows[0].pagePath === "First.md"')
  assert.equal(await cell.inputValue(), 'Third', 'the older save response preserves newer cell input')
  assert.equal(await page.evaluate('window.tabs.activeTab.id'), originalTabId)
  assert.equal(await titleInput.inputValue(), 'Third')
  await page.getByRole('button', { name: 'Leave cell', exact: true }).click()
  await page.waitForFunction('window.database.view.rows[0].pagePath === "Third.md" && window.tabs.activeTab.path === "Third.md"')
  await page.waitForFunction('window.tabs.activeTab.content===window.tabs.activeTab.savedContent')
  await page.getByRole('button', { name: /Third.*page|page.*Third/i }).click()
  assert.equal(await page.evaluate('window.openedPage'), 'Third.md')
  assert.ok(disk.get('Third.md')?.includes('Typed during rename'))
  assert.equal(disk.has('Old.md'), false)
  assert.equal(disk.has('First.md'), false)
  assert.equal(await page.evaluate('Object.keys(window.titlePreviews()).length'), 0)
  await cell.fill('Duplicate')
  assert.equal(await titleInput.inputValue(), 'Duplicate')
  await page.getByRole('button', { name: 'Leave cell', exact: true }).click()
  await failureStarted
  await cell.fill('Fourth')
  await page.evaluate('window.emitDatabaseEvent({type:"row.update",rowId:"row",columnId:"title",value:"Third"})')
  assert.equal(await cell.inputValue(), 'Fourth', 'a saved event echo preserves the newer local title')
  releaseFailure()
  await page.waitForFunction('window.database.error === "Duplicate title" && window.database.view.rows[0].cells.title === "Fourth"')
  assert.equal(await titleInput.inputValue(), 'Fourth', 'an older failed save preserves newer editor and cell previews')
  await page.getByRole('button', { name: 'Leave cell', exact: true }).click()
  await page.waitForFunction('window.database.view.rows[0].pagePath === "Fourth.md" && window.tabs.activeTab.path === "Fourth.md" && !window.database.error')
  await cell.fill('Duplicate')
  await page.getByRole('button', { name: 'Leave cell', exact: true }).click()
  await page.waitForFunction('window.database.error === "Duplicate title" && window.database.view.rows[0].cells.title === "Fourth"')
  assert.equal(await titleInput.inputValue(), 'Fourth', 'a failed save restores the linked open document too')
  assert.equal(await page.evaluate('Object.keys(window.titlePreviews()).length'), 0)
  assert.equal(await page.evaluate('window.tabs.activeTab.id'), originalTabId)
  assert.equal(writes.at(-1), 'Fourth.md')
  assert.deepEqual(errors, [])
})

test('late database page-path refreshes cannot replace a newer confirmed path', { skip: !domBrowserExecutable(), timeout: 20_000 }, async t => {
  const root = path.resolve(import.meta.dirname, '..')
  const source = `
import React from 'react';import {createRoot} from 'react-dom/client';
import {useDatabaseView} from '${root}/packages/editor/src/database/useDatabaseView.ts';
const reads=[];window.databaseReads=reads;
const view=(title,path)=>({id:'database',title:'Projects',kind:'managed',editable:true,columns:[{id:'title',name:'Name',type:'page'}],rows:[{id:'row',pos:0,cells:{title},pagePath:path}]});
window.resolveDatabaseRead=(index,title,path)=>reads[index](view(title,path));
const api={getView:()=>new Promise(resolve=>reads.push(resolve)),subscribe:(_,listener)=>{window.emitDatabaseEvent=listener;return()=>{}},updateCell:async(_,row,column,value)=>value};
function Fixture(){const ctrl=useDatabaseView(api,'database');window.database=ctrl;return <output>{JSON.stringify(ctrl.view)}</output>}
createRoot(document.getElementById('root')).render(<Fixture/>);`
  const bundle = await build({ input: 'virtual:database-path-order.tsx', write: false, platform: 'browser', output: { format: 'esm' }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
    plugins: [{ name: 'database-path-order', resolveId: id => id === 'virtual:database-path-order.tsx' ? id : undefined, load: id => id === 'virtual:database-path-order.tsx' ? source : undefined }],
  })
  const script = bundle.output.find(item => item.type === 'chunk')!.code
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  t.after(() => browser.close())
  const page = await browser.newPage()
  await page.route('http://mew-database-path-order.test/**', route => route.fulfill(new URL(route.request().url()).pathname === '/app.js'
    ? { contentType: 'text/javascript', body: script } : { contentType: 'text/html', body: '<div id="root"></div><script type="module" src="/app.js"></script>' }))
  await page.goto('http://mew-database-path-order.test/')
  await page.waitForFunction('window.databaseReads.length === 1')
  await page.evaluate('window.resolveDatabaseRead(0,"Old","Old.md")')
  await page.waitForFunction('window.database.view?.rows[0].pagePath === "Old.md"')
  await page.evaluate('window.emitDatabaseEvent({type:"row.update",rowId:"row",columnId:"title",value:"First"})')
  await page.evaluate('window.emitDatabaseEvent({type:"row.update",rowId:"row",columnId:"title",value:"Second"})')
  await page.waitForFunction('window.databaseReads.length === 3')
  await page.evaluate('window.resolveDatabaseRead(2,"Second","Second.md")')
  await page.waitForFunction('window.database.view.rows[0].pagePath === "Second.md"')
  await page.evaluate('window.resolveDatabaseRead(1,"First","First.md")')
  assert.equal(await page.evaluate('window.database.view.rows[0].pagePath'), 'Second.md')
  await page.evaluate('(()=>{window.database.localCell("row","title","Third");window.database.commitCell("row","title","Third")})()')
  await page.waitForFunction('window.databaseReads.length === 4')
  await page.evaluate('(()=>{window.database.localCell("row","title","Fourth");window.database.commitCell("row","title","Fourth")})()')
  await page.waitForFunction('window.databaseReads.length === 5')
  await page.evaluate('window.resolveDatabaseRead(4,"Fourth","Fourth.md")')
  await page.waitForFunction('window.database.view.rows[0].pagePath === "Fourth.md"')
  await page.evaluate('window.resolveDatabaseRead(3,"Third","Third.md")')
  assert.equal(await page.evaluate('window.database.view.rows[0].pagePath'), 'Fourth.md')
  assert.equal(await page.evaluate('window.database.view.rows[0].cells.title'), 'Fourth')
})
