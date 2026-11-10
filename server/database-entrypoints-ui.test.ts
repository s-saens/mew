import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { connectTestBrowser } from './test-browser.ts'

const root = path.resolve(import.meta.dirname, '..')

test('database actions align with explorer creation controls and respect availability', { timeout: 60_000 }, async t => {
  const source = `import React from 'react';import {createRoot} from 'react-dom/client';
import {I18nProvider} from '${root}/src/i18n.tsx';
import {FileTree} from '${root}/src/components/FileTree.tsx';
import {ExplorerDatabaseButton} from '${root}/src/components/explorer-database-button.tsx';
import {SidebarCreateButtons} from '${root}/src/components/sidebar-create-buttons.tsx';
import {ScopeToggle} from '${root}/src/components/scope-toggle.tsx';
import {EditorPane} from '${root}/src/components/EditorPane.tsx';
import {MobileDock} from '${root}/src/components/mobile-dock.tsx';
const noop=()=>{};window.actions=[];
const callbacks=Object.fromEntries(['registerHandle','registerElement','registerTabBar','onFocus','onActivate','onPin','onCloseTab','onReorder','onSetViewMode','onChangeContent','onOpenLink','onOpenHistory','onSetTocOpen','onOpenSidebar','onTabDragMove','onTabDrop'].map(k=>[k,noop]));
function Fixture(){const [access,setAccess]=React.useState(true);const [guest,setGuest]=React.useState(false);const [scope,setScope]=React.useState('docs');const [writable,setWritable]=React.useState(true);window.setWritable=setWritable;window.setDatabaseAccess=setAccess;window.setGuest=setGuest;const open=access?()=>window.actions.push('database'):undefined;const tree=Array.from({length:70},(_,i)=>({path:'document-'+i+'.txt',name:'Document '+i,type:'file'}));
return <div className="flex h-dvh flex-col bg-surface-deep text-ink"><header className="h-9 shrink-0">Documents</header><main className="flex min-h-0 flex-1 flex-col md:flex-row"><aside data-explorer-area className="relative flex h-24 shrink-0 flex-col md:h-full md:w-64">{!guest&&<div data-explorer-toggle className="flex shrink-0 items-center gap-1 border-b border-edge p-1"><ScopeToggle label="Explorer scope" value={scope} options={[{value:"docs",label:"Documents"},{value:"files",label:"Files"}]} onChange={setScope}/>{writable&&<SidebarCreateButtons documents={scope==='docs'} onCreate={noop}/>} {open&&<ExplorerDatabaseButton onOpen={open}/>}</div>}<FileTree tree={tree} project="docs" stateKey="database-entrypoints" selectedPath={null} readOnly newFileSignal={{n:0,parentPath:null}} revealSignal={0} presence={{}} onSelect={noop} onFileCreated={noop} onFolderCreated={noop} onRenamed={noop} onDeleted={noop} onNotice={noop}/></aside><section data-editor-area className="flex min-h-0 min-w-0 flex-1 flex-col"><EditorPane {...callbacks} pane={{id:'main',activePath:'notes.md',tabs:[{path:'notes.md',content:'Example document',viewMode:'plain',preview:false,editable:true}]}} role={guest?'guest':'owner'} authEmail={guest?null:'owner@example.test'} project="docs" tree={[]} presence={{}} focused isGuest={guest} canCollaborate={true} showSidebarButton={false} tocOpen={false} dropZone={null} onAskAgent={async()=>window.actions.push('agent')} onOpenDatabase={open}/></section></main><MobileDock active="editor" openPanels={['editor']} available={['sidebar','editor']} hidden={false} position="bottom" onSelect={id=>window.actions.push(id)} onNavigate={noop}/></div>}
createRoot(document.getElementById('root')).render(<I18nProvider><Fixture/></I18nProvider>);`
  const bundle = await build({
    input: 'virtual:database-entrypoints.tsx', write: false, platform: 'browser', output: { format: 'esm', codeSplitting: false },
    onLog(level, log, handler) { if (log.code !== 'MODULE_LEVEL_DIRECTIVE') handler(level, log) },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
    plugins: [{ name: 'database-entrypoints', resolveId(id) {
      if (id === 'virtual:database-entrypoints.tsx') return id
      if (id.endsWith('.css')) return 'virtual:style'
    }, async load(id) {
      if (id === 'virtual:database-entrypoints.tsx') return source
      if (id === 'virtual:style') return ''
      if (id.endsWith('?raw')) return 'export default ' + JSON.stringify(await fs.readFile(id.slice(0, -4), 'utf8'))
    } }],
  })
  const code = bundle.output.find(item => item.type === 'chunk')!.code
  const components = ['src/components/FileTree.tsx', 'src/components/explorer-database-button.tsx', 'src/components/sidebar-create-buttons.tsx', 'src/components/scope-toggle.tsx', 'src/components/EditorPane.tsx', 'src/components/mobile-dock.tsx', 'src/components/TabBar.tsx', 'packages/ui/src/HoverTipLayer.tsx']
  const content = (await Promise.all(components.map(file => fs.readFile(path.join(root, file), 'utf8')))).join('\n')
  const compiler = await compile(await fs.readFile(path.join(root, 'src/index.css'), 'utf8'), { base: path.join(root, 'src'), onDependency() {} })
  const css = compiler.build([...new Set((source + content).match(/[A-Za-z0-9_@!:/.[\]()%,-]+/g))])
  const browser = await connectTestBrowser()
  t.after(() => browser.close())
  for (const width of [320, 390, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } })
    page.setDefaultTimeout(5000)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript("localStorage.setItem('mew:locale','en')")
    await page.route('http://mew-database-entrypoints.test/**', async route => {
      const url = new URL(route.request().url())
      if (url.pathname.startsWith('/api/')) return route.fulfill({ json: url.pathname === '/api/comments' ? { threads: [] } : url.pathname === '/api/members' ? { members: [] } : [] })
      return route.fulfill(url.pathname === '/app.js' ? { contentType: 'text/javascript', body: code } : { contentType: 'text/html', body: `<!doctype html><html class="dark"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script type="module" src="/app.js"></script></html>` })
    })
    await page.goto('http://mew-database-entrypoints.test/')
    const explorer = page.locator('[data-explorer-database]')
    const editor = page.locator('[data-editor-database]')
    const dock = page.locator('[data-dock-item="database"]')
    const menu = page.getByRole('button', { name: 'Editor actions' })
    if (width < 768) {
      await menu.waitFor()
      assert.equal(await editor.isVisible(), false)
      await menu.click()
      assert.equal(await menu.getAttribute('aria-expanded'), 'true')
      assert.equal(await page.getByRole('button', { name: 'Comments', exact: true }).isVisible(), true)
      assert.equal(await page.getByRole('button', { name: 'Annotations', exact: true }).isVisible(), true)
      const comments = page.getByRole('button', { name: 'Comments', exact: true })
      const annotations = page.getByRole('button', { name: 'Annotations', exact: true })
      await comments.click()
      assert.equal(await comments.getAttribute('aria-expanded'), 'true')
      await annotations.click()
      assert.equal(await comments.getAttribute('aria-expanded'), 'false')
      assert.equal(await annotations.getAttribute('aria-expanded'), 'true')
      await annotations.click()
      await page.keyboard.press('Escape')
      assert.equal(await editor.isVisible(), false)
      await menu.click()
    } else {
      assert.equal(await menu.isVisible(), false)
    }
    await editor.waitFor().catch(error => { assert.deepEqual(errors, []); throw error })
    for (const action of [editor, explorer]) {
      assert.equal(await action.getAttribute('aria-label'), 'Database')
      assert.equal(await action.getAttribute('aria-haspopup'), 'dialog')
      await action.click()
    }
    assert.deepEqual(await page.evaluate('window.actions'), ['database', 'database'])
    if (width < 768) await menu.click()
    assert.equal(await dock.count(), 0, 'the database catalog is absent from desktop and mobile Dock')
    const editorBox = (await editor.boundingBox())!, agentBox = (await page.locator('[data-editor-database] + button').boundingBox())!
    if (width < 768) {
      assert.ok(editorBox.y + editorBox.height <= agentBox.y && agentBox.y - editorBox.y - editorBox.height <= 8)
    } else {
      assert.ok(editorBox.x + editorBox.width <= agentBox.x && agentBox.x - editorBox.x - editorBox.width <= 8)
      assert.equal(editorBox.y, agentBox.y)
    }
    assert.ok(editorBox.height <= 30 && editorBox.height === agentBox.height, 'the database action shares the compact floating toolbar height')
    const area = (await page.locator('[data-explorer-area]').boundingBox())!, before = (await explorer.boundingBox())!
    assert.ok(before.x >= area.x && before.x + before.width <= area.x + area.width && before.y >= area.y && before.y + before.height <= area.y + area.height, 'explorer action remains inside its file area')
    const toolbar = page.locator('[data-explorer-toggle]')
    const newDocument = toolbar.getByRole('button', { name: 'New document', exact: true })
    const createBox = (await newDocument.boundingBox())!
    assert.equal(await toolbar.locator('[data-explorer-database]').count(), 1)
    assert.equal(await page.locator('[data-tree-key] [data-explorer-database]').count(), 0, 'the file list has no floating database action')
    assert.ok(before.x >= createBox.x + createBox.width && before.x - createBox.x - createBox.width <= 8, 'the database button immediately follows New document')
    assert.equal(before.y, createBox.y)
    assert.equal(before.height, createBox.height)
    assert.equal(before.width, createBox.width)
    assert.equal(await explorer.evaluate(el => el.ownerDocument.defaultView!.getComputedStyle(el).position), 'static')
    const listBox = (await page.locator('[data-tree-key]').boundingBox())!
    assert.ok(before.y + before.height <= listBox.y, 'the toolbar sits above file content')
    await page.locator('[data-tree-key] > div').last().evaluate(el => { el.scrollTop = 500 })
    assert.deepEqual(await explorer.boundingBox(), before, 'scrolling files does not move the header action')
    await toolbar.getByRole('button', { name: 'Files', exact: true }).click()
    const folderBox = (await toolbar.getByRole('button', { name: 'New folder', exact: true }).boundingBox())!
    const filesDatabaseBox = (await explorer.boundingBox())!
    assert.ok(filesDatabaseBox.x >= folderBox.x + folderBox.width && filesDatabaseBox.x - folderBox.x - folderBox.width <= 8, 'Files keeps the database button after creation actions')
    await toolbar.getByRole('button', { name: 'Documents', exact: true }).click()
    await newDocument.focus()
    await page.keyboard.press('Tab')
    assert.equal(await explorer.evaluate(el => el === el.ownerDocument.activeElement), true, 'keyboard focus moves from creation to the database button')
    await page.keyboard.press('Enter')
    assert.deepEqual(await page.evaluate('window.actions'), ['database', 'database', 'database'])
    await page.mouse.move(0, 0)
    await explorer.hover()
    await page.getByRole('tooltip', { name: 'Database', exact: true }).waitFor()
    await page.evaluate('window.setGuest(true)')
    for (const action of [explorer, editor]) await action.waitFor({ state: 'hidden' })
    await page.evaluate('window.setGuest(false);window.setDatabaseAccess(false)')
    for (const action of [explorer, editor, dock]) await action.waitFor({ state: 'hidden' })
    await page.evaluate('window.setDatabaseAccess(true);window.setWritable(false)')
    if (width < 768) await menu.click()
    await editor.waitFor()
    await explorer.waitFor()
    assert.equal(await newDocument.count(), 0)
    assert.equal(await explorer.isVisible(), true, 'database access does not require file creation permission')
    await page.evaluate('window.setWritable(true)')
    await newDocument.waitFor()
    assert.deepEqual(errors, [])
    await page.screenshot({ path: `/tmp/mew-database-entrypoints-${width}.png` })
    await page.close()
  }
})
