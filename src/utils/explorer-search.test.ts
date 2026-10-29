import test from 'node:test'
import assert from 'node:assert/strict'
import { explorerSearchTree } from './explorer-search.ts'

test('search retains matching branches, opens ancestors and preserves filesystem metadata', () => {
  const tree = [{ path: 'a1', name: 'a1', type: 'dir' as const, project: true, icon: 'i:folder' }]
  const result = explorerSearchTree(tree, {}, ['a1/b1/c1.md', 'a1/b2/c3.md'], false)
  assert.equal(result.tree[0].project, true)
  assert.deepEqual([...result.openDirs].sort(), ['a1', 'a1/b1', 'a1/b2'])
  assert.deepEqual(result.tree[0].children!.map(node => [node.path, node.children!.map(child => child.path)]), [
    ['a1/b1', ['a1/b1/c1.md']], ['a1/b2', ['a1/b2/c3.md']],
  ])
  assert.equal(tree[0].children, undefined, 'the browsing tree is unchanged')
})

test('Documents highlights the page represented by a matching folder file and keeps its representative', () => {
  const representative = { path: 'guide/_guide.md', name: '_guide.md', type: 'file' as const }
  const result = explorerSearchTree([], { guide: [representative] }, ['guide/_guide.md', 'guide/child.md'], true)
  assert.equal(result.matched.get('guide'), representative.path)
  assert.equal(result.matched.get('guide/child.md'), 'guide/child.md')
  assert.equal(result.tree[0].children!.filter(node => node.path === representative.path).length, 1)
  const childOnly = explorerSearchTree([], { guide: [representative] }, ['guide/child.md'], true)
  assert.ok(childOnly.tree[0].children!.includes(representative))
  assert.equal(childOnly.matched.has('guide'), false)
})

test('search deduplicates paths and supports empty results and a nested root', () => {
  assert.deepEqual(explorerSearchTree([], {}, [], false).tree, [])
  const result = explorerSearchTree([], {}, ['root/a.md', 'root/a.md', 'other/b.md'], false, 'root')
  assert.deepEqual(result.tree.map(node => node.path), ['root/a.md'])
})
