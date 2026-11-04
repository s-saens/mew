import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeAgentTabs, type AgentTabsState } from '../../shared/agent-tabs.ts'
import { createAgentTabsSync, type AgentTabsWrite } from './agent-tabs-sync.ts'

const tick = () => new Promise(resolve => setTimeout(resolve, 0))
const state = (...ids: string[]): AgentTabsState => ({
  tabs: ids.map(id => ({ id, label: id, runtime: id.startsWith('shell') ? 'tmux' : 'codex', cwd: '/workspace' })),
  activeId: ids.at(-1) ?? null,
})
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
function ledger(initial: AgentTabsState | null) {
  let remote = initial
  const writes: AgentTabsWrite[] = []
  return {
    read: async () => remote,
    get value() { return remote },
    set value(value: AgentTabsState | null) { remote = value },
    writes,
    write: async (input: AgentTabsWrite) => {
      writes.push(input)
      if (input.initialize && remote) return remote
      const submitted = { tabs: input.tabs, activeId: input.activeId }
      remote = remote && input.base ? mergeAgentTabs(remote, input.base, submitted) : submitted
      return remote
    },
  }
}

test('agent and shell tabs, order, names and active selection propagate without echo saves', async () => {
  const server = ledger(state('agent-a', 'shell-a'))
  let first = state(), second = state()
  const firstSync = createAgentTabsSync(first, { ...server, apply: value => { first = value }, ready() {}, onError: assert.fail })
  const secondSync = createAgentTabsSync(second, { ...server, apply: value => { second = value }, ready() {}, onError: assert.fail })
  try {
    await Promise.all([firstSync.refresh(), secondSync.refresh()])
    assert.deepEqual(first, second)
    assert.equal(server.writes.length, 0, 'restoring the account registry never writes it back')
    const changed = { tabs: [{ ...first.tabs[1], label: 'Shared shell' }, first.tabs[0]], activeId: 'agent-a' }
    firstSync.change(changed)
    await tick()
    await secondSync.refresh()
    assert.deepEqual(second, changed)
    secondSync.change(second)
    await tick()
    assert.equal(server.writes.length, 1, 'rendering a received update does not produce another PUT')
    assert.deepEqual(server.writes[0].base, state('agent-a', 'shell-a'))
    secondSync.change(state('shell-a'))
    await tick()
    await firstSync.refresh()
    assert.deepEqual(first, state('shell-a'))
  } finally { firstSync.dispose(); secondSync.dispose() }
})

test('simultaneous device additions preserve both agent and terminal tabs', async () => {
  const server = ledger(state('agent-existing'))
  let first = state(), second = state()
  const firstSync = createAgentTabsSync(first, { ...server, apply: value => { first = value }, ready() {}, onError: assert.fail })
  const secondSync = createAgentTabsSync(second, { ...server, apply: value => { second = value }, ready() {}, onError: assert.fail })
  try {
    await Promise.all([firstSync.refresh(), secondSync.refresh()])
    firstSync.change(state('agent-existing', 'agent-new'))
    secondSync.change(state('agent-existing', 'shell-new'))
    await tick()
    await Promise.all([firstSync.refresh(), secondSync.refresh()])
    assert.deepEqual(new Set(first.tabs.map(tab => tab.id)), new Set(['agent-existing', 'agent-new', 'shell-new']))
    assert.deepEqual(first, second)
  } finally { firstSync.dispose(); secondSync.dispose() }
})

