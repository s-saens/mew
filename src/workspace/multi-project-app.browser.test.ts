import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { connectTestBrowser } from '../../server/test-browser.ts'
import { DEFAULT_THEME_PALETTE } from '../../shared/theme.ts'
import type { Page } from 'playwright-core'

const root = path.resolve(import.meta.dirname, '../..')
const sourcePath = (relative: string) => path.join(root, 'src', relative)
const origin = 'http://multi-project-app.test'

async function fixtureBundle() {
  const source = `import React from'react';import{createRoot}from'react-dom/client';import App from${JSON.stringify(sourcePath('App.tsx'))};import{I18nProvider}from${JSON.stringify(sourcePath('i18n.tsx'))};
    const auth={authenticated:true,email:'integration@test',role:'owner',mustChangePassword:false,displayName:'Integration',avatarDataUrl:null,capabilities:{filesRead:true,filesWrite:true,agent:true,terminal:true,git:true,collaboration:false,database:false,chat:false,system:false,nativeBrowser:true,portPreview:true,desktop:true,serverFiles:false,schedules:false}};
    function Fixture(){const [current,setCurrent]=React.useState(auth);window.setCapabilities=changes=>setCurrent(value=>({...value,capabilities:{...value.capabilities,...changes}}));return <I18nProvider><App auth={current} refreshing={false} onLoggedOut={()=>{}} onRequestLogin={()=>{}} onProfileChanged={()=>{}}/></I18nProvider>}
    window.editorMounts={};window.editorUnmounts={};createRoot(document.getElementById('root')).render(<Fixture/>);`
  const editorStub = `import React from'react';export function EditorPane(props){const tab=props.pane.tabs.find(tab=>tab.id===props.pane.activeTabId)??props.pane.tabs.find(tab=>tab.path===props.pane.activePath),root=props.workspace?.path;React.useEffect(()=>{window.editorMounts[root]=(window.editorMounts[root]??0)+1;return()=>{window.editorUnmounts[root]=(window.editorUnmounts[root]??0)+1}},[]);return <div data-test-editor-root={root} style={{display:'flex',height:'100%'}}>{tab&&<textarea aria-label={'Editor '+root} value={tab.content} onFocus={props.onFocus} onChange={event=>props.onChangeContent(tab.path,event.target.value,props.pane.id,tab.id)}/>}</div>}`
  const agentStub = `import React from'react';import{DockPanel}from${JSON.stringify(sourcePath('components/DockWorkspace.tsx'))};export function AgentPanel({workspacePath,agentOpen,terminalOpen}){return <><output hidden data-test-agent-state={workspacePath} data-open={String(agentOpen)}/><DockPanel id="agent" kind="agent" visible={agentOpen} tabs={['agent']} mobileSelected><textarea data-test-agent-root={workspacePath} aria-label={'Agent '+workspacePath}/></DockPanel><DockPanel id="terminal" kind="terminal" visible={terminalOpen} tabs={['terminal']} mobileSelected><textarea/></DockPanel></>}`
  const gitStub = `import React from'react';import{DockPanel}from${JSON.stringify(sourcePath('components/DockWorkspace.tsx'))};export function GitPanel({workspacePath,visible}){return <DockPanel id="git" kind="git" visible={visible} tabs={['git']} mobileSelected><div data-test-git-root={workspacePath} data-open={String(visible)}>Git {workspacePath}</div></DockPanel>}`
  const candidates = [source, editorStub, agentStub, gitStub]
  const result = await build({ input: 'virtual:multi-project-app.tsx', write: false, platform: 'browser', output: { format: 'esm' }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('production'), 'import.meta.hot': 'false' } }, onLog(level, log, handler) { if (log.code !== 'MODULE_LEVEL_DIRECTIVE') handler(level, log) }, plugins: [{
    name: 'multi-project-app-fixture', resolveId(id) {
      if (id.startsWith('virtual:')) return id
      if (/\.(?:png|webp|jpe?g|gif|woff2?)(?:\?url)?$/.test(id)) return 'virtual:image'
    },
    async load(id) {
      if (id === 'virtual:multi-project-app.tsx') return source
      if (id === 'virtual:image') return 'export default "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"'
      if (id.endsWith('.css')) return { code: '', moduleType: 'js' }
      if (id.endsWith('?raw')) return 'export default ' + JSON.stringify(await fs.readFile(id.slice(0, -4), 'utf8'))
      if (id === sourcePath('components/BrowserDesktopPanel.tsx')) return `import React from 'react';export function BrowserDesktopPanel(){return <div data-test-remote-browser>Browser fixture</div>}`
      if (id === sourcePath('components/remote-desktop.tsx')) return `import React from 'react';export function RemoteDesktop({embedded}){return <div data-test-remote-desktop data-embedded={String(!!embedded)}>Desktop fixture</div>}`
      if (id === sourcePath('components/EditorPane.tsx')) return editorStub
      if (id === sourcePath('components/AgentPanel.tsx')) return agentStub
      if (id === sourcePath('components/git-panel.tsx')) return gitStub
      if (id.endsWith('.tsx') && !id.includes('node_modules')) candidates.push(await fs.readFile(id, 'utf8'))
    },
  }] })
  const chunks = result.output.filter(item => item.type === 'chunk'), entry = chunks.find(item => item.isEntry)!
  const scripts = new Map(chunks.map(chunk => ['/' + chunk.fileName, chunk.code]))
  const compiler = await compile(await fs.readFile(path.join(root, 'src/index.css'), 'utf8'), { base: path.join(root, 'src'), onDependency() {} })
  const css = compiler.build([...new Set(candidates.join('\n').match(/[A-Za-z0-9_@!:/.[\]()%,-]+/g))]) + '\n' + await fs.readFile(sourcePath('components/project-board.css'), 'utf8')
  return { scripts, html: `<html class="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script type="module" src="/${entry.fileName}"></script></body></html>` }
}

