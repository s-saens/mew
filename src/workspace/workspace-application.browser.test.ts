import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { build } from 'rolldown'
import type { Page } from 'playwright-core'
import { connectTestBrowser } from '../../server/test-browser.ts'

const origin = 'http://workspace-application.test'
const sourcePath = (path: string) => new URL(path, import.meta.url).pathname

async function fixtureBundle() {
  const application = sourcePath('./workspace-application.tsx'), apiContext = sourcePath('../api/workspace-api-context.tsx')
  const client = sourcePath('../api/client.ts')
  const source = `
    import React from'react';import{createRoot}from'react-dom/client';import{createPortal}from'react-dom';
    import{WorkspaceApplication}from${JSON.stringify(application)};import{useWorkspaceApi}from${JSON.stringify(apiContext)};
    window.fixture={activeRoot:new URLSearchParams(location.search).has('no-project')?null:'/a',calls:[],hosts:{},mounts:{},unmounts:{},prepared:{},released:{},waiters:{},blocked:[],prepareBlocked:[],prepareWaiters:{},fail:[],unavailable:[],actions:[],notReady:[],globalMounts:0,globalUnmounts:0};
    function Header({host}){React.useEffect(()=>{window.fixture.globalMounts++;return()=>{window.fixture.globalUnmounts++}},[]);return <nav data-global-toolbar data-project={host.panel.projectPath}><button data-mode="multi" onClick={()=>host.onModeChange('multi')}>Multi</button><button data-mode="single" onClick={()=>host.onModeChange('single')}>Single</button></nav>}
    function Workspace({host,onWorkspaceReady}){const api=useWorkspaceApi(),[tool,setTool]=React.useState('editor'),[selecting,setSelecting]=React.useState(false);if(!host)return window.fixture.activeRoot?<div data-legacy-workspace data-api-root={api.scope?.workspacePath??'legacy'}><textarea aria-label="Legacy draft"/></div>:<div data-fallback><button data-first-project onClick={()=>{window.fixture.activeRoot='/a';onWorkspaceReady?.({path:'/a',projectPath:'/a',hasProject:true,workspaceScopeVersion:1})}}>Open first project</button></div>;
      React.useEffect(()=>{window.fixture.mounts[host.id]=(window.fixture.mounts[host.id]??0)+1;return()=>{window.fixture.unmounts[host.id]=(window.fixture.unmounts[host.id]??0)+1}},[host.id]);
      React.useEffect(()=>{window.fixture.hosts[host.id]=host;host.register({workspacePath:host.panel.workingRoot,isReady:()=>!window.fixture.notReady.includes(host.panel.workingRoot),performAction:async action=>{window.fixture.actions.push({id:host.id,project:host.panel.projectPath,root:host.panel.workingRoot,action});if(action.kind==='start_project_session')setTool('agent')},prepareClose:async()=>{window.fixture.prepared[host.id]=(window.fixture.prepared[host.id]??0)+1;if(window.fixture.prepareBlocked.includes(host.panel.projectPath))await new Promise(resolve=>{window.fixture.prepareWaiters[host.id]=resolve});return()=>{window.fixture.released[host.id]=(window.fixture.released[host.id]??0)+1}}});return()=>{host.register(null);if(window.fixture.hosts[host.id]===host)delete window.fixture.hosts[host.id]}},[host]);
      React.useEffect(()=>{if(host.selectionSignal)setSelecting(true)},[host.selectionSignal]);
      return <div data-fixture-workspace={host.id} data-path={host.panel.projectPath} data-root={host.panel.workingRoot} data-active={String(host.active)} data-api-root={api.scope?.workspacePath??'legacy'}>
        {host.active&&host.headerHost&&createPortal(<Header host={host}/>,host.headerHost)}
        <output data-tool>{tool}</output><button data-tool-choice="agent" onClick={()=>setTool('agent')}>Agent</button><button data-tool-choice="git" onClick={()=>setTool('git')}>Git</button>
        <textarea data-draft aria-label={'Draft '+host.panel.projectPath} defaultValue={'Draft '+host.panel.projectPath}/>
        {selecting&&<div data-fixture-selector>{['/a','/b','/c','/d','/e'].map(path=><button key={path} data-replace-path={path} onClick={()=>host.onProjectChange(path).then(ok=>{if(ok)setSelecting(false)})}>{path}</button>)}</div>}
      </div>
    }
    createRoot(document.getElementById('root')).render(<WorkspaceApplication account="fixture@test" guest={false} renderWorkspace={(host,onWorkspaceReady)=><Workspace host={host} onWorkspaceReady={onWorkspaceReady}/>}/>);
  `
  const clientSource = `
    const info=path=>({path:path??'',projectPath:path?.includes('/.worktrees/')?path.split('/.worktrees/')[0]:path??'',label:path?.slice(1)??'',hasProject:!!path,...(new URLSearchParams(location.search).has('legacy-server')?{}:{workspaceScopeVersion:1})});
    export function createWorkspaceClient(scope){return{scope,fetchWorkspace:async()=>{window.fixture.calls.push({kind:'read',scope:scope?.workspacePath??'legacy'});if(scope&&window.fixture.unavailable.includes(scope.workspacePath))throw new Error('Workspace unavailable: '+scope.workspacePath);return info(scope?.workspacePath??window.fixture.activeRoot)},switchWorkspace:async path=>{window.fixture.calls.push({kind:'switch',scope:scope?.workspacePath??'legacy',path});if(scope&&window.fixture.unavailable.includes(scope.workspacePath))throw new Error('Workspace unavailable: '+scope.workspacePath);if(window.fixture.blocked.includes(path))await new Promise(resolve=>{window.fixture.waiters[path]=resolve});if(window.fixture.fail.includes(path))throw new Error('Selection failed: '+path);if(!scope)window.fixture.activeRoot=path;return info(path)}}}
    export const workspaceClient=createWorkspaceClient();
  `
  const result = await build({ input: 'virtual:workspace-application.tsx', write: false, platform: 'browser', output: { format: 'esm' }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('production') } }, onLog(level, log, handler) { if (log.code !== 'MODULE_LEVEL_DIRECTIVE') handler(level, log) }, plugins: [{
    name: 'workspace-application-fixture', resolveId(id) { if (id.startsWith('virtual:')) return id },
    load(id) {
      if (id === 'virtual:workspace-application.tsx') return source
      if (id.endsWith('.css')) return { code: '', moduleType: 'js' }
      if (id === client) return clientSource
      if (id === sourcePath('../i18n.tsx')) return `export function useI18n(){return{locale:'en',t:key=>key}}`
      if (id === sourcePath('./workspace-account.tsx')) return 'const services={capabilities:{terminal:false},projects:{paths:["/a","/b","/c"],setPaths(){},icons:{},saveQueue:{current:Promise.resolve()}}};export function useWorkspaceAccount(){return services}'
      if (id === sourcePath('../components/ProjectIcon.tsx')) return 'export function ProjectIcon(){return null}'
      if (id === sourcePath('../components/CommandButtonMenu.tsx')) return `import React from'react';export function CommandButtonMenu({workspacePath}){return <button data-project-command={workspacePath}>Command</button>}`
      if (id === sourcePath('../components/project-catalog-panel.tsx')) return `import React from'react';export function ProjectCatalogPanel({onOpen,onBusyChange}){return <div data-fixture-catalog>{['/a','/b','/c','/d','/e'].map(path=><button key={path} data-open-path={path} onClick={async()=>{onBusyChange?.(true);try{await onOpen?.(path)}finally{onBusyChange?.(false)}}}>{path}</button>)}</div>}`
      if (id === sourcePath('../components/startup-screen.tsx')) return `import React from'react';export function StartupScreen(){return <div data-startup>Loading</div>}export const PanelLoading=StartupScreen`
    },
  }] })
  const chunks = result.output.filter(item => item.type === 'chunk'), entry = chunks.find(item => item.isEntry)!
  const scripts = new Map(chunks.map(chunk => ['/' + chunk.fileName, chunk.code]))
  const css = fs.readFileSync(new URL('../components/project-board.css', import.meta.url), 'utf8')
  const html = `<html><head><style>:root{--color-edge:#445;--color-ink:#ddd;--color-ink-secondary:#aaa;--color-ink-muted:#999;--color-surface:#122;--color-surface-raised:#234}*{box-sizing:border-box}body{margin:0;color:#ddd;background:#123;font:14px sans-serif}.flex{display:flex}.flex-col{flex-direction:column}.flex-1{flex:1}.h-full{height:100%}.min-h-0{min-height:0}.relative{position:relative}.shrink-0{flex-shrink:0}.overflow-hidden{overflow:hidden}[hidden]{display:none!important}button{border:0;background:none;color:inherit;cursor:pointer}nav[data-global-toolbar]{height:36px}textarea{max-width:100%;background:transparent;color:inherit}[role=dialog]{position:fixed;top:60px;left:440px;z-index:100;background:#234;padding:8px}${css}</style></head><body><div id="root"></div><script type="module" src="/${entry.fileName}"></script></body></html>`
  return { scripts, html }
}

