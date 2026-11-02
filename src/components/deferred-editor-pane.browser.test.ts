import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'rolldown'
import { chromium, type Page } from 'playwright-core'
import { domBrowserExecutable } from '../../server/browser-dom-executable.ts'

async function fixtureBundle() {
  const pane = new URL('./EditorPane.tsx', import.meta.url).pathname
  const deferred = new URL('./deferred-editor-pane.tsx', import.meta.url).pathname
  const views = new URL('./deferred-editor-views.tsx', import.meta.url).pathname
  const plain = new URL('./CodePane.tsx', import.meta.url).pathname
  const react = import.meta.resolve('react'), reactDom = import.meta.resolve('react-dom/client')
  const engine = (name: string, kind: string) => `import React from ${JSON.stringify(react)};export const ${name}=React.forwardRef((props,ref)=>{React.useImperativeHandle(ref,()=>({getSelectedText:()=>props.path}));React.useEffect(()=>{window.mountedEngines.push(${JSON.stringify(kind)}+':'+props.path+':'+props.subject)},[]);return <textarea data-engine=${JSON.stringify(kind)} value={props.value} onChange={event=>props.onChange(event.target.value)}/>});`
  const result = await build({ input: 'virtual:prepared-pane.tsx', write: false, platform: 'browser', output: { format: 'esm' }, onwarn(warning, warn) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning) }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('production') } }, plugins: [{
    name: 'prepared-pane', resolveId(id) { if (id.startsWith('virtual:')) return id; if (id === '@mew/editor') return 'virtual:hotview.tsx'; if (id.endsWith('.css')) return 'virtual:style' },
    load(id) {
      if (id === 'virtual:style') return ''
      if (id === plain) return engine('CodePane', 'plain')
      if (id === 'virtual:hotview.tsx') return engine('Editor', 'hotview')
      if (id === pane) return `import React from ${JSON.stringify(react)};import{DeferredCodePane,DeferredHotviewEditor}from ${JSON.stringify(views)};
export function EditorPane(props){const ref=React.useRef(null),selected=props.pane.tabs.find(tab=>tab.id===props.pane.activeTabId)??props.pane.tabs.find(tab=>tab.path===props.pane.activePath),tab=selected?{...selected,path:props.pane.activePath??''}:null;window.currentHandle=()=>ref.current?.getSelectedText()??null;React.useEffect(()=>{window.mountedPanes.push(props.authEmail)},[]);const View=tab?.viewMode==='plain'?DeferredCodePane:DeferredHotviewEditor;return <div data-pane-scope={props.authEmail}>{tab&&<View ref={ref} path={tab.path} subject={props.authEmail} value={tab.content} onChange={value=>window.edits.push({subject:props.authEmail,path:tab.path,value})}/>}</div>}`
      if (id === 'virtual:prepared-pane.tsx') return `import React from ${JSON.stringify(react)};import{createRoot}from ${JSON.stringify(reactDom)};import{DeferredEditorPane}from ${JSON.stringify(deferred)};
window.mountedEngines=[];window.mountedPanes=[];window.edits=[];
const query=new URLSearchParams(location.search),initialPath=query.get('path')??'first.md';
function Fixture(){const[visible,setVisible]=React.useState(query.has('open')),[mode,setMode]=React.useState(query.get('mode')??'plain'),[path,setPath]=React.useState(initialPath),[subject,setSubject]=React.useState('first@test'),[revision,setRevision]=React.useState(0);const tab={id:'selected',path,content:path,viewMode:mode,editable:!query.has('denied'),status:query.has('denied')?'error':'idle',deferredLoad:query.has('deferred')};return <><button onClick={()=>setVisible(true)}>Open</button><button onClick={()=>setVisible(false)}>Close</button><button onClick={()=>setMode('hotview')}>Hotview</button><button onClick={()=>setMode('plain')}>Plain</button><button onClick={()=>setPath('second.md')}>Other file</button><button onClick={()=>setSubject('second@test')}>Other scope</button><button onClick={()=>setRevision(value=>value+1)}>Permission change</button><DeferredEditorPane visible={visible} accessVersion={String(revision)} authEmail={subject} role="owner" workspace={{path:'/fixture'}} project="docs" isGuest={false} canCollaborate pane={{id:'main',activePath:query.has('id')&&path===initialPath?(query.get('renderPath')??'wrong.md'):path,activeTabId:query.has('empty')?undefined:'selected',tabs:query.has('empty')?[]:query.has('id')?[{...tab,id:'other',path:'wrong.md',viewMode:'hotview'},tab]:[tab]}}/></>};createRoot(document.getElementById('root')).render(<Fixture/>);`
    },
  }] })
  const chunks = result.output.filter(chunk => chunk.type === 'chunk')
  return { scripts: new Map(chunks.map(chunk => ['/' + chunk.fileName, chunk.code])), entry: chunks.find(chunk => chunk.isEntry)!.fileName,
    pane: '/' + chunks.find(chunk => pane in chunk.modules)!.fileName, plain: '/' + chunks.find(chunk => plain in chunk.modules)!.fileName,
    hotview: '/' + chunks.find(chunk => 'virtual:hotview.tsx' in chunk.modules)!.fileName }
}

