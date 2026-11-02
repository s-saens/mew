import assert from 'node:assert/strict'
import test from 'node:test'
import { MAX_WORKSPACE_UI_SNAPSHOT_BYTES, readWorkspaceUiSnapshot, type WorkspaceUiSnapshotInfo } from '../../shared/workspace-ui-snapshot.ts'
import { WorkspaceSnapshotCache } from './workspace-snapshot-cache.ts'
import { seedWorkspaceUiSnapshot } from './workspace-ui-startup.ts'

const scope = { sequence: 1, epoch: 0 }
const info = (state: unknown = { tabs: { active: 'README.md' } }): WorkspaceUiSnapshotInfo => ({
  path: '/worktree', projectPath: '/project', workspaceUi: { workspacePath: '/project', state },
})

test('initial UI snapshot uses the logical project and retains device restoration', async () => {
  const cache = new WorkspaceSnapshotCache<Record<string, unknown>>()
  const restored: string[] = []
  seedWorkspaceUiSnapshot(info(), cache, scope, scope, (path, state) => {
    restored.push(path)
    return { ...state, tabs: { active: 'device.md' } }
  })
  assert.deepEqual(restored, ['/project'])
  assert.deepEqual(cache.get('/project'), { tabs: { active: 'device.md' } })
  assert.equal(cache.get('/worktree'), undefined)
  let reads = 0
  assert.deepEqual(await cache.load('/project', async () => { reads++; return {} }), { tabs: { active: 'device.md' } })
  assert.equal(reads, 0, 'the accepted snapshot removes the sequential UI GET')
})

test('a known-empty null snapshot is loaded and still accepts device overrides', async () => {
  const cache = new WorkspaceSnapshotCache<Record<string, unknown>>()
  seedWorkspaceUiSnapshot(info(null), cache, scope, scope, (path, state) => {
    assert.equal(path, '/project')
    assert.deepEqual(state, {})
    return { chrome: { sidebarOpen: false } }
  })
  assert.deepEqual(cache.get('/project'), { chrome: { sidebarOpen: false } })
  await cache.load('/project', async () => assert.fail('null must not trigger another read'))
})

test('newer local and prefetched UI win over an initial response and pending old reads', async () => {
  const cache = new WorkspaceSnapshotCache<Record<string, unknown>>()
  let resolve!: (state: Record<string, unknown>) => void
  const pending = cache.load('/project', () => new Promise(yes => { resolve = yes }))
  cache.set('/project', { tabs: { active: 'newer.md' } })
  seedWorkspaceUiSnapshot(info(), cache, scope, scope, () => assert.fail('newer cache must win'))
  resolve({ tabs: { active: 'old.md' } })
  assert.deepEqual(await pending, { tabs: { active: 'newer.md' } })
  assert.deepEqual(cache.get('/project'), { tabs: { active: 'newer.md' } })
})

test('a current initial snapshot supersedes an older pending read without replacing newer edits', async () => {
  const cache = new WorkspaceSnapshotCache<Record<string, unknown>>()
  let resolve!: (state: Record<string, unknown>) => void
  const pending = cache.load('/project', () => new Promise(yes => { resolve = yes }))
  seedWorkspaceUiSnapshot(info(), cache, scope, scope, (_path, state) => state)
  resolve({ tabs: { active: 'old.md' } })
  assert.deepEqual(await pending, { tabs: { active: 'README.md' } })
})

test('obsolete root reads and permission epochs cannot seed a new scope', () => {
  for (const current of [{ sequence: 2, epoch: 0 }, { sequence: 1, epoch: 1 }, { sequence: 2, epoch: 1 }]) {
    const cache = new WorkspaceSnapshotCache<Record<string, unknown>>()
    seedWorkspaceUiSnapshot(info(), cache, scope, current, () => assert.fail('obsolete response cannot restore'))
    assert.equal(cache.get('/project'), undefined)
  }
})

test('legacy, malformed, wrong-root and projectless responses retain the old UI read', async () => {
  const malformed: WorkspaceUiSnapshotInfo[] = [
    { path: '/project' },
    { ...info(), hasProject: false },
    { ...info(), workspaceUi: null },
    { ...info(), workspaceUi: [] },
    { ...info(), workspaceUi: { workspacePath: '/worktree', state: {} } },
    { ...info(), workspaceUi: { workspacePath: '/project' } },
    { path: '', workspaceUi: { workspacePath: '', state: {} } },
    { path: undefined, workspaceUi: { state: {} } } as unknown as WorkspaceUiSnapshotInfo,
    ...[[], 0, '', false].map(state => info(state)),
  ]
  for (const value of malformed) {
    const cache = new WorkspaceSnapshotCache<Record<string, unknown>>()
    seedWorkspaceUiSnapshot(value, cache, scope, scope, () => assert.fail('invalid snapshots cannot restore'))
    let reads = 0
    await cache.load('/project', async () => { reads++; return { fallback: true } })
    assert.equal(reads, 1, 'old servers and omitted/malformed snapshots use the existing endpoint')
  }
})

test('snapshot fields must be own data properties and cannot invoke accessors', () => {
  let getters = 0
  const getter = () => { getters++; return {} }
  const values = [
    Object.defineProperty({ path: '/project' }, 'workspaceUi', { get: getter }),
    { path: '/project', workspaceUi: Object.create({ workspacePath: '/project', state: {} }) },
    { path: '/project', workspaceUi: Object.defineProperty({ workspacePath: '/project' }, 'state', { get: getter }) },
  ]
  for (const value of values) assert.equal(readWorkspaceUiSnapshot(value), undefined)
  assert.equal(getters, 0)
  const state = JSON.parse('{"__proto__":{"polluted":true},"tabs":{}}')
  const parsed = readWorkspaceUiSnapshot(info(state))!
  assert.equal(Object.hasOwn(parsed.state!, '__proto__'), true, 'stored keys remain data inside the state')
  assert.equal(({} as { polluted?: boolean }).polluted, undefined)
})

test('the inline snapshot limit counts UTF-8 bytes and includes its path envelope', () => {
  const base = Buffer.byteLength(JSON.stringify({ workspacePath: '/project', state: { text: '' } }))
  const exact = { text: 'a'.repeat(MAX_WORKSPACE_UI_SNAPSHOT_BYTES - base) }
  assert.ok(readWorkspaceUiSnapshot(info(exact)))
  assert.equal(readWorkspaceUiSnapshot(info({ text: exact.text + 'a' })), undefined)
  assert.equal(readWorkspaceUiSnapshot(info({ text: '한'.repeat(25_000) })), undefined)
})
