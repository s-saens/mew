import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { compile } from '@tailwindcss/node'
import { build } from 'rolldown'
import { domBrowserExecutable } from '../../server/browser-dom-executable.ts'
import { connectTestBrowser } from '../../server/test-browser.ts'

const root = path.resolve(import.meta.dirname, '../..')

test('native browser and localhost tabs obey independent permissions on desktop and mobile', { skip: !domBrowserExecutable(), timeout: 45_000 }, async t => {
  const auth = {
    authenticated: true, email: 'browser-entry@example.test', role: 'owner', mustChangePassword: false,
    displayName: 'Browser entry', avatarDataUrl: null,
    capabilities: { filesRead: true, filesWrite: true, agent: false, terminal: false, serverFiles: false, collaboration: false, git: false, portPreview: true, nativeBrowser: true, desktop: false },
  }
  const source = `import React from ${JSON.stringify(import.meta.resolve('react'))};
    import {createRoot} from ${JSON.stringify(import.meta.resolve('react-dom/client'))};
    import App from ${JSON.stringify(path.join(root, 'src/App.tsx'))};
    import {I18nProvider} from ${JSON.stringify(path.join(root, 'src/i18n.tsx'))};
    function Fixture(){const [auth,setAuth]=React.useState(${JSON.stringify(auth)});
      window.setBrowserAllowed=allowed=>setAuth(current=>({...current,capabilities:{...current.capabilities,portPreview:allowed}}));
      window.setDesktopAllowed=allowed=>setAuth(current=>({...current,capabilities:{...current.capabilities,desktop:allowed}}));
      window.setNativeBrowserAllowed=allowed=>setAuth(current=>({...current,capabilities:{...current.capabilities,nativeBrowser:allowed}}));
      return <I18nProvider><App auth={auth}/></I18nProvider>}
    createRoot(document.getElementById('root')).render(<Fixture/>);`
  // Keep App, permissions, capture listeners, dock layout and mobile foreground real;
  // isolate the two renderers so this test needs neither a local app nor a browser server.
  const editor = `export function prepareEditorPane(){return Promise.resolve()}
    export function DeferredEditorPane(){return <article data-entry-editor>
    <a data-local-link href="http://localhost:5173/nested?mode=preview#section" target="_blank" onClick={()=>{window.nativeEditorClicks=(window.nativeEditorClicks||0)+1}}>Local app</a>
    <a data-second-link href="http://127.0.0.1:8080/other?x=1#next" target="_blank">Second local app</a>
    </article>}`
  const panel = `export function BrowserDesktopPanel({url,navigationRequest,nativeAllowed,previewAllowed,onClose}){return <div data-entry-browser data-url={url} data-request={navigationRequest} data-native-allowed={String(nativeAllowed)} data-preview-allowed={String(previewAllowed)}>
    <output aria-label="Requested browser URL">{url}</output><button onClick={onClose}>Close test browser</button></div>}`
  const bundle = await build({
    input: 'virtual:browser-entry.tsx', logLevel: 'silent', write: false, platform: 'browser', output: { format: 'esm' },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('production'), 'import.meta.hot': 'false' } },
    plugins: [{ name: 'browser-entry-fixture', resolveId(id) {
      if (id === 'virtual:browser-entry.tsx') return id
      if (id.endsWith('/deferred-editor-pane')) return 'virtual:editor.tsx'
      if (id.endsWith('/BrowserDesktopPanel')) return 'virtual:browser.tsx'
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
  const browser = await connectTestBrowser()
  t.after(() => browser.close())

  for (const mobile of [false, true]) await t.test(mobile ? 'mobile foreground and access changes' : 'desktop dock and access changes', async () => {
    const context = await browser.newContext({ viewport: { width: mobile ? 390 : 1100, height: 844 }, hasTouch: mobile, isMobile: mobile, locale: 'en-US' })
    const page = await context.newPage()
    page.setDefaultTimeout(5000)
    const errors: string[] = [], escapedRequests: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    context.on('request', request => {
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
    await context.route('http://mew-browser-entry.test/**', route => {
      const url = new URL(route.request().url())
      if (/^\/\d+\//.test(url.pathname)) return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Local app preview</title><h1>Local app preview</h1>' })
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
      await link.waitFor().catch(async error => {
        throw new Error(`${error instanceof Error ? error.message : String(error)}\n${JSON.stringify(errors)}\n${await page.locator('body').innerText()}`)
      })
      await dockButton.waitFor()
      assert.equal(await page.locator('[data-entry-browser]').count(), 0)
      await dockButton.click()
      const nativeBrowser = page.locator('[data-entry-browser]')
      await nativeBrowser.waitFor({ state: 'visible' })
      assert.equal(await nativeBrowser.getAttribute('data-url'), 'about:blank', 'the Browser dock starts an actual Chrome window with its own native toolbar')
      assert.equal(await nativeBrowser.getAttribute('data-native-allowed'), 'true')
      await page.evaluate('window.setDesktopAllowed(true)')
      assert.equal(await nativeBrowser.getAttribute('data-native-allowed'), 'true', 'the remote desktop grant does not own native browser access')
      await page.evaluate('window.setDesktopAllowed(false)')
      assert.equal(await nativeBrowser.getAttribute('data-native-allowed'), 'true', 'remote desktop revocation keeps an independently granted browser open')
      await page.evaluate('window.setNativeBrowserAllowed(false)')
      await nativeBrowser.waitFor({ state: 'detached' })
      await dockButton.click()
      await nativeBrowser.waitFor({ state: 'visible' })
      assert.equal(await nativeBrowser.getAttribute('data-url'), '', 'browser revocation changes the dock to the separately permitted localhost port picker')
      assert.equal(await nativeBrowser.getAttribute('data-native-allowed'), 'false', 'localhost preview permission alone does not grant a native browser')
      await nativeBrowser.getByRole('button', { name: 'Close test browser' }).click()
      await nativeBrowser.waitFor({ state: 'detached' })
      const headerMenu = page.getByRole('button', { name: 'Menu', exact: true })
      await headerMenu.click()
      await page.getByRole('menuitem', { name: 'Remote browser', exact: true }).click()
      const home = page.locator('[data-entry-browser]')
      await home.waitFor({ state: 'visible' })
      assert.equal(await home.getAttribute('data-url'), '', 'hamburger entry opens the port list instead of a previous app')
      await home.getByRole('button', { name: 'Close test browser' }).click()
      await home.waitFor({ state: 'detached' })
      if (mobile) await page.locator('[data-dock-item="editor"]').click()
      const [firstPreview] = await Promise.all([context.waitForEvent('page', { timeout: 5000 }), link.click()])
      await firstPreview.waitForLoadState()
      assert.equal(firstPreview.url(), 'http://mew-browser-entry.test/5173/nested?mode=preview#section')
      assert.equal(await firstPreview.evaluate('window.opener'), null, 'the localhost app cannot control the Mew tab')
      assert.equal(await page.evaluate('window.nativeEditorClicks || 0'), 0, 'capture precedes editor link navigation')
      assert.equal(await page.locator('[data-entry-browser]').count(), 0, 'localhost app links do not open the internal browser')
      assert.equal(await page.locator('[data-entry-editor]').isVisible(), true, 'the original editor remains available')
      await firstPreview.close()
      const [secondPreview] = await Promise.all([context.waitForEvent('page', { timeout: 5000 }), page.locator('[data-second-link]').click()])
      await secondPreview.waitForLoadState()
      assert.equal(secondPreview.url(), 'http://mew-browser-entry.test/8080/other?x=1#next')
      await secondPreview.close()
      await headerMenu.click()
      await page.getByRole('menuitem', { name: 'Remote browser', exact: true }).click()
      const panel = page.locator('[data-entry-browser]')
      await panel.waitFor({ state: 'visible' })
      assert.equal(await panel.getAttribute('data-url'), '', 'hamburger still opens the internal browser start page')

      await page.evaluate('window.setBrowserAllowed(false)')
      await dockButton.waitFor({ state: 'detached' })
      await panel.waitFor({ state: 'detached' })
      await headerMenu.click()
      assert.equal(await page.getByRole('menuitem', { name: 'Remote browser', exact: true }).count(), 0, 'revoked access removes the menu entry')
      await page.keyboard.press('Escape')
      if (mobile) await page.locator('[data-dock-item="editor"]').click()
      await link.waitFor({ state: 'visible' })
      await link.click()
      await page.getByText('You do not have permission to access localhost apps.', { exact: true }).waitFor()
      assert.equal(await panel.count(), 0, 'revoked access cannot reopen the browser')
      assert.equal(context.pages().length, 1, 'revoked localhost access cannot create another preview tab')
      await page.evaluate('window.setNativeBrowserAllowed(true)')
      await dockButton.waitFor()
      await dockButton.click()
      await panel.waitFor({ state: 'visible' })
      assert.equal(await panel.getAttribute('data-url'), 'about:blank', 'browser permission alone opens native Chrome')
      assert.equal(await panel.getAttribute('data-native-allowed'), 'true')
      assert.equal(await panel.getAttribute('data-preview-allowed'), 'false', 'native browser permission does not expose the localhost port picker')
      await page.evaluate('window.setBrowserAllowed(true)')
      await dockButton.waitFor()
      await dockButton.click()
      await panel.waitFor({ state: 'visible' })
      assert.equal(await panel.getAttribute('data-url'), 'about:blank', 'an account or permission reset restores the native Chrome start page')
      await page.evaluate('window.setNativeBrowserAllowed(false);window.setBrowserAllowed(false);window.setDesktopAllowed(true)')
      await dockButton.waitFor({ state: 'detached' })
      await panel.waitFor({ state: 'detached' })
      assert.deepEqual(escapedRequests, [], 'the viewing device never requests its own localhost')
      assert.deepEqual(errors, [])
    } finally { await context.close() }
  })
})