let fixturePromise: ReturnType<typeof fixtureBundle> | undefined
const bundleOnce = () => fixturePromise ??= fixtureBundle()
const projectRoots = ['/alpha', '/beta', '/gamma', '/delta', '/epsilon', '/zeta', '/eta', '/theta', '/iota', '/kappa']
const paint = (page: Page) => page.locator('body').evaluate(element => new Promise<void>(resolve => element.ownerDocument.defaultView!.requestAnimationFrame(() => element.ownerDocument.defaultView!.requestAnimationFrame(() => resolve()))))

async function installApp(page: Page, fixture: Awaited<ReturnType<typeof fixtureBundle>>, roots = projectRoots.slice(0, 3), seed: Record<string, string> = {}, scopedWorkspace = true) {
  const errors: string[] = [], consoleErrors: string[] = [], requests: string[] = []
  const contents = new Map(roots.map(root => [root, root[1].toUpperCase() + root.slice(2) + ' original']))
  let activeRoot = '/alpha'
  const saves: { root: string; path: string; content: string }[] = []
  const commandReads: string[] = []
  let releaseSave: (() => void) | undefined
  const saveGate = new Promise<void>(resolve => { releaseSave = resolve })
  let reportSaveStarted!: () => void, reportSaveCompleted!: () => void
  const saveStarted = new Promise<void>(resolve => { reportSaveStarted = resolve })
  const saveCompleted = new Promise<void>(resolve => { reportSaveCompleted = resolve })
  let holdSave = false
  const storedTabs = { panes: [{ id: 'main', tabs: [{ id: 'readme', path: 'README.md', preview: false, viewMode: 'plain' }], activePath: 'README.md', activeTabId: 'readme' }], layout: { kind: 'leaf', pane: 'main' }, focusedPaneId: 'main' }
  const ui = { sidebar: { docsExpanded: false }, chrome: { sidebarOpen: false, agentOpen: false, terminalOpen: false, gitOpen: false }, tabs: { '.workspace': storedTabs } }
  const accountTabs = new Map<string, Record<string, unknown>>()
  const scopes: string[] = []
  page.setDefaultTimeout(8000)
  page.on('pageerror', error => errors.push(error.stack ?? error.message))
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  await page.addInitScript(seed => {
    for (const [key, value] of Object.entries(seed)) localStorage.setItem(key, value)
    localStorage.setItem('mew:locale', 'en'); localStorage.setItem('mew:ui-locale', 'en'); localStorage.setItem('mew:mewcat-skin', 'none')
    Object.assign(window, { fixtureSockets: [] });
    class Socket extends EventTarget { static OPEN = 1; readyState = 0; url: string; onopen: (() => void) | null = null; constructor(url: string) { super(); this.url = url; (window as any).fixtureSockets.push(this) }; send() {}; close() { this.readyState = 3 } }
    Object.defineProperty(globalThis, 'WebSocket', { value: Socket })
  }, seed)
  const workspaceInfo = (workspace: string) => ({ path: workspace, projectPath: workspace, hasProject: true, ...(scopedWorkspace ? { workspaceScopeVersion: 1 } : {}), projects: [], docs: 'docs', docsPath: workspace + '/docs', workspaceUi: { workspacePath: workspace, state: ui } })
  await page.route(`${origin}/**`, async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method(), pathname = url.pathname
    requests.push(`${method} ${pathname}`)
    const script = fixture.scripts.get(pathname)
    if (script !== undefined) return route.fulfill({ contentType: 'text/javascript', body: script })
    const json = (value: unknown) => route.fulfill({ json: value })
    const root = url.searchParams.get('mewWorkspacePath') ?? activeRoot
    if (url.searchParams.has('mewWorkspacePath')) scopes.push(root)
    if (pathname === '/api/workspace') {
      if (method === 'POST') {
        const body = request.postDataJSON()
        if (!url.searchParams.has('mewWorkspacePath')) activeRoot = body.path
        return json(workspaceInfo(body.path))
      }
      return json(workspaceInfo(root))
    }
    if (pathname === '/api/user-ui/root-projects') return json({ state: { paths: roots, icons: {}, groups: [] } })
    if (pathname === '/api/project-registry') return json({ projects: roots.map(path => ({ path, name: path.slice(1), icon: 'i:folder', parentPath: null, sources: [] })) })
    if (pathname === '/api/cmd-buttons') { commandReads.push(url.searchParams.get('workspacePath') ?? root); return json({ buttons: [] }) }
    if (pathname === '/api/user-ui/theme') return json({ state: method === 'PUT' ? request.postDataJSON().state : { palette: DEFAULT_THEME_PALETTE, custom: [] } })
    if (pathname === '/api/user-ui/workspace') return json({ state: method === 'PUT' ? request.postDataJSON().state : ui })
    if (pathname === '/api/user-ui/editor-tabs') {
      const workspace = method === 'PUT' ? request.postDataJSON().workspacePath : url.searchParams.get('workspace')!
      if (!accountTabs.has(workspace)) accountTabs.set(workspace, { '.workspace': storedTabs })
      if (method === 'PUT') { const body = request.postDataJSON(); accountTabs.set(workspace, { ...accountTabs.get(workspace), [body.project]: body.state }) }
      return json({ state: accountTabs.get(workspace), revision: 1 })
    }
    if (pathname === '/api/tree') return json({ version: 1, state: 'ready', entries: [{ name: 'README.md', path: 'README.md', type: 'file' }] })
    if (pathname === '/api/file-access') return json({ view: true, edit: true })
    if (pathname === '/api/file') {
      if (method === 'PUT') {
        const body = request.postDataJSON(), saveRoot = url.searchParams.get('mewWorkspacePath') ?? body.workspace ?? activeRoot
        saves.push({ root: saveRoot, path: body.path, content: body.content })
        if (saveRoot === '/alpha' && body.content === 'Alpha pending edit') reportSaveStarted()
        if (holdSave && saveRoot === '/alpha') await saveGate
        contents.set(saveRoot, body.content)
        if (saveRoot === '/alpha' && body.content === 'Alpha pending edit') reportSaveCompleted()
        return json({ ok: true, commit: null, content: body.content })
      }
      return json({ path: url.searchParams.get('path'), content: contents.get(root), editable: true })
    }
    if (pathname === '/api/projects' || pathname === '/api/members') return json([])
    if (pathname === '/api/project-icons/read') return json({ icons: {} })
    if (pathname === '/api/mewpet/skins') return json({ skins: [] })
    if (pathname === '/api/user-ui/agent-tabs') return json({ state: { tabs: [], activeId: null }, claims: [] })
    if (pathname === '/api/tasks') return json({ tasks: [] })
    if (pathname === '/api/agent/runtimes') return json({ runtimes: [] })
    if (pathname.startsWith('/api/')) return json({})
    return route.fulfill({ contentType: 'text/html', body: fixture.html })
  })
  return { errors, consoleErrors, requests, contents, saves, commandReads, scopes, saveStarted, saveCompleted,
    holdAlphaSave: () => { holdSave = true }, releaseSave: () => { holdSave = false; releaseSave?.() } }
}

