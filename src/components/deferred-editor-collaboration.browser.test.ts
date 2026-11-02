import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'rolldown'
import { chromium, type Page } from 'playwright-core'
import { domBrowserExecutable } from '../../server/browser-dom-executable.ts'

async function fixtureBundle() {
  const pane = new URL('./EditorPane.tsx', import.meta.url).pathname
  const deferred = new URL('./deferred-editor-pane.tsx', import.meta.url).pathname
  const runtime = new URL('../runtime/app-runtime.ts', import.meta.url).pathname
  const i18n = new URL('../i18n.tsx', import.meta.url).pathname
  const performance = new URL('../utils/fileOpenPerformance.ts', import.meta.url).pathname
  const source = `import React from ${JSON.stringify(import.meta.resolve('react'))};import{createRoot}from ${JSON.stringify(import.meta.resolve('react-dom/client'))};
import*as Y from'yjs';import{Awareness}from'y-protocols/awareness';import{configureAppRuntime}from ${JSON.stringify(runtime)};
import{DeferredEditorPane}from ${JSON.stringify(deferred)};import{I18nProvider}from ${JSON.stringify(i18n)};import{startFileOpen}from ${JSON.stringify(performance)};
window.sessions=[];window.writes=[];
configureAppRuntime({collaboration:{close(){},open(identity,onState){const ydoc=new Y.Doc(),awareness=new Awareness(ydoc),entry={...identity,ydoc,closed:false,destroyed:false,updates:0};window.sessions.push(entry);ydoc.on('destroy',()=>entry.destroyed=true);ydoc.on('update',()=>entry.updates++);entry.sync=()=>onState({ydoc,awareness,synced:true,connected:true});onState({ydoc,awareness,synced:false,connected:true});return{close(){entry.closed=true;awareness.destroy();ydoc.destroy()}}}}});
const noop=()=>{},callbacks=Object.fromEntries(['registerHandle','registerElement','registerTabBar','onFocus','onActivate','onPin','onCloseTab','onReorder','onSetViewMode','onOpenLink','onOpenHistory','onSetTocOpen','onOpenSidebar','onTabDragMove','onTabDrop'].map(key=>[key,noop]));
function Fixture(){const q=new URLSearchParams(location.search),[visible,setVisible]=React.useState(q.has('open')),[path,setPath]=React.useState(q.get('path')??'README.md'),[project,setProject]=React.useState('docs'),[workspace,setWorkspace]=React.useState('/fixture'),[email,setEmail]=React.useState('first@test'),[version,setVersion]=React.useState(0),[verified,setVerified]=React.useState(false),[denied,setDenied]=React.useState(false),[trace]=React.useState(startFileOpen);
const tab={id:'active',path,openTrace:trace,viewMode:q.get('mode')??'hotview',content:verified?'# Verified server body':'# Unverified cache',editable:verified&&!denied,revalidating:!verified,status:denied?'error':'idle',statusMessage:denied?'Permission denied':undefined,deferredLoad:q.has('deferred'),anchorPreview:q.has('anchor')?{lineStart:1,lineEnd:2}:undefined};
return <div style={{height:700,display:'flex',flexDirection:'column'}}><nav><button onClick={()=>setVisible(true)}>Open</button><button onClick={()=>setVisible(false)}>Close</button><button onClick={()=>setVerified(true)}>Verify</button><button onClick={()=>{setVerified(true);setDenied(true)}}>Deny</button><button onClick={()=>setVersion(value=>value+1)}>Permission change</button><button onClick={()=>setPath('other.md')}>Other file</button><button onClick={()=>setProject('other')}>Other project</button><button onClick={()=>setWorkspace('/other')}>Other workspace</button><button onClick={()=>setEmail('other@test')}>Other account</button><button onClick={()=>window.sessions.at(-1)?.sync()}>Synchronize</button></nav>
<DeferredEditorPane {...callbacks} accessVersion={String(version)} visible={visible} onChangeContent={(path,content)=>window.writes.push({path,content})} pane={{id:'main',activePath:path,activeTabId:'active',tabs:[tab]}} authEmail={email} role={q.has('guest')?'guest':'owner'} isGuest={q.has('guest')} canCollaborate={!q.has('disabled')} workspace={{path:workspace}} project={project} tree={[]} presence={{}} focused showSidebarButton={false} tocOpen={false} dropZone={null}/></div>}
createRoot(document.getElementById('root')).render(<I18nProvider><Fixture/></I18nProvider>);`
  const bundle = await build({ input: 'virtual:early-collaboration.tsx', write: false, platform: 'browser', output: { format: 'esm' }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('production') } }, onwarn(warning, warn) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning) }, plugins: [{ name: 'early-collaboration', resolveId(id) { if (id === 'virtual:early-collaboration.tsx') return id; if (id.endsWith('.css')) return 'virtual:style' }, load(id) { if (id === 'virtual:early-collaboration.tsx') return source; if (id === 'virtual:style') return '' } }] })
  const chunks = bundle.output.filter(item => item.type === 'chunk')
  return { scripts: new Map(chunks.map(item => ['/' + item.fileName, item.code])), entry: '/' + chunks.find(item => item.isEntry)!.fileName, pane: '/' + chunks.find(item => pane in item.modules)!.fileName }
}

async function install(page: Page, fixture: Awaited<ReturnType<typeof fixtureBundle>>, holdPane = false) {
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve; if (!holdPane) resolve() })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.setDefaultTimeout(5000)
  await page.route('http://early-collaboration.test/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path === fixture.pane) await gate
    if (page.isClosed()) return
    const script = fixture.scripts.get(path)
    if (script !== undefined) return route.fulfill({ contentType: 'text/javascript', body: script })
    if (path === '/api/comments') return route.fulfill({ json: { threads: [] } })
    if (path === '/api/members') return route.fulfill({ json: { members: [] } })
    if (path.startsWith('/api/')) return route.fulfill({ json: [] })
    return route.fulfill({ contentType: 'text/html', body: `<div id="root"></div><script type="module" src="${fixture.entry}"></script>` })
  })
  return { release, errors }
}