async function install(page: Page, fixture: Awaited<ReturnType<typeof fixtureBundle>>, storage: Record<string, string> = {}, pathname = '') {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.setDefaultTimeout(5000)
  await page.addInitScript(storage => { for (const [key, value] of Object.entries(storage)) localStorage.setItem(key, value) }, storage)
  await page.route(`${origin}/**`, route => {
    const script = fixture.scripts.get(new URL(route.request().url()).pathname)
    return route.fulfill(script ? { contentType: 'text/javascript', body: script } : { contentType: 'text/html', body: fixture.html })
  })
  await page.goto(origin + pathname)
  await page.locator('[data-fixture-workspace], [data-fallback], [data-legacy-workspace]').first().waitFor({ state: 'attached' })
  return errors
}
const paths = (page: Page) => page.locator('[data-project-panel]:visible [data-fixture-workspace]').evaluateAll(elements => elements.map(element => element.getAttribute('data-path')))
const workspace = (page: Page, path: string) => page.locator(`[data-fixture-workspace][data-path="${path}"]`)
async function add(page: Page, path: string) {
  await page.locator('.mew-project-board-add').click()
  await page.locator(`[data-fixture-catalog] [data-open-path="${path}"]`).click()
  await workspace(page, path).waitFor({ state: 'visible' })
}

