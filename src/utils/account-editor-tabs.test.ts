import assert from 'node:assert/strict'
import test from 'node:test'
import type { StoredTabs } from './editor-tab-state.ts'
import { createAccountEditorTabsSync, type AccountEditorTabs, type AccountEditorTabsSnapshot } from './account-editor-tabs.ts'

const tabs = (path: string): StoredTabs => ({
  panes: [{ id: 'main', activePath: path, tabs: [{ path, preview: false, viewMode: 'hotview' }] }],
  layout: { kind: 'leaf', pane: 'main' }, focusedPaneId: 'main',
})
const snapshot = (state: AccountEditorTabs | null, revision = 0): AccountEditorTabsSnapshot => ({ state, revision })
const tick = () => new Promise(resolve => setTimeout(resolve, 0))
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

test('initial account state is authoritative and pre-hydration browser state cannot write', async () => {
  const initial = deferred<AccountEditorTabsSnapshot>(), remote = { docs: tabs('server.md') }
  const applied: AccountEditorTabs[] = []
  let writes = 0
  const sync = createAccountEditorTabsSync({
    read: () => initial.promise, write: async () => { writes++; return snapshot(null) },
    apply: value => applied.push(value), onError: assert.fail,
  })
  sync.refresh(); sync.change('docs', tabs('stale-browser.md'))
  assert.deepEqual(applied, [])
  initial.resolve(snapshot(remote, 4)); await tick()
  assert.deepEqual(applied, [remote]); assert.equal(writes, 0)
  sync.refresh(); await tick()
  assert.equal(applied.length, 1, 'identical refreshes do not feed another restoration')
  sync.dispose()
})

test('empty server state hydrates before one-time browser migration; later edits are normal saves', async () => {
  let remote: AccountEditorTabs | null = null, revision = 0
  const writes: { project: string; initialize: boolean }[] = [], applied: AccountEditorTabs[] = []
  const sync = createAccountEditorTabsSync({
    read: async () => snapshot(remote, revision),
    write: async (project, state, initialize) => {
      writes.push({ project, initialize }); remote = { ...remote, [project]: state }
      return snapshot(remote, ++revision)
    }, apply: value => applied.push(value), onError: assert.fail,
  })
  sync.refresh(); await tick()
  assert.deepEqual(applied, [{}])
  sync.change('docs', tabs('migrated.md')); await tick()
  sync.change('docs', tabs('edited.md')); await tick()
  assert.deepEqual(writes, [{ project: 'docs', initialize: true }, { project: 'docs', initialize: false }])
  assert.deepEqual(applied.at(-1), { docs: tabs('edited.md') })
  sync.dispose()
})

test('identical restoration notifications do not save account state again', async () => {
  const existing = tabs('server.md')
  let writes = 0
  const sync = createAccountEditorTabsSync({
    read: async () => snapshot({ docs: existing }, 1),
    write: async () => { writes++; return snapshot({ docs: existing }, 1) },
    apply: () => {}, onError: assert.fail,
  })
  sync.refresh(); await tick(); sync.change('docs', structuredClone(existing)); await tick()
  assert.equal(writes, 0)
  sync.dispose()
})

test('concurrent migration preserves an existing server project and every other project', async () => {
  let remote: AccountEditorTabs | null = null, revision = 0, local: AccountEditorTabs = {}
  const sync = createAccountEditorTabsSync({
    read: async () => snapshot(remote, revision),
    write: async (project, _state, initialize) => {
      assert.equal(project, 'docs'); assert.equal(initialize, true)
      remote = { docs: tabs('other-device.md'), code: tabs('app.ts') }; revision = 2
      return snapshot(remote, revision)
    }, apply: value => { local = value }, onError: assert.fail,
  })
  sync.refresh(); await tick(); sync.change('docs', tabs('legacy.md')); await tick()
  assert.deepEqual(local, remote)
  sync.dispose()
})

test('refreshes during an in-flight query use one trailing query and ignore its stale result', async () => {
  const first = deferred<AccountEditorTabsSnapshot>(), second = deferred<AccountEditorTabsSnapshot>()
  const applied: AccountEditorTabs[] = []
  let reads = 0
  const sync = createAccountEditorTabsSync({
    read: () => ++reads === 1 ? first.promise : second.promise,
    write: async () => { assert.fail('A query cannot save browser tabs') },
    apply: value => applied.push(value), onError: assert.fail,
  })
  sync.refresh(); sync.refresh(); sync.refresh()
  assert.equal(reads, 1, 'queries stay ordered even when signals arrive together')
  first.resolve(snapshot({ docs: tabs('stale.md') }, 1)); await tick()
  assert.equal(reads, 2); assert.deepEqual(applied, [])
  second.resolve(snapshot({ docs: tabs('latest.md') }, 2)); await tick()
  assert.deepEqual(applied, [{ docs: tabs('latest.md') }])
  sync.dispose()
})