test('a local edit during an outstanding refresh rebases over remote additions and closes', async () => {
  const server = ledger(state('agent-a', 'agent-closed'))
  const pending = deferred<AgentTabsState | null>()
  let local = state(), holdRead = false
  const sync = createAgentTabsSync(local, {
    ...server,
    read: () => holdRead ? pending.promise : server.read(),
    apply: value => { local = value }, ready() {}, onError: assert.fail,
  })
  try {
    await sync.refresh()
    holdRead = true
    const refresh = sync.refresh()
    sync.change({ ...local, tabs: local.tabs.map(tab => tab.id === 'agent-a' ? { ...tab, label: 'Local rename' } : tab) })
    server.value = state('agent-a', 'shell-remote')
    holdRead = false
    pending.resolve(server.value)
    await refresh
    assert.deepEqual(local.tabs.map(tab => [tab.id, tab.label]), [['agent-a', 'Local rename'], ['shell-remote', 'shell-remote']])
    assert.equal(local.activeId, 'shell-remote')
    assert.deepEqual(local, server.value)
    assert.equal(server.writes.length, 1)
  } finally { sync.dispose() }
})

test('edits during a save preserve returned remote tabs and the newest session pointer', async () => {
  const server = ledger(state('agent-a'))
  const pending = deferred<AgentTabsState>()
  let local = state(), holdWrite = true, outstanding = 0, maximum = 0
  const sync = createAgentTabsSync(local, {
    ...server,
    write: async input => {
      outstanding++; maximum = Math.max(maximum, outstanding)
      try {
        if (holdWrite) {
          holdWrite = false
          await pending.promise
        }
        return await server.write(input)
      } finally { outstanding-- }
    },
    apply: value => { local = value }, ready() {}, onError: assert.fail,
  })
  try {
    await sync.refresh()
    const renamed = { ...local, tabs: [{ ...local.tabs[0], label: 'Renamed' }] }
    sync.change(renamed)
    sync.change({ ...renamed, tabs: [{ ...renamed.tabs[0], sessionIds: { slot: 'newest-session' } }] })
    server.value = state('agent-a', 'shell-remote')
    pending.resolve(server.value)
    await tick()
    assert.equal(maximum, 1)
    assert.equal(server.writes.length, 2)
    assert.deepEqual(local.tabs.map(tab => tab.id), ['agent-a', 'shell-remote'])
    assert.equal(local.tabs[0].label, 'Renamed')
    assert.deepEqual(local.tabs[0].sessionIds, { slot: 'newest-session' })
    assert.deepEqual(local, server.value)
  } finally { sync.dispose() }
})

test('first-device migration cannot overwrite a registry initialized while its read was pending', async () => {
  const server = ledger(null)
  const pending = deferred<AgentTabsState | null>()
  let local = state()
  const sync = createAgentTabsSync(local, { ...server, read: () => pending.promise, apply: value => { local = value }, ready() {}, onError: assert.fail })
  try {
    const refresh = sync.refresh()
    server.value = state('agent-other-device', 'shell-other-device')
    pending.resolve(null)
    await refresh
    assert.deepEqual(local, server.value)
    assert.equal(server.writes.length, 1)
    assert.equal(server.writes[0].initialize, true)
  } finally { sync.dispose() }
})

test('a failed write retains local edits for reconnection and ignores work after disposal', async () => {
  const server = ledger(state('agent-a'))
  const pending = deferred<AgentTabsState | null>()
  let fail = false, holdRead = false, local = state(), errors = 0, applied = 0
  const sync = createAgentTabsSync(local, {
    ...server,
    read: () => holdRead ? pending.promise : server.read(),
    write: input => fail ? Promise.reject(new Error('offline')) : server.write(input),
    apply: value => { local = value; applied++ }, ready() {}, onError: () => { errors++ },
  })
  await sync.refresh()
  fail = true
  sync.change(state('agent-a', 'shell-unsaved'))
  await tick()
  assert.equal(errors, 1)
  assert.deepEqual(server.value, state('agent-a'))
  fail = false
  await sync.refresh()
  assert.deepEqual(local, state('agent-a', 'shell-unsaved'))
  const appliedBeforeDispose = applied
  holdRead = true
  const refresh = sync.refresh()
  sync.dispose()
  pending.resolve(state('agent-after-account-switch'))
  await refresh
  sync.change(state('shell-after-disposal'))
  assert.equal(applied, appliedBeforeDispose)
  assert.deepEqual(server.value, state('agent-a', 'shell-unsaved'))
})