test('workspace application preserves independent project tools and drafts through selectors, mode round trips, geometry and reload', { timeout: 40_000 }, async t => {
  const fixture = await fixtureBundle(), browser = await connectTestBrowser()
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1800, height: 1000 } }), errors = await install(page, fixture)
  const initialId = await workspace(page, '/a').getAttribute('data-fixture-workspace')
  await workspace(page, '/a').locator('[data-draft]').fill('Preserve A')
  await page.locator('[data-mode="multi"]').click()
  assert.deepEqual(await paths(page), ['/a'])
  assert.equal((await workspace(page, '/a').boundingBox())!.width < 420, true)
  await add(page, '/b'); await add(page, '/c')
  await workspace(page, '/b').locator('[data-tool-choice="agent"]').click()
  await workspace(page, '/c').locator('[data-tool-choice="git"]').click()
  await workspace(page, '/b').locator('[data-draft]').fill('Preserve B')
  await workspace(page, '/c').locator('[data-draft]').fill('Preserve C')
  assert.deepEqual(await page.locator('[data-tool]').allTextContents(), ['editor', 'agent', 'git'])
  assert.equal(await page.locator('[data-global-toolbar]').count(), 1)
  assert.deepEqual(await workspace(page, '/b').getAttribute('data-api-root'), '/b')
  assert.equal(await page.evaluate('window.fixture.activeRoot'), '/a', 'opening explicit panels does not change legacy selection')

  const thirdId = (await workspace(page, '/c').getAttribute('data-fixture-workspace'))!
  await page.locator(`[data-project-panel="${thirdId}"] .mew-project-board-name`).click()
  await workspace(page, '/c').locator('[data-replace-path="/b"]').click()
  assert.deepEqual(await paths(page), ['/a', '/b', '/c'], 'selecting an open logical project focuses its existing panel')
  assert.equal(await workspace(page, '/b').getAttribute('data-active'), 'true')
  assert.equal(await workspace(page, '/c').locator('[data-draft]').inputValue(), 'Preserve C')
  await page.locator('[data-mode="single"]').click()
  await workspace(page, '/b').waitFor({ state: 'visible' })
  assert.deepEqual(await paths(page), ['/b'])
  assert.equal(await page.evaluate('window.fixture.activeRoot'), '/b')
  await page.locator('[data-mode="multi"]').click()
  assert.deepEqual(await paths(page), ['/a', '/b', '/c'])
  assert.equal(await workspace(page, '/a').locator('[data-draft]').inputValue(), 'Preserve A')
  assert.equal(await workspace(page, '/b').locator('[data-draft]').inputValue(), 'Preserve B')
  assert.equal(await workspace(page, '/c').locator('[data-draft]').inputValue(), 'Preserve C')
  assert.equal(await workspace(page, '/a').getAttribute('data-fixture-workspace'), initialId)
  assert.deepEqual(Object.values(await page.evaluate('window.fixture.mounts')), [1, 1, 1])
  assert.deepEqual(await page.evaluate('window.fixture.unmounts'), {})

  await page.reload()
  await workspace(page, '/c').waitFor({ state: 'visible' })
  assert.deepEqual(await paths(page), ['/a', '/b', '/c'])
  assert.equal(await page.locator('[data-global-toolbar]').count(), 1)
  assert.deepEqual(errors, [])
})