test('a query started before a local edit cannot replace that edit', async () => {
  const stale = deferred<AccountEditorTabsSnapshot>(), save = deferred<AccountEditorTabsSnapshot>()
  let reads = 0, local: AccountEditorTabs = {}, remote = { docs: tabs('initial.md') }
  const writes: StoredTabs[] = []
  const sync = createAccountEditorTabsSync({
    read: () => ++reads === 2 ? stale.promise : Promise.resolve(snapshot(remote, reads === 1 ? 1 : 3)),
    write: async (_project, state, initialize) => { assert.equal(initialize, false); writes.push(state); return save.promise },
    apply: value => { local = value }, onError: assert.fail,
  })
  sync.refresh(); await tick(); sync.refresh(); sync.change('docs', tabs('local.md'))
  stale.resolve(snapshot({ docs: tabs('stale.md') }, 2)); await tick()
  assert.deepEqual(local, { docs: tabs('local.md') }); assert.deepEqual(writes, [tabs('local.md')])
  remote = { docs: tabs('local.md') }; save.resolve(snapshot(remote, 3)); await tick()
  assert.deepEqual(local, remote)
  sync.dispose()
})

test('rapid edits coalesce behind one save without overwriting newer optimistic project state', async () => {
  const firstSave = deferred<AccountEditorTabsSnapshot>()
  let remote: AccountEditorTabs = { docs: tabs('initial.md'), code: tabs('app.ts') }, revision = 1, local = remote
  const writes: [string, StoredTabs][] = []
  const sync = createAccountEditorTabsSync({
    read: async () => snapshot(remote, revision),
    write: async (project, state) => {
      writes.push([project, state])
      if (writes.length === 1) return firstSave.promise
      remote = { ...remote, [project]: state }; return snapshot(remote, ++revision)
    }, apply: value => { local = value }, onError: assert.fail,
  })
  sync.refresh(); await tick()
  sync.change('docs', tabs('first.md')); sync.change('docs', tabs('second.md')); sync.change('docs', tabs('last.md'))
  sync.change('code', tabs('changed.ts'))
  assert.equal(writes.length, 1)
  remote = { ...remote, docs: tabs('first.md') }; firstSave.resolve(snapshot(remote, ++revision)); await tick()
  assert.deepEqual(writes, [['docs', tabs('first.md')], ['docs', tabs('last.md')], ['code', tabs('changed.ts')]])
  assert.deepEqual(local, { docs: tabs('last.md'), code: tabs('changed.ts') })
  assert.deepEqual(remote, local)
  sync.dispose()
})

test('the query after a write observes a newer save from another device without an echo write', async () => {
  let reads = 0, writes = 0, local: AccountEditorTabs = {}
  const sync = createAccountEditorTabsSync({
    read: async () => snapshot({ docs: tabs(++reads === 1 ? 'initial.md' : 'other-device.md') }, reads === 1 ? 1 : 3),
    write: async (_project, state) => { writes++; return snapshot({ docs: state }, 2) },
    apply: value => { local = value }, onError: assert.fail,
  })
  sync.refresh(); await tick(); sync.change('docs', tabs('my-device.md')); await tick()
  assert.deepEqual(local, { docs: tabs('other-device.md') }); assert.equal(writes, 1)
  sync.dispose()
})

test('older server revisions cannot roll back an accepted save', async () => {
  let reads = 0, local: AccountEditorTabs = {}
  const sync = createAccountEditorTabsSync({
    read: async () => snapshot({ docs: tabs('older.md') }, ++reads === 1 ? 1 : 2),
    write: async (_project, state) => snapshot({ docs: state }, 3),
    apply: value => { local = value }, onError: assert.fail,
  })
  sync.refresh(); await tick(); sync.change('docs', tabs('newest.md')); await tick(); sync.refresh(); await tick()
  assert.deepEqual(local, { docs: tabs('newest.md') })
  sync.dispose()
})

test('failed hydration stays pending, does not migrate empty browser tabs and retries on refresh', async () => {
  let offline = true, writes = 0, errors = 0
  const applied: AccountEditorTabs[] = []
  const sync = createAccountEditorTabsSync({
    read: async () => { if (offline) throw new Error('offline'); return snapshot({ docs: tabs('server.md') }, 2) },
    write: async () => { writes++; return snapshot(null) },
    apply: value => applied.push(value), onError: () => { errors++ },
  })
  sync.refresh(); await tick(); sync.change('docs', tabs('empty-browser.md')); await tick()
  assert.deepEqual(applied, []); assert.equal(errors, 1); assert.equal(writes, 0)
  offline = false; sync.refresh(); await tick()
  assert.deepEqual(applied, [{ docs: tabs('server.md') }])
  sync.dispose()
})