test('real workspace controllers isolate same-name editor saves and preserve drafts across compact tool and mode changes', { timeout: 65_000 }, async t => {
  const fixture = await bundleOnce(), browser = await connectTestBrowser()
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1700, height: 1000 } })
  const state = await installApp(page, fixture)
  const { errors, consoleErrors, requests, contents, saves, commandReads, scopes, saveStarted, saveCompleted, holdAlphaSave, releaseSave } = state
  try {
    await page.goto(origin)
    const alpha = page.getByRole('textbox', { name: 'Editor /alpha', exact: true })
    await alpha.waitFor()
    await page.waitForFunction(`document.querySelector('[aria-label="Editor /alpha"]')?.value === 'Alpha original'`)
    assert.equal(await alpha.inputValue(), 'Alpha original')
    const layout = page.getByRole('button', { name: /Layout|레이아웃/ }).first()
    await layout.click()
    const multiChoice = page.getByRole('button', { name: /멀티프로젝트모드|Multi.project mode/ }).first()
    await multiChoice.click()
    await page.locator('[data-project-board][data-presentation="board"]').waitFor()
    const add = async (root: string) => {
      await page.locator('.mew-project-board-add').click()
      await page.locator('[data-project-draft]').locator(`[data-project-option="${root}"]`).click()
      await page.getByRole('textbox', { name: 'Editor ' + root, exact: true }).waitFor()
    }
    await add('/beta'); await add('/gamma')
    const panel = (root: string) => page.locator(`[data-project-panel][data-project-path="${root}"]`)
    assert.equal(await page.getByRole('button', { name: 'Menu', exact: true }).count(), 1)
    assert.equal(await page.locator('.mobile-dock').count(), 3)
    assert.equal(await page.getByRole('textbox', { name: 'Editor /beta', exact: true }).inputValue(), 'Beta original')
    assert.equal(await page.getByRole('textbox', { name: 'Editor /gamma', exact: true }).inputValue(), 'Gamma original')
    await panel('/alpha').locator('.mobile-dock [data-dock-item="sidebar"]').click()
    await panel('/alpha').locator('[data-sidebar]').waitFor({ state: 'visible' })
    assert.equal(await panel('/alpha').getByRole('textbox', { name: 'Find files', exact: true }).count(), 1, 'desktop compact Sidebar renders its actual search controls')
    await panel('/alpha').locator('.mobile-dock [data-dock-item="editor"]').click()
    holdAlphaSave()
    await alpha.fill('Alpha pending edit')
    await panel('/beta').locator('.mobile-dock [data-dock-item="agent"]').click()
    await panel('/beta').getByRole('textbox', { name: 'Agent /beta', exact: true }).fill('Beta unsent prompt')
    const commandReadCount = commandReads.length
    await page.keyboard.press('Alt+r')
    await page.locator('[data-command-menu]').waitFor()
    assert.equal(await page.locator('[data-command-menu]').count(), 1)
    assert.deepEqual(commandReads.slice(commandReadCount), ['/beta'], 'the project command shortcut has exactly one active root owner')
    await page.keyboard.press('Escape')
    await page.locator('[data-command-menu]').waitFor({ state: 'detached' })
    await panel('/gamma').locator('.mobile-dock [data-dock-item="git"]').click()
    await panel('/gamma').locator('[data-test-git-root="/gamma"]').waitFor()
    await saveStarted
    assert.equal(await alpha.inputValue(), 'Alpha pending edit')
    assert.equal(await panel('/beta').getByRole('textbox', { name: 'Agent /beta', exact: true }).inputValue(), 'Beta unsent prompt')
    assert.equal(await panel('/gamma').locator('[data-test-git-root="/gamma"]').isVisible(), true)
    await panel('/beta').getByRole('textbox', { name: 'Agent /beta', exact: true }).click()
    await layout.click()
    await page.getByRole('button', { name: /싱글프로젝트모드|Single.project mode/ }).first().click()
    await page.locator('[data-project-board][data-presentation="single"]').waitFor()
    assert.equal(await page.locator('[data-project-panel]:visible').getAttribute('data-project-path'), '/beta')
    assert.equal(await page.locator('[data-test-agent-root="/beta"]').inputValue(), 'Beta unsent prompt')
    await layout.click(); await multiChoice.click()
    await page.locator('[data-project-board][data-presentation="board"]').waitFor()
    assert.equal(await alpha.inputValue(), 'Alpha pending edit')
    assert.equal(await page.locator('[data-test-agent-root="/beta"]').inputValue(), 'Beta unsent prompt')
    releaseSave()
    await saveCompleted
    assert.ok(saves.some(save => save.root === '/alpha' && save.path === 'README.md' && save.content === 'Alpha pending edit'), 'a delayed edit is saved only to its originating root')
    assert.equal(contents.get('/beta'), 'Beta original')
    assert.equal(contents.get('/gamma'), 'Gamma original')
    assert.ok(scopes.includes('/beta') && scopes.includes('/gamma'))
    await panel('/gamma').locator('.mew-project-board-name').click()
    const selector = panel('/gamma').locator('[data-mobile-project-panel]')
    await selector.waitFor()
    const panelBox = (await panel('/gamma').boundingBox())!
    const selectorBox = (await selector.boundingBox())!
    assert.ok(Math.abs(selectorBox.x - panelBox.x) <= 1 && Math.abs(selectorBox.y - panelBox.y) <= 1, 'the selector covers the invoking panel from its header')
    assert.ok(Math.abs(selectorBox.width - panelBox.width) <= 2 && Math.abs(selectorBox.height - panelBox.height) <= 2, 'the selector stays within the invoking panel')
    assert.equal(await selector.locator('..').getAttribute('aria-modal'), null, 'the panel selector is nonmodal')
    const betaAgent = panel('/beta').getByRole('textbox', { name: 'Agent /beta', exact: true })
    await betaAgent.fill('Beta still editable')
    assert.equal(await betaAgent.inputValue(), 'Beta still editable', 'another panel remains interactive while the selector is open')
    await selector.waitFor({ state: 'detached' })
    await panel('/gamma').locator('.mew-project-board-name').click()
    await selector.waitFor()
    await page.keyboard.press('Escape')
    await selector.waitFor({ state: 'detached' })
    assert.equal(await panel('/gamma').locator('.mew-project-board-name').evaluate(element => element === element.ownerDocument.activeElement), true, 'Escape restores focus to the panel name')
    await panel('/gamma').locator('.mew-project-board-name').click()
    await selector.waitFor()
    await selector.locator('[data-project-option="/beta"]').click()
    await page.locator('[data-mobile-project-panel]').waitFor({ state: 'detached' })
    assert.equal(await panel('/gamma').getAttribute('data-project-path'), '/gamma', 'a duplicate selection retains the invoking project')
    assert.equal(await panel('/beta').getAttribute('data-active'), 'true', 'the title selector focuses the existing requested project')
    assert.equal(await page.locator('[data-test-agent-root="/beta"]').inputValue(), 'Beta still editable')
    assert.deepEqual(await page.evaluate('window.editorMounts'), { '/alpha': 1, '/beta': 1, '/gamma': 1 })
    assert.deepEqual(await page.evaluate('window.editorUnmounts'), {})
    assert.deepEqual(errors, [], 'real App hooks have no uncaught failures')
    assert.deepEqual(consoleErrors.filter(message => !message.includes('favicon')), [], 'real App effects and scoped reads have no recoverable render/runtime errors')
  } catch (error) {
    await page.screenshot({ path: '/tmp/mew-multi-project-app-failure.png' })
    const state = await page.locator('[data-project-panel]').evaluateAll(elements => elements.map(element => ({ project: element.getAttribute('data-project-path'), active: element.getAttribute('data-active'), selectedTool: element.querySelector('.mobile-dock [aria-current]')?.getAttribute('data-dock-item') })))
    throw new Error(`${String(error)}\nState: ${JSON.stringify(state)}\nPage errors: ${errors.join('\n')}\nConsole errors: ${consoleErrors.join('\n')}\nRecent requests: ${requests.slice(-30).join(', ')}`, { cause: error })
  } finally { releaseSave() }
})

