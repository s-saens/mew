import test from 'node:test'
import assert from 'node:assert/strict'
import { selectTreeItem, topLevelTreeItems, type TreeSelection, type TreeSelectionItem } from './tree-selection.ts'

const ordered: TreeSelectionItem[] = ['a', 'b', 'c', 'd', 'e'].map(path => ({ path, type: 'file' }))
const empty = (): TreeSelection => ({ paths: new Set(), anchor: null })
const paths = (selection: TreeSelection) => [...selection.paths]

test('ordinary clicks replace the selection and establish a new anchor', () => {
  const current: TreeSelection = { paths: new Set(['b', 'c']), anchor: 'b' }
  const next = selectTreeItem(current, ordered, 'e', {})
  assert.deepEqual(paths(next), ['e'])
  assert.equal(next.anchor, 'e')
  assert.deepEqual(paths(current), ['b', 'c'], 'selection changes do not mutate the previous set')
  assert.equal(current.anchor, 'b')
})

test('Control and Command toggle individual rows, including the final selected row', () => {
  for (const modifier of [{ ctrlKey: true }, { metaKey: true }, { ctrlKey: true, metaKey: true }]) {
    const first = selectTreeItem(empty(), ordered, 'b', modifier)
    const second = selectTreeItem(first, ordered, 'd', modifier)
    const third = selectTreeItem(second, ordered, 'b', modifier)
    const last = selectTreeItem(third, ordered, 'd', modifier)
    assert.deepEqual(paths(first), ['b'])
    assert.deepEqual(paths(second), ['b', 'd'])
    assert.deepEqual(paths(third), ['d'])
    assert.equal(third.anchor, 'b', 'a toggled-off row remains the next range anchor')
    assert.deepEqual(paths(last), [])
    assert.equal(last.anchor, 'd')
  }
})

test('Shift extends and shrinks a range from a stable anchor in either direction', () => {
  const start = selectTreeItem(empty(), ordered, 'c', {})
  const forward = selectTreeItem(start, ordered, 'e', { shiftKey: true })
  const shrinkForward = selectTreeItem(forward, ordered, 'd', { shiftKey: true })
  const reverse = selectTreeItem(shrinkForward, ordered, 'a', { shiftKey: true })
  const shrinkReverse = selectTreeItem(reverse, ordered, 'b', { shiftKey: true })
  const anchorOnly = selectTreeItem(shrinkReverse, ordered, 'c', { shiftKey: true })
  assert.deepEqual(paths(forward), ['c', 'd', 'e'])
  assert.deepEqual(paths(shrinkForward), ['c', 'd'])
  assert.deepEqual(paths(reverse), ['a', 'b', 'c'])
  assert.deepEqual(paths(shrinkReverse), ['b', 'c'])
  assert.deepEqual(paths(anchorOnly), ['c'])
  for (const selection of [forward, shrinkForward, reverse, shrinkReverse, anchorOnly]) assert.equal(selection.anchor, 'c')
})

test('Shift replaces an existing disjoint selection while Control/Command+Shift adds the range', () => {
  const current: TreeSelection = { paths: new Set(['a', 'e']), anchor: 'e' }
  const replacement = selectTreeItem(current, ordered, 'c', { shiftKey: true })
  assert.deepEqual(paths(replacement), ['c', 'd', 'e'])
  for (const modifier of [{ ctrlKey: true }, { metaKey: true }]) {
    const added = selectTreeItem(current, ordered, 'c', { ...modifier, shiftKey: true })
    assert.deepEqual(new Set(paths(added)), new Set(['a', 'c', 'd', 'e']))
    assert.equal(added.anchor, 'e')
    assert.deepEqual(paths(current), ['a', 'e'])
  }
})

test('a toggled-off anchor can still establish a Shift range', () => {
  const start = selectTreeItem(empty(), ordered, 'b', { ctrlKey: true })
  const removed = selectTreeItem(start, ordered, 'b', { ctrlKey: true })
  const range = selectTreeItem(removed, ordered, 'd', { shiftKey: true })
  assert.deepEqual(paths(range), ['b', 'c', 'd'])
  assert.equal(range.anchor, 'b')
})