const paint = (page: Page) => page.locator('body').evaluate(element => new Promise<void>(resolve => element.ownerDocument.defaultView!.requestAnimationFrame(() => element.ownerDocument.defaultView!.requestAnimationFrame(() => resolve()))))

test('collaboration overlaps the held pane without attaching cached data and survives same-scope closure', { skip: !domBrowserExecutable(), timeout: 25_000 }, async t => {
  const fixture = await fixtureBundle(), browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  t.after(() => browser.close())
  const page = await browser.newPage(), state = await install(page, fixture, true)
  await page.goto('http://early-collaboration.test/', { waitUntil: 'domcontentloaded' })
  await paint(page)
  assert.equal(await page.evaluate('window.sessions.length'), 0, 'initially closed scopes prepare no document')
  await page.getByRole('button', { name: 'Open', exact: true }).click()
  await page.waitForFunction('window.sessions.length===1')
  assert.equal(await page.evaluate("performance.getEntriesByType('measure').filter(entry=>entry.name.endsWith(':collaboration-start')).length"), 1)
  assert.equal(await page.locator('.ProseMirror').count(), 0, 'the pane module remains held while collaboration is ready')
  await page.getByRole('button', { name: 'Synchronize', exact: true }).click()
  await page.waitForFunction("performance.getEntriesByType('measure').some(entry=>entry.name.endsWith(':collaboration-synced'))")
  state.release()
  await page.locator('.ProseMirror').filter({ hasText: 'Unverified cache' }).waitFor()
  assert.equal(await page.locator('.ProseMirror').getAttribute('contenteditable'), 'false')
  assert.equal(await page.evaluate('window.sessions[0].updates'), 0, 'a synchronized preparatory document cannot seed the cached body')
  assert.equal(await page.evaluate('window.sessions.length'), 1, 'EditorPane adopts the existing session without opening a second one')
  await page.getByRole('button', { name: 'Verify', exact: true }).click()
  await page.locator('.ProseMirror[contenteditable="true"]').filter({ hasText: 'Verified server body' }).waitFor()
  await page.waitForFunction('window.sessions[0].updates>0')
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await paint(page)
  assert.equal(await page.evaluate('window.sessions[0].closed'), false, 'an already mounted same-scope pane retains its collaboration')
  await page.getByRole('button', { name: 'Permission change', exact: true }).click()
  await page.waitForFunction('window.sessions[0].closed&&window.sessions[0].destroyed')
  assert.equal(await page.locator('.ProseMirror').count(), 0, 'a closed changed authorization scope cannot retain the old editor')
  await page.getByRole('button', { name: 'Open', exact: true }).click()
  await page.waitForFunction('window.sessions.length===2')
  await page.locator('.ProseMirror[contenteditable="false"]').waitFor()
  assert.equal(await page.evaluate('window.sessions[1].updates'), 0, 'the replacement remains unseeded until its own synchronization')
  await page.getByRole('button', { name: 'Synchronize', exact: true }).click()
  await page.locator('.ProseMirror[contenteditable="true"]').waitFor()
  for (const button of ['Other file', 'Other project', 'Other workspace', 'Other account']) {
    const count = await page.evaluate('window.sessions.length') as number
    await page.getByRole('button', { name: button, exact: true }).click()
    await page.waitForFunction(count => window.sessions.length === count + 1 && window.sessions[count - 1].destroyed, count)
    await page.locator('.ProseMirror[contenteditable="false"]').waitFor()
    assert.equal(await page.evaluate('window.sessions.at(-1).updates'), 0, button)
  }
  await page.getByRole('button', { name: 'Deny', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'Permission denied' }).waitFor()
  await page.waitForFunction('window.sessions.at(-1).destroyed')
  assert.deepEqual(state.errors, [])
  await page.close()
})

test('cancelled preparation destroys its document and excludes non-primary or unauthorized tabs', { skip: !domBrowserExecutable(), timeout: 25_000 }, async t => {
  const fixture = await fixtureBundle(), browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  t.after(() => browser.close())
  const page = await browser.newPage(), state = await install(page, fixture, true)
  await page.goto('http://early-collaboration.test/?open=1', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction('window.sessions.length===1')
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await page.waitForFunction('window.sessions[0].destroyed')
  await page.getByRole('button', { name: 'Synchronize', exact: true }).click()
  state.release()
  await paint(page)
  assert.equal(await page.locator('.ProseMirror').count(), 0)
  await page.getByRole('button', { name: 'Open', exact: true }).click()
  await page.waitForFunction('window.sessions.length===2')
  await page.locator('.ProseMirror[contenteditable="false"]').waitFor()
  assert.equal(await page.evaluate('window.sessions[1].updates'), 0, 'reopening cannot adopt a destroyed cached session')
  assert.deepEqual(state.errors, [])
  await page.close()
  for (const query of ['guest=1', 'disabled=1', 'deferred=1', 'anchor=1', 'path=archives/README.md', 'path=@fs:/outside/README.md', 'path=photo.png&mode=plain', 'path=file.exe', 'mode=plain']) {
    const blocked = await browser.newPage(), current = await install(blocked, fixture, true)
    await blocked.goto('http://early-collaboration.test/?open=1&' + query, { waitUntil: 'domcontentloaded' })
    await paint(blocked)
    assert.equal(await blocked.evaluate('window.sessions.length'), 0, query)
    await blocked.close()
    current.release()
    assert.deepEqual(current.errors, [])
  }
})
