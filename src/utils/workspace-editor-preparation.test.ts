import assert from 'node:assert/strict'
import test from 'node:test'
import { workspaceEditorPreparations } from './workspace-editor-preparation.ts'

const stored = (path: string, viewMode: 'plain' | 'hotview' = 'plain') => ({
  panes: [{ id: 'main', activePath: path, tabs: [{ path, preview: false, viewMode }] }],
  layout: { kind: 'leaf', pane: 'main' }, focusedPaneId: 'main',
})

test('initial editor preparation selects only active restored engines and normalizes document scope', () => {
  const workspace = stored('first.md')
  workspace.panes[0].tabs.push({ path: 'inactive.py', preview: false, viewMode: 'plain' })
  assert.deepEqual(workspaceEditorPreparations({ tabs: { '.workspace': workspace } }), [{ mode: 'plain', path: 'first.md' }])
  assert.deepEqual(workspaceEditorPreparations({ tabs: { docs: stored('guide.md', 'hotview') } }), [{ mode: 'hotview', path: 'guide.md' }])
  assert.deepEqual(workspaceEditorPreparations({ tabs: { '.workspace': stored('mew:file:docs/guide.md', 'hotview') } }), [{ mode: 'hotview', path: 'guide.md' }])
  assert.deepEqual(workspaceEditorPreparations({ tabs: { '.workspace': { ...workspace, unifiedScopes: true }, docs: stored('ignored.md', 'hotview') } }), [{ mode: 'plain', path: 'first.md' }])
})

test('preparation preserves legacy merged-pane selection and ignores inactive or invalid paths', () => {
  assert.deepEqual(workspaceEditorPreparations({ tabs: { '.workspace': stored('root.ts'), docs: stored('guide.md', 'hotview') } }), [{ mode: 'plain', path: 'root.ts' }])
  for (const path of ['photo.png', 'file.exe', '@fs:/outside/file.md', 'mew:diff:' + encodeURIComponent(JSON.stringify(['docs', '', null, 'file.md']))]) {
    assert.deepEqual(workspaceEditorPreparations({ tabs: { '.workspace': stored(path) } }), [], path)
  }
  assert.deepEqual(workspaceEditorPreparations({ tabs: { '.workspace': stored('preview.svg', 'hotview') } }), [])
  assert.deepEqual(workspaceEditorPreparations({ tabs: { '.workspace': stored('preview.svg', 'plain') } }), [{ mode: 'plain', path: 'preview.svg' }])
  const noActive = stored('first.md'); noActive.panes[0].activePath = 'missing.md'
  assert.deepEqual(workspaceEditorPreparations({ tabs: { '.workspace': noActive } }), [])
})

test('optional metadata preparation rejects malformed states without changing restoration', () => {
  for (const state of [null, [], {}, { tabs: [] }, { tabs: { '.workspace': { panes: [{}] } } }, { tabs: { '.workspace': stored('file.md', 'unknown' as 'plain') } }]) {
    assert.deepEqual(workspaceEditorPreparations(state), [])
  }
})
