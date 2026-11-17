import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { build } from 'rolldown'
import { chromium } from 'playwright-core'
import { domBrowserExecutable } from '../server/browser-dom-executable.ts'

const root = path.resolve(import.meta.dirname, '..')
const bootstrap = path.join(root, 'src/AppBootstrap.tsx')
const workspace = path.join(root, 'src/App.tsx')
const owner = { authenticated: true, email: 'owner@example.test', role: 'owner', mustChangePassword: false, setupRequired: false, capabilities: {} }

test('first owner configures agents before remote access', { skip: !domBrowserExecutable(), timeout: 45_000 }, async t => {
  const source = `import React from 'react'; import { createRoot } from 'react-dom/client'; import App from ${JSON.stringify(bootstrap)}; createRoot(document.getElementById('root')).render(<App initialAuth={{setupRequired:true}}/>);`
  const result = await build({ input: 'virtual:first-run.tsx', write: false, platform: 'browser', transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': '"production"', 'import.meta.hot': 'false' } }, output: { format: 'esm' }, onLog(level, log, handler) { if (log.code !== 'MODULE_LEVEL_DIRECTIVE') handler(level, log) }, plugins: [{
    name: 'first-run-fixture',
    resolveId(id) {
      if (id === 'virtual:first-run.tsx') return id
      if (id.endsWith('.css')) return 'virtual:style'
      if (id.endsWith('/components/deferred-dialog')) return 'virtual:deferred.tsx'
      if (id.endsWith('/components/FirstOwnerSetup')) return 'virtual:owner.tsx'
      if (id.endsWith('/components/AgentSetupModal')) return 'virtual:agent.tsx'
      if (id.endsWith('/components/remote-access-settings')) return 'virtual:remote.tsx'
      if (id.endsWith('/utils/remote-transport')) return 'virtual:transport'
    },
    load(id) {
      if (id === 'virtual:first-run.tsx') return source
      if (id === 'virtual:style') return ''
      if (id === 'virtual:deferred.tsx') return "import {lazy, Suspense} from 'react'; export function deferredDialog(load) { const Component = lazy(load); return props => <Suspense fallback={null}><Component {...props}/></Suspense> }"
      if (id === 'virtual:owner.tsx') return `export function FirstOwnerSetup({onSuccess}) { return <button data-owner onClick={() => onSuccess(${JSON.stringify(owner)})}>Create owner</button> }`
      if (id === 'virtual:agent.tsx') return 'export function AgentSetupModal({onClose}) { return <button data-agent onClick={onClose}>Finish agents</button> }'
      if (id === 'virtual:remote.tsx') return 'export function RemoteAccessModal({onClose}) { return <button data-remote onClick={onClose}>Finish remote</button> }'
      if (id === 'virtual:transport') return 'export const isRemoteMode=()=>false; export const mewFetch=(...args)=>fetch(...args)'
      if (id === workspace) return 'export default function Workspace() { return <div data-workspace /> }'
    },
  }] })
  const chunks = result.output.filter(item => item.type === 'chunk'), entry = chunks.find(item => item.isEntry)!
  const scripts = new Map(chunks.map(item => ['/' + item.fileName, item.code]))
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  t.after(() => browser.close())
  const page = await browser.newPage()
  await page.route('http://mew-first-run.test/**', route => {
    const pathname = new URL(route.request().url()).pathname
    return scripts.has(pathname) ? route.fulfill({ contentType: 'text/javascript', body: scripts.get(pathname)! }) : route.fulfill({ contentType: 'text/html', body: `<!doctype html><div id="root"></div><script type="module" src="/${entry.fileName}"></script>` })
  })
  page.setDefaultTimeout(5000)
  await page.goto('http://mew-first-run.test/')
  await page.locator('[data-owner]').click()
  await page.locator('[data-agent]').waitFor()
  assert.equal(await page.locator('[data-remote]').count(), 0)
  await page.locator('[data-agent]').click()
  await page.locator('[data-remote]').waitFor()
  assert.equal(await page.locator('[data-agent]').count(), 0)
  await page.locator('[data-remote]').click()
  assert.equal(await page.locator('[data-remote]').count(), 0)
})
