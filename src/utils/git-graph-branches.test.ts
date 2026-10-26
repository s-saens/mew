import assert from 'node:assert/strict'
import test from 'node:test'
import { graphLayout } from './git-graph.ts'
import { graphBranchTargets } from './git-graph-branches.ts'
import type { GitBranchRef, GitLogEntry } from '../api/client'

const branch = (name: string, kind: GitBranchRef['kind'] = 'local'): GitBranchRef => ({ name, kind, ref: `refs/${kind === 'local' ? 'heads' : kind === 'remote' ? 'remotes' : 'tags'}/${name}` })
const commit = (hash: string, parents: string[], branches: GitBranchRef[] = []): GitLogEntry => ({ hash, parents, branches, refs: [], subject: hash, author: '', email: '', date: '' })
const names = (targets: GitBranchRef[]) => targets.map(item => item.name)

test('merged paths retain real first-parent branch identities and shared ancestors offer every branch', () => {
  const commits = [commit('merge', ['main', 'feature'], [branch('main'), branch('origin/main', 'remote')]), commit('main', ['base']), commit('feature', ['base'], [branch('feature')]), commit('base', [], [branch('v1', 'tag')])]
  const rows = graphLayout(commits).rows
  const targets = graphBranchTargets(commits, rows)
  assert.deepEqual(targets[0].edges.map(names), [['main', 'origin/main'], ['feature']])
  assert.deepEqual(names(targets[1].node), ['main', 'origin/main'])
  assert.deepEqual(names(targets[2].node), ['feature'])
  assert.deepEqual(targets[2].edges.map(names).at(-1), ['feature'], 'a feature curve keeps its identity until reaching a shared ancestor')
  assert.deepEqual(names(targets[3].node), ['main', 'origin/main', 'feature'])
})

test('lane reuse never leaks another branch, while truncated or unnamed paths do not invent targets', () => {
  const commits = [commit('a', ['older'], [branch('a')]), commit('b', [], [branch('b')]), commit('c', [], [branch('c')]), commit('unnamed', [])]
  const rows = graphLayout(commits).rows
  const targets = graphBranchTargets(commits, rows)
  assert.equal(rows[1].lane, rows[2].lane)
  assert.deepEqual(names(targets[1].node), ['b'])
  assert.deepEqual(names(targets[2].node), ['c'])
  assert.deepEqual(names(targets[2].edges[0]), ['a'], 'known branch identity continues across a truncated history boundary')
  assert.deepEqual(targets[3].node, [])
})