test('independent project selections settle per panel and failed selections preserve their prior project', { timeout: 30_000 }, async t => {
  const fixture = await fixtureBundle(), browser = await connectTestBrowser()
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1800, height: 1000 } }), errors = await install(page, fixture)
  await page.locator('[data-mode="multi"]').click(); await add(page, '/b'); await add(page, '/c')
  await page.evaluate(`(() => {
    const entries=Object.entries(window.fixture.hosts),a=entries.find(([,host])=>host.panel.projectPath==='/a'),b=entries.find(([,host])=>host.panel.projectPath==='/b');
    window.fixture.blocked=['/d','/e'];window.fixture.pendingA=a[1].onProjectChange('/d');window.fixture.pendingB=b[1].onProjectChange('/e');
  })()`)
  await page.waitForFunction('window.fixture.waiters["/d"] && window.fixture.waiters["/e"]')
  await page.evaluate('window.fixture.waiters["/e"]()')
  await workspace(page, '/e').waitFor({ state: 'visible' })
  await page.evaluate('window.fixture.waiters["/d"]()')
  await workspace(page, '/d').waitFor({ state: 'visible' })
  assert.deepEqual(await paths(page), ['/d', '/e', '/c'])
  assert.equal(await page.evaluate('window.fixture.activeRoot'), '/a')
  await page.evaluate(`(() => { window.fixture.fail=['/b'];const host=Object.values(window.fixture.hosts).find(host=>host.panel.projectPath==='/c');window.fixture.failedSelection=host.onProjectChange('/b') })()`)
  assert.equal(await page.evaluate('window.fixture.failedSelection'), false)
  assert.deepEqual(await paths(page), ['/d', '/e', '/c'])
  assert.equal(await page.locator('[data-global-toolbar]').count(), 1)
  assert.deepEqual(errors, [])
})

test('an unavailable origin can be replaced through a client bound to the destination', { timeout: 20_000 }, async t => {
  const fixture = await fixtureBundle(), browser = await connectTestBrowser()
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } }), errors = await install(page, fixture)
  await page.locator('[data-mode="multi"]').click()
  await page.evaluate(`(() => {
    window.fixture.unavailable=['/a'];
    const host=Object.values(window.fixture.hosts).find(host=>host.panel.projectPath==='/a');
    window.fixture.recovered=host.onProjectChange('/d');
  })()`)
  assert.equal(await page.evaluate('window.fixture.recovered'), true)
  await workspace(page, '/d').waitFor({ state: 'visible' })
  assert.deepEqual(await paths(page), ['/d'])
  assert.equal(await workspace(page, '/d').getAttribute('data-api-root'), '/d')
  assert.deepEqual(await page.evaluate('window.fixture.calls.filter(call=>call.kind==="switch").at(-1)'), { kind: 'switch', scope: '/d', path: '/d' })
  assert.equal(await page.evaluate('window.fixture.activeRoot'), '/a', 'recovering a compact project leaves the confirmed legacy selection unchanged')
  assert.deepEqual(errors, [])
})

