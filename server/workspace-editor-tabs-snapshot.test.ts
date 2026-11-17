import assert from 'node:assert/strict'
import test from 'node:test'
import { readWorkspaceEditorTabsSnapshot, type WorkspaceUiSnapshotInfo } from '../shared/workspace-ui-snapshot.ts'

const info = (editorTabs: unknown): WorkspaceUiSnapshotInfo => ({ path: '/worktree', projectPath: '/project', editorTabs })
const valid = { workspacePath: '/project', state: { docs: { active: 'README.md' } }, revision: 7 }

test('authoritative tab snapshots retain logical project identity, null and revision', () => {
  assert.deepEqual(readWorkspaceEditorTabsSnapshot(info(valid)), valid)
  assert.deepEqual(readWorkspaceEditorTabsSnapshot(info({ ...valid, state: null, revision: 0 })), { ...valid, state: null, revision: 0 })
  assert.equal(readWorkspaceEditorTabsSnapshot({ ...info(valid), hasProject: false }), undefined)
  assert.equal(readWorkspaceEditorTabsSnapshot(info({ ...valid, workspacePath: '/worktree' })), undefined)
})

test('malformed, inherited, throwing and oversized optional tabs preserve the separate authoritative read', () => {
  const inherited = Object.create(valid)
  const throwing = Object.defineProperty({}, 'workspacePath', { get() { throw new Error('must not evaluate envelope getters') } })
  const stateGetter = Object.defineProperty({}, 'docs', { enumerable: true, get() { throw new Error('invalid state getter') } })
  const circular: Record<string, unknown> = {}; circular.self = circular
  const values = [
    undefined, null, [], {}, inherited, throwing,
    { ...valid, revision: undefined }, { ...valid, revision: -1 }, { ...valid, revision: 1.5 },
    { ...valid, revision: Infinity }, { ...valid, revision: Number.MAX_SAFE_INTEGER + 1 },
    { ...valid, state: [] }, { ...valid, state: { docs: null } }, { ...valid, state: { docs: [] } },
    { ...valid, state: { '': {} } }, { ...valid, state: stateGetter }, { ...valid, state: { docs: circular } },
    { ...valid, state: { docs: { body: '한'.repeat(24_000) } } },
  ]
  for (const value of values) assert.equal(readWorkspaceEditorTabsSnapshot(info(value)), undefined)
  assert.equal(readWorkspaceEditorTabsSnapshot(Object.create(info(valid))), undefined, 'inherited top-level envelopes are omitted')
})