test('adding a project opens a panel-scoped picker and handles cancellation and duplicate selection', { timeout: 45_000 }, async t => {
  const fixture = await bundleOnce(), browser = await connectTestBrowser()
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1700, height: 1000 } })
  const { errors, consoleErrors } = await installApp(page, fixture)
  await page.goto(origin)
  const alpha = page.getByRole('textbox', { name: 'Editor /alpha', exact: true })
  await alpha.waitFor()
  await page.getByRole('button', { name: /Layout|레이아웃/ }).first().click()
  await page.getByRole('button', { name: /멀티프로젝트모드|Multi.project mode/ }).first().click()
  await page.locator('[data-project-board][data-presentation="board"]').waitFor()
  const add = page.locator('.mew-project-board-add')
  const draft = page.locator('[data-project-draft]')
  const picker = draft.locator('[data-mobile-project-panel]')
  const alphaPanel = page.locator('[data-project-panel][data-project-path="/alpha"]')
  const openPicker = async () => {
    await add.click()
    await picker.waitFor()
    assert.equal(await draft.count(), 1, 'adding creates a single draft project panel')
    assert.equal(await page.locator('[role="dialog"][aria-modal="true"]').count(), 0, 'the picker does not block the workspace')
    const panelBox = await draft.boundingBox(), pickerBox = await picker.boundingBox()
    assert.ok(panelBox && pickerBox)
    assert.ok(Math.abs(pickerBox.x - panelBox.x) <= 1 && Math.abs(pickerBox.y - panelBox.y) <= 1, 'the picker covers its project panel from the header')
    assert.ok(Math.abs(pickerBox.width - panelBox.width) <= 2 && Math.abs(pickerBox.height - panelBox.height) <= 2, 'the picker stays inside its project panel')
  }
  await openPicker()
  await alpha.fill('Alpha remains editable')
  assert.equal(await alpha.inputValue(), 'Alpha remains editable', 'other project panels remain interactive')
  assert.equal(await picker.isVisible(), true, 'the draft remains available when another panel is used')
  await picker.getByRole('button', { name: 'All', exact: true }).click()
  await picker.locator('[data-project-catalog]').waitFor()
  await picker.getByRole('textbox', { name: 'Search projects', exact: true }).focus()
  await page.keyboard.press('Escape')
  await draft.waitFor({ state: 'detached' })
  assert.equal(await alphaPanel.isVisible(), true, 'cancelling leaves the existing project panel intact')

  await openPicker()
  await picker.locator('[data-project-option="/alpha"]').click()
  await draft.waitFor({ state: 'detached' })
  assert.equal(await page.locator('[data-project-panel][data-project-path="/alpha"]').count(), 1, 'an existing project is not duplicated')
  assert.equal(await alphaPanel.getAttribute('data-active'), 'true', 'selecting an existing project focuses its panel')
  assert.equal(await alpha.inputValue(), 'Alpha remains editable')

  await openPicker()
  await page.keyboard.press('Alt+2')
  await draft.waitFor({ state: 'detached' })
  const beta = page.locator('[data-project-panel][data-project-path="/beta"]')
  await beta.getByRole('textbox', { name: 'Editor /beta', exact: true }).waitFor()
  assert.equal(await beta.getAttribute('data-active'), 'true', 'selecting a new project activates the new panel')
  assert.equal(await alpha.inputValue(), 'Alpha remains editable')
  await openPicker()
  await page.reload()
  await page.locator('[data-project-panel][data-project-path="/beta"]').waitFor()
  assert.equal(await draft.count(), 0, 'an unselected draft panel is not restored after reload')
  assert.equal(await page.locator('[data-project-panel][data-project-path="/alpha"]').count(), 1)
  assert.deepEqual(errors, [])
  assert.deepEqual(consoleErrors.filter(message => !message.includes('favicon')), [])
})

