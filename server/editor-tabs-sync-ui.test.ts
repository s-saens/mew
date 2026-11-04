import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'rolldown'
import { Window } from 'happy-dom'

const stored = (paths: string[], activePath = paths.at(-1) ?? null) => ({
  panes: [{ id: 'main', tabs: paths.map(path => ({ path, preview: false, viewMode: 'hotview' })), activePath }],
  layout: { kind: 'leaf', pane: 'main' }, focusedPaneId: 'main',
})
type StoredState = ReturnType<typeof stored>
type FileTab = { path: string; content: string; savedContent: string; status: string; revalidating?: boolean }
type Device = {
  account: { hydrated: boolean }
  editor: {
    hydrated: boolean; tabs: FileTab[]; activePath: string | null; activeTab: FileTab | null
    openFile(path: string, options: { preview: boolean; forceNewTab?: boolean }): Promise<void>
    setActivePath(path: string): void; closeTab(path: string): void; updateTabContent(path: string, content: string): void; forgetProject(project: string): void
  }
}
type FixtureWindow = Window & { devices: Record<string, Device>; failures: string[]; editorProject?: string; unmountFixture(): void }
const delay = () => new Promise(resolve => setTimeout(resolve, 5))
async function until(check: () => boolean, message: string) {
  const deadline = Date.now() + 5000
  while (!check() && Date.now() < deadline) await delay()
  assert.ok(check(), message)
}
function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}

