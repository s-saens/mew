import test from 'node:test'
import assert from 'node:assert/strict'
import { projectHierarchy } from './project-hierarchy.ts'

test('project hierarchy groups descendants by nearest ancestor and numbers shortcuts in displayed order', () => {
  const rows = projectHierarchy(['/mew/mewlink', '/other', '/mew', '/mew/mewlink/app', '/mew-two', '/mew'])
  assert.deepEqual(rows.map(({path, depth, index}) => [path, depth, index]), [
    ['/other', 0, 0], ['/mew', 0, 1], ['/mew/mewlink', 1, 2], ['/mew/mewlink/app', 2, 3], ['/mew-two', 0, 4],
  ])
  assert.equal(rows[3].parentPath, '/mew/mewlink')
})

test('project hierarchy handles roots, Windows separators, trailing separators and removed parents', () => {
  assert.deepEqual(projectHierarchy(['/child', '/']).map(row => [row.path, row.depth]), [['/', 0], ['/child', 1]])
  assert.deepEqual(projectHierarchy(['C:\\work\\mew\\child', 'C:\\work\\mew\\']).map(row => row.depth), [0, 1])
  assert.deepEqual(projectHierarchy(['/mew/child']).map(row => row.depth), [0])
  assert.deepEqual(projectHierarchy([]), [])
})