test('an intentionally empty board restores empty and closing every project can return to a usable single workspace', { timeout: 30_000 }, async t => {
  const fixture = await fixtureBundle(), browser = await connectTestBrowser()
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }), errors = await install(page, fixture)
  await page.locator('[data-mode="multi"]').click()
  await page.locator('.mew-project-board-header button:last-child').click()
  await page.locator('[data-project-panel]:visible').waitFor({ state: 'detached' })
  assert.deepEqual(await paths(page), [])
  const switchSingle = page.locator('.mew-workspace-shell > div button').filter({ hasText: /싱글프로젝트모드|Single.project mode/ }).first()
  await switchSingle.click()
  await page.locator('[data-global-toolbar]').waitFor()
  assert.equal((await paths(page)).length, 1, 'closing the last board panel retains a usable single workspace without reloading')
  await page.locator('[data-mode="multi"]').click()
  assert.deepEqual(await paths(page), [], 'returning to multi mode preserves the deliberately empty board')
  await page.reload()
  await page.locator('.mew-project-board-add').waitFor()
  assert.deepEqual(await paths(page), [], 'refresh does not recreate a deliberately closed panel')
  await switchSingle.click()
  await page.locator('[data-global-toolbar]').waitFor()
  assert.equal((await paths(page)).length, 1)
  assert.deepEqual(errors, [])
})

test('latest project selection wins within one panel and a slow mode handoff keeps the initiating project usable', { timeout: 35_000 }, async t => {
  const fixture = await fixtureBundle(), browser = await connectTestBrowser()
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1800, height: 1000 } }), errors = await install(page, fixture)
  await page.locator('[data-mode="multi"]').click(); await add(page, '/b')
  await page.evaluate(`(() => {window.fixture.blocked=['/d','/e'];const host=Object.values(window.fixture.hosts).find(host=>host.panel.projectPath==='/a');window.fixture.pendingFirst=host.onProjectChange('/d');window.fixture.pendingLatest=host.onProjectChange('/e')})()`)
  await page.waitForFunction('window.fixture.waiters["/d"] && window.fixture.waiters["/e"]')
  await page.evaluate('window.fixture.waiters["/e"]()')
  await workspace(page, '/e').waitFor({ state: 'visible' })
  await page.evaluate('window.fixture.waiters["/d"]()')
  assert.equal(await page.evaluate('window.fixture.pendingFirst'), false)
  assert.deepEqual(await paths(page), ['/e', '/b'])
  await workspace(page, '/b').locator('[data-draft]').fill('B draft during delayed handoff')
  await page.evaluate('window.fixture.blocked=["/b"];delete window.fixture.waiters["/b"]')
  await page.locator('[data-mode="single"]').click()
  await page.waitForFunction('window.fixture.waiters["/b"]')
  assert.deepEqual(await paths(page), ['/e', '/b'], 'the board remains usable until legacy selection is ready')
  assert.equal(await page.evaluate('window.fixture.activeRoot'), '/a')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('[data-project-board][data-presentation="single"]').waitFor()
  assert.deepEqual(await paths(page), ['/a'])
  assert.equal(await workspace(page, '/a').getAttribute('data-api-root'), '/a', 'mobile keeps a fixed explicit root during an unconfirmed legacy handoff')
  await page.evaluate('window.fixture.waiters["/b"]()')
  await page.waitForFunction('window.fixture.activeRoot==="/b"')
  await page.locator('[data-project-board][data-presentation="single"]').waitFor()
  assert.deepEqual(await paths(page), ['/b'])
  assert.equal(await workspace(page, '/b').count(), 1)
  assert.equal(await workspace(page, '/b').getAttribute('data-api-root'), 'legacy')
  assert.equal(await workspace(page, '/b').locator('[data-draft]').inputValue(), 'B draft during delayed handoff')
  assert.deepEqual(errors, [])
})

test('physical mobile presentation preserves its selected project and restores the independent desktop board', { timeout: 30_000 }, async t => {
  const fixture = await fixtureBundle(), browser = await connectTestBrowser()
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1800, height: 1000 } }), errors = await install(page, fixture)
  await workspace(page, '/a').locator('[data-draft]').fill('A draft before viewport change')
  await page.locator('[data-mode="multi"]').click(); await add(page, '/b'); await add(page, '/c')
  await workspace(page, '/b').locator('[data-tool-choice="agent"]').click()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('[data-project-board][data-presentation="single"]').waitFor()
  assert.deepEqual(await paths(page), ['/a'], 'mobile uses the single project selection, independently of desktop active focus')
  assert.equal(await workspace(page, '/a').locator('[data-draft]').inputValue(), 'A draft before viewport change')
  await page.setViewportSize({ width: 1800, height: 1000 })
  await page.locator('[data-project-board][data-presentation="board"]').waitFor()
  assert.deepEqual(await paths(page), ['/a', '/b', '/c'])
  assert.equal(await workspace(page, '/b').locator('[data-tool]').textContent(), 'agent')
  assert.equal(await workspace(page, '/b').getAttribute('data-active'), 'true')
  assert.deepEqual(Object.values(await page.evaluate('window.fixture.mounts')), [1, 1, 1])
  assert.deepEqual(errors, [])
})

