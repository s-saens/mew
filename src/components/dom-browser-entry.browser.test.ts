import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { compile } from '@tailwindcss/node'
import { build } from 'rolldown'
import { chromium } from 'playwright-core'
import { domBrowserExecutable } from '../../server/browser-dom-executable.ts'

const root = path.resolve(import.meta.dirname, '../..')

test('localhost links open the real workspace browser dock on desktop and mobile and obey permission revocation', { skip: !domBrowserExecutable(), timeout: 45_000 }, async t => {
  const auth = {
    authenticated: true, email: 'browser-entry@example.test', role: 'owner', mustChangePassword: false,
    displayName: 'Browser entry', avatarDataUrl: null,
    capabilities: { filesRead: true, filesWrite: true, agent: false, terminal: false, serverFiles: false, collaboration: false, git: false, portPreview: true, desktop: false },
  }
  const source = `import React from ${JSON.stringify(import.meta.resolve('react'))};
    import {createRoot} from ${JSON.stringify(import.meta.resolve('react-dom/client'))};
    import App from ${JSON.stringify(path.join(root, 'src/App.tsx'))};
    import {I18nProvider} from ${JSON.stringify(path.join(root, 'src/i18n.tsx'))};
    function Fixture(){const [auth,setAuth]=React.useState(${JSON.stringify(auth)});
      window.setBrowserAllowed=allowed=>setAuth(current=>({...current,capabilities:{...current.capabilities,portPreview:allowed}}));
      return <I18nProvider><App auth={auth}/></I18nProvider>}
    createRoot(document.getElementById('root')).render(<Fixture/>);`
  // Keep App, permissions, capture listeners, dock layout and mobile foreground real;
  // isolate the two renderers so this test needs neither a local app nor a browser server.
  const editor = `export function DeferredEditorPane(){return <article data-entry-editor>
    <a data-local-link href="http://localhost:5173/nested?mode=preview#section" target="_blank" onClick={()=>{window.nativeEditorClicks=(window.nativeEditorClicks||0)+1}}>Local app</a>
    <a data-second-link href="http://127.0.0.1:8080/other?x=1#next" target="_blank">Second local app</a>
    </article>}`
  const panel = `export function DomBrowserPanel({url,navigationRequest,onClose}){return <div data-entry-browser data-url={url} data-request={navigationRequest}>
    <output aria-label="Requested browser URL">{url}</output><button onClick={onClose}>Close test browser</button></div>}`
  const bundle = await build({
    input: 'virtual:browser-entry.tsx', logLevel: 'silent', write: false, platform: 'browser', output: { format: 'esm' },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('production'), 'import.meta.hot': 'false' } },
    plugins: [{ name: 'browser-entry-fixture', resolveId(id) {
      if (id === 'virtual:browser-entry.tsx') return id
      if (id.endsWith('/deferred-editor-pane')) return 'virtual:editor.tsx'
      if (id.endsWith('/DomBrowserPanel')) return 'virtual:browser.tsx'
      if (id.endsWith('.css')) return 'virtual:style'
      if (/\.(?:png|webp|jpe?g|gif|woff2?)(?:\?url)?$/.test(id)) return 'virtual:image'
    }, async load(id) {
      if (id === 'virtual:browser-entry.tsx') return source
      if (id === 'virtual:editor.tsx') return editor
      if (id === 'virtual:browser.tsx') return panel
      if (id === 'virtual:style') return ''
      if (id === 'virtual:image') return 'export default "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"'
      if (id.endsWith('?raw')) return 'export default ' + JSON.stringify(await fs.readFile(id.slice(0, -4), 'utf8'))
    } }],
  })
  const chunks = bundle.output.filter(item => item.type === 'chunk')
  const entry = chunks.find(item => item.isEntry)!
  const scripts = new Map(chunks.map(item => [`/${item.fileName}`, item.code]))
  const styleSources = ['src/App.tsx', 'src/components/DockWorkspace.tsx', 'src/components/mobile-dock.tsx', 'src/components/ProjectSwitcher.tsx', 'src/components/HeaderMenu.tsx', 'src/components/header-menu-popup.tsx', 'src/components/FileTree.tsx', 'packages/ui/src/HoverTipLayer.tsx']
  const content = (await Promise.all(styleSources.map(file => fs.readFile(path.join(root, file), 'utf8')))).join('\n')
  const compiler = await compile(await fs.readFile(path.join(root, 'src/index.css'), 'utf8'), { base: path.join(root, 'src'), onDependency() {} })
  const css = compiler.build([...new Set(content.match(/[A-Za-z0-9_@:/.[\]()%,-]+/g))])
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  t.after(() => browser.close())

  for (const mobile of [false, true]) await t.test(mobile ? 'mobile foreground and access changes' : 'desktop dock and access changes', async () => {
    const context = await browser.newContext({ viewport: { width: mobile ? 390 : 1100, height: 844 }, hasTouch: mobile, isMobile: mobile, locale: 'en-US' })
    const page = await context.newPage()
    page.setDefaultTimeout(5000)
    const errors: string[] = [], escapedRequests: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('request', request => {
      if (new URL(request.url()).hostname !== 'mew-browser-entry.test') escapedRequests.push(request.url())
    })
    await page.addInitScript(() => {
      localStorage.setItem('mew:locale', 'en')
      localStorage.setItem('mew:mewcat-skin', 'none')
      localStorage.setItem('mew:startup-guide:install:hidden', '1')
      localStorage.setItem('mew:startup-guide:fullscreen:hidden', '1')
      class Socket extends EventTarget {
        static OPEN = 1
        readyState = 1
        onopen: (() => void) | null = null
        constructor() { super(); setTimeout(() => this.onopen?.(), 0) }
        send() {}
        close() { this.readyState = 3 }
      }
      Object.defineProperty(globalThis, 'WebSocket', { value: Socket })
    })
    await page.route('http://mew-browser-entry.test/**', route => {
      const url = new URL(route.request().url())
      if (scripts.has(url.pathname)) return route.fulfill({ contentType: 'text/javascript', body: scripts.get(url.pathname)! })
      const json = (value: unknown) => route.fulfill({ json: value })
      if (url.pathname === '/api/auth/me') return json(auth)
      if (url.pathname === '/api/workspace') return json({ path: '/alpha', projects: [], docs: 'docs', docsPath: '/alpha/docs' })
      if (url.pathname === '/api/user-ui/root-projects') return json({ state: { paths: ['/alpha'], icons: {}, groups: [] } })
      if (url.pathname === '/api/user-ui/workspace') return json({ state: route.request().method() === 'PUT' ? route.request().postDataJSON().state : { chrome: { sidebarOpen: false, sidebarView: 'files' }, tabs: { '.workspace': { panes: [{ id: 'main', tabs: [{ path: 'README.md', preview: false, viewMode: 'plain' }], activePath: 'README.md' }], layout: { kind: 'leaf', pane: 'main' }, focusedPaneId: 'main' } } } })
      if (url.pathname === '/api/tree') return json({ version: 1, state: 'ready', entries: [{ name: 'README.md', path: 'README.md', type: 'file' }] })
      if (url.pathname === '/api/file-access') return json({ view: true, edit: true })
      if (url.pathname === '/api/file') return json({ path: 'README.md', content: 'Browser fixture', editable: true })
      if (url.pathname === '/api/projects' || url.pathname === '/api/members') return json([])
      if (url.pathname === '/api/project-icons/read') return json({ icons: {} })
      if (url.pathname === '/api/mewpet/skins') return json({ skins: [] })
      if (url.pathname.startsWith('/api/')) return json({})
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html class="dark"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script type="module" src="/${entry.fileName}"></script></html>` })
    })
    try {
      await page.goto('http://mew-browser-entry.test/')
      const link = page.locator('[data-local-link]'), dockButton = page.locator('[data-dock-item="browser"]')
      await link.waitFor()
      await dockButton.waitFor()
      assert.equal(await page.locator('[data-entry-browser]').count(), 0)
      const headerMenu = page.getByRole('button', { name: 'Menu', exact: true })
      await headerMenu.click()
      await page.getByRole('menuitem', { name: 'Localhost browser', exact: true }).click()
      const home = page.locator('[data-entry-browser]')
      await home.waitFor({ state: 'visible' })
      assert.equal(await home.getAttribute('data-url'), '', 'hamburger entry opens the port list instead of a previous app')
      await home.getByRole('button', { name: 'Close test browser' }).click()
      await home.waitFor({ state: 'detached' })
      await link.click()
      const panel = page.locator('[data-entry-browser]')
      await panel.waitFor({ state: 'visible' })
      assert.equal(await panel.getAttribute('data-url'), 'http://localhost:5173/nested?mode=preview#section')
      assert.equal(await page.evaluate('window.nativeEditorClicks || 0'), 0, 'capture precedes editor link navigation')
      assert.equal(await dockButton.getAttribute('aria-pressed'), mobile ? null : 'true')
      const dockPanel = page.locator('[data-dock-panel="browser"]')
      assert.equal(await dockPanel.isVisible(), true)
      const bounds = (await dockPanel.boundingBox())!
      assert.ok(bounds.width > 0 && bounds.height > 0, 'opening gives the browser a usable dock area')
      if (mobile) assert.equal(await page.locator('[data-entry-editor]').isVisible(), false, 'browser is the mobile foreground panel')
      await panel.getByRole('button', { name: 'Close test browser' }).click()
      await panel.waitFor({ state: 'detached' })
      await page.locator('[data-entry-editor]').waitFor({ state: 'visible' })
      await page.locator('[data-second-link]').click()
      await panel.waitFor({ state: 'visible' })
      assert.equal(await panel.getAttribute('data-url'), 'http://127.0.0.1:8080/other?x=1#next')
      assert.equal(await panel.getAttribute('data-request'), '3', 'reopening requests a fresh navigation')
      await headerMenu.click()
      await page.getByRole('menuitem', { name: 'Localhost browser', exact: true }).click()
      assert.equal(await panel.getAttribute('data-url'), '', 'hamburger returns an already open browser to its port list')

      await page.evaluate('window.setBrowserAllowed(false)')
      await dockButton.waitFor({ state: 'detached' })
      await panel.waitFor({ state: 'detached' })
      await headerMenu.click()
      assert.equal(await page.getByRole('menuitem', { name: 'Localhost browser', exact: true }).count(), 0, 'revoked access removes the menu entry')
      await page.keyboard.press('Escape')
      await link.waitFor({ state: 'visible' })
      await link.click()
      await page.getByText('You do not have permission to access localhost apps.', { exact: true }).waitFor()
      assert.equal(await panel.count(), 0, 'revoked access cannot reopen the browser')
      assert.equal(context.pages().length, 1, 'localhost target=_blank never opens an external tab')
      assert.deepEqual(escapedRequests, [], 'the viewing device never requests its own localhost')
      assert.deepEqual(errors, [])
    } finally { await context.close() }
  })
})
