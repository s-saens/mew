import './test-isolated-data.ts'
import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeAgentTabs, type AgentTabsState } from '../shared/agent-tabs.ts'
import { saveAgentTabs } from './agent-tab-state.ts'
import { readAgentTabs } from './userUiState.ts'

test('agent tab deltas retain concurrent additions, renames, session pointers and active selection', () => {
  const base: AgentTabsState = { tabs: [{ id: 'one', label: 'One', sessionIds: { old: 'session-old' } }], activeId: 'one' }
  const current: AgentTabsState = {
    tabs: [{ id: 'one', label: 'Remote rename', renamed: true, sessionIds: { old: 'session-updated', remote: 'remote-pointer' } }, { id: 'remote', label: 'Remote' }],
    activeId: 'remote',
  }
  const next: AgentTabsState = {
    tabs: [{ ...base.tabs[0], cwd: '/work/new', sessionIds: { old: 'session-old', local: 'local-pointer' } }, { id: 'local', label: 'Local' }],
    activeId: 'one',
  }
  assert.deepEqual(mergeAgentTabs(current, base, next), {
    tabs: [
      { id: 'one', label: 'Remote rename', renamed: true, cwd: '/work/new', sessionIds: { old: 'session-updated', remote: 'remote-pointer', local: 'local-pointer' } },
      { id: 'remote', label: 'Remote' }, { id: 'local', label: 'Local' },
    ],
    activeId: 'remote',
  })
  assert.equal(mergeAgentTabs(current, base, { ...next, activeId: 'local' }).activeId, 'local')
})

test('agent tab closes do not remove remote additions or resurrect remotely closed tabs', () => {
  const base: AgentTabsState = { tabs: [{ id: 'one', label: 'One' }, { id: 'two', label: 'Two' }], activeId: 'one' }
  const current: AgentTabsState = { tabs: [{ id: 'two', label: 'Two' }, { id: 'remote', label: 'Remote' }], activeId: 'remote' }
  const next: AgentTabsState = { tabs: [{ id: 'one', label: 'Local stale rename' }], activeId: 'one' }
  assert.deepEqual(mergeAgentTabs(current, base, next), { tabs: [{ id: 'remote', label: 'Remote' }], activeId: 'remote' })
  assert.equal(mergeAgentTabs(current, base, { tabs: [], activeId: null }).activeId, null)
})

test('agent tab deltas apply explicit field removals and reorder without dropping remote tabs', () => {
  const base: AgentTabsState = { tabs: [{ id: 'one', label: 'One', renamed: true, sessionIds: { old: 'old' } }, { id: 'two', label: 'Two' }], activeId: 'one' }
  const current: AgentTabsState = {
    tabs: [{ ...base.tabs[0], sessionIds: { old: 'old', remote: 'remote' } }, base.tabs[1], { id: 'remote', label: 'Remote' }], activeId: 'one',
  }
  const next: AgentTabsState = { tabs: [base.tabs[1], { id: 'one', label: 'Renamed locally' }], activeId: 'two' }
  assert.deepEqual(mergeAgentTabs(current, base, next), {
    tabs: [{ id: 'two', label: 'Two' }, { id: 'one', label: 'Renamed locally', sessionIds: { remote: 'remote' } }, { id: 'remote', label: 'Remote' }], activeId: 'two',
  })
})

test('server agent saves merge stale device snapshots and protect first-device initialization', async () => {
  const email = 'agent-delta@example.test', root = '/work/agent-deltas'
  const base: AgentTabsState = { tabs: [{ id: 'one', label: 'One' }], activeId: 'one' }
  await saveAgentTabs(email, root, base)
  const remote: AgentTabsState = { tabs: [base.tabs[0], { id: 'remote', label: 'Remote' }], activeId: 'remote' }
  await saveAgentTabs(email, root, { ...remote, base })
  const merged = await saveAgentTabs(email, root, { tabs: [{ ...base.tabs[0], label: 'Local rename' }], activeId: 'one', base })
  assert.deepEqual(merged, { tabs: [{ id: 'one', label: 'Local rename' }, { id: 'remote', label: 'Remote' }], activeId: 'remote' })
  assert.deepEqual(await saveAgentTabs(email, root, { ...base, initialize: true }), merged)
  assert.deepEqual(readAgentTabs(email, root), merged)
  await assert.rejects(saveAgentTabs(email, root, { ...base, base: [] }))
  assert.deepEqual(readAgentTabs(email, root), merged)

  assert.deepEqual(await saveAgentTabs(email, root, base), base, 'legacy clients retain whole-snapshot save behavior')
  assert.deepEqual(await saveAgentTabs(email, '/work/agent-first-device', { ...base, initialize: true }), base)
})