test('account editor tab hooks propagate live metadata without echoing or losing local drafts', { timeout: 25_000 }, async t => {
  const source = `
import React from ${JSON.stringify(import.meta.resolve('react'))};
import {createRoot} from ${JSON.stringify(import.meta.resolve('react-dom/client'))};
import {useTabs} from ${JSON.stringify(new URL('../src/hooks/useTabs.ts', import.meta.url).pathname)};
import {useAccountEditorTabs} from ${JSON.stringify(new URL('../src/hooks/use-account-editor-tabs.ts', import.meta.url).pathname)};
import {I18nProvider} from ${JSON.stringify(new URL('../src/i18n.tsx', import.meta.url).pathname)};
const noop=()=>{};
window.devices={};window.failures=[];
function Device({id}){
  const account=useAccountEditorTabs('owner@example.test','/fixture',error=>window.failures.push(String(error)));
  const editor=useTabs(window.editorProject||'docs',noop,error=>window.failures.push(String(error)),'/fixture',account.tabs,account.change,account.hydrated,undefined,'owner@example.test','/fixture');
  window.devices[id]={account,editor};return null;
}
const root=createRoot(document.getElementById('root'));
window.unmountFixture=()=>root.unmount();
root.render(<React.StrictMode><I18nProvider><Device id="a"/><Device id="b"/></I18nProvider></React.StrictMode>);`
  const bundle = await build({
    input: 'virtual:account-editor-tabs.tsx', write: false, platform: 'browser', output: { format: 'iife' },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
    plugins: [{ name: 'account-editor-tabs-fixture', resolveId(id) {
      if (id === 'virtual:account-editor-tabs.tsx') return id
      if (id.endsWith('.css')) return 'virtual:style'
    }, load(id) {
      if (id === 'virtual:account-editor-tabs.tsx') return source
      if (id === 'virtual:style') return ''
    } }],
  })
  const code = bundle.output.find(item => item.type === 'chunk')!.code
  async function fixture(initial: Record<string, StoredState> | null, options: { holdHydration?: boolean; failHydration?: boolean; holdSave?: boolean; failSave?: boolean; project?: string } = {}) {
    const win = new Window({ url: 'http://mew-editor-tabs.test/' }) as FixtureWindow
    win.console.timeStamp = () => {}
    win.editorProject = options.project
    win.addEventListener('error', event => { win.failures?.push('message' in event ? String(event.message) : event.type) })
    win.document.body.innerHTML = '<div id="root"></div>'
    win.localStorage.setItem('mew:open-tabs:docs@/fixture', JSON.stringify(stored(['stale-device.md'])))
    let remote = initial, revision = initial ? 1 : 0, failHydration = !!options.failHydration
    const hydration = deferred(), save = deferred()
    if (!options.holdHydration) hydration.resolve()
    if (!options.holdSave) save.resolve()
    const writes: { project: string; state: StoredState; initialize: boolean }[] = []
    const fileWrites: { path: string; content: string }[] = [], disk = new Map<string, string>()
    let reads = 0
    const signal = () => win.dispatchEvent(new win.CustomEvent('mew:editor-tabs-changed', { detail: { workspacePath: '/fixture' } }))
    const response = (value: unknown, status = 200) => new win.Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
    win.fetch = async (input, init) => {
      const url = new URL(String(input), win.location.href)
      if (url.pathname === '/api/user-ui/editor-tabs') {
        if (init?.method !== 'PUT') {
          reads++
          await hydration.promise
          if (failHydration) return response({ error: 'Offline' }, 503)
          return response({ state: remote, revision })
        }
        const body = JSON.parse(String(init.body)) as typeof writes[number]
        writes.push(body)
        if (!body.initialize || !remote || !Object.hasOwn(remote, body.project)) {
          remote = { ...remote, [body.project]: body.state }; revision++
        }
        const saved = { state: remote, revision }
        queueMicrotask(signal)
        return response(saved)
      }
      if (url.pathname === '/api/file') {
        if (init?.method === 'PUT') {
          const body = JSON.parse(String(init.body)) as typeof fileWrites[number]
          fileWrites.push(body)
          if (options.failSave) return response({ error: 'Draft conflict' }, 409)
          await save.promise; disk.set(body.path, body.content)
          return response({ ok: true, content: body.content })
        }
        const path = url.searchParams.get('path')!
        return response({ path, content: disk.get(path) ?? `Body ${path}`, editable: true })
      }
      return response([])
    }
    win.eval(code)
    const a = () => win.devices.a.editor, b = () => win.devices.b.editor
    return {
      win, a, b, writes, fileWrites, hydration, save, signal,
      get reads() { return reads },
      get remote() { return remote },
      recover() { failHydration = false; win.dispatchEvent(new win.Event('online')) },
      update(next: Record<string, StoredState>) { remote = next; revision++; signal() },
      async ready() { await until(() => !!win.devices.a?.editor.hydrated && !!win.devices.b?.editor.hydrated, 'Both device hooks should hydrate') },
      async close() { hydration.resolve(); save.resolve(); win.unmountFixture(); await win.happyDOM.abort(); win.close() },
    }
  }

  await t.test('authoritative hydration replaces stale browser tabs and live open, selection and close propagate once', async () => {
    const f = await fixture({ docs: stored(['server.md']) }, { holdHydration: true })
    try {
      await until(() => f.reads > 0, 'Account hydration should begin')
      assert.equal(f.a().hydrated, false); assert.equal(f.b().hydrated, false); assert.deepEqual(f.writes, [])
      f.hydration.resolve(); await f.ready()
      await until(() => f.a().activeTab?.revalidating === false || f.a().activeTab?.revalidating === undefined, 'Initial file should validate')
      assert.deepEqual(Array.from(f.a().tabs, tab => tab.path), ['server.md']); assert.deepEqual(Array.from(f.b().tabs, tab => tab.path), ['server.md'])
      assert.deepEqual(f.writes, [], 'Server restoration cannot echo a PUT')
      await f.a().openFile('new.md', { preview: false, forceNewTab: true })
      await until(() => f.b().activePath === 'new.md', 'Opening a file should update the other device')
      f.b().setActivePath('server.md')
      await until(() => f.a().activePath === 'server.md', 'Selecting a tab should update the other device')
      f.a().closeTab('new.md')
      await until(() => !f.b().tabs.some(tab => tab.path === 'new.md'), 'Closing a clean tab should update the other device')
      assert.equal(f.writes.length, 3, 'Only the three explicit local metadata changes should save')
      assert.equal(f.win.failures.length, 0, f.win.failures.join('; '))
    } finally { await f.close() }
  })

  await t.test('canonical workspace tabs cannot import stale browser Documents tabs during migration', async () => {
    const f = await fixture({ '.workspace': stored(['canonical.md']) }, { project: '.workspace' })
    try {
      await f.ready(); await delay()
      assert.deepEqual(Array.from(f.a().tabs, tab => tab.path), ['canonical.md'])
      assert.deepEqual(Array.from(f.b().tabs, tab => tab.path), ['canonical.md'])
      assert.equal(JSON.stringify(f.remote).includes('stale-device.md'), false)
      assert.ok(f.writes.length <= 2, 'Only the unified-scope migration may save once per device')
      assert.equal(f.win.failures.length, 0, f.win.failures.join('; '))
    } finally { await f.close() }
  })

  await t.test('a remote close preserves the local dirty buffer until its save succeeds', async () => {
    const f = await fixture({ docs: stored(['draft.md', 'other.md'], 'draft.md') }, { holdSave: true })
    try {
      await f.ready(); await until(() => f.b().activeTab?.revalidating === false, 'Draft should become editable')
      await delay()
      f.b().updateTabContent('draft.md', 'Unsaved local draft')
      await until(() => f.b().tabs.some(tab => tab.content === 'Unsaved local draft'), 'Local edit should render')
      f.a().closeTab('draft.md')
      await until(() => f.fileWrites.length > 0, 'Remote close should flush local draft immediately')
      assert.equal(f.b().tabs.find(tab => tab.path === 'draft.md')?.content, 'Unsaved local draft')
      assert.equal(f.b().tabs.find(tab => tab.path === 'draft.md')?.status, 'saving')
      f.save.resolve()
      await until(() => !f.b().tabs.some(tab => tab.path === 'draft.md'), 'Remote close should complete after autosave acknowledgement')
      assert.deepEqual(f.fileWrites, [{ path: 'draft.md', content: 'Unsaved local draft', expectedContent: 'Body draft.md', project: 'docs', commit: false, workspace: '/fixture' }])
      assert.equal(f.writes.length, 1, 'The remote close cannot resurrect tabs through a save echo')
      assert.equal(f.win.failures.length, 0, f.win.failures.join('; '))
    } finally { await f.close() }
  })

  await t.test('failed initial reads leave tabs unhydrated and reconnect restores server state', async () => {
    const f = await fixture({ docs: stored(['server.md']) }, { failHydration: true })
    try {
      await until(() => f.win.failures.length > 0, 'Hydration failure should be reported')
      assert.equal(f.a().hydrated, false); assert.equal(f.b().hydrated, false); assert.deepEqual(f.writes, [])
      f.recover(); await f.ready()
      assert.deepEqual(Array.from(f.a().tabs, tab => tab.path), ['server.md']); assert.deepEqual(f.writes, [])
      const reads = f.reads
      f.win.dispatchEvent(new f.win.CustomEvent('mew:editor-tabs-changed', { detail: { workspacePath: '/different' } }))
      await delay(); assert.equal(f.reads, reads, 'Another workspace signal should not reload this workspace')
      f.update({ docs: stored(['latest.md']) })
      await until(() => f.a().activePath === 'latest.md' && f.b().activePath === 'latest.md', 'The live signal should refresh both devices')
    } finally { await f.close() }
  })

  await t.test('a failed autosave keeps a remotely closed draft in the local editor', async () => {
    const f = await fixture({ docs: stored(['draft.md']) }, { failSave: true })
    try {
      await f.ready(); await until(() => f.b().activeTab?.revalidating === false, 'Draft should become editable'); await delay()
      f.b().updateTabContent('draft.md', 'Draft retained after conflict')
      await until(() => f.b().activeTab?.content === 'Draft retained after conflict', 'Draft should render')
      f.a().closeTab('draft.md')
      await until(() => f.b().activeTab?.status === 'error', 'Failed remote-close save should remain visible as an error')
      assert.equal(f.b().activeTab?.content, 'Draft retained after conflict')
      assert.equal(f.b().activeTab?.savedContent, 'Body draft.md')
      assert.deepEqual(f.remote?.docs.panes[0].tabs, [])
      assert.equal(f.writes.length, 1, 'A preserved local draft cannot overwrite the remote tab closure')
    } finally { await f.close() }
  })

  await t.test('forgetting a project clears account-scoped hydration before its next restoration', async () => {
    const f = await fixture({ docs: stored(['restored.md']) })
    try {
      await f.ready(); await delay()
      f.a().forgetProject('docs')
      await until(() => f.a().tabs.length === 0, 'Forgotten project state should be discarded')
      f.update({ docs: stored(['restored.md']), other: stored([]) })
      await until(() => f.a().tabs.some(tab => tab.path === 'restored.md'), 'The next account snapshot should restore the forgotten project')
      assert.equal(f.win.failures.length, 0, f.win.failures.join('; '))
    } finally { await f.close() }
  })
})