async function install(page: Page, fixture: Awaited<ReturnType<typeof fixtureBundle>>, hold: Set<string>) {
  const requested: string[] = [], releases = new Map<string, () => void>()
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.setDefaultTimeout(3000)
  await page.route('http://prepared-pane.test/**', async route => {
    const path = new URL(route.request().url()).pathname
    requested.push(path)
    if (hold.has(path)) await new Promise<void>(resolve => { releases.set(path, resolve) })
    if (page.isClosed()) return
    const script = fixture.scripts.get(path)
    await route.fulfill(script === undefined ? { contentType: 'text/html', body: `<div id="root"></div><script type="module" src="/${fixture.entry}"></script>` } : { contentType: 'text/javascript', body: script })
  })
  return { requested, releases, errors }
}

const paint = (page: Page) => page.locator('body').evaluate(element => new Promise<void>(resolve => element.ownerDocument.defaultView!.requestAnimationFrame(() => element.ownerDocument.defaultView!.requestAnimationFrame(() => resolve()))))

test('selected engine preparation overlaps the pane while scope, current props, refs and cancellation remain guarded', { skip: !domBrowserExecutable(), timeout: 20_000 }, async t => {
  const fixture = await fixtureBundle(), browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  t.after(() => browser.close())
  const page = await browser.newPage(), state = await install(page, fixture, new Set([fixture.pane, fixture.plain]))
  await page.goto('http://prepared-pane.test/?id=1', { waitUntil: 'domcontentloaded' })
  await paint(page)
  assert.equal(state.requested.includes(fixture.pane) || state.requested.includes(fixture.plain) || state.requested.includes(fixture.hotview), false, 'an initially closed pane downloads no pane or engine')
  const paneRequested = page.waitForRequest(request => new URL(request.url()).pathname === fixture.pane)
  const plainRequested = page.waitForRequest(request => new URL(request.url()).pathname === fixture.plain)
  await page.getByRole('button', { name: 'Open', exact: true }).click()
  await Promise.all([paneRequested, plainRequested])
  assert.equal(state.requested.includes(fixture.hotview), false, 'only the selected active-ID engine is prepared while its pane is held')
  await page.getByRole('button', { name: 'Hotview', exact: true }).click()
  await page.getByRole('button', { name: 'Other file', exact: true }).click()
  await page.getByRole('button', { name: 'Other scope', exact: true }).click()
  state.releases.get(fixture.plain)!()
  await paint(page)
  assert.equal(await page.locator('[data-pane-scope]').count(), 0, 'engine preparation cannot bypass the current scope pane gate')
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  state.releases.get(fixture.pane)!()
  await paint(page)
  assert.deepEqual(await page.evaluate('window.mountedPanes'), [], 'closing during preparation cannot mount a late pane')
  await page.getByRole('button', { name: 'Open', exact: true }).click()
  await page.locator('[data-engine="hotview"]').waitFor()
  assert.deepEqual(await page.evaluate('window.mountedPanes'), ['second@test'])
  assert.deepEqual(await page.evaluate('window.mountedEngines'), ['hotview:second.md:second@test'])
  assert.equal(await page.evaluate('window.currentHandle()'), 'second.md')
  await page.getByRole('button', { name: 'Plain', exact: true }).click()
  await page.locator('[data-engine="plain"]').fill('Current edit')
  assert.equal(await page.evaluate('window.currentHandle()'), 'second.md')
  assert.deepEqual(await page.evaluate('window.edits'), [{ subject: 'second@test', path: 'second.md', value: 'Current edit' }])
  assert.equal(state.requested.filter(path => path === fixture.plain).length, 1, 'the mounted wrapper shares the preparation promise')
  assert.deepEqual(state.errors, [])
  await page.close()
})