test('project header hover controls stay compact, rounded, aligned, and functional', { timeout: 40_000 }, async t => {
  const fixture = await bundleOnce(), browser = await connectTestBrowser()
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
  const state = await installApp(page, fixture, ['/alpha', '/beta'])
  try {
    await page.goto(origin)
    await page.getByRole('textbox', { name: 'Editor /alpha', exact: true }).waitFor()
    await page.getByRole('button', { name: 'Layout', exact: true }).click()
    await page.getByRole('button', { name: /멀티프로젝트모드|Multi.project mode/ }).first().click()
    const panel = page.locator('[data-project-panel][data-project-path="/alpha"]')
    await panel.waitFor()
    const resize = page.getByRole('separator', { name: 'Resize project column', exact: true })
    await resize.focus(); await resize.press('Home')
    const title = panel.locator('.mew-project-board-name')
    const command = panel.locator('.mew-project-board-header [data-header-menu-trigger]')
    const close = panel.getByRole('button', { name: 'Close project panel: alpha', exact: true })
    const headerBox = (await panel.locator('.mew-project-board-header').boundingBox())!
    const titleBox = (await title.boundingBox())!, commandBox = (await command.boundingBox())!, closeBox = (await close.boundingBox())!
    assert.ok(titleBox.width < headerBox.width / 2, 'title hover follows its content rather than filling the header')
    assert.ok(titleBox.height >= closeBox.height, 'the title retains a comfortable click target')
    assert.ok(commandBox.width === closeBox.width && commandBox.height === closeBox.height, 'command and close affordances share compact dimensions')
    for (const [label, box] of [['title', titleBox], ['command', commandBox], ['close', closeBox]] as const) {
      assert.ok(Math.abs(box.y + box.height / 2 - (headerBox.y + headerBox.height / 2)) <= 1, `${label} is vertically centered`)
      assert.ok(box.x >= headerBox.x && box.x + box.width <= headerBox.x + headerBox.width, `${label} fits the narrow panel`)
    }
    assert.ok(titleBox.x + titleBox.width <= commandBox.x && commandBox.x + commandBox.width <= closeBox.x, 'header actions do not overlap')
    for (const [label, control] of [['title', title], ['command', command], ['close', close]] as const) {
      await control.hover()
      const hover = await control.evaluate((element, pseudo) => {
        const style = getComputedStyle(element, pseudo ? '::before' : null)
        return { radius: parseFloat(style.borderTopLeftRadius), background: style.backgroundColor, top: parseFloat(style.top), bottom: parseFloat(style.bottom) }
      }, label === 'title')
      assert.ok(hover.radius > 0, `${label} hover has rounded corners`)
      assert.notEqual(hover.background, 'rgba(0, 0, 0, 0)', `${label} has a visible hover background`)
      if (label === 'title') {
        assert.ok(hover.top >= 4 && hover.bottom >= 4, 'title hover background is inset from the header')
      }
    }
    const titleText = title.locator('span').last()
    await titleText.evaluate(element => { element.textContent = 'A very long project name '.repeat(10) })
    assert.equal(await titleText.evaluate(element => element.scrollWidth > element.clientWidth), true, 'long names truncate within the panel')
    const longTitleBox = (await title.boundingBox())!, longCommandBox = (await command.boundingBox())!, longCloseBox = (await close.boundingBox())!
    assert.ok(longTitleBox.x + longTitleBox.width <= longCommandBox.x && longCommandBox.x + longCommandBox.width <= longCloseBox.x, 'long names leave both actions visible')
    const reads = state.commandReads.length
    await command.click()
    await page.locator('[data-command-menu]').waitFor()
    assert.deepEqual(state.commandReads.slice(reads), ['/alpha'], 'the command action remains scoped to its panel')
    await page.keyboard.press('Escape')
    await page.locator('[data-command-menu]').waitFor({ state: 'detached' })
    await title.click()
    await panel.locator('[data-mobile-project-panel]').waitFor()
    await page.keyboard.press('Escape')
    await panel.locator('[data-mobile-project-panel]').waitFor({ state: 'detached' })
    assert.deepEqual(state.errors, []); assert.deepEqual(state.consoleErrors, [])
  } finally { state.releaseSave() }
})

