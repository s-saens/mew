import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'rolldown'
import { connectTestBrowser } from '../../server/test-browser.ts'

test('wide desktop project views use compact tools and one active keyboard owner with distinct Dock IDs', { timeout: 30_000 }, async t => {
  const sourcePath = (path: string) => new URL(path, import.meta.url).pathname
  const context = sourcePath('./workspace-view-context.ts'), dock = sourcePath('../components/DockWorkspace.tsx'), mobileDock = sourcePath('../components/mobile-dock.tsx'), switcher = sourcePath('../components/ProjectSwitcher.tsx'), memo = sourcePath('../hooks/use-shared-memo.ts')
  const source = `
    import React from'react';import{createRoot}from'react-dom/client';import{WorkspaceViewProvider,useWorkspaceDesktop}from${JSON.stringify(context)};
    import{DockWorkspace,DockPanel}from${JSON.stringify(dock)};import{MobileDock}from${JSON.stringify(mobileDock)};import{ProjectSwitcher}from${JSON.stringify(switcher)};import{useSharedMemo}from${JSON.stringify(memo)};
    window.selections=[];
    function Content({id}){const desktop=useWorkspaceDesktop(),[signal,setSignal]=React.useState(0),[open,setOpen]=React.useState(false),dockRef=React.useRef(null);const session=useSharedMemo({authEmail:'fixture@test',open,onOpenChange:setOpen});
      return <><output data-desktop>{String(desktop)}</output><button data-select-project onClick={()=>setSignal(value=>value+1)}>Choose {id}</button><ProjectSwitcher paths={['/a','/b']} activePath={'/'+id} fallbackLabel={id} canOpen canChangeIcon={false} icons={{}} onActivate={path=>window.selections.push({id,path})} onIconChange={()=>{}} onOpen={()=>{}} sidebarEnabled selectionSignal={signal}/>
        <div style={{position:'relative',height:200,display:'flex'}}><DockWorkspace value={null} onChange={()=>{}} foreground="agent" apiRef={dockRef}><DockPanel id="editor" kind="editor" tabs={['editor']}><div data-editor>Editor {id}</div></DockPanel><DockPanel id="agent" kind="agent" tabs={['agent']}><div data-agent>Agent {id}</div></DockPanel></DockWorkspace></div>
        <MobileDock active="agent" available={['editor','agent']} hidden={false} position="left" onSelect={()=>{}} onNavigate={()=>{}}/>
        <div data-workspace-panel="memo" data-memo-root={id} ref={session.root} hidden={!open} tabIndex={-1}>Memo {id}</div>
      </>
    }
    function Frame({id,active,compact}){const root=React.useRef(null);return <section ref={root} data-workspace-view={id} style={{width:500}}><WorkspaceViewProvider value={{id,compact,active,root}}><Content id={id}/></WorkspaceViewProvider></section>}
    function Fixture(){const[active,setActive]=React.useState('a'),[compact,setCompact]=React.useState(true);return <><nav><button onClick={()=>setActive('a')}>Focus A</button><button onClick={()=>setActive('b')}>Focus B</button><button onClick={()=>setCompact(value=>!value)}>Toggle compact</button></nav><div style={{display:'flex'}}><Frame id="a" active={active==='a'} compact={compact}/><Frame id="b" active={active==='b'} compact={compact}/></div></>};createRoot(document.getElementById('root')).render(<Fixture/>);
  `
  const result = await build({ input: 'virtual:workspace-view.tsx', write: false, platform: 'browser', output: { format: 'esm' }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('production') } }, onLog(level, log, handler) { if (log.code !== 'MODULE_LEVEL_DIRECTIVE') handler(level, log) }, plugins: [{
    name: 'workspace-view-fixture', resolveId(id) { if (id.startsWith('virtual:')) return id },
    load(id) {
      if (id === 'virtual:workspace-view.tsx') return source
      if (id.endsWith('.css')) return { code: '', moduleType: 'js' }
      if (id === sourcePath('../i18n.tsx')) return `export function useI18n(){return{locale:'en',t:key=>key}}`
      if (id === sourcePath('../hooks/useCollab.ts')) return 'export function useCollab(){return null}'
      if (id === sourcePath('../hooks/use-mobile-keyboard.ts')) return 'export function useMobileKeyboard(){return false}'
      if (id === sourcePath('../components/ProjectIcon.tsx')) return 'export function ProjectIcon(){return null}'
      if (id === sourcePath('../components/CommandButtonMenu.tsx')) return 'export function CommandButtonMenu(){return null}'
      if (id === sourcePath('../components/project-catalog-panel.tsx')) return 'export function ProjectCatalogPanel(){return null}'
      if (id === sourcePath('../components/ProjectDeleteDialog.tsx')) return 'export function ProjectDeleteDialog(){return null}'
    },
  }] })
  const chunks = result.output.filter(item => item.type === 'chunk'), entry = chunks.find(item => item.isEntry)!
  const scripts = new Map(chunks.map(chunk => ['/' + chunk.fileName, chunk.code]))
  const browser = await connectTestBrowser()
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } }), errors: string[] = []
  page.setDefaultTimeout(5000)
  page.on('pageerror', error => errors.push(error.message))
  await page.route('http://workspace-view.test/**', route => {
    const script = scripts.get(new URL(route.request().url()).pathname)
    return route.fulfill(script ? { contentType: 'text/javascript', body: script } : { contentType: 'text/html', body: `<style>section[hidden],[hidden]{display:none!important}.flex{display:flex}.relative{position:relative}.min-h-0{min-height:0}.flex-1{flex:1}</style><div id="root"></div><script type="module" src="/${entry.fileName}"></script>` })
  })
  await page.goto('http://workspace-view.test')
  await page.locator('[data-workspace-view="a"] [data-agent]').waitFor()
  assert.deepEqual(await page.locator('[data-desktop]').allTextContents(), ['false', 'false'])
  assert.equal(await page.locator('[data-workspace-view="a"] [data-editor]').isVisible(), false)
  assert.equal(await page.locator('[data-workspace-view="b"] [data-agent]').isVisible(), true)
  assert.deepEqual(await page.locator('.mobile-dock').evaluateAll(elements => elements.map(element => [element.getAttribute('data-position'), element.hasAttribute('data-vertical')])), [['bottom', false], ['bottom', false]])
  const hintIds = await page.locator('.mobile-dock button').evaluateAll(elements => elements.map(element => element.getAttribute('aria-describedby')))
  assert.equal(new Set(hintIds).size, 2, 'each project Dock has a distinct hint target')
  for (const id of hintIds) assert.equal(await page.locator(`[id="${id}"]`).count(), 1)

  await page.keyboard.press('Alt+2')
  assert.deepEqual(await page.evaluate('window.selections'), [{ id: 'a', path: '/b' }])
  await page.getByRole('button', { name: 'Focus B', exact: true }).click()
  await page.keyboard.press('Alt+1')
  assert.deepEqual(await page.evaluate('window.selections'), [{ id: 'a', path: '/b' }, { id: 'b', path: '/a' }])
  await page.keyboard.press('Control+m')
  assert.equal(await page.locator('[data-memo-root="a"]').isVisible(), false)
  assert.equal(await page.locator('[data-memo-root="b"]').isVisible(), true)
  await page.locator('[data-memo-root="b"]').evaluate(element => new Promise<void>(resolve => element.ownerDocument.defaultView!.requestAnimationFrame(() => element.ownerDocument.defaultView!.requestAnimationFrame(() => resolve()))))
  assert.equal(await page.locator('[data-memo-root="b"]').evaluate(element => element === element.ownerDocument.activeElement), true)

  await page.locator('[data-workspace-view="b"] [data-select-project]').click()
  await page.locator('[data-mobile-project-panel]').waitFor()
  assert.equal(await page.locator('[data-mobile-project-panel]').count(), 1, 'board title signal opens one compact selector')
  await page.keyboard.press('Escape')
  await page.locator('[data-mobile-project-panel]').waitFor({ state: 'detached' })
  await page.getByRole('button', { name: 'Toggle compact', exact: true }).click()
  assert.deepEqual(await page.locator('[data-desktop]').allTextContents(), ['true', 'true'])
  assert.equal(await page.locator('[data-workspace-view="a"] [data-editor]').isVisible(), true)
  assert.deepEqual(errors, [])
})
