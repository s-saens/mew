import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'rolldown'
import { Window } from 'happy-dom'

const source = `import React from ${JSON.stringify(import.meta.resolve('react'))};
import {createRoot} from ${JSON.stringify(import.meta.resolve('react-dom/client'))};
import {flushSync} from ${JSON.stringify(import.meta.resolve('react-dom'))};
import {useRootProjectTabs} from ${JSON.stringify(new URL('./use-root-project-tabs.ts', import.meta.url).pathname)};
const root=createRoot(document.getElementById('root'));
const track=request=>request;
function Fixture(){Object.assign(window.fixture,useRootProjectTabs(window.fixture.enabled,track));return null}
window.fixture.flush=fn=>flushSync(fn);
window.fixture.close=()=>flushSync(()=>root.unmount());
flushSync(()=>root.render(<Fixture/>));`
const bundle = await build({
  input: 'virtual:root-project-tabs.tsx', write: false, platform: 'browser', output: { format: 'iife' },
  transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
  plugins: [{
    name: 'root-project-tabs-fixture',
    resolveId(id) {
      if (id === 'virtual:root-project-tabs.tsx') return id
      if (id === '../api/client.ts') return 'virtual:api'
    },
    load(id) {
      if (id === 'virtual:root-project-tabs.tsx') return source
      if (id === 'virtual:api') return `
        export function fetchRootProjectTabs(){window.fixture.reads++;return window.fixture.read}
        export async function saveRootProjectTabs(state){window.fixture.writes.push(state);return {state}}
      `
    },
  }],
})
const chunk = bundle.output.find(item => item.type === 'chunk')!
type State = { paths: string[]; icons: Record<string, string> }
interface Fixture {
  paths: string[]; icons: Record<string, string>; synced: boolean
  reads: number; writes: State[]; setPaths: (paths: string[]) => void
  flush: (callback: () => void) => void; close: () => void
}
function mount(enabled = true) {
  const win = new Window({ url: 'https://account-projects.test', console: { ...console, error() {} },
    settings: { enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true } })
  win.document.body.innerHTML = '<div id="root"></div>'
  win.localStorage.setItem('mew:open-project-paths', '["/another-account/project"]')
  let resolve!: (value: { state: State | null }) => void
  let reject!: (error: Error) => void
  const read = new Promise<{ state: State | null }>((yes, no) => { resolve = yes; reject = no })
  const data = { enabled, read, reads: 0, writes: [] }
  Object.assign(win, { fixture: data })
  win.eval(chunk.code)
  const fixture = data as unknown as Fixture
  const waitFor = async (condition: () => boolean) => {
    const deadline = Date.now() + 2000
    while (!condition() && Date.now() < deadline) await new Promise(done => setTimeout(done, 5))
    assert.ok(condition(), 'account project state settles')
  }
  const paths = () => [...fixture.paths]
  const writes = () => fixture.writes.map(state => [...state.paths])
  return { win, fixture, resolve, reject, waitFor, paths, writes, close: async () => { fixture.close(); await win.happyDOM.close() } }
}

test('a new account ignores cached projects before and after its empty server response', async () => {
  const view = mount()
  try {
    assert.deepEqual(view.paths(), [], 'cached projects never appear while loading')
    assert.deepEqual(view.writes(), [], 'nothing is saved before the account list is read')
    assert.equal(view.win.localStorage.getItem('mew:open-project-paths'), '["/another-account/project"]')
    view.resolve({ state: null })
    await view.waitFor(() => view.fixture.synced && view.fixture.writes.length > 0)
    assert.deepEqual(view.paths(), [])
    assert.deepEqual(view.writes(), [[]], 'cached paths are never uploaded to the new account')
    assert.equal(view.win.localStorage.getItem('mew:open-project-paths'), '[]')
    view.fixture.flush(() => view.fixture.setPaths(['/explicitly-added']))
    await view.waitFor(() => view.fixture.writes.length === 2)
    assert.deepEqual(view.writes(), [[], ['/explicitly-added']])
  } finally { await view.close() }
})

test('existing account shortcuts restore in server order and an explicitly empty list stays empty', async () => {
  for (const paths of [['/second', '/first'], []]) {
    const view = mount()
    try {
      view.resolve({ state: { paths, icons: { '/first': '🌱' } } })
      await view.waitFor(() => view.fixture.synced && view.fixture.writes.length > 0)
      assert.deepEqual(view.paths(), paths)
      assert.equal(view.fixture.icons['/first'], '🌱')
      assert.deepEqual(view.writes(), [paths])
    } finally { await view.close() }
  }
})

test('a failed account read never uploads cached or empty shortcuts', async () => {
  const view = mount()
  try {
    view.reject(new Error('offline'))
    await new Promise(done => setTimeout(done, 30))
    assert.equal(view.fixture.synced, false)
    assert.deepEqual(view.paths(), [])
    assert.deepEqual(view.writes(), [])
  } finally { await view.close() }
})

test('accounts without project access do not read or save personal shortcuts', async () => {
  const view = mount(false)
  try {
    assert.equal(view.fixture.reads, 0)
    assert.deepEqual(view.paths(), [])
    assert.deepEqual(view.writes(), [])
  } finally { await view.close() }
})