test('actual workspace mode round trips retain separate seeded chrome and the same editor draft', { timeout: 40_000 }, async t => {
  const fixture = await bundleOnce(), browser = await connectTestBrowser()
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1700, height: 1000 } })
  const desktopKey = 'mew:device-layout:integration%40test:desktop', compactKey = 'mew:project-panel-layout:integration%40test:%2Falpha'
  const state = await installApp(page, fixture, ['/alpha'], {
    [desktopKey]: JSON.stringify({ dock: null, chrome: { sidebarOpen: false, agentOpen: true, terminalOpen: false, gitOpen: false } }),
    [compactKey]: JSON.stringify({ dock: null, chrome: { sidebarOpen: false, agentOpen: false, terminalOpen: false, gitOpen: true } }),
    'mew:project-panel-foreground:integration@test:/alpha': 'editor',
  })
  try {
    await page.goto(origin)
    const alpha = page.getByRole('textbox', { name: 'Editor /alpha', exact: true }), layout = page.getByRole('button', { name: 'Layout', exact: true })
    await alpha.waitFor()
    await alpha.fill('Draft survives distinct chrome')
    assert.equal(await page.locator('[data-test-agent-state="/alpha"]').getAttribute('data-open'), 'true')
    await layout.click(); await page.getByRole('button', { name: /멀티프로젝트모드|Multi.project mode/ }).first().click()
    await page.locator('[data-project-board][data-presentation="board"]').waitFor()
    await page.locator('[data-test-git-root="/alpha"]').waitFor({ state: 'attached' })
    assert.equal(await page.locator('[data-test-agent-state="/alpha"]').getAttribute('data-open'), 'false')
    assert.equal(await page.locator('[data-test-git-root="/alpha"]').getAttribute('data-open'), 'true')
    assert.equal(await alpha.inputValue(), 'Draft survives distinct chrome')
    await layout.click(); await page.getByRole('button', { name: /싱글프로젝트모드|Single.project mode/ }).first().click()
    await page.locator('[data-project-board][data-presentation="single"]').waitFor()
    assert.equal(await page.locator('[data-test-agent-state="/alpha"]').getAttribute('data-open'), 'true')
    assert.equal(await page.locator('[data-test-git-root="/alpha"]').getAttribute('data-open'), 'false')
    await paint(page)
    const saved = await page.evaluate(keys => keys.map(key => JSON.parse(localStorage.getItem(key)!).chrome), [desktopKey, compactKey])
    assert.deepEqual(saved.map(chrome => [chrome.agentOpen, chrome.gitOpen]), [[true, false], [false, true]])
    assert.equal(await alpha.inputValue(), 'Draft survives distinct chrome')
    assert.deepEqual(await page.evaluate('window.editorMounts'), { '/alpha': 1 })
    assert.deepEqual(await page.evaluate('window.editorUnmounts'), {})
    assert.deepEqual(state.errors, []); assert.deepEqual(state.consoleErrors, [])
  } finally { state.releaseSave() }
})