test('opening the first project hands the setup workspace to the mode shell without a reload', { timeout: 20_000 }, async t => {
  const fixture = await fixtureBundle(), browser = await connectTestBrowser()
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 } }), errors = await install(page, fixture, {}, '/?no-project=1')
  assert.equal(await page.locator('[data-project-board]').count(), 0)
  await page.locator('[data-first-project]').click()
  await page.locator('[data-global-toolbar]').waitFor()
  await workspace(page, '/a').locator('[data-draft]').fill('First project draft')
  await page.locator('[data-mode="multi"]').click()
  assert.deepEqual(await paths(page), ['/a'])
  assert.equal(await workspace(page, '/a').locator('[data-draft]').inputValue(), 'First project draft')
  assert.equal(await page.locator('[data-fallback]').count(), 0)
  assert.deepEqual(errors, [])
})

test('a server without scoped workspace support retains one legacy view despite a saved multi-project board', { timeout: 20_000 }, async t => {
  const fixture = await fixtureBundle(), browser = await connectTestBrowser()
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
  const saved = JSON.stringify({ version: 1, panels: [{ id: 'saved-a', projectPath: '/a', workingRoot: '/a' }, { id: 'saved-b', projectPath: '/b', workingRoot: '/b' }], columns: [{ id: 'column-a', width: 400, rows: [{ panelId: 'saved-a', weight: 1 }] }, { id: 'column-b', width: 400, rows: [{ panelId: 'saved-b', weight: 1 }] }], activePanelId: 'saved-b' })
  const boardKey = 'mew:project-board:fixture%40test'
  const errors = await install(page, fixture, { 'mew:workspace-mode:fixture%40test': 'multi', [boardKey]: saved }, '/?legacy-server=1')
  assert.equal(await page.locator('[data-legacy-workspace]').count(), 1)
  assert.equal(await page.locator('[data-legacy-workspace]').getAttribute('data-api-root'), 'legacy')
  assert.equal(await page.locator('[data-project-board], [data-workspace-view], [data-mode]').count(), 0)
  assert.deepEqual(await page.evaluate('window.fixture.calls'), [{ kind: 'read', scope: 'legacy' }])
  assert.equal(await page.evaluate(key => localStorage.getItem(key), boardKey), saved, 'unsupported servers leave the saved desktop board intact')
  assert.deepEqual(errors, [])
})

test('a single workspace worktree change is the actual scope used when opening multi-project mode', { timeout: 20_000 }, async t => {
  const fixture = await fixtureBundle(), browser = await connectTestBrowser()
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } }), errors = await install(page, fixture)
  await page.evaluate(`(() => {
    window.fixture.activeRoot='/a/.worktrees/task';
    const host=Object.values(window.fixture.hosts).find(host=>host.active);
    host.onScopeChanged({path:'/a/.worktrees/task',projectPath:'/a',hasProject:true});
  })()`)
  await page.waitForFunction(`document.querySelector('[data-fixture-workspace][data-path="/a"]')?.getAttribute('data-root')==='/a/.worktrees/task'`)
  await page.locator('[data-mode="multi"]').click()
  assert.deepEqual(await paths(page), ['/a'])
  assert.equal(await workspace(page, '/a').getAttribute('data-root'), '/a/.worktrees/task')
  assert.equal(await workspace(page, '/a').getAttribute('data-api-root'), '/a/.worktrees/task')
  assert.equal(await page.evaluate('window.fixture.activeRoot'), '/a/.worktrees/task')
  await add(page, '/b')
  await page.locator('[data-mode="single"]').click()
  await page.waitForFunction('window.fixture.activeRoot==="/b"')
  await page.locator('[data-project-board][data-presentation="single"]').waitFor()
  await workspace(page, '/b').waitFor({ state: 'visible' })
  await page.evaluate(`(() => {
    const host=Object.values(window.fixture.hosts).find(host=>host.active);
    window.fixture.pendingOpenProject=host.onAction({kind:'open_project',path:'/a'});
  })()`)
  await page.evaluate('window.fixture.pendingOpenProject')
  assert.deepEqual(await paths(page), ['/a'])
  assert.equal(await workspace(page, '/a').getAttribute('data-root'), '/a/.worktrees/task')
  assert.equal(await page.evaluate('window.fixture.activeRoot'), '/a/.worktrees/task', 'opening an existing logical project preserves its selected worktree')
  assert.deepEqual(await page.evaluate('window.fixture.actions'), [], 'project focus actions are completed by the shell')
  assert.deepEqual(errors, [])
})

