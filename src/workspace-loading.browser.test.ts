import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { build } from 'rolldown'
import { chromium, type Page } from 'playwright-core'
import { domBrowserExecutable } from '../server/browser-dom-executable.ts'

const root = path.resolve(import.meta.dirname, '..')
const component = path.join(root, 'src/AppBootstrap.tsx')
const workspace = path.join(root, 'src/App.tsx')
const owner = { authenticated: true, email: 'first@example.test', role: 'owner', mustChangePassword: false, displayName: null, avatarDataUrl: null, accessRevision: 'first', capabilities: { portPreview: true } }

test('authenticated workspace mounts without waiting for the lazy retry deadline', { skip: !domBrowserExecutable(), timeout: 45_000 }, async t => {
  const source = `import React, { lazy, Suspense, useEffect, useState } from 'react';
    import { createRoot } from 'react-dom/client';
    import AppBootstrap from ${JSON.stringify(component)};
    import { setBrowserStorageScope } from '@mew/ui/browser-storage-scope';
    setBrowserStorageScope('first@example.test', 'fixture-instance');
    const LazyWorkspace = lazy(() => import(${JSON.stringify(workspace)}));
    function Baseline() { return <Suspense fallback={<div data-startup-screen>Loading baseline</div>}><LazyWorkspace auth={${JSON.stringify(owner)}} /></Suspense> }
    function Fixture() {
      const [auth, setAuth] = useState(undefined), [mounted, setMounted] = useState(true);
      useEffect(() => { window.fixtureSetAuth = setAuth; window.fixtureUnmount = () => setMounted(false) }, []);
      return mounted ? <AppBootstrap initialAuth={auth} /> : <div data-unmounted />;
    }
    createRoot(document.getElementById('root')).render(location.search.includes('baseline') ? <Baseline /> : <Fixture />);`
  const result = await build({ input: 'virtual:app-bootstrap.tsx', write: false, platform: 'browser', transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': '"production"', 'import.meta.hot': 'false' } }, output: { format: 'esm', minify: true }, plugins: [{
    name: 'controlled-workspace-module',
    resolveId(id) {
      if (id.endsWith('.css')) return 'virtual:style'
      if (id === 'virtual:app-bootstrap.tsx') return id
      if (id.endsWith('/utils/remote-transport') || id.endsWith('/utils/remote-transport.ts')) return 'virtual:transport'
      if (id.endsWith('/utils/contentCache')) return 'virtual:content-identity'
      if (id.endsWith('/components/LoginPage')) return 'virtual:login.tsx'
      if (id.endsWith('/components/PortPreviewPage.tsx')) return 'virtual:preview.tsx'
    },
    load(id) {
      if (id === 'virtual:style') return ''
      if (id === 'virtual:app-bootstrap.tsx') return source
      if (id === 'virtual:transport') return 'export const isRemoteMode=()=>true; export const mewFetch=(...args)=>fetch(...args); export const setRemoteTransport=()=>{}; export class DataChannelTransport {}'
      if (id === 'virtual:content-identity') return 'export function clearFileContentCache(){}; export function setContentIdentity(value){window.fixtureContentIdentity=value}'
      if (id === 'virtual:login.tsx') return 'export function LoginPage(){return <div data-login>Login</div>}'
      if (id === 'virtual:preview.tsx') return 'export default function Preview(){return <div data-preview>Preview</div>}'
      if (id === workspace) return `import { useEffect } from 'react'; import { scopedBrowserStorage } from '@mew/ui/browser-storage-scope';
        window.fixtureModuleState={identity:window.fixtureContentIdentity,permissions:scopedBrowserStorage().getItem('mew:access-version')};
        export default function Workspace({auth}){useEffect(()=>{fetch('/api/workspace?account='+encodeURIComponent(auth.email)+'&revision='+auth.accessRevision)},[auth.email,auth.accessRevision]);return <button data-workspace>{auth.email}:{auth.accessRevision}</button>}`
    },
  }] })
  const chunks = result.output.filter(item => item.type === 'chunk'), entry = chunks.find(item => item.isEntry)!
  const workspaceChunk = chunks.find(item => workspace in item.modules)!
  assert.ok(workspaceChunk)
  assert.notEqual(workspaceChunk.fileName, entry.fileName)
  const scripts = new Map(chunks.map(item => ['/' + item.fileName, item.code]))
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  t.after(() => browser.close())

  async function fixture(query = '') {
    const page = await browser.newPage()
    page.setDefaultTimeout(5000)
    const errors: string[] = [], reads: string[] = []
    let releaseAuth!: (value: unknown) => void, releaseModule!: () => void, moduleRequests = 0
    let failModule = false
    const authPending = new Promise<unknown>(resolve => { releaseAuth = resolve })
    const modulePending = new Promise<void>(resolve => { releaseModule = resolve })
    page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(() => {
      const nativeSet = window.setTimeout, nativeClear = window.clearTimeout
      let next = 1_000_000
      const held = new Map<number, { callback: TimerHandler; args: unknown[]; delay: number }>()
      Object.assign(window, {
        fixtureHeldDelays: [] as number[],
        fixtureReleaseTimers() {
          for (const [id, value] of held) {
            held.delete(id)
            if (typeof value.callback === 'function') Reflect.apply(value.callback, window, value.args)
          }
        },
      })
      window.setTimeout = function (callback: TimerHandler, delay = 0, ...args: unknown[]) {
        if (typeof callback === 'function' && callback.name.startsWith('bound ') && delay > 10 && delay <= 300) {
          const id = next++; held.set(id, { callback, args, delay })
          ;(window as unknown as { fixtureHeldDelays: number[] }).fixtureHeldDelays.push(delay)
          return id
        }
        return nativeSet(callback, delay, ...args)
      }
      window.clearTimeout = id => { if (!held.delete(Number(id))) nativeClear(id) }
    })
    await page.route('http://mew-bootstrap.test/**', async route => {
      const url = new URL(route.request().url())
      if (url.pathname === '/api/auth/me') return route.fulfill({ json: await authPending })
      if (url.pathname === '/' + workspaceChunk.fileName) { moduleRequests++; await modulePending; return route.fulfill(failModule ? { status: 503, body: 'Unavailable' } : { contentType: 'text/javascript', body: scripts.get(url.pathname)! }) }
      if (url.pathname === '/api/workspace') { reads.push(url.search); return route.fulfill({ json: {} }) }
      if (scripts.has(url.pathname)) return route.fulfill({ contentType: 'text/javascript', body: scripts.get(url.pathname)! })
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><div id="root"></div><script type="module" src="/${entry.fileName}"></script>` })
    })
    await page.goto('http://mew-bootstrap.test/' + query, { waitUntil: 'domcontentloaded' })
    return { page, errors, reads, releaseAuth, releaseModule, moduleRequests: () => moduleRequests, failModule: () => { failModule = true } }
  }
  const updateAuth = (page: Page, auth: unknown) => page.evaluate(value => (window as unknown as { fixtureSetAuth(value: unknown): void }).fixtureSetAuth(value), auth)

  await t.test('a real lazy baseline is held by React retry while the awaited workspace is not', async () => {
    const baseline = await fixture('?baseline')
    try {
      await baseline.page.locator('[data-startup-screen]').waitFor()
      baseline.releaseModule()
      await baseline.page.waitForFunction(() => (window as unknown as { fixtureHeldDelays: number[] }).fixtureHeldDelays.length > 0)
      assert.equal(await baseline.page.locator('[data-workspace]').count(), 0)
      const delays = await baseline.page.evaluate(() => (window as unknown as { fixtureHeldDelays: number[] }).fixtureHeldDelays)
      t.diagnostic('Controlled real React.lazy retry delays: ' + JSON.stringify(delays.map(Math.round)))
      await baseline.page.evaluate(() => (window as unknown as { fixtureReleaseTimers(): void }).fixtureReleaseTimers())
      await baseline.page.locator('[data-workspace]').waitFor()
    } finally { await baseline.page.close() }

    const actual = await fixture()
    try {
      await actual.page.locator('[data-startup-screen]').waitFor()
      assert.equal(await actual.page.locator('[data-startup-screen] .mew-loading-logo').count(), 1, 'full workspace entry uses the logo')
      assert.equal(await actual.page.locator('[data-startup-screen] .mew-loading-dots').count(), 0)
      assert.equal(actual.moduleRequests(), 0, 'unverified status cannot evaluate or request the workspace')
      actual.releaseAuth(owner)
      await actual.page.waitForRequest(request => new URL(request.url()).pathname === '/' + workspaceChunk.fileName)
      actual.releaseModule()
      await actual.page.locator('[data-workspace]').waitFor()
      assert.deepEqual(await actual.page.evaluate(() => (window as unknown as { fixtureHeldDelays: number[] }).fixtureHeldDelays), [])
      assert.deepEqual(await actual.page.evaluate(() => (window as unknown as { fixtureModuleState: unknown }).fixtureModuleState), { identity: owner.email, permissions: JSON.stringify([owner.email, owner.role, owner.accessRevision, owner.capabilities]) })
      assert.deepEqual(actual.errors, [])
    } finally { await actual.page.close() }
  })

  await t.test('late imports use the current account and permissions and never mount after cancellation', async () => {
    const actual = await fixture()
    try {
      const requested = actual.page.waitForRequest(request => new URL(request.url()).pathname === '/' + workspaceChunk.fileName)
      actual.releaseAuth(owner); await requested
      const current = { ...owner, email: 'second@example.test', accessRevision: 'second' }
      await updateAuth(actual.page, current)
      await actual.page.waitForFunction(value => (window as unknown as { fixtureContentIdentity: string }).fixtureContentIdentity === value, current.email)
      const workspaceRead = actual.page.waitForRequest(request => new URL(request.url()).pathname === '/api/workspace')
      actual.releaseModule()
      await actual.page.locator('[data-workspace]').waitFor()
      assert.equal(await actual.page.locator('[data-workspace]').innerText(), current.email + ':second')
      await workspaceRead
      assert.equal(actual.reads.some(value => value.includes('first%40')), false)
      assert.equal(actual.moduleRequests(), 1)
    } finally { await actual.page.close() }

    const cancelled = await fixture()
    try {
      const requested = cancelled.page.waitForRequest(request => new URL(request.url()).pathname === '/' + workspaceChunk.fileName)
      cancelled.releaseAuth(owner); await requested
      await cancelled.page.evaluate(() => (window as unknown as { fixtureUnmount(): void }).fixtureUnmount())
      await cancelled.page.locator('[data-unmounted]').waitFor({ state: 'attached' })
      cancelled.releaseModule()
      await cancelled.page.waitForFunction(() => !!(window as unknown as { fixtureModuleState?: unknown }).fixtureModuleState)
      assert.equal(await cancelled.page.locator('[data-workspace]').count(), 0)
      assert.deepEqual(cancelled.reads, [])
      assert.deepEqual(cancelled.errors, [])
    } finally { await cancelled.page.close() }
  })

  await t.test('expired login, password changes and preview keep their existing gates', async () => {
    for (const status of [{ ...owner, authenticated: false }, { ...owner, mustChangePassword: true }]) {
      const actual = await fixture()
      try {
        actual.releaseAuth(status)
        await actual.page.locator('[data-login]').waitFor()
        assert.equal(actual.moduleRequests(), 0)
        assert.deepEqual(actual.reads, [])
      } finally { await actual.page.close() }
    }
    const preview = await fixture('?preview=5101')
    try {
      preview.releaseAuth(owner)
      await preview.page.waitForFunction(() => (window as unknown as { fixtureHeldDelays: number[] }).fixtureHeldDelays.length > 0)
      await preview.page.evaluate(() => (window as unknown as { fixtureReleaseTimers(): void }).fixtureReleaseTimers())
      await preview.page.locator('[data-preview]').waitFor()
      assert.equal(preview.moduleRequests(), 0)
    } finally { await preview.page.close() }
  })

  await t.test('a failed module shows a bounded error without starting workspace APIs', async () => {
    const actual = await fixture()
    try {
      const requested = actual.page.waitForRequest(request => new URL(request.url()).pathname === '/' + workspaceChunk.fileName)
      actual.failModule(); actual.releaseAuth(owner); await requested; actual.releaseModule()
      await actual.page.getByRole('alert').waitFor()
      assert.equal(actual.moduleRequests(), 1)
      assert.deepEqual(actual.reads, [])
      assert.deepEqual(actual.errors, [])
    } finally { await actual.page.close() }
  })
})