test('a legacy server keeps one real workspace and performs no explicit requests even with a saved multi-project board', { timeout: 30_000 }, async t => {
  const fixture = await bundleOnce(), browser = await connectTestBrowser()
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1700, height: 1000 } })
  const saved = JSON.stringify({ version: 1, panels: [{ id: 'saved-alpha', projectPath: '/alpha', workingRoot: '/alpha' }, { id: 'saved-beta', projectPath: '/beta', workingRoot: '/beta' }], columns: [{ id: 'column-alpha', width: 400, rows: [{ panelId: 'saved-alpha', weight: 1 }] }, { id: 'column-beta', width: 400, rows: [{ panelId: 'saved-beta', weight: 1 }] }], activePanelId: 'saved-beta' })
  const state = await installApp(page, fixture, ['/alpha', '/beta'], { 'mew:workspace-mode:integration%40test': 'multi', 'mew:project-board:integration%40test': saved }, false)
  try {
    await page.goto(origin)
    const editor = page.getByRole('textbox', { name: 'Editor /alpha', exact: true })
    await editor.waitFor()
    await page.waitForFunction(() => document.querySelector<HTMLTextAreaElement>('[aria-label="Editor /alpha"]')?.value === 'Alpha original')
    assert.equal(await editor.inputValue(), 'Alpha original')
    assert.equal(await page.locator('[data-test-editor-root]').count(), 1)
    assert.equal(await page.locator('[data-project-board], [data-workspace-view]').count(), 0)
    assert.equal(await page.getByRole('button', { name: 'Menu', exact: true }).count(), 1)
    await page.getByRole('button', { name: 'Layout', exact: true }).click()
    assert.equal(await page.getByRole('button', { name: /Multi.project mode|Single.project mode/ }).count(), 0)
    await page.keyboard.press('Escape')
    await editor.fill('Alpha pending edit')
    await state.saveCompleted
    assert.ok(state.saves.some(save => save.root === '/alpha' && save.content === 'Alpha pending edit'))
    assert.equal(state.contents.get('/beta'), 'Beta original')
    assert.deepEqual(state.scopes, [], 'the incompatible server never receives mewWorkspacePath requests')
    assert.deepEqual(state.errors, []); assert.deepEqual(state.consoleErrors, [])
  } finally { state.releaseSave() }
})

test('synthetic one, three, and ten project measurements retain one header and one presence connection', { timeout: 60_000 }, async t => {
  const fixture = await bundleOnce(), browser = await connectTestBrowser()
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } }), state = await installApp(page, fixture, projectRoots)
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Performance.enable')
  const samples: Record<string, unknown>[] = []
  const panel = (root: string) => page.locator(`[data-project-panel][data-project-path="${root}"]`)
  const layout = page.getByRole('button', { name: 'Layout', exact: true })
  const selectMode = async (mode: 'single' | 'multi') => {
    await layout.click()
    await page.getByRole('button', { name: mode === 'single' ? /싱글프로젝트모드|Single.project mode/ : /멀티프로젝트모드|Multi.project mode/ }).first().click()
    await page.locator(`[data-project-board][data-presentation="${mode === 'multi' ? 'board' : 'single'}"]`).waitFor()
  }
  try {
    await page.goto(origin)
    await page.getByRole('textbox', { name: 'Editor /alpha', exact: true }).waitFor()
    await selectMode('multi')
    await panel('/alpha').locator('.mobile-dock [data-dock-item="editor"]').click()
    for (let index = 0; index < projectRoots.length; index++) {
      const root = projectRoots[index]
      if (index) {
        await page.locator('.mew-project-board-add').click()
        await page.locator('[data-project-draft]').locator(`[data-project-option="${root}"]`).click()
        await page.getByRole('textbox', { name: 'Editor ' + root, exact: true }).waitFor()
      }
      if (![1, 3, 10].includes(index + 1)) continue
      const start = performance.now()
      await panel(root).locator('.mobile-dock [data-dock-item="editor"]').click()
      await paint(page)
      const clickMs = performance.now() - start
      const modeStart = performance.now()
      await selectMode('single'); await selectMode('multi'); await paint(page)
      const roundTripMs = performance.now() - modeStart
      await cdp.send('HeapProfiler.collectGarbage')
      const metrics = await cdp.send('Performance.getMetrics'), counters = await cdp.send('Memory.getDOMCounters')
      const sample = await page.evaluate(() => ({
        views: document.querySelectorAll('[data-workspace-view]').length,
        docks: document.querySelectorAll('.mobile-dock').length,
        headers: document.querySelectorAll('button[aria-label="Menu"]').length,
        presenceSockets: (window as any).fixtureSockets.filter((socket: { url: string; readyState: number }) => socket.url.endsWith('/api/presence') && socket.readyState !== 3).length,
        editorMounts: Object.values((window as any).editorMounts as Record<string, number>).reduce((total, value) => total + value, 0),
        editorUnmounts: Object.values((window as any).editorUnmounts as Record<string, number>).reduce((total, value) => total + value, 0),
        domElements: document.querySelectorAll('*').length,
      }))
      assert.equal(sample.views, index + 1); assert.equal(sample.docks, index + 1); assert.equal(sample.headers, 1); assert.equal(sample.presenceSockets, 1)
      assert.equal(sample.editorMounts, index + 1); assert.equal(sample.editorUnmounts, 0)
      samples.push({ projects: index + 1, apiRequests: state.requests.filter(request => request.includes('/api/')).length, ...sample, jsEventListeners: counters.jsEventListeners, heapBytes: metrics.metrics.find(metric => metric.name === 'JSHeapUsedSize')?.value ?? null, clickMs: Math.round(clickMs), modeRoundTripMs: Math.round(roundTripMs) })
    }
    for (const root of projectRoots) {
      await panel(root).getByRole('button', { name: 'Close project panel: ' + root.slice(1), exact: true }).click()
      await panel(root).waitFor({ state: 'detached' })
    }
    await paint(page)
    await cdp.send('HeapProfiler.collectGarbage')
    const closed = await cdp.send('Memory.getDOMCounters')
    const closedSample = { projects: 0, views: await page.locator('[data-workspace-view]').count(), docks: await page.locator('.mobile-dock').count(), jsEventListeners: closed.jsEventListeners, editorUnmounts: await page.evaluate<number>('Object.values(window.editorUnmounts).reduce((sum,value)=>sum+value,0)') }
    samples.push(closedSample)
    assert.equal(await page.locator('[data-workspace-view]').count(), 0)
    assert.equal(await page.locator('.mobile-dock').count(), 0)
    assert.equal(closedSample.editorUnmounts, projectRoots.length)
    assert.ok(closed.jsEventListeners < (samples[0].jsEventListeners as number), 'closing the board releases view listeners after garbage collection')
    assert.deepEqual(state.errors, []); assert.deepEqual(state.consoleErrors, [])
    console.log('Synthetic multi-project fixture (stub editor/agent/Git bodies, mocked transport):', JSON.stringify(samples))
  } finally { state.releaseSave(); await cdp.send('Performance.disable'); await cdp.detach() }
})