test('missing and hidden anchors fall back to the target instead of stale row positions', () => {
  for (const anchor of [null, 'removed']) {
    const current: TreeSelection = { paths: new Set(['a']), anchor }
    const next = selectTreeItem(current, ordered, 'd', { shiftKey: true })
    assert.deepEqual(paths(next), ['d'])
    assert.equal(next.anchor, 'd')
  }
  const hidden: TreeSelection = { paths: new Set(['b', 'e']), anchor: 'b' }
  const next = selectTreeItem(hidden, ordered.filter(item => item.path !== 'b'), 'd', { shiftKey: true, metaKey: true })
  assert.deepEqual(paths(next), ['b', 'e', 'd'])
  assert.equal(next.anchor, 'd')
  assert.deepEqual(paths(selectTreeItem(next, ordered, 'c', { shiftKey: true })), ['c', 'd'])
})

test('a missing target or empty row list also falls back to a single target', () => {
  const current: TreeSelection = { paths: new Set(['a', 'b']), anchor: 'b' }
  for (const rows of [ordered, []]) {
    const next = selectTreeItem(current, rows, 'removed', { shiftKey: true })
    assert.deepEqual(paths(next), ['removed'])
    assert.equal(next.anchor, 'removed')
  }
})

test('ranges use the supplied display order and include read-only rows', () => {
  const rows: TreeSelectionItem[] = [
    { path: 'MOC.md', type: 'file' },
    { path: 'folder', type: 'dir' },
    { path: 'folder/z.md', type: 'file', editable: false },
    { path: 'a.md', type: 'file' },
  ]
  const current = selectTreeItem(empty(), rows, 'a.md', {})
  assert.deepEqual(paths(selectTreeItem(current, rows, 'folder', { shiftKey: true })), ['folder', 'folder/z.md', 'a.md'])
})

test('top-level items keep the first duplicate and preserve order and metadata', () => {
  const first: TreeSelectionItem = { path: 'a.md', type: 'file', editable: false }
  const second: TreeSelectionItem = { path: 'b.md', type: 'file' }
  const items = [first, second, { path: 'a.md', type: 'file' as const, editable: true }]
  const next = topLevelTreeItems(items)
  assert.deepEqual(next, [first, second])
  assert.equal(next[0], first)
  assert.equal(items.length, 3)
  assert.deepEqual(topLevelTreeItems([]), [])
})

test('selected directories cover descendants regardless of selection order', () => {
  const items: TreeSelectionItem[] = [
    { path: 'folder/deep/child.md', type: 'file' },
    { path: 'folder/deep', type: 'dir' },
    { path: 'other.md', type: 'file' },
    { path: 'folder', type: 'dir' },
    { path: 'folder/direct.md', type: 'file' },
  ]
  assert.deepEqual(topLevelTreeItems(items).map(item => item.path), ['other.md', 'folder'])
})

test('directory coverage respects segment boundaries and file items do not cover paths', () => {
  const items: TreeSelectionItem[] = [
    { path: 'foo', type: 'dir' },
    { path: 'foobar/note.md', type: 'file' },
    { path: 'foo/child.md', type: 'file' },
    { path: 'foo.md', type: 'file' },
    { path: 'foo.md/child.md', type: 'file' },
    { path: 'a/foo/child.md', type: 'file' },
  ]
  assert.deepEqual(topLevelTreeItems(items).map(item => item.path), ['foo', 'foobar/note.md', 'foo.md', 'foo.md/child.md', 'a/foo/child.md'])
})

test('a selected root directory covers every non-root item', () => {
  const root: TreeSelectionItem = { path: '', type: 'dir' }
  assert.deepEqual(topLevelTreeItems([{ path: 'a.md', type: 'file' }, root, { path: 'folder/note.md', type: 'file' }]), [root])
})
