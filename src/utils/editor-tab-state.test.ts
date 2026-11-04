import assert from 'node:assert/strict'
import test from 'node:test'
import type { Tab } from '../hooks/useTabs.ts'
import { normalizeStoredTabs, reconcileEditorTabs, storedEditorTabs, type EditorTabState, type StoredTabs } from './editor-tab-state.ts'
import { leaf } from './paneTree.ts'

const tab = (path: string, id = path): Tab => ({ id, path, content: 'draft', savedContent: 'baseline', committedContent: 'baseline', rules: null, status: 'idle', preview: false, viewMode: 'plain', editable: true })
const stored = (paths: string[], activePath = paths[0] ?? null): StoredTabs => ({ panes: [{ id: 'main', tabs: paths.map(path => ({ path, preview: false, viewMode: 'plain' })), activePath }], layout: leaf('main'), focusedPaneId: 'main' })

test('remote opens, selection, reorder and close preserve retained buffers and identities', () => {
  const one = tab('one.md'), two = tab('two.md')
  const previous: EditorTabState = { panes: [{ id: 'main', tabs: [one, two], activePath: 'one.md' }], layout: leaf('main'), focusedPaneId: 'main' }
  const incoming = stored(['two.md', 'three.md'], 'three.md')
  const next = reconcileEditorTabs(previous, incoming, metadata => ({ ...tab(metadata.path), ...metadata, deferredLoad: true }))
  assert.deepEqual(next.panes[0].tabs.map(tab => tab.path), ['two.md', 'three.md'])
  assert.equal(next.panes[0].tabs[0].id, two.id)
  assert.equal(next.panes[0].tabs[0].content, 'draft')
  assert.equal(next.panes[0].tabs[0].savedContent, 'baseline')
  assert.equal(next.panes[0].activeTabId, next.panes[0].tabs[1].id)
  assert.equal(next.panes[0].tabs[1].deferredLoad, true)
  assert.deepEqual(storedEditorTabs(next, 'docs'), incoming, 'applying remote metadata must not generate a different account snapshot')
})

test('moving a tab to a remote pane keeps its draft, identity and load state', () => {
  const draft = { ...tab('one.md'), revalidating: true, navigation: { entries: ['old.md', 'one.md'], index: 1 } }
  const previous = { panes: [{ id: 'main', tabs: [draft], activePath: draft.path }], layout: leaf('main'), focusedPaneId: 'main' }
  const incoming = { ...stored(['one.md']), panes: [{ ...stored(['one.md']).panes[0], id: 'remote' }], layout: leaf('remote'), focusedPaneId: 'remote' }
  const next = reconcileEditorTabs(previous, incoming, () => { throw new Error('existing buffer must be reused') })
  assert.deepEqual(next.panes[0].tabs[0], draft)
  assert.equal(next.panes[0].activeTabId, draft.id)
  assert.deepEqual(storedEditorTabs(next, 'docs'), incoming)
})

test('external tabs remain local and file bodies never enter account metadata', () => {
  const local = tab('@fs:/private/secret.txt'), shared = tab('one.md')
  const previous = { panes: [{ id: 'main', tabs: [local, shared], activePath: shared.path }], layout: leaf('main'), focusedPaneId: 'main' }
  const next = reconcileEditorTabs(previous, stored(['one.md']), tab)
  assert.equal(next.panes[0].tabs[1], local)
  const payload = storedEditorTabs(next, '.workspace')
  assert.equal(payload.unifiedScopes, true)
  assert.equal(JSON.stringify(payload).includes('draft'), false)
  assert.equal(JSON.stringify(payload).includes('secret'), false)
  const externalActive = { ...previous, panes: [{ ...previous.panes[0], activePath: local.path }] }
  const sharedMetadata = storedEditorTabs(externalActive, 'docs')
  assert.equal(normalizeStoredTabs(sharedMetadata)?.panes[0].activePath, null, 'an explicit local-only selection cannot become a remote shared selection')
})

test('normalization accepts legacy metadata and rejects duplicate or malformed remote entries', () => {
  assert.equal(normalizeStoredTabs([]), null)
  assert.equal(normalizeStoredTabs({ panes: [] }), null)
  const legacy = stored(['one.md'])
  legacy.panes[0].tabs[0].viewMode = 'hotview'
  assert.deepEqual(normalizeStoredTabs({ tabs: [{ path: 'one.md', preview: false }], activePath: 'missing.md' }), legacy)
  const input = stored(['one.md', 'one.md', '@fs:/secret', 'two.md'])
  input.panes.push(input.panes[0])
  assert.deepEqual(normalizeStoredTabs(input), stored(['one.md', 'two.md']))
})