test('remote tools open as independent movable board panels', { timeout: 45_000 }, async t => {
  const fixture = await bundleOnce(), browser = await connectTestBrowser()
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1700, height: 1000 } })
  await installApp(page, fixture)
  await page.goto(origin)
  await page.getByRole('textbox', { name: 'Editor /alpha', exact: true }).waitFor()
  await page.getByRole('button', { name: /Layout|레이아웃/ }).first().click()
  await page.getByRole('button', { name: /멀티프로젝트모드|Multi.project mode/ }).first().click()
  const menu = page.getByRole('button', { name: 'Menu', exact: true })
  await menu.click()
  await page.getByRole('menuitem', { name: 'Remote browser', exact: true }).click()
  const browserPanel = page.locator('[data-project-panel][data-project-path="remote-tool:browser"]')
  await browserPanel.locator('[data-test-remote-browser]').waitFor()
  assert.equal(await page.getByRole('dialog').count(), 0)
  assert.equal(await menu.count(), 1)
  await menu.click()
  await page.getByText('Remote desktop', { exact: true }).click()
  const desktopPanel = page.locator('[data-project-panel][data-project-path="remote-tool:desktop"]')
  await desktopPanel.locator('[data-test-remote-desktop][data-embedded="true"]').waitFor()
  await desktopPanel.locator('[data-project-panel-handle]').focus()
  await page.keyboard.press('ArrowLeft')
  assert.equal(await menu.count(), 1)
  await menu.click()
  await page.getByRole('menuitem', { name: 'Remote browser', exact: true }).click()
  assert.equal(await browserPanel.count(), 1)
  const desktopWidth = await desktopPanel.evaluate(element => element.getBoundingClientRect().width)
  const columnId = await desktopPanel.locator('[data-project-panel-handle]').getAttribute('data-project-panel-handle')
  const separator = page.locator('[data-project-column-resize]').first()
  await separator.focus()
  await page.keyboard.press('ArrowRight')
  assert.ok(columnId)
  assert.ok(desktopWidth > 0)
  await page.getByRole('button', { name: /Layout|레이아웃/ }).first().click()
  await page.getByRole('button', { name: /싱글프로젝트모드|Single.project mode/ }).first().click()
  await page.locator('[data-project-board][data-presentation="single"]').waitFor()
  assert.equal(await page.locator('[data-test-remote-desktop]').count(), 0)
  await page.getByRole('button', { name: /Layout|레이아웃/ }).first().click()
  await page.getByRole('button', { name: /멀티프로젝트모드|Multi.project mode/ }).first().click()
  await browserPanel.locator('[data-test-remote-browser]').waitFor()
  await desktopPanel.locator('[data-test-remote-desktop]').waitFor()
  await page.locator('[data-project-panel][data-project-path="/alpha"] .mew-project-board-header button[aria-label^="Close"]').click()
  await page.locator('[data-project-panel][data-project-path="/alpha"]').waitFor({ state: 'detached' })
  assert.equal(await browserPanel.isVisible(), true)
  assert.equal(await desktopPanel.isVisible(), true)
  await page.reload()
  await browserPanel.locator('[data-test-remote-browser]').waitFor()
  await desktopPanel.locator('[data-test-remote-desktop]').waitFor()
  await page.evaluate('window.setCapabilities({desktop:false,portPreview:false,nativeBrowser:false})')
  await browserPanel.waitFor({ state: 'detached' })
  await desktopPanel.waitFor({ state: 'detached' })
})