test('failed saves preserve explicit local changes and retry on reconnect', async () => {
  let offline = true, errors = 0, remote = { docs: tabs('initial.md') }, local = remote
  const writes: StoredTabs[] = []
  const sync = createAccountEditorTabsSync({
    read: async () => snapshot(remote, 1),
    write: async (_project, state) => {
      writes.push(state); if (offline) throw new Error('offline')
      remote = { docs: state }; return snapshot(remote, 2)
    }, apply: value => { local = value as typeof remote }, onError: () => { errors++ },
  })
  sync.refresh(); await tick(); sync.change('docs', tabs('unsaved.md')); await tick()
  assert.equal(errors, 1); assert.deepEqual(local, { docs: tabs('unsaved.md') })
  offline = false; sync.refresh(); await tick()
  assert.deepEqual(writes, [tabs('unsaved.md'), tabs('unsaved.md')]); assert.deepEqual(local, remote)
  sync.dispose()
})

test('two connected controllers share tab changes; simultaneous edits converge to the last server save', async () => {
  let remote: AccountEditorTabs = { docs: tabs('initial.md') }, revision = 1
  let first: AccountEditorTabs = {}, second: AccountEditorTabs = {}, writes = 0
  const delayed = deferred<void>()
  const controllers: ReturnType<typeof createAccountEditorTabsSync>[] = []
  const write = async (project: string, state: StoredTabs) => {
    writes++
    if (state.panes[0].activePath === 'second-device.md') await delayed.promise
    remote = { ...remote, [project]: state }
    const result = snapshot(remote, ++revision)
    for (const controller of controllers) controller.refresh()
    return result
  }
  const a = createAccountEditorTabsSync({ read: async () => snapshot(remote, revision), write, apply: value => { first = value }, onError: assert.fail })
  const b = createAccountEditorTabsSync({ read: async () => snapshot(remote, revision), write, apply: value => { second = value }, onError: assert.fail })
  controllers.push(a, b)
  a.refresh(); b.refresh(); await tick()
  a.change('docs', tabs('shared.md')); await tick()
  assert.deepEqual(first, second); assert.deepEqual(first, remote)
  b.change('docs', tabs('second-device.md')); a.change('docs', tabs('first-device.md')); await tick()
  assert.deepEqual(first, { docs: tabs('first-device.md') })
  delayed.resolve(); await tick()
  assert.deepEqual(first, { docs: tabs('second-device.md') }); assert.deepEqual(first, second)
  assert.equal(writes, 3, 'remote snapshots do not write back to the server')
  a.dispose(); b.dispose()
})

test('workspace or account disposal aborts an old query and ignores every late result', async () => {
  const oldResponse = deferred<AccountEditorTabsSnapshot>(), applied: AccountEditorTabs[] = []
  let oldSignal: AbortSignal | undefined, writes = 0
  const old = createAccountEditorTabsSync({
    read: signal => { oldSignal = signal; return oldResponse.promise },
    write: async () => { writes++; return snapshot(null) }, apply: value => applied.push(value), onError: assert.fail,
  })
  old.refresh(); old.dispose(); old.refresh(); old.change('docs', tabs('old-account.md'))
  const next = createAccountEditorTabsSync({
    read: async () => snapshot({ docs: tabs('new-account.md') }, 1),
    write: async () => { assert.fail('No write expected') }, apply: value => applied.push(value), onError: assert.fail,
  })
  next.refresh(); await tick(); oldResponse.resolve(snapshot({ docs: tabs('old-account.md') }, 9)); await tick()
  assert.equal(oldSignal?.aborted, true); assert.equal(writes, 0)
  assert.deepEqual(applied, [{ docs: tabs('new-account.md') }])
  next.dispose()
})

test('disposal while saving drops queued writes, ignores late failures and leaves the next scope untouched', async () => {
  const save = deferred<AccountEditorTabsSnapshot>(), applied: AccountEditorTabs[] = []
  let writes = 0, writeSignal: AbortSignal | undefined
  const sync = createAccountEditorTabsSync({
    read: async () => snapshot({ docs: tabs('initial.md') }, 1),
    write: async (_project, _state, _initialize, signal) => { writes++; writeSignal = signal; return save.promise },
    apply: value => applied.push(value), onError: assert.fail,
  })
  sync.refresh(); await tick()
  sync.change('docs', tabs('first.md')); sync.change('docs', tabs('queued.md'))
  sync.dispose(); save.reject(new Error('Old account disconnected')); await tick()
  assert.equal(writeSignal?.aborted, true); assert.equal(writes, 1)
  assert.deepEqual(applied.at(-1), { docs: tabs('queued.md') })
})