test('mobile returns to the confirmed legacy workspace after its desktop board slot changes project', { timeout: 25_000 }, async t => {
  const fixture = await fixtureBundle(), browser = await connectTestBrowser()
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } }), errors = await install(page, fixture)
  await page.locator('[data-mode="multi"]').click()
  await page.evaluate(`(() => {const host=Object.values(window.fixture.hosts).find(host=>host.panel.projectPath==='/a');window.fixture.replaced=host.onProjectChange('/c')})()`)
  assert.equal(await page.evaluate('window.fixture.replaced'), true)
  await workspace(page, '/c').waitFor({ state: 'visible' })
  assert.equal(await workspace(page, '/c').getAttribute('data-api-root'), '/c')
  assert.equal(await page.evaluate('window.fixture.activeRoot'), '/a')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('[data-project-board][data-presentation="single"]').waitFor()
  assert.deepEqual(await paths(page), ['/a'])
  assert.equal(await workspace(page, '/a').getAttribute('data-api-root'), 'legacy')
  assert.equal(await workspace(page, '/c').getAttribute('data-api-root'), '/c', 'a hidden desktop project retains its explicit root')
  await page.setViewportSize({ width: 1600, height: 900 })
  await page.locator('[data-project-board][data-presentation="board"]').waitFor()
  assert.deepEqual(await paths(page), ['/c'])
  assert.equal(await workspace(page, '/c').getAttribute('data-api-root'), '/c')
  assert.deepEqual(errors, [])
})

test('project replacement freezes only its origin from save preparation through request completion and failure', { timeout: 30_000 }, async t => {
  const fixture = await fixtureBundle(), browser = await connectTestBrowser()
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } }), errors = await install(page, fixture)
  await page.locator('[data-mode="multi"]').click(); await add(page, '/b')
  const alpha = workspace(page, '/a'), beta = workspace(page, '/b')
  const alphaId = (await alpha.getAttribute('data-fixture-workspace'))!
  const originView = page.locator(`[data-workspace-view="${alphaId}"]`)
  await alpha.locator('[data-draft]').fill('A draft survives failed selection')
  await page.evaluate(`(() => {
    window.fixture.prepareBlocked=['/a'];window.fixture.blocked=['/d'];window.fixture.fail=['/d'];
    const host=Object.values(window.fixture.hosts).find(host=>host.panel.projectPath==='/a');
    window.fixture.pendingFailed=host.onProjectChange('/d');
  })()`)
  await page.waitForFunction(id => !!(window as any).fixture.prepareWaiters[id], alphaId)
  assert.equal(await originView.evaluate(element => element.inert), true, 'preparing pending saves immediately blocks new input')
  assert.equal(await beta.locator('[data-draft]').evaluate(element => !!element.closest('[inert]')), false)
  await beta.locator('[data-draft]').fill('B remains editable')
  await page.evaluate(id => (window as any).fixture.prepareWaiters[id](), alphaId)
  await page.waitForFunction('window.fixture.waiters["/d"]')
  assert.equal(await originView.evaluate(element => element.inert), true, 'the origin remains blocked while replacement is loading')
  await page.evaluate('window.fixture.waiters["/d"]()')
  assert.equal(await page.evaluate('window.fixture.pendingFailed'), false)
  await page.waitForFunction(id => !(document.querySelector(`[data-workspace-view="${id}"]`) as HTMLElement)?.inert, alphaId)
  assert.equal(await alpha.locator('[data-draft]').inputValue(), 'A draft survives failed selection')
  assert.equal(await beta.locator('[data-draft]').inputValue(), 'B remains editable')
  assert.deepEqual(await paths(page), ['/a', '/b'])
  assert.equal(await page.evaluate(id => (window as any).fixture.released[id], alphaId), 1)
  await page.evaluate(`(() => {
    window.fixture.prepareBlocked=[];window.fixture.fail=[];delete window.fixture.waiters['/d'];
    const host=Object.values(window.fixture.hosts).find(host=>host.panel.projectPath==='/a');
    window.fixture.pendingSuccess=host.onProjectChange('/d');
  })()`)
  await page.waitForFunction('window.fixture.waiters["/d"]')
  assert.equal(await originView.evaluate(element => element.inert), true)
  await page.evaluate('window.fixture.waiters["/d"]()')
  assert.equal(await page.evaluate('window.fixture.pendingSuccess'), true)
  await workspace(page, '/d').waitFor({ state: 'visible' })
  assert.equal(await workspace(page, '/d').locator('[data-draft]').evaluate(element => !!element.closest('[inert]')), false)
  assert.equal(await workspace(page, '/a').isVisible(), false, 'the confirmed single workspace stays outside the visible board')
  assert.deepEqual(await paths(page), ['/d', '/b'])
  assert.equal(await beta.locator('[data-draft]').inputValue(), 'B remains editable')
  assert.equal(await page.evaluate(id => (window as any).fixture.released[id], alphaId), 2)
  assert.deepEqual(errors, [])
})