test('closed prepared panes retain same-scope state but cannot display the old scope after permission changes', { skip: !domBrowserExecutable(), timeout: 15_000 }, async t => {
  const fixture = await fixtureBundle(), browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  t.after(() => browser.close())
  const page = await browser.newPage(), state = await install(page, fixture, new Set())
  await page.goto('http://prepared-pane.test/?open=1')
  await page.locator('[data-engine="plain"]').waitFor()
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  assert.equal(await page.locator('[data-pane-scope]').getAttribute('data-pane-scope'), 'first@test', 'same-scope close preserves an already mounted editor')
  await page.getByRole('button', { name: 'Permission change', exact: true }).click()
  assert.equal(await page.locator('[data-pane-scope]').count(), 0, 'a closed access-version transition hides the previously authorized pane even for the same account')
  await page.getByRole('button', { name: 'Open', exact: true }).click()
  await page.locator('[data-pane-scope="first@test"] [data-engine="plain"]').waitFor()
  assert.deepEqual(await page.evaluate('window.mountedPanes'), ['first@test', 'first@test'])
  assert.deepEqual(state.errors, [])
  await page.close()
})

test('empty, deferred, unsupported, media, SVG, diff and denied tabs do not prepare an unrelated engine', { skip: !domBrowserExecutable(), timeout: 20_000 }, async t => {
  const fixture = await fixtureBundle(), browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  t.after(() => browser.close())
  const diff = 'mew:diff:' + encodeURIComponent(JSON.stringify(['docs', '', null, 'file.txt']))
  for (const query of ['empty=1', 'deferred=1', 'path=file.exe', 'path=photo.png', 'path=preview.svg&mode=hotview', 'denied=1', 'path=' + encodeURIComponent(diff), 'id=1&renderPath=photo.png', 'id=1&renderPath=file.exe', 'id=1&renderPath=' + encodeURIComponent(diff), 'path=mew%3Afile%3Adocs%2Fpreview.svg&mode=hotview']) {
    const page = await browser.newPage(), state = await install(page, fixture, new Set([fixture.pane]))
    await page.goto('http://prepared-pane.test/?open=1&' + query, { waitUntil: 'domcontentloaded' })
    await paint(page)
    assert.equal(state.requested.includes(fixture.plain) || state.requested.includes(fixture.hotview), false, query)
    await page.close()
    state.releases.get(fixture.pane)?.()
  }
  const external = await browser.newPage(), state = await install(external, fixture, new Set([fixture.pane, fixture.hotview]))
  const requested = external.waitForRequest(request => new URL(request.url()).pathname === fixture.hotview)
  await external.goto('http://prepared-pane.test/?open=1&mode=hotview&path=' + encodeURIComponent('@fs:/outside/preview.svg'), { waitUntil: 'domcontentloaded' })
  await requested
  assert.equal(state.requested.includes(fixture.plain), false, 'external SVG Hotview follows the rich editor branch')
  await external.close()
  state.releases.get(fixture.pane)?.()
  state.releases.get(fixture.hotview)?.()
})
