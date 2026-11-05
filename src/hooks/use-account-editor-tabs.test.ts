import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'rolldown'
import { Window } from 'happy-dom'
import type { AccountEditorTabs, AccountEditorTabsSnapshot } from '../utils/account-editor-tabs.ts'

const source = `import React from ${JSON.stringify(import.meta.resolve('react'))};
import {createRoot} from ${JSON.stringify(import.meta.resolve('react-dom/client'))};
import {flushSync} from ${JSON.stringify(import.meta.resolve('react-dom'))};
import {useAccountEditorTabs} from ${JSON.stringify(new URL('./use-account-editor-tabs.ts', import.meta.url).pathname)};
const root=createRoot(document.getElementById('root'));
function Fixture(){Object.assign(window.fixture,useAccountEditorTabs(window.fixture.account,window.fixture.path,error=>window.fixture.errors.push(error)));return null}
window.fixture.render=()=>flushSync(()=>root.render(<Fixture/>));
window.fixture.close=()=>flushSync(()=>root.unmount());
window.fixture.render();`
const bundle = await build({
  input: 'virtual:account-editor-tabs.tsx', write: false, platform: 'browser', output: { format: 'iife' },
  transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
  plugins: [{
    name: 'account-editor-tabs-fixture',
    resolveId(id) {
      if (id === 'virtual:account-editor-tabs.tsx') return id
      if (id === '../api/editor-tabs.ts') return 'virtual:api'
    },
    load(id) {
      if (id === 'virtual:account-editor-tabs.tsx') return source
      if (id === 'virtual:api') return `
        export function fetchAccountEditorTabs(path,signal){return window.fixture.read(path,signal)}
        export async function saveAccountEditorTabs(){throw new Error('unexpected write')}
      `
    },
  }],
})
const chunk = bundle.output.find(item => item.type === 'chunk')!
type Request = {
  path: string; signal: AbortSignal
  resolve: (value: AccountEditorTabsSnapshot) => void; reject: (error: Error) => void
}
type Fixture = {
  account: string; path: string; tabs: AccountEditorTabs | undefined; hydrated: boolean; errors: unknown[]
  prepare: (path: string, signal: AbortSignal) => void; render: () => void; close: () => void
}
const snapshot = (path: string): AccountEditorTabsSnapshot => ({ revision: 1, state: {
  '.workspace': { panes: [{ id: 'main', activePath: path, tabs: [{ path, preview: false, viewMode: 'plain' }] }], layout: { kind: 'leaf', pane: 'main' }, focusedPaneId: 'main' },
} })

function mount() {
  const win = new Window({ url: 'https://account-tabs.test', console: { ...console, error() {} }, settings: {
    enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true,
  } })
  win.document.body.innerHTML = '<div id="root"></div>'
  const requests: Request[] = []
  const data = { account: 'first@example.test', path: '/alpha', errors: [], read(path: string, signal: AbortSignal) {
    // Keep mock responses controllable even after cancellation to check stale replies.
    return new Promise<AccountEditorTabsSnapshot>((resolve, reject) => requests.push({ path, signal, resolve, reject }))
  } }
  Object.assign(win, { fixture: data })
  win.eval(chunk.code)
  const fixture = data as unknown as Fixture
  const waitFor = async (condition: () => boolean) => {
    const deadline = Date.now() + 2000
    while (!condition() && Date.now() < deadline) await new Promise(done => setTimeout(done, 5))
    assert.ok(condition(), 'account tab state settles')
  }
  const switchTo = (path: string, account = fixture.account) => { fixture.path = path; fixture.account = account; fixture.render() }
  const event = (name: string, workspacePath?: string) => win.dispatchEvent(new win.CustomEvent(name, { detail: { workspacePath } }))
  const activePath = () => fixture.tabs?.['.workspace']?.panes[0]?.activePath
  return { win, fixture, requests, waitFor, switchTo, event, activePath, close: async () => { fixture.close(); await win.happyDOM.close() } }
}

test('selection reads account tabs before switching scope and consumes its fresh preparation only once', async () => {
  const view = mount()
  try {
    view.requests[0].resolve(snapshot('alpha.md'))
    await view.waitFor(() => view.fixture.hydrated)
    view.fixture.prepare('/beta', new AbortController().signal)
    assert.equal(view.requests[1].path, '/beta', 'selection starts its read immediately')
    assert.equal(view.activePath(), 'alpha.md', 'preparing does not replace the displayed scope')
    view.requests[1].resolve(snapshot('beta.md'))
    view.switchTo('/beta')
    await view.waitFor(() => view.fixture.hydrated)
    assert.equal(view.activePath(), 'beta.md')
    assert.equal(view.requests.length, 2, 'activation reuses the selected root read')
    view.event('mew:editor-tabs-changed', '/beta')
    assert.equal(view.requests.length, 3, 'subsequent signals always read fresh authority')
    view.requests[2].resolve({ state: {}, revision: 2 })
    await view.waitFor(() => view.fixture.hydrated && Object.keys(view.fixture.tabs ?? {}).length === 0)
    view.switchTo('/alpha'); view.switchTo('/beta')
    assert.equal(view.requests.length, 5, 'returning does not reuse an earlier selection snapshot')
  } finally { await view.close() }
})

