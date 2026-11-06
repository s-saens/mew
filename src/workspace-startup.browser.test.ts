import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { compile } from '@tailwindcss/node'
import { build } from 'rolldown'
import { chromium } from 'playwright-core'
import { domBrowserExecutable } from '../server/browser-dom-executable.ts'
import { startupCodeSplitting } from '../server/startup-chunks.ts'

const root = path.resolve(import.meta.dirname, '..')
const componentPath = (name: string) => path.join(root, 'src/components', `${name}.tsx`)

test('workspace chrome remains usable while editor and unopened tools download on desktop and mobile', { skip: !domBrowserExecutable(), timeout: 45_000 }, async t => {
  const source = `import React from ${JSON.stringify(import.meta.resolve('react'))};
    import { createRoot } from ${JSON.stringify(import.meta.resolve('react-dom/client'))};
    import App from ${JSON.stringify(path.join(root, 'src/AppBootstrap.tsx'))};
    import { I18nProvider } from ${JSON.stringify(path.join(root, 'src/i18n.tsx'))};
    createRoot(document.getElementById('root')).render(<I18nProvider><App /></I18nProvider>);`
  const bundle = await build({
    input: 'virtual:workspace-startup.tsx', write: false, platform: 'browser', output: { format: 'esm', codeSplitting: startupCodeSplitting },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('production'), 'import.meta.hot': 'false' } },
    plugins: [{ name: 'workspace-startup-fixture', transform(code, id) {
      if (id === path.join(root, 'src/App.tsx')) return code.replace("import('./components/AgentPanel')", "(window.startupAgentImportAt=performance.now(),window.startupPreparationOrder.push('agent'),import('./components/AgentPanel'))")
        .replace('await agentPanelPreparation.prepare(', 'await (window.startupAgentScheduledAt ??= performance.now(), agentPanelPreparation.prepare)(')
      if (id === componentPath('deferred-editor-pane')) return code.replace("import('./EditorPane').then", "(window.startupPreparationOrder.push('editor'),import('./EditorPane')).then")
      if (id === componentPath('deferred-editor-views')) return code.replace("return mode === 'plain' ?", "window.startupPreparationOrder.push('engine:' + mode); return mode === 'plain' ?")
    }, resolveId(id) {
      if (id === 'virtual:workspace-startup.tsx') return id
      if (id.endsWith('.css')) return 'virtual:style'
      if (/\.(?:png|webp|jpe?g|gif|woff2?)(?:\?url)?$/.test(id)) return 'virtual:image'
    }, async load(id) {
      if (id === 'virtual:workspace-startup.tsx') return source
      if (id === 'virtual:style') return ''
      if (id === 'virtual:image') return 'export default "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"'
      if (id === componentPath('AgentPanel')) return `import {useEffect} from ${JSON.stringify(import.meta.resolve('react'))}; export function AgentPanel(props){useEffect(()=>{window.restoredAgentWorkspace=props.workspacePath},[props.workspacePath]);return null}`
      if (id.endsWith('?raw')) return 'export default ' + JSON.stringify(await fs.readFile(id.slice(0, -4), 'utf8'))
    } }],
  })
  const chunks = bundle.output.filter(item => item.type === 'chunk')
  const entry = chunks.find(item => item.isEntry)!
  const scripts = new Map(chunks.map(item => [`/${item.fileName}`, item.code]))
  const scriptFor = (name: string) => {
    const chunk = chunks.find(item => componentPath(name) in item.modules)
    assert.ok(chunk, `${name} has its own deferred module`)
    return `/${chunk.fileName}`
  }
  const editorScript = scriptFor('EditorPane'), settingsScript = scriptFor('SettingsModal'), agentScript = scriptFor('AgentPanel')
  const closedTools = ['AdminSettingsModal', 'remote-desktop', 'FileHistoryModal', 'project-add-inline', 'project-catalog-panel'].map(scriptFor)
  assert.notEqual(editorScript, `/${entry.fileName}`)
  assert.notEqual(editorScript, settingsScript)
  const styleSources = ['src/App.tsx', 'src/components/ProjectSwitcher.tsx', 'src/components/project-add-inline.tsx', 'src/components/project-catalog-panel.tsx', 'src/components/HeaderMenu.tsx', 'src/components/header-menu-popup.tsx', 'src/components/FileTree.tsx', 'src/components/SearchPanel.tsx', 'src/components/DockWorkspace.tsx', 'src/components/mobile-dock.tsx', 'src/components/SettingsModal.tsx', 'src/components/EditorPane.tsx', 'src/components/startup-screen.tsx', 'src/components/deferred-dialog.tsx', 'src/components/panel-close-button.tsx', 'packages/ui/src/HoverTipLayer.tsx', 'packages/ui/src/select-field.tsx']
  const content = (await Promise.all(styleSources.map(file => fs.readFile(path.join(root, file), 'utf8')))).join('\n')
  const compiler = await compile(await fs.readFile(path.join(root, 'src/index.css'), 'utf8'), { base: path.join(root, 'src'), onDependency() {} })
  const css = compiler.build([...new Set(content.match(/[A-Za-z0-9_@:/.[\]()%,-]+/g))])
  const initialUi = { sidebar: { docsExpanded: false }, chrome: { sidebarOpen: true, sidebarView: 'files' }, tabs: { '.workspace': { panes: [{ id: 'main', tabs: [{ path: 'README.md', preview: false, viewMode: 'plain' }], activePath: 'README.md' }], layout: { kind: 'leaf', pane: 'main' }, focusedPaneId: 'main' } } }
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  t.after(() => browser.close())

  for (const width of [1100, 390]) await t.test(`${width === 1100 ? 'desktop' : 'mobile'} shell survives pending tool imports`, async () => {
    const page = await browser.newPage({ viewport: { width, height: 800 }, locale: 'ko-KR' })
    page.setDefaultTimeout(5000)
    const errors: string[] = [], requested = new Set<string>()
    page.on('pageerror', error => errors.push(error.message))
    let releaseEditor!: () => void, releaseSettings!: () => void
    const editorPending = new Promise<void>(resolve => { releaseEditor = resolve })
    const settingsPending = new Promise<void>(resolve => { releaseSettings = resolve })
    const gates = new Map([[editorScript, editorPending], [settingsScript, settingsPending]])
    await page.addInitScript(urgent => {
      localStorage.setItem('mew:locale', 'ko')
      localStorage.setItem('mew:mewcat-skin', 'none')
      if (urgent) localStorage.setItem('mew:agent-open', '1')
      Object.assign(window, { startupPreparationOrder: [], startupSockets: [] })
      class Socket extends EventTarget {
        static OPEN = 1
        readyState = 0
        onopen: (() => void) | null = null
        constructor() { super(); (window as any).startupSockets.push(this) }
        send() {}
        close() { this.readyState = 3 }
      }
      Object.defineProperty(globalThis, 'WebSocket', { value: Socket })
    }, width === 390)
    await page.route('http://mew-startup.test/**', async route => {
      const url = new URL(route.request().url()), method = route.request().method()
      requested.add(url.pathname)
      if (scripts.has(url.pathname)) {
        await gates.get(url.pathname)
        return route.fulfill({ contentType: 'text/javascript', body: scripts.get(url.pathname)! })
      }
      const json = (value: unknown) => route.fulfill({ json: value })
      if (url.pathname === '/api/auth/me') return json({ authenticated: true, email: 'startup@example.test', role: 'owner', mustChangePassword: false, displayName: 'Startup', avatarDataUrl: null, capabilities: { filesRead: true, filesWrite: true, agent: true, terminal: false, serverFiles: false, collaboration: false, git: true, portPreview: true, desktop: true } })
      if (url.pathname === '/api/workspace') return json({ path: '/alpha', projects: [], docs: 'docs', docsPath: '/alpha/docs', workspaceUi: { workspacePath: '/alpha', state: initialUi } })
      if (url.pathname === '/api/user-ui/root-projects') return json({ state: { paths: ['/alpha'], icons: {}, groups: [] } })
      if (url.pathname === '/api/user-ui/workspace') return json({ state: method === 'PUT' ? route.request().postDataJSON().state : initialUi })
      if (url.pathname === '/api/tree') return json({ version: 1, state: 'ready', entries: [{ name: 'README.md', path: 'README.md', type: 'file' }] })
      if (url.pathname === '/api/file-access') return json({ view: true, edit: true })
      if (url.pathname === '/api/file') return json({ path: url.searchParams.get('path'), content: 'Startup document', editable: true })
      if (url.pathname === '/api/projects' || url.pathname === '/api/members') return json([])
      if (url.pathname === '/api/project-icons/read') return json({ icons: {} })
      if (url.pathname === '/api/mewpet/skins') return json({ skins: [] })
      if (url.pathname.startsWith('/api/')) return json({})
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script type="module" src="/${entry.fileName}"></script></html>` })
    })
    try {
      const editorRequested = page.waitForRequest(request => new URL(request.url()).pathname === editorScript)
      await page.goto('http://mew-startup.test/', { waitUntil: 'domcontentloaded' })
      const menu = page.getByRole('button', { name: '메뉴', exact: true })
      await menu.waitFor()
      await page.waitForFunction('window.restoredAgentWorkspace === "/alpha"')
      const preparation = await page.evaluate(() => (window as any).startupPreparationOrder as string[])
      const agentDelay = await page.evaluate('window.startupAgentImportAt-window.startupAgentScheduledAt') as number
      assert.ok(width === 390 ? agentDelay < 80 : agentDelay >= 200, `visible agents start immediately; closed background code waits250ms: ${agentDelay}`)
      assert.equal(preparation.filter(value => value === 'agent').length, 1, 'urgent and background preparation share one import')
      assert.ok(preparation.indexOf('engine:plain') >= 0 && preparation.indexOf('engine:plain') < preparation.indexOf('editor'), 'the accepted initial UI prepares the selected engine before pane registration: ' + JSON.stringify(preparation))
      assert.ok(preparation.indexOf('editor') >= 0 && preparation.indexOf('editor') < preparation.indexOf('agent'), 'editor preparation starts before background agent module fanout: ' + JSON.stringify(preparation))
      assert.equal(requested.has(agentScript), true, 'background agent preparation continues while the editor is held')
      // Establish presence after the initial HTTP snapshot, then exercise its permission refresh.
      await page.evaluate(() => { for (const socket of (window as any).startupSockets) { socket.readyState = 1; socket.onopen?.() } })
      if (width === 390) await page.locator('.mobile-dock').getByRole('button', { name: '파일 탐색기', exact: true }).click()
      const sidebar = page.locator('[data-sidebar]')
      await sidebar.waitFor()
      const scopes = sidebar.locator('[data-explorer-toggle]')
      const scope = scopes.getByRole('button', { name: '문서', exact: true })
      assert.equal(await scopes.getByRole('combobox').count(), 0, 'scope uses the existing document/file toggle')
      await scope.click()
      assert.equal(await scope.getAttribute('aria-pressed'), 'true')
      assert.equal(await scopes.getByRole('button', { name: '파일', exact: true }).getAttribute('aria-pressed'), 'false')
      assert.equal(await sidebar.getByRole('textbox', { name: '파일명 검색', exact: true }).isVisible(), true)
      assert.equal(await sidebar.locator('[data-numbered-tab], [role="tab"]').count(), 0)
      await editorRequested
      assert.equal(requested.has(editorScript), true, 'editor code is pending after the real shell appears')
      assert.equal(await page.locator('[data-dock-tab-bar]').count(), 0, 'editor renderer has not mounted')
      for (const script of [settingsScript, ...closedTools]) assert.equal(requested.has(script), false, `${script} is not downloaded while closed`)

      await menu.click()
      const popup = page.getByRole('menu', { name: '메뉴', exact: true })
      await Promise.all([page.waitForRequest(request => new URL(request.url()).pathname === settingsScript), popup.getByText('설정', { exact: true }).click()])
      await popup.waitFor({ state: 'detached' })
      assert.equal(requested.has(settingsScript), true, 'opening settings starts its download')
      const pendingSettings = page.getByRole('dialog', { name: '설정', exact: true })
      await pendingSettings.waitFor()
      assert.equal(await pendingSettings.getByRole('status', { name: '불러오는 중…' }).isVisible(), true, 'settings shell appears before its code arrives')
      assert.equal(await menu.isVisible(), true, 'pending settings does not replace the shell')
      await pendingSettings.getByRole('button', { name: '닫기', exact: true }).click()
      await pendingSettings.waitFor({ state: 'detached' })
      const filesScope = scopes.getByRole('button', { name: '파일', exact: true })
      await filesScope.click()
      assert.equal(await filesScope.getAttribute('aria-pressed'), 'true')
      assert.equal(await scope.getAttribute('aria-pressed'), 'false')
      for (const script of closedTools) assert.equal(requested.has(script), false)

      await menu.click()
      await popup.getByText('설정', { exact: true }).click()
      releaseSettings()
      const settings = page.getByRole('dialog', { name: '설정', exact: true })
      await settings.getByRole('navigation').waitFor()
      await page.keyboard.press('Escape')
      await settings.waitFor({ state: 'detached' })
      releaseEditor()
      await page.locator('[data-dock-tab-bar]').waitFor({ state: 'attached' })
      assert.equal(await menu.isVisible(), true)
      assert.deepEqual(errors, [])
    } finally {
      releaseEditor(); releaseSettings()
      await page.close()
    }
  })
})
