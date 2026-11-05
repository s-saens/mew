import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { connectTestBrowser } from './test-browser.ts'

const root = path.resolve(import.meta.dirname, '..')

test('database actions stay compact inside explorer/editor content and respect availability', { timeout: 60_000 }, async t => {
  const source = `import React from 'react';import {createRoot} from 'react-dom/client';
import {I18nProvider} from '${root}/src/i18n.tsx';
import {FileTree} from '${root}/src/components/FileTree.tsx';
import {EditorPane} from '${root}/src/components/EditorPane.tsx';
import {MobileDock} from '${root}/src/components/mobile-dock.tsx';
import {HoverTipLayer} from '@mew/ui';
const noop=()=>{};window.actions=[];
const callbacks=Object.fromEntries(['registerHandle','registerElement','registerTabBar','onFocus','onActivate','onPin','onCloseTab','onReorder','onSetViewMode','onChangeContent','onOpenLink','onOpenHistory','onSetTocOpen','onOpenSidebar','onTabDragMove','onTabDrop'].map(k=>[k,noop]));
function Fixture(){const [access,setAccess]=React.useState(true);const [guest,setGuest]=React.useState(false);window.setDatabaseAccess=setAccess;window.setGuest=setGuest;const open=access?()=>window.actions.push('database'):undefined;const tree=Array.from({length:70},(_,i)=>({path:'document-'+i+'.txt',name:'Document '+i,type:'file'}));
return <HoverTipLayer><div className="flex h-dvh flex-col bg-surface-deep text-ink"><header className="h-9 shrink-0">Documents</header><main className="flex min-h-0 flex-1 flex-col md:flex-row"><aside data-explorer-area className="relative h-64 shrink-0 md:h-full md:w-64"><FileTree tree={tree} project="docs" stateKey="database-entrypoints" selectedPath={null} readOnly newFileSignal={{n:0,parentPath:null}} revealSignal={0} presence={{}} onSelect={noop} onFileCreated={noop} onFolderCreated={noop} onRenamed={noop} onDeleted={noop} onNotice={noop} onOpenDatabase={open}/></aside><section data-editor-area className="flex min-h-0 min-w-0 flex-1 flex-col"><EditorPane {...callbacks} pane={{id:'main',activePath:'notes.txt',tabs:[{path:'notes.txt',content:'Example document',viewMode:'plain',preview:false,editable:true}]}} role={guest?'guest':'owner'} authEmail={guest?null:'owner@example.test'} project="docs" tree={[]} presence={{}} focused isGuest={guest} canCollaborate={false} showSidebarButton={false} tocOpen={false} dropZone={null} onAskAgent={async()=>window.actions.push('agent')} onOpenDatabase={open}/></section></main><MobileDock active="editor" openPanels={['editor']} available={access?['sidebar','editor','database']:['sidebar','editor']} hidden={false} position="bottom" onSelect={id=>window.actions.push(id)} onNavigate={noop}/></div></HoverTipLayer>}
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
  const components = ['src/components/FileTree.tsx', 'src/components/EditorPane.tsx', 'src/components/mobile-dock.tsx', 'src/components/TabBar.tsx', 'packages/ui/src/HoverTipLayer.tsx']
  const content = (await Promise.all(components.map(file => fs.readFile(path.join(root, file), 'utf8')))).join('\n')
  const compiler = await compile(await fs.readFile(path.join(root, 'src/index.css'), 'utf8'), { base: path.join(root, 'src'), onDependency() {} })
  const css = compiler.build([...new Set((source + content).match(/[A-Za-z0-9_@!:/.[\]()%,-]+/g))])
  const browser = await connectTestBrowser()
  t.after(() => browser.close())
  for (const width of [390, 1280]) {
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
    await editor.waitFor().catch(error => { assert.deepEqual(errors, []); throw error })
    for (const action of [explorer, editor, dock]) {
      assert.equal(await action.getAttribute('aria-label'), 'Database')
      assert.equal(await action.getAttribute('aria-haspopup'), 'dialog')
      await action.click()
    }
    assert.deepEqual(await page.evaluate('window.actions'), ['database', 'database', 'database'])
    assert.equal(await dock.getAttribute('aria-pressed'), null, 'the database popup action is not presented as a panel toggle')
    const editorBox = (await editor.boundingBox())!, agentBox = (await page.locator('[data-editor-database] + button').boundingBox())!
    assert.ok(editorBox.x + editorBox.width <= agentBox.x && agentBox.x - editorBox.x - editorBox.width <= 8)
    assert.equal(editorBox.y, agentBox.y)
    assert.ok(editorBox.height <= 30 && editorBox.height === agentBox.height, 'the database action shares the compact floating toolbar height')
    const area = (await page.locator('[data-explorer-area]').boundingBox())!, before = (await explorer.boundingBox())!
    assert.ok(before.x >= area.x && before.x + before.width <= area.x + area.width && before.y >= area.y && before.y + before.height <= area.y + area.height, 'explorer action remains inside its file area')
    assert.ok(before.height <= 30 && before.x > area.x + area.width / 2, 'the explorer action is compact and aligned at the upper right')
    await page.locator('[data-tree-key] > div').last().evaluate(el => { el.scrollTop = 500 })
    assert.deepEqual(await explorer.boundingBox(), before, 'scrolling files does not move the floating action')
    await explorer.hover()
    await page.getByRole('tooltip', { name: 'Database', exact: true }).waitFor()
    await page.evaluate('window.setGuest(true)')
    await editor.waitFor({ state: 'hidden' })
    await page.evaluate('window.setGuest(false);window.setDatabaseAccess(false)')
    for (const action of [explorer, editor, dock]) await action.waitFor({ state: 'hidden' })
    await page.evaluate('window.setDatabaseAccess(true)')
    await editor.waitFor()
    assert.deepEqual(errors, [])
    await page.screenshot({ path: `/tmp/mew-database-entrypoints-${width}.png` })
    await page.close()
  }
})