test('Mewcat actions reach the mounted target after single selection and compact owner replacement', { timeout: 30_000 }, async t => {
  const fixture = await fixtureBundle(), browser = await connectTestBrowser()
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } }), errors = await install(page, fixture)
  const initialId = (await workspace(page, '/a').getAttribute('data-fixture-workspace'))!
  await page.evaluate(`(() => {
    const host=Object.values(window.fixture.hosts).find(host=>host.active);
    window.fixture.pendingAction=host.onAction({kind:'open_file',projectRoot:'/b',path:'README.md'});
  })()`)
  await page.evaluate('window.fixture.pendingAction')
  assert.equal(await workspace(page, '/b').count(), 1, 'switch and confirmation results share one mounted destination owner')
  await workspace(page, '/b').waitFor({ state: 'visible' })
  assert.equal(await page.evaluate(id => (window as any).fixture.prepared[id], initialId), 1, 'a cross-root action drains the originating workspace before replacement')
  assert.deepEqual(await page.evaluate('window.fixture.actions.map(({root,action})=>({root,action}))'), [{ root: '/b', action: { kind: 'open_file', projectRoot: '/b', path: 'README.md' } }])
  await page.locator('[data-mode="multi"]').click(); await add(page, '/c')
  await page.evaluate(`(() => {
    const host=Object.values(window.fixture.hosts).find(host=>host.panel.projectPath==='/b');
    window.fixture.pendingAction=host.onAction({kind:'open_file',projectRoot:'/c',path:'existing.md'});
  })()`)
  await page.evaluate('window.fixture.pendingAction')
  assert.equal(await workspace(page, '/c').getAttribute('data-active'), 'true')
  assert.deepEqual(await paths(page), ['/b', '/c'])
  assert.equal(await page.evaluate('window.fixture.actions.at(-1).root'), '/c')
  const replacedId = (await workspace(page, '/c').getAttribute('data-fixture-workspace'))!
  await page.evaluate(`(() => {
    window.fixture.notReady=['/d'];
    const host=Object.values(window.fixture.hosts).find(host=>host.active);
    window.fixture.pendingAction=host.onAction({kind:'start_project_session',projectRoot:'/d',runtime:'fixture-runtime',request:'Review this draft'});
  })()`)
  await workspace(page, '/d').waitFor({ state: 'visible' })
  assert.equal(await page.evaluate(id => (window as any).fixture.unmounts[id], replacedId), 1, 'delivery no longer depends on the unmounted originating workspace')
  assert.equal(await page.evaluate('window.fixture.actions.length'), 2, 'an action waits for the new workspace to finish hydrating')
  await page.evaluate('window.fixture.notReady=[]')
  await page.evaluate('window.fixture.pendingAction')
  assert.equal(await workspace(page, '/d').locator('[data-tool]').textContent(), 'agent')
  assert.equal(await page.evaluate('window.fixture.actions.at(-1).root'), '/d')
  assert.equal(await page.evaluate('window.fixture.actions.at(-1).action.request'), 'Review this draft')
  assert.equal(await page.evaluate('window.fixture.activeRoot'), '/b', 'compact action routing retains the confirmed legacy project')
  assert.deepEqual(errors, [])
})