test('aborted, superseded and failed preparations are discarded so activation retries fresh', async () => {
  for (const reason of ['aborted', 'superseded', 'failed'] as const) {
    const view = mount()
    try {
      const selection = new AbortController()
      view.fixture.prepare('/beta', selection.signal)
      const prepared = view.requests[1]
      if (reason === 'aborted') selection.abort()
      else if (reason === 'superseded') view.fixture.prepare('/gamma', new AbortController().signal)
      else { prepared.reject(new Error('offline')); await view.waitFor(() => prepared.signal.aborted) }
      assert.equal(prepared.signal.aborted, true)
      view.switchTo('/beta')
      const fresh = view.requests.at(-1)!
      assert.notEqual(fresh, prepared)
      prepared.resolve(snapshot('obsolete.md'))
      fresh.resolve(snapshot('current.md'))
      await view.waitFor(() => view.fixture.hydrated)
      assert.equal(view.activePath(), 'current.md')
      assert.equal(view.fixture.errors.length, 0, 'unused preparation failures do not leak into active scope')
    } finally { await view.close() }
  }
})

test('preparation cannot hydrate a different account or root and disposed consumed requests are aborted', async () => {
  const view = mount()
  try {
    view.fixture.prepare('/beta', new AbortController().signal)
    const beta = view.requests[1]
    view.switchTo('/gamma')
    assert.equal(view.requests[2].path, '/gamma')
    assert.equal(beta.signal.aborted, true, 'a different selected root discards the preparation')
    view.fixture.prepare('/beta', new AbortController().signal)
    const consumed = view.requests.at(-1)!
    view.switchTo('/beta')
    assert.equal(view.requests.length, 4, 'the matching root consumes its new preparation')
    view.switchTo('/beta', 'second@example.test')
    assert.equal(consumed.signal.aborted, true, 'disposing a consumed account scope aborts its preparation')
    beta.resolve(snapshot('first-account.md'))
    consumed.resolve(snapshot('first-account.md'))
    view.requests.at(-1)!.resolve(snapshot('second-account.md'))
    await view.waitFor(() => view.fixture.hydrated)
    assert.equal(view.activePath(), 'second-account.md')
    view.fixture.prepare('/other', new AbortController().signal)
    const other = view.requests.at(-1)!
    view.switchTo('/other', 'third@example.test')
    assert.equal(other.signal.aborted, true, 'account disposal discards unconsumed preparation')
  } finally { await view.close() }
})

test('explicit empty tab authority from preparation remains empty', async () => {
  for (const state of [null, {}]) {
    const view = mount()
    try {
      view.fixture.prepare('/beta', new AbortController().signal)
      view.requests[1].resolve({ state, revision: 7 })
      view.switchTo('/beta')
      await view.waitFor(() => view.fixture.hydrated)
      assert.equal(Object.keys(view.fixture.tabs ?? {}).length, 0)
      assert.equal(view.requests.length, 2)
    } finally { await view.close() }
  }
})

test('recovery and matching metadata changes invalidate a preparation before scope activation', async () => {
  for (const eventName of ['mew:permissions-changed', 'online', 'pageshow', 'visibilitychange', 'mew:editor-tabs-changed']) {
    const view = mount()
    try {
      view.requests[0].resolve(snapshot('alpha.md'))
      await view.waitFor(() => view.fixture.hydrated)
      view.fixture.prepare('/beta', new AbortController().signal)
      const prepared = view.requests[1]
      if (eventName === 'pageshow') {
        const event = new view.win.Event('pageshow')
        Object.defineProperty(event, 'persisted', { value: true })
        view.win.dispatchEvent(event)
      }
      else if (eventName === 'visibilitychange') view.win.document.dispatchEvent(new view.win.Event(eventName))
      else view.event(eventName, '/beta')
      assert.equal(prepared.signal.aborted, true, `${eventName} invalidates unconsumed metadata`)
      view.switchTo('/beta')
      const fresh = view.requests.at(-1)!
      assert.notEqual(fresh, prepared)
      prepared.resolve(snapshot('stale.md'))
      fresh.resolve(snapshot('fresh.md'))
      await view.waitFor(() => view.fixture.hydrated)
      assert.equal(view.activePath(), 'fresh.md')
    } finally { await view.close() }
  }
})

test('a recovery signal during a consumed preparation rereads before applying the snapshot', async () => {
  const view = mount()
  try {
    view.fixture.prepare('/beta', new AbortController().signal)
    view.switchTo('/beta')
    view.event('mew:editor-tabs-changed', '/beta')
    view.requests[1].resolve(snapshot('before-signal.md'))
    await view.waitFor(() => view.requests.length === 3)
    assert.equal(view.fixture.hydrated, false, 'invalidated consumed state cannot hydrate')
    view.requests[2].resolve(snapshot('after-signal.md'))
    await view.waitFor(() => view.fixture.hydrated)
    assert.equal(view.activePath(), 'after-signal.md')
    assert.equal(view.requests[0].signal.aborted, true, 'outgoing active read is disposed')
  } finally { await view.close() }
})

test('preparation respects aborted selections and unmount cleanup, and consumed failures recover with a fresh read', async () => {
  const view = mount()
  try {
    const canceled = new AbortController()
    canceled.abort()
    view.fixture.prepare('/beta', canceled.signal)
    assert.equal(view.requests.length, 1, 'an already canceled selection starts no read')
    view.fixture.prepare('/beta', new AbortController().signal)
    view.switchTo('/beta')
    view.requests[1].reject(new Error('offline'))
    await view.waitFor(() => view.fixture.errors.length === 1)
    assert.equal(view.fixture.hydrated, false)
    view.event('online')
    assert.equal(view.requests.length, 3, 'recovery does not reuse a rejected preparation')
    view.requests[2].resolve(snapshot('recovered.md'))
    await view.waitFor(() => view.fixture.hydrated)
    assert.equal(view.activePath(), 'recovered.md')
    view.fixture.prepare('/gamma', new AbortController().signal)
    view.fixture.close()
    assert.equal(view.requests[3].signal.aborted, true, 'unmount aborts unconsumed preparations')
  } finally { await view.close() }
})
