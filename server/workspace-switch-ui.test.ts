import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { chromium } from 'playwright-core'
import { domBrowserExecutable } from './browser-dom-executable.ts'
import { applyTaskChanges, type TaskItem } from '../shared/task-list.ts'

const root = path.resolve(import.meta.dirname, '..')

for (const mode of ['keyboard', 'workspace', 'documents', 'permissions', 'panels', 'worktree', 'swipes', 'rapid'] as const) test(mode === 'rapid' ? 'App rapid project selections cancel superseded handoffs and restore the latest root' : mode === 'swipes' ? 'App mobile dock swipes select panels and explorer swipes preserve search mode' : mode === 'worktree' ? 'linked worktree swaps retain project layout and sessions and settle outgoing file saves' : mode === 'panels' ? 'App restores Tasks with Alt+T and task sessions survive close and reload' : mode === 'permissions' ? 'permission invalidation replaces pending workspace metadata and ignores the old response' : mode === 'documents' ? 'Files opens Documents as a filesystem folder with a separate navigation arrow' : mode === 'keyboard' ? 'App keyboard aliases open files and projects and create files and folders in the current explorer scope' : 'App overlaps workspace metadata, restores warm roots and ignores duplicate handoffs', { skip: !domBrowserExecutable(), timeout: 60_000 }, async () => {
  const keyboardOnly = mode === 'keyboard'
  const appSource = await fs.readFile(`${root}/src/App.tsx`, 'utf8')
  // Keep App, useTabs, FileTree, project switching and docking real. Unrelated panels and the
  // editor renderer are inert so this measures handoff work rather than editor startup.
  const keep = new Set(['deferredComponent', 'ProjectSwitcher', 'ProjectLoadingOverlay', 'FileTree', 'SearchPanel', 'DockWorkspace', 'ProjectIcon', 'SubprojectLink', 'SidebarCreateButtons', 'MobileDock', 'HeaderMenu', 'TaskPanel', 'IconPackProvider'])
  if (keyboardOnly) { keep.add('OpenProjectDialog'); keep.add('ServerFileExplorer') }
  const stubs = new Map<string, string>()
  const componentImports = appSource.replace(/const \w+ = deferredComponent\(async \(\) => \(\{ default: \(await import\('([^']+)'\)\)\.(\w+) \}\)(?:, null)?\)/g, (_match, module, name) => `import { ${name} } from '${module}'`)
  for (const match of componentImports.matchAll(/import \{ ([^\n]+) \} from '(\.\/components\/[^']+)'/g)) {
    const names = match[1].split(',').map(n => n.trim()).filter(n => !n.startsWith('type ')).map(specifier => {
      const [exported, local = exported] = specifier.split(/\s+as\s+/)
      return { exported, local }
    })
    if (names.some(({ exported, local }) => keep.has(exported) || keep.has(local))) continue
    stubs.set(match[2], names.map(({ exported, local }) => {
      const stub = local === 'EditorPane'
        ? `import {DockGrip} from '${root}/src/components/DockWorkspace.tsx';function EditorPane({pane,onCloseTab,onActivate,onChangeContent,workspace}) { const active=pane.tabs.find(t=>t.path===pane.activePath);React.useEffect(()=>{window.fixtureEditors??={};window.fixtureEditors[pane.id]={pane,workspace,onChangeContent};window.fixtureEditorCallbacks??={};window.fixtureEditorCallbacks[(workspace?.path||'')+':'+pane.id]=onChangeContent},[pane,workspace,onChangeContent]);return React.createElement('div',{'data-test-editor':pane.id,'data-test-active':pane.activePath,'data-test-root':workspace?.path,'data-test-revalidating':!!active?.revalidating},React.createElement(DockGrip,{group:'editor:'+pane.id}),React.createElement('span',{'data-test-content':true},active?.content||''),...pane.tabs.flatMap(t=>[React.createElement('button',{key:'select:'+t.path,onClick:()=>onActivate(t.path)},'Select '+t.path),React.createElement('button',{key:t.path,onClick:()=>onCloseTab(t.path)},'Close '+t.path)])); }`
        : local === 'AgentPanel' ? `${mode === 'worktree' ? `import {DockPanel} from '${root}/src/components/DockWorkspace.tsx';` : ''}function AgentPanel({preparedTabs,workspacePath,agentOpen,terminalOpen}) { React.useEffect(()=>{window.fixtureAgentMounts=(window.fixtureAgentMounts||0)+1},[]);React.useEffect(()=>{window.fixtureAgentRoot=workspacePath},[workspacePath]);React.useEffect(()=>{const prepared=preparedTabs${mode === 'worktree' ? `??(workspacePath?fetch('/api/user-ui/agent-tabs?workspace='+encodeURIComponent(workspacePath)).then(response=>response.json()):undefined)` : ''};prepared?.then(value=>{window.preparedAgentRoot=value.workspace})},[preparedTabs,workspacePath]);return ${mode === 'worktree' ? `React.createElement(React.Fragment,null,React.createElement(DockPanel,{id:'agent',kind:'agent',visible:agentOpen,tabs:['fixture-agent']},React.createElement('div',{'data-test-agent-root':workspacePath},'Existing agent')),React.createElement(DockPanel,{id:'terminal',kind:'terminal',visible:terminalOpen,tabs:['fixture-terminal']},React.createElement('div',{'data-test-terminal-root':workspacePath},'Existing terminal')))` : 'null'} }`
        : local === 'GitPanel' && mode === 'worktree' ? `import {DockPanel} from '${root}/src/components/DockWorkspace.tsx';function GitPanel({onPrepareBranchChange,onOpenWorktree,visible}) {React.useEffect(()=>{window.openFixtureWorktree=async path=>{window.worktreeError=null;try {const release=await onPrepareBranchChange();try {await onOpenWorktree(path);return true}finally{release()}}catch(error){window.worktreeError=error.message;return false}}},[onPrepareBranchChange,onOpenWorktree]);return React.createElement(DockPanel,{id:'git',kind:'git',visible,tabs:[]},React.createElement('button',{'data-test-worktree-trigger':true,onClick:()=>{window.openFixtureWorktree('/alpha-worktree')}},'Open linked worktree'))}`
        : local === 'RemoteDesktop' ? `function RemoteDesktop({onClose,dockHostRef}) { return React.createElement('div',{'role':'dialog','aria-label':'Remote desktop fixture',style:{position:'fixed',inset:0,zIndex:100,background:'var(--color-surface)'}},React.createElement('button',{onClick:onClose},'Close remote desktop'),React.createElement('div',{ref:dockHostRef})); }`
        : `function ${local}(){return null}`
      return `${stub}\nexport { ${local} as ${exported} }`
    }).join('\n'))
  }
  const source = `import React from '${root}/node_modules/react/index.js';import {createRoot} from '${root}/node_modules/react-dom/client.js';import App from '${root}/src/AppBootstrap.tsx';import {I18nProvider} from '${root}/src/i18n.tsx';import {setDockPosition} from '${root}/src/hooks/use-dock-preferences.ts';window.fixtureDockPosition=setDockPosition;createRoot(document.getElementById('root')).render(<I18nProvider><App/></I18nProvider>);`
  const bundle = await build({ input: 'virtual:switch.tsx', write: false, platform: 'browser', output: { format: 'iife', codeSplitting: false }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } }, plugins: [{ name: 'fixture', resolveId(id, importer) {
    if (id === 'virtual:switch.tsx') return id
    if (importer === `${root}/src/App.tsx` && stubs.has(id)) return `virtual:stub:${id}`
    if (/\/file-type-icon(?:\.tsx)?$/.test(id)) return 'virtual:file-icons'
    if (id.endsWith('.css')) return 'virtual:style'
  }, async load(id) {
    if (id === 'virtual:switch.tsx') return source
    if (id === 'virtual:style') return ''
    if (id === 'virtual:file-icons') return 'export function FileTypeIcon(){return null} export function FolderTypeIcon(){return null}'
    if (id.startsWith('virtual:stub:')) return `import React from '${root}/node_modules/react/index.js';\n${stubs.get(id.slice('virtual:stub:'.length))}`
    if (id.endsWith('?raw')) return 'export default ' + JSON.stringify(await fs.readFile(id.slice(0, -4), 'utf8'))
  } }] })
  const chunk = bundle.output.find(item => item.type === 'chunk')!
  const content = (await Promise.all(['src/components/ProjectSwitcher.tsx', 'src/components/project-loading-overlay.tsx', 'src/components/FileTree.tsx', 'src/components/SearchPanel.tsx', 'src/components/DockWorkspace.tsx', 'src/components/mobile-dock.tsx', 'src/components/HeaderMenu.tsx', 'src/components/OpenProjectDialog.tsx', 'src/components/ServerFileExplorer.tsx', 'src/components/file-browser.tsx', 'src/components/file-browser-favorites.tsx', 'packages/ui/src/HoverTipLayer.tsx', 'packages/ui/src/dialog-frame.tsx', 'packages/ui/src/ConfirmDialog.tsx', 'packages/ui/src/select-field.tsx'].map(file => fs.readFile(path.join(root, file), 'utf8')))).join('\n')
  const compiler = await compile(await fs.readFile(`${root}/src/index.css`, 'utf8'), { base: `${root}/src`, onDependency() {} })
  const taskContent = await fs.readFile(`${root}/src/components/task-panel.tsx`, 'utf8')
  const dateCss = await fs.readFile(`${root}/packages/ui/src/date-field.css`, 'utf8')
  const css = compiler.build([...new Set((source + content + appSource + taskContent).match(/[A-Za-z0-9_@:/.[\]()%,-]+/g)), ...Array.from(dateCss.matchAll(/--color-([a-z-]+)/g), match => `bg-${match[1]}`)]) + await fs.readFile(`${root}/src/components/task-panel.css`, 'utf8') + dateCss
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 700 }, hasTouch: true })
    page.setDefaultTimeout(3000)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    let active = '/alpha', projectPath = '/alpha'
    let role = 'owner', serverFiles = keyboardOnly
    let failSwitch = false
    const requests: { path: string; method: string; root: string; time: number }[] = []
    const persisted = new Map<string, unknown>()
    const taskBoards = new Map<string, TaskItem[]>()
    let accountTheme: unknown = null
    let releaseSwitch: (() => void) | undefined
    let releaseUi: (() => void) | undefined
    const uiWaiters: (() => void)[] = []
    let blockSwitch = false, blockUi = true, blockTree = false
    let blockAuth = false, blockAccess = false, failTree = false
    const authWaiters: (() => void)[] = [], accessWaiters: (() => void)[] = []
    const treeWaiters: (() => void)[] = []
    const fileWaiters: (() => void)[] = []
    let blockFileRoot: string | null = null
    let blockFileSave = false, failFileSave = false
    const saveWaiters: (() => void)[] = []
    const fileWrites: { root: string; path: string; content: string; expectedContent?: string }[] = []
    const fileContents = new Map<string, string>()
    const workspacePosts: { path: string; worktree?: boolean; workspace?: string }[] = []
    const heldSwitchPaths = new Set<string>()
    const heldSwitchResponses: { path: string; release(error?: boolean): void }[] = []
    const heldUiPaths = new Set<string>()
    const heldUiResponses: { path: string; release(): void }[] = []
    const stateFor = (name: string) => ({ sidebar: { docsExpanded: false, expandedSubprojects: [] }, chrome: { sidebarOpen: true, sidebarView: 'tree', ragOpen: true, ...(mode === 'worktree' ? { agentOpen: true, terminalOpen: true, gitOpen: true } : {}) }, tabs: { '.workspace': { panes: [{ id: 'main', tabs: [{ path: 'README.md', preview: false, viewMode: 'plain' }, { path: 'extra.md', preview: false, viewMode: 'plain' }], activePath: 'README.md' }, ...(mode === 'worktree' && name === '/alpha' ? [{ id: 'side', tabs: [{ path: 'side.md', preview: false, viewMode: 'plain' }], activePath: 'side.md' }] : [])], layout: mode === 'worktree' && name === '/alpha' ? { kind: 'split', dir: 'row', kids: [{ kind: 'leaf', pane: 'main' }, { kind: 'leaf', pane: 'side' }] } : { kind: 'leaf', pane: 'main' }, focusedPaneId: 'main' } }, label: name })
    await page.addInitScript(() => {
      localStorage.setItem('mew:locale', 'ko')
      localStorage.setItem('mew:mobile-dock-hidden', '["browser"]')
      class Socket extends EventTarget {
        static OPEN = 1
        readyState = 1
        onopen: (() => void) | null = null
        onmessage: ((event: { data: string }) => void) | null = null
        onclose: (() => void) | null = null
        constructor(url: string) { super(); if (url.includes('presence')) (globalThis as unknown as { presence: Socket }).presence = this; setTimeout(() => this.onopen?.(), 0) }
        send() {}
        close() { this.readyState = 3 }
      }
      Object.defineProperty(globalThis, 'WebSocket', { value: Socket })
    })
    await page.route('http://mew-switch.test/**', async route => {
      const url = new URL(route.request().url()), method = route.request().method(), captured = active
      requests.push({ path: url.pathname, method, root: url.searchParams.get('workspace') ?? captured, time: Date.now() })
      const json = (value: unknown) => route.fulfill({ json: value })
      if (url.pathname === '/api/auth/me') {
        if (blockAuth) await new Promise<void>(resolve => authWaiters.push(resolve))
        return json({ authenticated: true, email: 'switch@example.test', role, mustChangePassword: false, capabilities: { filesRead: true, filesWrite: true, serverFiles, agent: true, terminal: true, git: true, browser: true, desktop: true } })
      }
      if (url.pathname === '/api/user-ui/theme') {
        if (method === 'PUT') accountTheme = route.request().postDataJSON().state
        return json({ state: accountTheme })
      }
      if (url.pathname === '/api/file-access') {
        if (blockAccess) await new Promise<void>(resolve => accessWaiters.push(resolve))
        return json({ view: true, edit: true })
      }
      if (url.pathname === '/api/workspace') {
        if (method === 'POST') {
          const body = route.request().postDataJSON()
          workspacePosts.push(body)
          if (mode === 'rapid') {
            if (failSwitch) return route.fulfill({ status: 400, json: { error: 'missing folder' } })
            // A regular server switch commits synchronously; only its response
            // can remain in flight while a later project selection is accepted.
            active = body.path
            projectPath = active
            const info = { path: active, projectPath, docs: 'docs', docsPath: active + '/docs', projects: [] }
            await page.evaluate(() => (globalThis as unknown as { presence: { onmessage: (e: { data: string }) => void } }).presence.onmessage({ data: JSON.stringify({ type: 'workspace' }) }))
            let lateError = false
            if (heldSwitchPaths.has(body.path)) await new Promise<void>(resolve => heldSwitchResponses.push({ path: body.path, release(error = false) { lateError = error; resolve() } }))
            return lateError ? route.fulfill({ status: 400, json: { error: 'obsolete project error' } }) : json(info)
          }
          if (blockSwitch) await new Promise<void>(resolve => { releaseSwitch = resolve })
          if (failSwitch) return route.fulfill({ status: 400, json: { error: 'missing folder' } })
          active = body.path
          if (!body.worktree) projectPath = active
          // Real presence can arrive before the POST response. Both must share one hydration.
          await page.evaluate(() => (globalThis as unknown as { presence: { onmessage: (e: { data: string }) => void } }).presence.onmessage({ data: JSON.stringify({ type: 'workspace' }) }))
          await new Promise(resolve => setTimeout(resolve, 40))
        }
        return json({ path: active, projectPath: mode === 'worktree' ? projectPath : active, docs: 'docs', docsPath: active + '/docs', projects: [] })
      }
      if (url.pathname === '/api/project-icons/read') return json({ icons: {} })
      if (url.pathname === '/api/user-ui/root-projects') return json({ state: { paths: ['/alpha', '/beta', ...(mode === 'worktree' ? ['/alpha-worktree'] : mode === 'rapid' ? ['/gamma'] : [])], icons: {}, groups: [] } })
      if (url.pathname === '/api/user-ui/agent-tabs') return json({ state: null, claims: [], workspace: url.searchParams.get('workspace') })
      if (url.pathname === '/api/user-ui/workspace') {
        if (method === 'PUT') { const body = route.request().postDataJSON(); persisted.set(body.workspacePath, body.state); return json({ state: body.state }) }
        if (blockUi) await new Promise<void>(resolve => { releaseUi = resolve; uiWaiters.push(resolve) })
        const name = url.searchParams.get('workspace')!
        if (mode === 'rapid' && heldUiPaths.has(name)) await new Promise<void>(resolve => heldUiResponses.push({ path: name, release: resolve }))
        return json({ state: persisted.get(name) ?? stateFor(name) })
      }
      if (url.pathname === '/api/tree') {
        if (blockTree) await new Promise<void>(resolve => treeWaiters.push(resolve))
        if (failTree) return route.fulfill({ status: 500, json: { error: 'refresh failed' } })
        if (url.searchParams.get('project') === '.workspace' && url.searchParams.get('path') === 'src') {
          return json({ version: 1, state: 'ready', entries: [{ name: 'child.ts', path: 'src/child.ts', type: 'file' }] })
        }
        if (url.searchParams.get('project') === '.workspace' && url.searchParams.get('path') === 'docs') {
          return json({ version: 1, state: 'ready', entries: [
            { name: 'MOC.md', path: 'docs/MOC.md', type: 'file' },
            { name: 'example.ts', path: 'docs/example.ts', type: 'file' },
          ] })
        }
        return json({ version: 1, state: 'ready', entries: [...(url.searchParams.get('project') === 'docs' ? [{ name: 'MOC.md', path: 'MOC.md', type: 'file' }] : [{ name: 'assets', path: 'assets', type: 'dir' }, { name: 'docs', path: 'docs', type: 'dir' }, { name: 'src', path: 'src', type: 'dir', project: true }]), { name: captured.slice(1) + '.md', path: captured.slice(1) + '.md', type: 'file' }] })
      }
      if (url.pathname === '/api/file') {
        if (method === 'PUT') {
          const body = route.request().postDataJSON()
          fileWrites.push({ root: captured, ...body })
          if (blockFileSave) await new Promise<void>(resolve => saveWaiters.push(resolve))
          if (failFileSave) return route.fulfill({ status: 409, json: { error: 'fixture save conflict' } })
          fileContents.set(`${captured}:${body.path}`, body.content)
          return json({ ok: true, content: body.content, commit: null })
        }
        const delayed = captured === blockFileRoot
        if (delayed) await new Promise<void>(resolve => fileWaiters.push(resolve))
        const filePath = url.searchParams.get('path')!
        return json({ path: filePath, content: delayed ? 'Late response from ' + captured : fileContents.get(`${captured}:${filePath}`) ?? 'Content of ' + captured + (mode === 'worktree' && filePath !== 'README.md' ? ` / ${filePath}` : ''), editable: true })
      }
      if (url.pathname === '/api/fs/favorites') return json({ folders: [] })
      if (url.pathname === '/api/fs/entries') {
        const folder = url.searchParams.get('path') || '/home/test'
        return json({ path: folder, canonicalPath: folder, parent: folder === '/' ? null : '/', entries: [{ name: '.zshrc', path: folder + '/.zshrc', type: 'file', size: 20 }, { name: 'config', path: folder + '/config', type: 'dir', size: null }] })
      }
      if (url.pathname === '/api/fs/file') return json({ path: url.searchParams.get('path'), content: 'External shell configuration', editable: true })
      if (url.pathname === '/api/task-list') {
        const workspace = method === 'PATCH' ? route.request().postDataJSON().workspace : url.searchParams.get('workspace')
        if (workspace !== active) return route.fulfill({ status: 409, json: { error: '프로젝트가 변경되었습니다. 태스크 패널을 다시 여세요.' } })
        if (method === 'PATCH') taskBoards.set(workspace, applyTaskChanges(taskBoards.get(workspace) ?? [], route.request().postDataJSON().changes))
        return json({ tasks: taskBoards.get(workspace) ?? [], canEdit: true })
      }
      if (url.pathname === '/api/agent-sets') return json({ sets: [] })
      if (url.pathname === '/api/member-profiles') return json({ members: [] })
      if (url.pathname === '/api/projects') return json([])
      if (url.pathname.startsWith('/api/')) return json({})
      return route.fulfill(url.pathname === '/app.js' ? { contentType: 'text/javascript', body: chunk.code } : { contentType: 'text/html', body: `<!doctype html><html><meta charset="utf-8"><style>${css}</style><div id="root"></div><script src="/app.js"></script></html>` })
    })
    await page.goto('http://mew-switch.test/')
    const loading = page.locator('[role="status"].pointer-events-none').filter({ has: page.getByText('불러오는 중…', { exact: true }) })
    await loading.waitFor()
    while (!releaseUi) await page.waitForTimeout(10)
    if (mode === 'permissions') {
      await page.locator('header').evaluate(element => element.ownerDocument.defaultView!.dispatchEvent(new Event('mew:permissions-changed')))
      const deadline = Date.now() + 3000
      while (uiWaiters.length < 2 && Date.now() < deadline) await page.waitForTimeout(10)
      assert.equal(uiWaiters.length, 2, 'new permissions start a fresh metadata read without waiting for the invalidated response')
      uiWaiters[1](); blockUi = false
      await page.locator('[data-test-content]').getByText('Content of /alpha', { exact: true }).waitFor()
      uiWaiters[0]()
      await loading.waitFor({ state: 'detached' })
      await page.waitForTimeout(100)
      assert.equal(requests.filter(r => r.path === '/api/user-ui/workspace' && r.method === 'GET').length, 2)
      assert.equal(await page.getByRole('button', { name: 'Select README.md', exact: true }).count(), 1, 'late invalidated metadata does not restart the current restoration')
      assert.deepEqual(errors, [])
      return
    }
    releaseUi(); blockUi = false
    await page.locator('[data-test-content]').getByText('Content of /alpha', { exact: true }).waitFor()
    if (mode === 'swipes') {
      const dock = page.getByRole('navigation', { name: '작업 독', exact: true })
      for (const width of [390, 1100]) {
        await page.setViewportSize({ width, height: 700 })
        for (const position of ['top', 'bottom', 'left', 'right']) {
          await page.evaluate(`window.fixtureDockPosition('${width >= 768 ? 'desktop' : 'mobile'}','${position}')`)
          await page.waitForFunction(`document.querySelector('.workspace-dock-layout').dataset.dockPosition === '${position}' && document.querySelector('.mobile-dock').dataset.position === '${position}'`)
          const dockBounds = (await dock.boundingBox())!
          const rail = (await page.locator('[data-sidebar-dock]').boundingBox())!
          const content = (await page.locator('.workspace-dock-layout > .mew-workspace-content').boundingBox())!
          assert.ok(dockBounds.x >= 0 && dockBounds.y >= 0 && dockBounds.x + dockBounds.width <= width && dockBounds.y + dockBounds.height <= 700, `${width}px ${position} dock stays within the App viewport`)
          assert.ok(content.width > 0 && content.height > 0)
          if (position === 'top') assert.ok(rail.y + rail.height <= content.y + 1)
          if (position === 'bottom') assert.ok(content.y + content.height <= rail.y + 1)
          if (position === 'left') assert.ok(rail.x + rail.width <= content.x + 1)
          if (position === 'right') assert.ok(content.x + content.width <= rail.x + 1)
          if (width >= 768) {
            const sidebar = (await page.locator('[data-sidebar]').boundingBox())!
            const toggle = (await page.locator('[data-sidebar-toggle]').boundingBox())!
            assert.equal(toggle.x, sidebar.x + sidebar.width - 1, `${position} dock keeps the explorer toggle at the sidebar boundary`)
            assert.ok(toggle.y >= content.y && toggle.y + toggle.height <= content.y + content.height)
          }
        }
      }
      await page.evaluate("window.fixtureDockPosition('desktop','left');window.fixtureDockPosition('mobile','bottom')")
      await page.setViewportSize({ width: 390, height: 700 })
      await page.waitForFunction("document.querySelector('.mobile-dock').dataset.position === 'bottom'")
      await dock.locator('[data-dock-item=editor]').tap()
      const selected = await page.locator('[data-test-editor]').getAttribute('data-test-active')
      const cdp = await page.context().newCDPSession(page)
      const swipe = async (selector: string, dx: number) => {
        const target = page.locator(selector)
        await target.waitFor({ state: 'visible' })
        const box = (await target.boundingBox())!
        const x = box.x + box.width / 2, y = box.y + box.height / 2
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx, y }] })
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      }
      const foreground = (panel: string) => page.waitForFunction(`document.querySelector('[data-dock-item="${panel}"]').getAttribute('aria-current') === 'page'`)
      await swipe('.mobile-dock', 65)
      await foreground('sidebar')
      await swipe('.mobile-dock', 65)
      await foreground('sidebar')
      assert.equal(await page.locator('[data-test-editor]').getAttribute('data-test-active'), selected, 'dock preserves the editor tab and stops at its first panel')
      const sidebar = page.locator('[data-sidebar]')
      const input = sidebar.getByRole('textbox')
      const contentToggle = sidebar.getByRole('button', { name: '파일 내용 검색', exact: true })
      await input.fill('beta')
      for (const enabled of [false, true]) {
        if (enabled) await contentToggle.tap()
        for (const [dx, scope] of [[-90, '파일'], [90, '문서'], [90, '문서'], [-90, '파일'], [-90, '파일'], [90, '문서']] as const) {
          await swipe('[data-sidebar]', dx)
          const scopeButton = sidebar.getByRole('button', { name: scope, exact: true })
          await page.waitForFunction(el => el?.getAttribute('aria-pressed') === 'true', await scopeButton.elementHandle())
          await foreground('sidebar')
          assert.equal(await input.isVisible(), true, 'body swipes preserve the shared explorer search field')
          assert.equal(await input.inputValue(), 'beta', 'scope swipes preserve the search query')
          assert.equal(await contentToggle.getAttribute('aria-pressed'), String(enabled), 'body swipes preserve the content-search mode')
          assert.equal(await sidebar.locator('[data-numbered-tab], [role="tab"]').count(), 0, 'the explorer has no search tabs')
        }
      }
      await page.setViewportSize({ width: 1100, height: 700 })
      await swipe('[data-sidebar]', -90)
      assert.equal(await sidebar.getByRole('button', { name: '문서', exact: true }).getAttribute('aria-pressed'), 'true', 'desktop body swipes preserve the scope')
      await page.setViewportSize({ width: 390, height: 700 })
      await swipe('.mobile-dock', -65)
      await foreground('editor')
      await swipe('.mobile-dock', -65)
      await foreground('agent')
      await swipe('.mobile-dock', 65)
      await foreground('editor')
      assert.equal(await page.locator('[data-test-editor]').getAttribute('data-test-active'), selected, 'tabbed panels still use dock swipes to change panels')
      await cdp.detach()
      assert.deepEqual(errors, [])
      return
    }
    if (mode === 'worktree') {
      const main = page.locator('[data-test-editor="main"]')
      const side = page.locator('[data-test-editor="side"]')
      await page.locator('[data-test-worktree-trigger]').waitFor()
      await side.getByText('Content of /alpha / side.md', { exact: true }).waitFor()
      await page.waitForFunction('window.fixtureAgentRoot === "/alpha" && window.preparedAgentRoot === "/alpha"')
      persisted.set('/alpha-worktree', {
        chrome: { sidebarOpen: false, agentOpen: false, terminalOpen: false, gitOpen: false },
        tabs: { '.workspace': { panes: [{ id: 'target', tabs: [{ path: 'target-only.md', preview: false, viewMode: 'plain' }], activePath: 'target-only.md' }], layout: { kind: 'leaf', pane: 'target' }, focusedPaneId: 'target' } },
      })
      const layoutSnapshot = async () => ({
        sidebar: await page.locator('[data-sidebar]').boundingBox(),
        panels: await page.locator('[data-dock-panel]').evaluateAll(elements => elements.map(element => {
          const bounds = element.getBoundingClientRect()
          return { id: element.getAttribute('data-dock-panel'), x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
        }).sort((a, b) => a.id!.localeCompare(b.id!))),
        tabs: await page.locator('[data-test-editor]').evaluateAll(elements => elements.map(element => ({
          id: element.getAttribute('data-test-editor'), active: element.getAttribute('data-test-active'), tabs: Array.from(element.querySelectorAll('button')).map(button => (button as { textContent: string | null }).textContent),
        }))),
      })
      const before = await layoutSnapshot()
      assert.equal(before.tabs.length, 2, 'the fixture starts with two independently restored editor panes')
      const agentMounts = await page.evaluate('window.fixtureAgentMounts')
      const metadataReads = () => requests.filter(request => request.method === 'GET' && (request.path === '/api/user-ui/workspace' || request.path === '/api/user-ui/agent-tabs')).length
      const metadataBefore = metadataReads()
      const startSwap = async (path: string) => {
        await page.evaluate(`window.worktreeResult=null;void window.openFixtureWorktree(${JSON.stringify(path)}).then(value=>{window.worktreeResult=value})`)
      }
      const waitForSave = async () => {
        const deadline = Date.now() + 3000
        while (!saveWaiters.length && Date.now() < deadline) await page.waitForTimeout(10)
        assert.ok(saveWaiters.length, 'outgoing edits begin saving before the workspace handoff')
      }
      const assertKeptWorkspace = async () => {
        assert.equal(await page.locator('[data-current-project="/alpha"]').count(), 1, 'the project selector retains the logical project')
        assert.equal(await page.locator('[data-current-project="/alpha"]').innerText(), 'alpha')
        assert.deepEqual(await layoutSnapshot(), before, 'worktree navigation preserves panel geometry, pane placement and open tab order')
        assert.equal(await page.evaluate('window.fixtureAgentMounts'), agentMounts, 'existing agents and terminals are not remounted')
        assert.equal(await page.locator('[data-test-agent-root]').getAttribute('data-test-agent-root'), '/alpha')
        assert.equal(await page.locator('[data-test-terminal-root]').getAttribute('data-test-terminal-root'), '/alpha')
        assert.equal(await page.evaluate('window.preparedAgentRoot'), '/alpha')
        assert.equal(metadataReads(), metadataBefore, 'linked worktrees do not load another project layout or reclaim its sessions')
      }

      blockFileSave = true
      await page.evaluate('window.fixtureEditors.main.onChangeContent("README.md", "Draft saved in alpha", "main")')
      await main.getByText('Draft saved in alpha', { exact: true }).waitFor()
      await startSwap('/alpha-worktree')
      await waitForSave()
      assert.equal(workspacePosts.length, 0, 'the handoff waits for the outgoing pending autosave')
      assert.equal(active, '/alpha')
      for (const release of saveWaiters.splice(0)) release()
      blockFileSave = false
      await page.waitForFunction('window.worktreeResult === true')
      await main.getByText('Content of /alpha-worktree', { exact: true }).waitFor()
      await side.getByText('Content of /alpha-worktree / side.md', { exact: true }).waitFor()
      assert.equal(active, '/alpha-worktree')
      assert.equal(projectPath, '/alpha')
      assert.deepEqual(workspacePosts, [{ path: '/alpha-worktree', worktree: true, workspace: '/alpha' }])
      assert.equal(fileContents.get('/alpha:README.md'), 'Draft saved in alpha')
      assert.equal(fileContents.has('/alpha-worktree:README.md'), false, 'opening the worktree never writes the previous root body into its same-named file')
      await assertKeptWorkspace()

      // A renderer from the previous root may finish an edit after the swap. Its
      // old callback must not edit or autosave the target root's same-named file.
      await page.evaluate('window.fixtureEditorCallbacks["/alpha:main"]("README.md", "Late edit from alpha", "main")')
      await page.waitForTimeout(600)
      assert.equal(await main.locator('[data-test-content]').textContent(), 'Content of /alpha-worktree')
      assert.equal(fileWrites.filter(write => write.root === '/alpha-worktree').length, 0)

      await page.evaluate('window.fixtureEditors.main.onChangeContent("README.md", "Draft saved in worktree", "main")')
      await main.getByText('Draft saved in worktree', { exact: true }).waitFor()
      await startSwap('/alpha')
      await page.waitForFunction('window.worktreeResult === true')
      await main.getByText('Draft saved in alpha', { exact: true }).waitFor()
      await side.getByText('Content of /alpha / side.md', { exact: true }).waitFor()
      assert.equal(fileContents.get('/alpha-worktree:README.md'), 'Draft saved in worktree')
      assert.deepEqual(workspacePosts.at(-1), { path: '/alpha', worktree: true, workspace: '/alpha-worktree' })
      await assertKeptWorkspace()

      // Once a save has started, switching must wait for its result as well.
      // A failed save leaves the unsaved draft and original workspace intact.
      blockFileSave = true
      failFileSave = true
      await page.evaluate('window.fixtureEditors.main.onChangeContent("README.md", "Unsaved conflict in alpha", "main")')
      await waitForSave()
      const postsBeforeFailedSave = workspacePosts.length
      await startSwap('/alpha-worktree')
      await page.waitForTimeout(80)
      assert.equal(workspacePosts.length, postsBeforeFailedSave, 'an already running autosave also blocks the handoff')
      for (const release of saveWaiters.splice(0)) release()
      blockFileSave = false
      await page.waitForFunction('window.worktreeResult === false')
      assert.equal(workspacePosts.length, postsBeforeFailedSave, 'a save conflict prevents the workspace mutation')
      assert.equal(active, '/alpha')
      assert.equal(await main.locator('[data-test-content]').textContent(), 'Unsaved conflict in alpha')
      assert.equal(fileContents.get('/alpha:README.md'), 'Draft saved in alpha')
      await assertKeptWorkspace()

      failFileSave = false
      failSwitch = true
      await startSwap('/alpha-worktree')
      await page.waitForFunction('window.worktreeResult === false')
      assert.equal(active, '/alpha', 'a rejected workspace handoff retains the original file root')
      assert.equal(await main.locator('[data-test-content]').textContent(), 'Unsaved conflict in alpha')
      assert.equal(fileContents.get('/alpha:README.md'), 'Unsaved conflict in alpha', 'the retry saves only to the outgoing root before the rejected handoff')
      await assertKeptWorkspace()
      assert.deepEqual(fileWrites.map(write => ({ root: write.root, content: write.content })), [
        { root: '/alpha', content: 'Draft saved in alpha' },
        { root: '/alpha-worktree', content: 'Draft saved in worktree' },
        { root: '/alpha', content: 'Unsaved conflict in alpha' },
        { root: '/alpha', content: 'Unsaved conflict in alpha' },
      ])
      // Explicitly opening the current worktree as a separate project restores
      // that project's own tabs even though the filesystem root stays the same.
      failSwitch = false
      await startSwap('/alpha-worktree')
      await page.waitForFunction('window.worktreeResult === true')
      await assertKeptWorkspace()
      await page.keyboard.press('Alt+p')
      await page.locator('[data-project-option="/alpha-worktree"]').click()
      await page.locator('[data-test-editor="target"]').getByText('Content of /alpha-worktree / target-only.md', { exact: true }).waitFor()
      assert.equal(active, '/alpha-worktree')
      assert.equal(projectPath, '/alpha-worktree')
      assert.equal(await side.count(), 0, 'a separate project restores its own pane layout')
      assert.equal(await page.getByRole('button', { name: 'Select README.md', exact: true }).count(), 0)
      assert.deepEqual(errors, [])
      return
    }
    if (mode === 'panels') {
      for (const width of [1100, 390]) {
        await page.setViewportSize({ width, height: 800 })
        const dock = page.getByRole('navigation', { name: '작업 독', exact: true })
        await dock.waitFor()
        await dock.locator('[data-dock-item=tasks]').waitFor()
        await page.keyboard.press('Alt+f')
        assert.equal(await dock.locator('[data-dock-item=features]').count(), 0)
        const terminal = page.locator('[data-dock-item=terminal]')
        const previous = await terminal.getAttribute('aria-pressed')
        await page.keyboard.press('Alt+t')
        const panel = page.getByRole('region', { name: '태스크', exact: true })
        await panel.waitFor()
        assert.equal(await terminal.getAttribute('aria-pressed'), previous, 'Alt+T does not toggle terminal')
        const draft = panel.getByRole('textbox', { name: '새 태스크', exact: true })
        const text = `Restored task ${width}`
        await draft.fill(text)
        const saved = page.waitForResponse(response => new URL(response.url()).pathname === '/api/task-list' && response.request().method() === 'PATCH')
        await draft.press('Enter')
        await saved
        const task = panel.getByRole('textbox', { name: '태스크 내용', exact: true }).last()
        await task.waitFor()
        assert.equal(await task.inputValue(), text)
        await panel.getByRole('button', { name: '닫기', exact: true }).click()
        await panel.waitFor({ state: 'hidden' })
        await page.keyboard.press('Alt+t')
        await panel.waitFor()
        assert.equal(await task.inputValue(), text, 'closing and reopening retains the task session')
        assert.ok(requests.some(request => request.path === '/api/task-list'))
        await page.screenshot({ path: `/tmp/mew-restored-tasks-${width}.png` })
        await panel.getByRole('button', { name: '닫기', exact: true }).click()

      }
      await page.keyboard.press('Alt+t')
      await page.getByRole('region', { name: '태스크', exact: true }).waitFor()
      await page.reload()
      const restored = page.getByRole('region', { name: '태스크', exact: true })
      await restored.waitFor()
      await restored.getByRole('textbox', { name: '태스크 내용', exact: true }).last().waitFor()
      assert.equal(await restored.getByRole('textbox', { name: '태스크 내용', exact: true }).last().inputValue(), 'Restored task 390')
      assert.deepEqual(errors, [])
      return
    }
    const selectProject = async (root: string) => {
      await page.keyboard.press('Alt+p')
      await page.locator(`[data-project-option="${root}"]`).click()
      if (page.viewportSize()!.width >= 768) {
        assert.equal(await page.locator('[data-project-sidebar]').isVisible(), true, 'desktop project selection retains its panel')
        const projects = await page.locator('[data-project-sidebar]').boundingBox()
        const files = await page.locator('[data-sidebar]').boundingBox()
        assert.ok(projects && files && Math.abs(projects.x + projects.width - files.x) < 1, 'project panel precedes the file explorer')
        const toggle = await page.locator('[data-sidebar-toggle]').boundingBox()
        assert.ok(toggle && Math.abs(toggle.x - (files.x + files.width - 1)) < 1, 'file explorer toggle follows both panels')
      }
    }
    const countUi = (root: string) => requests.filter(r => r.path === '/api/user-ui/workspace' && r.method === 'GET' && r.root === root).length
    if (mode === 'rapid') {
      const failedRequests: { path: string; method: string; root?: string }[] = []
      page.on('requestfailed', request => {
        const url = new URL(request.url())
        failedRequests.push({ path: url.pathname, method: request.method(), root: request.method() === 'POST' ? request.postDataJSON()?.path : url.searchParams.get('workspace') ?? undefined })
      })
      const until = async (condition: () => boolean, message: string) => {
        const deadline = Date.now() + 3000
        while (!condition() && Date.now() < deadline) await page.waitForTimeout(10)
        assert.ok(condition(), message)
      }
      const held = async (root: string) => {
        await until(() => heldSwitchResponses.some(response => response.path === root), `${root} starts without waiting for the previous response`)
        return heldSwitchResponses.find(response => response.path === root)!
      }
      const releaseHeld = (root: string, error = false) => {
        heldSwitchPaths.delete(root)
        for (let index = heldSwitchResponses.length - 1; index >= 0; index--) {
          if (heldSwitchResponses[index].path === root) heldSwitchResponses.splice(index, 1)[0].release(error)
        }
      }
      const content = (root: string) => page.locator('[data-test-content]').getByText(`Content of ${root}`, { exact: true })
      heldSwitchPaths.add('/beta'); heldSwitchPaths.add('/gamma'); heldUiPaths.add('/beta')
      await selectProject('/beta')
      await held('/beta')
      await until(() => heldUiResponses.some(response => response.path === '/beta'), 'beta UI preparation starts')
      assert.equal(active, '/beta', 'the server commits beta before its response arrives')
      await selectProject('/beta')
      assert.equal(workspacePosts.filter(post => post.path === '/beta').length, 1, 'duplicate pending selections do not restart the request')
      const started = Date.now()
      await selectProject('/gamma')
      await held('/gamma')
      await until(() => failedRequests.some(request => request.path === '/api/workspace' && request.root === '/beta'), 'superseded beta POST is aborted')
      await until(() => failedRequests.some(request => request.path === '/api/user-ui/workspace' && request.root === '/beta'), 'obsolete beta UI preparation is aborted')
      releaseHeld('/beta', true)
      heldUiPaths.delete('/beta')
      for (const response of heldUiResponses.splice(0)) response.release()
      await loading.waitFor()
      await content('/alpha').waitFor()
      assert.equal(await page.getByText('obsolete project error', { exact: true }).count(), 0, 'an obsolete failure does not show a toast')
      releaseHeld('/gamma')
      await content('/gamma').waitFor({ state: 'attached' })
      await loading.waitFor({ state: 'detached' })
      assert.equal(active, '/gamma')
      assert.equal(requests.some(request => request.path === '/api/tree' && request.root === '/beta'), false, 'canceled beta never hydrates its file tree')
      console.log(`latest project starts while obsolete response is held; gamma ready in ${Date.now() - started}ms`)
      // On mobile, tapping another root and then selecting the displayed root
      // must restore it through POST: beta may already be committed server-side.
      await page.setViewportSize({ width: 390, height: 700 })
      await page.locator('button[data-project-switcher][data-header-menu-trigger]').waitFor()
      heldSwitchPaths.add('/beta')
      await page.keyboard.press('Alt+p')
      await page.locator('[data-project-option="/beta"]').tap()
      await held('/beta')
      const gammaPosts = workspacePosts.filter(post => post.path === '/gamma').length
      await page.keyboard.press('Alt+3')
      await until(() => workspacePosts.filter(post => post.path === '/gamma').length === gammaPosts + 1, 'selecting the displayed root supersedes the pending project')
      await until(() => active === '/gamma', 'the server returns to the displayed root')
      releaseHeld('/beta')
      await loading.waitFor({ state: 'detached' })
      await content('/gamma').waitFor({ state: 'attached' })
      // A failed replacement preserves restoration already owned by the
      // displayed root, even if its metadata was still pending at selection.
      heldUiPaths.add('/gamma')
      await page.locator('header').evaluate(element => element.ownerDocument.defaultView!.dispatchEvent(new Event('mew:permissions-changed')))
      await until(() => heldUiResponses.some(response => response.path === '/gamma'), 'the current root begins uncached restoration')
      failSwitch = true
      await page.keyboard.press('Alt+1')
      await page.getByText('missing folder', { exact: true }).waitFor()
      assert.equal(failedRequests.some(request => request.path === '/api/user-ui/workspace' && request.root === '/gamma'), false, 'failed selection does not cancel the displayed root metadata')
      heldUiPaths.delete('/gamma')
      for (const response of heldUiResponses.splice(0)) response.release()
      await content('/gamma').waitFor({ state: 'attached' })
      await loading.waitFor({ state: 'detached' })
      assert.equal(active, '/gamma')
      assert.deepEqual(errors, [])
      return
    }
    const explorerToggle = page.locator('[data-explorer-toggle]')
    const explorerScope = explorerToggle.locator('button[aria-pressed="true"]')
    assert.equal(await explorerToggle.getByRole('combobox').count(), 0, 'file/document scope keeps its two-button toggle')
    assert.equal(await explorerToggle.getByRole('button', { name: '문서', exact: true }).count(), 1)
    assert.equal(await explorerToggle.getByRole('button', { name: '파일', exact: true }).count(), 1)
    const selectExplorerScope = async (label: '문서' | '파일', touch = false) => {
      const button = explorerToggle.getByRole('button', { name: label, exact: true })
      if (touch) await button.tap()
      else await button.click()
      assert.equal(await button.getAttribute('aria-pressed'), 'true')
      assert.equal((await explorerScope.innerText()).trim(), label)
    }
    assert.equal((await explorerScope.innerText()).trim(), '파일')
    const docsFolder = page.locator('[data-tree-key="sidebar-tree:root:/alpha"] [data-path="docs"]')
    assert.ok((await page.locator('[data-path="assets"]').boundingBox())!.y < (await docsFolder.boundingBox())!.y, 'docs follows the normal folder order')
    assert.ok((await docsFolder.boundingBox())!.y < (await page.locator('[data-path="src"]').boundingBox())!.y)
    await page.locator('[data-path="src"]').click()
    await page.locator('[data-path="src/child.ts"]').click()
    await page.getByRole('button', { name: 'Close src/child.ts', exact: true }).waitFor()
    assert.equal(active, '/alpha', 'subproject files open without switching the current project')
    await page.getByRole('button', { name: 'Close src/child.ts', exact: true }).click()
    assert.equal(await page.locator('[data-subproject-link="src"]').count(), 1, 'App keeps subprojects in the normal folder tree')
    assert.equal(await page.locator('[data-path="@subproject:src"]').count(), 0)
    await page.locator('[data-path="src"]').click()
    await docsFolder.click()
    assert.equal((await explorerScope.innerText()).trim(), '파일', 'folder expansion stays in Files')
    await page.locator('[data-path="docs/MOC.md"]').waitFor()
    assert.equal(await page.locator('[data-path="docs/MOC.md"]').innerText(), 'MOC.md')
    await page.locator('[data-path="docs/example.ts"]').click()
    await page.getByRole('button', { name: 'Close docs/example.ts', exact: true }).waitFor()
    assert.equal((await explorerScope.innerText()).trim(), '파일', 'raw document files open in Files')
    await page.getByRole('button', { name: 'Close docs/example.ts', exact: true }).click()
    await docsFolder.click()
    assert.equal(await page.locator('[data-path="docs/MOC.md"]').count(), 0, 'folder can collapse')
    await page.locator('[data-documents-link]').click()
    assert.equal((await explorerScope.innerText()).trim(), '문서')
    const graphEntry = page.locator('[data-docs-graph-entry]')
    assert.equal(await graphEntry.count(), 1)
    assert.ok((await graphEntry.boundingBox())!.y < (await page.locator('[data-tree-key="sidebar-tree:docs:/alpha"] [data-path="MOC.md"]').boundingBox())!.y)
    await page.locator('[data-sidebar]').getByRole('button', { name: '새 문서', exact: true }).click()
    await page.locator('[data-tree-key="sidebar-tree:docs:/alpha"]').getByPlaceholder('새 문서 이름').waitFor()
    await page.keyboard.press('Escape')
    assert.equal(await page.locator('[data-tree-key="sidebar-tree:root:/alpha"]').count(), 0)
    assert.equal(await page.locator('[data-documents-link]').count(), 0)
    await explorerScope.focus()
    await page.keyboard.press('Enter')
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    assert.equal((await explorerScope.innerText()).trim(), '파일')
    await page.locator('[data-sidebar]').getByRole('button', { name: '새 파일', exact: true }).click()
    await page.locator('[data-tree-key="sidebar-tree:root:/alpha"]').getByPlaceholder('새 파일 이름').waitFor()
    await page.keyboard.press('Escape')
    await explorerScope.focus()
    assert.equal(await page.locator('[data-tree-key="sidebar-tree:docs:/alpha"]').count(), 0)
    await page.keyboard.press('Enter')
    await page.keyboard.press('Home')
    await page.keyboard.press('Enter')
    assert.equal((await explorerScope.innerText()).trim(), '문서')
    await page.keyboard.press('ArrowRight')
    assert.equal((await explorerScope.innerText()).trim(), '파일')
    await page.keyboard.press('ArrowLeft')
    assert.equal((await explorerScope.innerText()).trim(), '문서')
    if (mode === 'documents') {
      for (const width of [1100, 390]) {
        await page.setViewportSize({ width, height: 700 })
        await page.evaluate(`document.documentElement.classList.toggle('dark', ${width === 390})`)
        await selectExplorerScope('파일')
        await docsFolder.click()
        await page.locator('[data-path="docs/example.ts"]').waitFor()
        await page.screenshot({ path: `/tmp/mew-docs-folder-${width}.png` })
        await page.locator('[data-documents-link]').click()
        assert.equal((await explorerScope.innerText()).trim(), '문서')
        await selectExplorerScope('파일')
        await page.locator('[data-path="docs/example.ts"]').waitFor()
        await docsFolder.click()
      }
      assert.deepEqual(errors, [])
      return
    }
    if (keyboardOnly) {
      for (const [width, modifier] of [[1100, 'Control'], [390, 'Meta']] as const) {
        await page.setViewportSize({ width, height: 700 })
        await page.evaluate(`document.documentElement.classList.toggle('dark', ${width === 390})`)
        await explorerScope.focus()
        await page.keyboard.press(`${modifier}+o`)
        const fileDialog = page.getByRole('dialog', { name: '서버 파일 탐색기', exact: true })
        await fileDialog.getByRole('button', { name: '.zshrc', exact: true }).waitFor()
        await page.screenshot({ path: `/tmp/mew-open-file-${width}.png` })
        await fileDialog.getByRole('button', { name: '.zshrc', exact: true }).click()
        await fileDialog.waitFor({ state: 'detached' })
        await page.locator('[data-test-content]').getByText('External shell configuration', { exact: true }).waitFor()
        assert.equal(await page.locator('[data-test-editor]').getAttribute('data-test-active'), '@fs:/home/test/.zshrc')
        assert.equal(active, '/alpha', 'opening an external file retains the current project')
        assert.equal(requests.filter(r => r.path === '/api/workspace' && r.method === 'POST').length, 0)
        assert.equal(await page.locator('[data-test-editor]').isVisible(), true, 'external file opening brings the mobile editor forward')
        await page.keyboard.press(`${modifier}+Shift+o`)
        const projectDialog = page.getByRole('dialog', { name: '새 프로젝트 열기', exact: true })
        await projectDialog.getByRole('button', { name: 'config', exact: true }).waitFor()
        assert.equal(await projectDialog.getByRole('button', { name: '.zshrc', exact: true }).count(), 0, 'project opening lists folders only')
        await page.screenshot({ path: `/tmp/mew-open-project-${width}.png` })
        await page.keyboard.press('Escape')
        await projectDialog.waitFor({ state: 'detached' })
        await page.getByRole('button', { name: 'Select README.md', exact: true }).click()
      }
      await page.setViewportSize({ width: 1100, height: 700 })
      assert.equal(await page.locator('[data-current-project="/alpha"]').count(), 1)
      await selectExplorerScope('문서')
      for (const combo of ['Control+n', 'Control+t']) {
        await explorerScope.focus(); await page.keyboard.press(combo)
        await page.locator('[data-tree-key="sidebar-tree:docs:/alpha"]').getByPlaceholder('새 문서 이름').waitFor()
        await page.keyboard.press('Escape')
      }
      await selectExplorerScope('파일')
      await explorerScope.focus(); await page.keyboard.press('Control+Shift+n')
      await page.locator('[data-tree-key="sidebar-tree:root:/alpha"]').getByPlaceholder('새 폴더 이름').waitFor()
      await page.keyboard.press('Escape'); await selectExplorerScope('문서')
      await page.getByRole('button', { name: 'Select extra.md', exact: true }).click()
      await page.getByRole('button', { name: 'Select extra.md', exact: true }).focus()
      await page.keyboard.press('Control+w')
      assert.equal(await page.getByRole('button', { name: 'Select extra.md', exact: true }).count(), 0, 'close applies to the active editor tab')
      await page.getByRole('button', { name: 'Select README.md', exact: true }).click()
      await page.keyboard.press('Alt+2')
      await page.locator('[data-test-content]').getByText('Content of /beta', { exact: true }).waitFor()
      const switches = requests.filter(r => r.path === '/api/workspace' && r.method === 'POST').length
      await page.keyboard.press('Alt+9'); await page.keyboard.press('Alt+2')
      assert.equal(requests.filter(r => r.path === '/api/workspace' && r.method === 'POST').length, switches, 'missing and current project positions do not repeat a workspace handoff')
      await page.keyboard.press('Alt+1')
      await page.locator('[data-test-content]').getByText('Content of /alpha', { exact: true }).waitFor()
      role = 'manager'
      await page.reload()
      await page.locator('[data-test-content]').getByText('Content of /alpha', { exact: true }).waitFor()
      await page.keyboard.press('Control+o')
      await page.getByRole('dialog', { name: '서버 파일 탐색기', exact: true }).waitFor()
      await page.keyboard.press('Escape')
      await page.getByRole('dialog').waitFor({ state: 'detached' })
      await page.keyboard.press('Control+Shift+o')
      await page.getByRole('dialog', { name: '새 프로젝트 열기', exact: true }).waitFor()
      await page.keyboard.press('Escape')
      await page.getByRole('dialog').waitFor({ state: 'detached' })
      await page.keyboard.press('Alt+p')
      await page.locator('[data-project-option="/beta"]').click()
      await page.locator('[data-test-content]').getByText('Content of /beta', { exact: true }).waitFor()
      await page.keyboard.press('Alt+1')
      await page.locator('[data-test-content]').getByText('Content of /alpha', { exact: true }).waitFor()
      role = 'member'
      await page.reload()
      await page.locator('[data-test-content]').getByText('Content of /alpha', { exact: true }).waitFor()
      assert.equal(await page.locator('button[data-project-switcher]').count(), 0, 'member cannot switch projects')
      await page.keyboard.press('Control+Shift+o')
      assert.equal(await page.getByRole('dialog').count(), 0, 'member cannot open the project picker')
      role = 'manager'
      serverFiles = false
      await page.reload()
      await page.locator('[data-test-content]').getByText('Content of /alpha', { exact: true }).waitFor()
      const browseCount = requests.filter(r => r.path === '/api/fs/entries').length
      await page.keyboard.press('Control+o')
      assert.equal(await page.getByRole('dialog').count(), 0, 'file opening requires server file access')
      assert.equal(requests.filter(r => r.path === '/api/fs/entries').length, browseCount)
      assert.deepEqual(errors, [])
      return
    }
    if (process.env.MEW_EXPLORER_SCREENSHOTS) {
      await fs.mkdir(process.env.MEW_EXPLORER_SCREENSHOTS, { recursive: true })
      await page.locator('[data-sidebar]').screenshot({ path: path.join(process.env.MEW_EXPLORER_SCREENSHOTS, 'desktop-documents.png') })
      await selectExplorerScope('파일')
      await page.locator('[data-sidebar]').screenshot({ path: path.join(process.env.MEW_EXPLORER_SCREENSHOTS, 'desktop-files.png') })
      await selectExplorerScope('문서')
    }
    await page.locator('[data-tree-key="sidebar-tree:docs:/alpha"] [data-path="alpha.md"]').click({ modifiers: ['Control'] })
    await page.getByRole('button', { name: 'Close mew:file:docs/alpha.md' }).waitFor()
    await page.getByRole('button', { name: 'Close README.md' }).waitFor()
    await page.getByRole('button', { name: 'Select extra.md', exact: true }).click()
    assert.equal((await explorerScope.innerText()).trim(), '파일', 'file-tab reveal selects its explorer scope')
    assert.equal(await page.locator('[data-docs-graph-entry]').count(), 0)
    assert.equal(await page.getByRole('button', { name: 'Close mew:file:docs/alpha.md' }).isVisible(), true, 'Documents remains in the same pane when a root file is selected')
    await selectProject('/alpha')
    await page.getByRole('button', { name: 'Close README.md' }).waitFor()
    const signal = () => page.evaluate(() => (globalThis as unknown as { presence: { onmessage: (e: { data: string }) => void } }).presence.onmessage({ data: JSON.stringify({ type: 'workspace' }) }))
    blockSwitch = true; blockUi = true
    const handoffsBeforePreview = requests.filter(r => r.path === '/api/workspace' && r.method === 'POST').length
    const filesBeforePreview = requests.filter(r => r.path === '/api/file' || r.path === '/api/tree').length
    await page.keyboard.press('Alt+p')
    await page.locator('[data-project-option="/beta"]').hover()
    await page.waitForTimeout(80)
    assert.ok(releaseUi, 'hover starts cold metadata preparation before selection')
    assert.equal(countUi('/beta'), 1)
    assert.equal(active, '/alpha', 'preview retains the current server root')
    assert.equal(requests.filter(r => r.path === '/api/workspace' && r.method === 'POST').length, handoffsBeforePreview)
    assert.equal(requests.filter(r => r.path === '/api/file' || r.path === '/api/tree').length, filesBeforePreview, 'preview never reads root-relative files or trees')
    assert.equal(requests.filter(r => r.path === '/api/user-ui/agent-tabs' && r.root === '/beta').length, 0, 'session claims stay fresh until the actual selection')
    const previewResponse = page.waitForResponse(response => response.url().includes('/api/user-ui/workspace?workspace=%2Fbeta') && response.request().method() === 'GET')
    releaseUi!(); blockUi = false
    await previewResponse
    await page.locator('[data-project-option="/beta"]').click()
    await page.waitForTimeout(80)
    assert.ok(releaseSwitch, 'switch request starts')
    assert.equal(countUi('/beta'), 1, 'selection reuses the preview response without another metadata round trip')
    assert.equal(requests.filter(r => r.path === '/api/user-ui/agent-tabs' && r.root === '/beta').length, 1, 'agent metadata also starts before the switch completes')
    assert.equal(active, '/alpha')
    await loading.waitFor()
    for (const width of [1100, 390]) {
      await page.setViewportSize({ width, height: 700 })
      assert.deepEqual(await loading.boundingBox(), { x: 0, y: 0, width, height: 700 })
      await page.screenshot({ path: `/tmp/mew-project-loading-${width}.png` })
    }
    await page.setViewportSize({ width: 1100, height: 700 })
    await page.keyboard.press('Tab')
    assert.equal(await loading.evaluate(el => el.contains(el.ownerDocument.activeElement)), false, 'loading does not capture keyboard focus')
    assert.equal(await page.locator('header').getByText('프로젝트 여는 중…').count(), 0)
    await page.locator('[data-test-content]').getByText('Content of /alpha', { exact: true }).waitFor()
    releaseSwitch!(); blockSwitch = false
    await page.locator('[data-test-content]').getByText('Content of /beta', { exact: true }).waitFor()
    await loading.waitFor({ state: 'detached' })
    assert.equal(countUi('/beta'), 1, 'prefetch is reused by hydration')
    assert.equal(await page.evaluate(() => (globalThis as unknown as { preparedAgentRoot: string }).preparedAgentRoot), '/beta')
    const layoutDock = page.getByRole('navigation', { name: '작업 독' })
    const dockBounds = (await layoutDock.boundingBox())!
    const railSidebarBounds = (await page.locator('[data-sidebar]').boundingBox())!
    assert.equal(dockBounds.x, 0)
    assert.equal(dockBounds.y, 44)
    assert.ok(dockBounds.width <= 48 && dockBounds.height > dockBounds.width)
    const projectPanelBounds = (await page.locator('[data-project-sidebar]').boundingBox())!
    assert.ok(Math.abs(projectPanelBounds.x - (dockBounds.x + dockBounds.width)) <= 1, 'the project panel follows the dock with at most a divider between them')
    assert.equal(railSidebarBounds.x, projectPanelBounds.x + projectPanelBounds.width)
    const railToggleBounds = (await page.locator('[data-sidebar-toggle]').boundingBox())!
    assert.equal(railToggleBounds.x, railSidebarBounds.x + railSidebarBounds.width - 1)
    await page.locator('[data-sidebar-toggle]').click()
    await page.locator('[data-sidebar]').waitFor({ state: 'hidden' })
    assert.equal(await layoutDock.isVisible(), true, 'sidebar collapse keeps the dock available')
    assert.equal((await page.locator('[data-sidebar-toggle]').boundingBox())!.x, railSidebarBounds.x)
    await page.locator('[data-sidebar-toggle]').click()
    await page.locator('[data-sidebar]').waitFor({ state: 'visible' })
    await page.screenshot({ path: '/tmp/mew-sidebar-dock-app.png' })
    const treeCount = requests.filter(r => r.path === '/api/tree').length
    await signal(); await page.waitForTimeout(100)
    assert.equal(requests.filter(r => r.path === '/api/tree').length, treeCount, 'duplicate broadcast does not empty or reload trees')
    // Mobile tab changes retain the editor; only reselecting the active tab reveals the sidebar.
    await page.setViewportSize({ width: 390, height: 700 })
    const mobileEditor = page.getByRole('navigation', { name: '작업 독' }).getByRole('button', { name: '에디터 화면', exact: true })
    await mobileEditor.tap()
    await page.getByRole('button', { name: 'Select extra.md', exact: true }).tap()
    assert.equal(await page.locator('[data-test-editor]').getAttribute('data-test-active'), 'extra.md')
    assert.equal(await page.locator('[data-sidebar]').isVisible(), false, 'switching files keeps the mobile editor in front')
    await page.getByRole('button', { name: 'Select extra.md', exact: true }).tap()
    await page.locator('[data-sidebar]').waitFor({ state: 'visible' })
    await mobileEditor.tap()
    await page.getByRole('button', { name: 'Select README.md', exact: true }).tap()
    assert.equal(await page.locator('[data-sidebar]').isVisible(), false)
    await page.setViewportSize({ width: 1100, height: 700 })
    await page.getByRole('button', { name: 'Close extra.md' }).click()
    await page.waitForTimeout(30)
    const iconReadsBeforeWarmSwitch = requests.filter(r => r.path === '/api/project-icons/read').length
    blockTree = true
    blockFileRoot = '/alpha'
    const warmStarted = Date.now()
    await selectProject('/alpha')
    await page.locator('[data-test-content]').getByText('Content of /alpha', { exact: true }).waitFor()
    assert.equal(countUi('/alpha'), 1, 'warm root does not wait for another UI GET')
    assert.equal(requests.filter(r => r.path === '/api/project-icons/read').length, iconReadsBeforeWarmSwitch, 'warm switching reuses project icons without rereading every project folder')
    await page.locator('[data-path="alpha.md"]').first().waitFor()
    assert.ok(treeWaiters.length > 0, 'cached tree is visible while its refresh is still blocked')
    assert.ok(fileWaiters.length > 0, 'cached file is visible while refresh is blocked')
    console.log(`warm workspace restore: ${Date.now() - warmStarted}ms; UI metadata GETs on return: 0`)
    for (const release of treeWaiters.splice(0)) release()
    blockTree = false
    await page.waitForTimeout(100)
    assert.ok(persisted.has('/beta'), 'leaving before 500ms flushes the last outgoing layout')
    assert.equal((persisted.get('/beta') as { tabs: Record<string, unknown> }).tabs.docs, undefined, 'old-root Documents tabs must not be saved into the new root')
    await loading.waitFor()
    assert.equal(await loading.evaluate(el => el.ownerDocument.defaultView!.getComputedStyle(el).pointerEvents), 'none', 'warm body refresh leaves the workspace interactive')
    // Another client may change the server workspace during the pending refresh.
    active = '/beta'
    await signal()
    await page.locator('[data-test-content]').getByText('Content of /beta', { exact: true }).waitFor()
    assert.equal(await page.getByRole('button', { name: 'Close extra.md' }).count(), 0, 'recent close survives quick round trip')
    blockFileRoot = null
    for (const release of fileWaiters.splice(0)) release()
    await page.waitForTimeout(100)
    await page.locator('[data-test-content]').getByText('Content of /beta', { exact: true }).waitFor()
    const betaCache = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.includes('mew:content:') && key.includes('/beta:')).map(([, value]) => value).join(''))
    assert.doesNotMatch(betaCache, /Late response/, 'late old-root response cannot pollute the current content cache')
    failSwitch = true
    blockSwitch = true
    await selectProject('/alpha')
    await loading.waitFor()
    await page.waitForTimeout(100)
    releaseSwitch!(); blockSwitch = false
    await loading.waitFor({ state: 'detached' })
    await page.locator('[data-test-content]').getByText('Content of /beta', { exact: true }).waitFor()
    assert.equal(active, '/beta', 'failed switch retains current project')
    // Re-entry and reconnect refresh several independent reads; none may hide the
    // overlay before the last one settles. Keep the existing workspace underneath.
    for (const [width, trigger] of [[1100, 'visibility'], [390, 'pageshow'], [1100, 'reconnect']] as const) {
      await page.setViewportSize({ width, height: 700 })
      await page.evaluate(`document.documentElement.classList.toggle('dark', ${width === 1100})`)
      blockAuth = true; blockAccess = true; blockTree = true
      if (trigger === 'visibility') await page.evaluate(`(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
        document.dispatchEvent(new Event('visibilitychange'));
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
        document.dispatchEvent(new Event('visibilitychange'));
      })()`)
      else if (trigger === 'pageshow') await page.evaluate("window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))")
      else await page.evaluate('window.presence.onopen()')
      await loading.waitFor()
      await page.waitForTimeout(100)
      assert.ok(authWaiters.length && accessWaiters.length && treeWaiters.length, 'resume starts auth, access and tree revalidation')
      assert.deepEqual(await loading.boundingBox(), { x: 0, y: 0, width, height: 700 })
      assert.equal(await loading.evaluate(el => el.ownerDocument.defaultView!.getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)')
      assert.equal(await page.locator('[data-test-content]').textContent(), 'Content of /beta')
      if (trigger !== 'reconnect') await page.screenshot({ path: `/tmp/mew-session-refresh-${width}.png` })
      await page.keyboard.press('Escape')
      await page.keyboard.press('Tab')
      assert.equal(await loading.evaluate(el => el.contains(el.ownerDocument.activeElement)), false)
      const sidebarButton = page.getByRole('navigation', { name: '작업 독' }).getByRole('button', { name: '파일 탐색기', exact: true })
      if (width !== 390 && await page.locator('[data-sidebar]').isVisible()) {
        await page.locator('[data-sidebar-toggle]').click()
        await page.locator('[data-sidebar]').waitFor({ state: 'hidden' })
      }
      if (width === 390) await sidebarButton.tap()
      else await sidebarButton.click()
      await page.locator('[data-sidebar]').waitFor({ state: 'visible' })
      await sidebarButton.focus()
      await page.keyboard.press('Tab')
      assert.equal(await sidebarButton.evaluate(el => el === el.ownerDocument.activeElement), false, 'Tab moves focus while loading')
      assert.equal(await loading.count(), 1, 'interaction keeps the pending indicator visible')
      await page.emulateMedia({ reducedMotion: 'reduce' })
      assert.equal(await loading.locator('[aria-hidden=true]').evaluate(el => el.ownerDocument.defaultView!.getComputedStyle(el).animationName), 'none')
      for (const release of authWaiters.splice(0)) release()
      blockAuth = false
      failTree = trigger === 'reconnect'
      for (const release of treeWaiters.splice(0)) release()
      blockTree = false
      await page.waitForTimeout(80)
      assert.equal(await loading.count(), 1, 'access checks still pending after other requests finish or fail')
      for (const release of accessWaiters.splice(0)) release()
      blockAccess = false
      await loading.waitFor({ state: 'detached' })
      failTree = false
      await page.emulateMedia({ reducedMotion: 'no-preference' })
    }
    blockTree = true
    await page.evaluate("window.presence.onmessage({data: JSON.stringify({type: 'tree'})})")
    await page.waitForTimeout(80)
    assert.ok(treeWaiters.length, 'ordinary file-watcher refresh is pending')
    assert.equal(await loading.count(), 0, 'routine background updates do not block the session')
    blockTree = false
    for (const release of treeWaiters.splice(0)) release()
    const dock = page.getByRole('navigation', { name: '작업 독' })
    assert.equal(await dock.isVisible(), true, 'desktop shows the sidebar dock')
    assert.equal(await page.locator('[data-sidebar-dock] .mobile-dock').count(), 1)
    assert.equal(await dock.locator('.dock-move-handle').count(), 0)
    const sidebarToggle = dock.locator('[data-dock-item=sidebar]')
    const editorToggle = dock.locator('[data-dock-item=editor]')
    const editorPanel = page.locator('[data-dock-panel^="editor:"]').first()
    await page.locator('[data-sidebar]').waitFor({ state: 'visible' })
    assert.equal(await sidebarToggle.getAttribute('aria-pressed'), 'true')
    assert.equal(await editorToggle.getAttribute('aria-pressed'), 'true', 'desktop marks every open panel')
    const highlighted = () => dock.locator('[aria-current]').getAttribute('data-dock-item')
    await page.locator('[data-test-content]').click()
    assert.equal(await highlighted(), 'editor', 'clicking an already open body updates the dock')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    for (const dark of [true, false]) {
      await page.evaluate(`document.documentElement.classList.toggle('dark', ${dark})`)
      const colors = await dock.evaluate(element => {
        const color = (selector: string) => element.ownerDocument.defaultView!.getComputedStyle(element.querySelector(selector)!).backgroundColor
        return { focused: color('[data-dock-item=editor]'), open: color('[data-dock-item=sidebar]'), closed: color('[data-dock-item=tasks]'), dock: element.ownerDocument.defaultView!.getComputedStyle(element.closest('.mew-workspace')!).backgroundColor }
      })
      assert.notEqual(colors.open, 'rgba(0, 0, 0, 0)', 'an open, unfocused panel keeps a background')
      assert.equal(colors.closed, 'rgba(0, 0, 0, 0)', 'closed panels have no highlight')
      const brightness = (color: string) => Number(color.match(/[\d.]+/g)![0]) * (color.startsWith('color(srgb ') ? 255 : 1)
      assert.ok(Math.abs(brightness(colors.focused) - brightness(colors.dock)) > Math.abs(brightness(colors.open) - brightness(colors.dock)), 'focused background is stronger than the open background in either theme')
      await page.screenshot({ path: `/tmp/mew-header-dock-app-${dark ? 'dark' : 'light'}.png` })
    }
    await page.evaluate("document.documentElement.classList.add('dark')")
    await page.locator('[data-sidebar]').click({ position: { x: 30, y: 200 } })
    assert.equal(await highlighted(), 'sidebar', 'pointer focus follows the sidebar, not the last opened panel')
    await page.getByRole('button', { name: 'Close README.md' }).focus()
    assert.equal(await highlighted(), 'editor', 'keyboard focus updates the dock')
    await page.locator('[data-sidebar] button').first().focus()
    assert.equal(await highlighted(), 'sidebar')
    await editorPanel.evaluate(el => {
      const frame = el.ownerDocument.createElement('iframe')
      frame.setAttribute('data-test-focus-frame', '')
      frame.srcdoc = '<button>Frame focus</button>'
      el.appendChild(frame)
    })
    await page.frameLocator('[data-test-focus-frame]').getByRole('button', { name: 'Frame focus' }).click()
    await page.waitForFunction(`document.querySelector('[data-dock-item=editor]').getAttribute('aria-current') === 'true'`)
    assert.equal(await highlighted(), 'editor', 'iframe focus reaches its owning panel')
    await page.locator('[data-test-focus-frame]').evaluate(el => el.remove())
    await sidebarToggle.click()
    await page.locator('[data-sidebar]').waitFor({ state: 'visible' })
    assert.equal(await sidebarToggle.getAttribute('aria-pressed'), 'true', 'selecting an open background panel keeps it open')
    assert.equal(await highlighted(), 'sidebar')
    await page.waitForFunction("document.activeElement?.closest('[data-workspace-panel]')?.getAttribute('data-workspace-panel') === 'sidebar'")
    assert.equal(await page.evaluate("document.activeElement?.closest('[data-workspace-panel]')?.getAttribute('data-workspace-panel')"), 'sidebar', 'dock selection moves keyboard focus into the panel')
    await sidebarToggle.click()
    await page.locator('[data-sidebar]').waitFor({ state: 'hidden' })
    assert.equal(await sidebarToggle.getAttribute('aria-pressed'), 'false')
    assert.equal(await sidebarToggle.getAttribute('aria-current'), null, 'closed panels cannot stay highlighted')
    assert.equal(await sidebarToggle.evaluate(el => el.ownerDocument.defaultView!.getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)', 'closing the refocused panel clears its background even while hovered')
    await editorPanel.waitFor({ state: 'visible' })
    await sidebarToggle.click()
    await page.locator('[data-sidebar]').waitFor({ state: 'visible' })
    const editorContent = await page.locator('[data-test-content]').textContent()
    await editorToggle.click()
    await editorPanel.waitFor({ state: 'visible' })
    assert.equal(await editorToggle.getAttribute('aria-pressed'), 'true', 'selecting the unfocused editor keeps its panes open')
    await page.locator('[data-test-content]').click()
    assert.equal(await highlighted(), 'editor')
    await editorToggle.click()
    await editorPanel.waitFor({ state: 'hidden' })
    assert.equal(await editorToggle.getAttribute('aria-pressed'), 'false')
    assert.equal(await editorToggle.getAttribute('aria-current'), null)
    assert.equal(await editorToggle.evaluate(el => el.ownerDocument.defaultView!.getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)', 'closing the focused panel clears its stronger highlight')
    await page.locator('[data-sidebar]').waitFor({ state: 'visible' })
    await page.setViewportSize({ width: 390, height: 700 })
    await editorToggle.tap()
    await editorPanel.waitFor({ state: 'visible' })
    await editorToggle.tap()
    await editorPanel.waitFor({ state: 'visible' })
    assert.equal(await editorToggle.getAttribute('aria-pressed'), null, 'mobile uses navigation, not toggle state')
    await page.waitForFunction(el => el!.ownerDocument.defaultView!.getComputedStyle(el!).backgroundColor === 'rgba(0, 0, 0, 0)', await editorToggle.elementHandle())
    await page.setViewportSize({ width: 1100, height: 700 })
    await page.locator('[data-test-content]').click()
    await editorToggle.click()
    await editorPanel.waitFor({ state: 'hidden' })
    await editorToggle.focus()
    await page.keyboard.press('Enter')
    await editorPanel.waitFor({ state: 'visible' })
    assert.equal(await page.locator('[data-test-content]').textContent(), editorContent, 'hiding the editor preserves its tabs and content')
    for (const panel of ['agent', 'terminal', 'git']) {
      const button = dock.locator(`[data-dock-item=${panel}]`)
      const before = await button.getAttribute('aria-pressed')
      await button.click()
      assert.equal(await button.getAttribute('aria-pressed'), 'true')
      await page.locator('[data-test-content]').click()
      await button.focus()
      await page.keyboard.press('Enter')
      assert.equal(await button.getAttribute('aria-pressed'), 'true', 'keyboard selection keeps an open background panel open')
      assert.equal(await highlighted(), panel)
      await button.click()
      assert.equal(await button.getAttribute('aria-pressed'), 'false', 'only selecting the focused panel closes it')
      if (before === 'true') await button.click()
    }
    const openMenuPanel = async (label: string) => {
      await page.getByRole('button', { name: '메뉴', exact: true }).click()
      await page.getByRole('menuitemcheckbox', { name: label, exact: true }).click()
    }
    await openMenuPanel('원격 데스크톱')
    await page.getByRole('dialog', { name: 'Remote desktop fixture' }).waitFor()
    await page.getByRole('button', { name: 'Close remote desktop', exact: true }).click()
    await page.getByRole('dialog', { name: 'Remote desktop fixture' }).waitFor({ state: 'detached' })
    assert.equal(await dock.locator('[data-dock-item=features]').count(), 0)
    await page.setViewportSize({ width: 390, height: 700 })
    await dock.waitFor()
    const sidebar = page.locator('[data-sidebar]')
    await dock.getByRole('button', { name: '에디터 화면', exact: true }).tap()
    assert.equal(await sidebar.isVisible(), false)
    await dock.getByRole('button', { name: '파일 탐색기', exact: true }).tap()
    await sidebar.waitFor({ state: 'visible' })
    await dock.getByRole('button', { name: '파일 탐색기', exact: true }).tap()
    assert.equal(await sidebar.isVisible(), true, 'selecting current dock panel does not close it')
    await dock.getByRole('button', { name: '에디터 화면', exact: true }).tap()
    await dock.getByRole('button', { name: '파일 탐색기', exact: true }).tap()
    await selectExplorerScope('문서', true)
    const toggleBounds = (await explorerToggle.boundingBox())!, sidebarBounds = (await sidebar.boundingBox())!
    assert.ok(toggleBounds.y < sidebarBounds.y + sidebarBounds.height / 2)
    assert.ok(toggleBounds.width >= sidebarBounds.width - 20)
    assert.ok(toggleBounds.y + toggleBounds.height <= sidebarBounds.y + sidebarBounds.height)
    if (process.env.MEW_EXPLORER_SCREENSHOTS) {
      await sidebar.evaluate(el => el.ownerDocument.documentElement.classList.remove('dark'))
      await page.mouse.move(0, 0)
      await sidebar.screenshot({ path: path.join(process.env.MEW_EXPLORER_SCREENSHOTS, 'mobile-documents.png') })
    }
    await selectExplorerScope('파일', true)
    if (process.env.MEW_EXPLORER_SCREENSHOTS) await sidebar.screenshot({ path: path.join(process.env.MEW_EXPLORER_SCREENSHOTS, 'mobile-files.png') })
    await sidebar.locator('[data-path="beta.md"]').first().tap()
    await dock.getByRole('button', { name: '에디터 화면', exact: true }).tap()
    const cdp = await page.context().newCDPSession(page)
    const swipe = async (dx: number) => {
      const box = (await dock.boundingBox())!
      const x = box.x + box.width / 2, y = box.y + box.height / 2
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx, y }] })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    }
    const selectedDocument = await page.locator('[data-test-editor]').getAttribute('data-test-active')
    await swipe(65)
    assert.equal(await dock.locator('[data-dock-item=sidebar]').getAttribute('aria-current'), 'page', 'left-to-right dock swipe selects the previous panel')
    assert.equal(await page.locator('[data-test-editor]').getAttribute('data-test-active'), selectedDocument, 'dock navigation preserves the selected document tab')
    await swipe(65)
    assert.equal(await dock.locator('[data-dock-item=sidebar]').getAttribute('aria-current'), 'page', 'dock swipes stop at the first visible panel')
    await swipe(-65)
    assert.equal(await page.locator('[data-test-editor]').getAttribute('data-test-active'), selectedDocument, 'returning to the editor preserves its tab')
    assert.equal(await dock.locator('[data-dock-item=editor]').getAttribute('aria-current'), 'page')
    await openMenuPanel('원격 데스크톱')
    await page.getByRole('dialog', { name: 'Remote desktop fixture' }).waitFor()
    await page.getByRole('button', { name: 'Close remote desktop', exact: true }).click()
    await page.getByRole('dialog', { name: 'Remote desktop fixture' }).waitFor({ state: 'detached' })
    await page.getByRole('button', { name: '메뉴', exact: true }).click()
    assert.equal(await page.getByRole('menuitemcheckbox', { name: '브라우저', exact: true }).count(), 0)
    await page.keyboard.press('Escape')
    assert.equal(await dock.locator('[data-dock-item=browser]').count(), 0)
    assert.equal(await dock.locator('[data-dock-item=features]').count(), 0)
    await dock.getByRole('button', { name: '파일 탐색기', exact: true }).tap()
    for (const dark of [false, true]) {
      await page.evaluate(`document.documentElement.classList.toggle('dark', ${dark})`)
      await page.screenshot({ path: `/tmp/mew-mobile-dock-app-${dark ? 'dark' : 'light'}.png` })
    }
    assert.equal(await page.locator('[data-mobile-sidebar-opener]').count(), 0)
    // Restore two real editor panes and switch them through the mobile picker.
    await page.waitForTimeout(550)
    persisted.set(active, { ...stateFor(active), tabs: { '.workspace': {
      panes: [
        { id: 'main', tabs: [{ path: 'README.md', preview: false, viewMode: 'plain' }], activePath: 'README.md' },
        { id: 'second', tabs: [{ path: 'extra.md', preview: false, viewMode: 'plain' }], activePath: 'extra.md' },
      ],
      layout: { kind: 'split', dir: 'row', kids: [{ kind: 'leaf', pane: 'main' }, { kind: 'leaf', pane: 'second' }] },
      focusedPaneId: 'main',
    } } })
    await page.locator('header').evaluate((element, workspace) => element.ownerDocument.defaultView!.localStorage.removeItem(`mew:device-layout:${encodeURIComponent('switch@example.test')}:${encodeURIComponent(workspace)}`), active)
    await page.reload()
    await dock.locator('[data-dock-item=editor]').tap()
    const panePicker = page.getByRole('combobox', { name: '편집 칸', exact: true })
    await panePicker.waitFor()
    assert.equal(await page.locator('select, datalist').count(), 0)
    await panePicker.tap()
    const list = page.getByRole('listbox')
    const listBounds = await list.boundingBox()
    assert.ok(listBounds && listBounds.x >= 0 && listBounds.x + listBounds.width <= 390)
    await page.getByRole('option', { name: '2 · extra.md', exact: true }).tap()
    assert.equal(await page.locator('[data-test-editor]:visible').getAttribute('data-test-active'), 'extra.md')
    await panePicker.click(); await panePicker.press('Escape')
    assert.equal(await list.count(), 0)
    assert.equal(await page.locator('[data-test-editor]:visible').getAttribute('data-test-active'), 'extra.md')
    await page.screenshot({ path: '/tmp/mew-mobile-pane-dropdown.png' })
    // The real App menu keeps secondary actions; workspace panels stay in the dock.
    for (const width of [390, 1100]) for (const dark of [false, true]) {
      await page.setViewportSize({ width, height: 700 })
      await page.evaluate(`document.documentElement.classList.toggle('dark', ${dark})`)
      await page.getByRole('button', { name: '메뉴', exact: true }).click()
      const menu = page.getByRole('menu', { name: '메뉴', exact: true })
      await menu.waitFor()
      for (const label of ['Git', '에이전트', '터미널']) {
        assert.equal(await menu.getByRole('menuitem', { name: new RegExp(`^${label}(?:\\s|$)`) }).count(), 0, `${label} is only in the dock`)
      }
      for (const id of ['agent', 'terminal', 'git']) {
        assert.equal(await dock.locator(`[data-dock-item=${id}]`).isVisible(), true, `${id} remains accessible`)
      }
      for (const [id, label] of [['browser', '브라우저'], ['desktop', '원격 데스크톱']]) {
        assert.equal(await dock.locator(`[data-dock-item=${id}]`).count(), 0)
        const entry = menu.getByRole('menuitemcheckbox', { name: label, exact: true })
        if (id === 'browser') assert.equal(await entry.count(), 0)
        else assert.equal(await entry.isVisible(), true)
      }
      assert.equal(await dock.locator('[data-dock-item=rag]').count(), 0)
      assert.equal(await menu.getByRole('menuitem', { name: 'RAG', exact: true }).count(), 0)
      assert.equal(await menu.getByRole('menuitem', { name: '설정', exact: true }).isVisible(), true)
      assert.equal(await page.locator('header').getByRole('button', { name: '전체화면', exact: true }).isVisible(), true)
      await page.screenshot({ path: `/tmp/mew-header-menu-${width}-${dark ? 'dark' : 'light'}.png` })
      await page.keyboard.press('Escape')
      await menu.waitFor({ state: 'detached' })
    }
    await page.setViewportSize({ width: 1100, height: 700 })
    await page.keyboard.press('Alt+p')
    const projectsPanel = page.locator('[data-project-sidebar]')
    await projectsPanel.waitFor()
    const projectResize = projectsPanel.getByRole('separator', { name: '프로젝트 패널 너비 조절' })
    const previousProjectWidth = Number(await projectResize.getAttribute('aria-valuenow'))
    await projectResize.focus(); await page.keyboard.press('ArrowRight')
    const savedProjectWidth = Math.min(360, previousProjectWidth + 16)
    assert.equal(Number(await projectResize.getAttribute('aria-valuenow')), savedProjectWidth)
    await page.locator('[data-dock-panel^="editor:"] [data-dock-grip]').first().dblclick()
    await page.locator('[data-dock-maximized]').waitFor()
    assert.equal(await projectsPanel.isVisible(), false, 'maximized editor hides the project panel')
    await page.keyboard.press('Alt+p')
    await projectsPanel.waitFor({ state: 'visible' })
    assert.equal(await page.locator('[data-dock-maximized]').count(), 0, 'Alt+P restores the workspace before focusing projects')
    await page.waitForFunction('document.activeElement?.hasAttribute("data-project-option")')
    await page.reload()
    await projectsPanel.waitFor()
    assert.equal(Number(await projectResize.getAttribute('aria-valuenow')), savedProjectWidth, 'App restores project panel width and open state across reload')
    await projectsPanel.getByRole('button', { name: '프로젝트 · 닫기', exact: true }).click()
    assert.equal(await page.locator('button[data-project-switcher]').getAttribute('aria-expanded'), 'false')
    await page.reload()
    await page.locator('button[data-project-switcher]').waitFor()
    assert.equal(await projectsPanel.count(), 0, 'App restores the closed project panel')
    assert.equal(await dock.locator('[data-dock-item=tasks]').count(), 1)
    assert.deepEqual(errors, [])
  } finally { await browser.close() }
})
