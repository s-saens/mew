import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { simpleGit } from 'simple-git'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-git-history-scope-'))
const paths = await import('./paths.ts')
const originalRoot = paths.WORKSPACE_ROOT
paths.setWorkspaceRoot(root)
const { repositoryLog } = await import('./gitWorkbench.ts')

after(() => {
  paths.setWorkspaceRoot(originalRoot)
  fs.rmSync(root, { recursive: true, force: true })
})

test('history follows HEAD across branches, worktrees, detached HEAD and merges', async () => {
  const directory = path.join(root, 'repo')
  fs.mkdirSync(directory)
  const git = simpleGit(directory)
  await git.init(['--initial-branch=main'])
  await git.addConfig('user.name', 'Mew Test')
  await git.addConfig('user.email', 'mew@example.com')
  assert.deepEqual(await repositoryLog(paths.WORKSPACE_PROJECT, 'repo'), [])
  await git.commit('base', ['--allow-empty'])
  const base = (await git.revparse(['HEAD'])).trim()
  const worktree = path.join(root, 'feature')
  await git.raw(['worktree', 'add', '-b', 'feat/task', worktree])
  const feature = simpleGit(worktree)
  await feature.commit('feature only', ['--allow-empty'])
  const featureHash = (await feature.revparse(['HEAD'])).trim()
  await git.raw(['update-ref', 'refs/remotes/origin/feature', featureHash])
  await feature.addTag('feature-only-tag')
  const subjects = async (folder: string) => (await repositoryLog(paths.WORKSPACE_PROJECT, folder)).map(entry => entry.subject)
  assert.deepEqual(await subjects('repo'), ['base'], 'unmerged local, remote and tagged commits stay out of main history')
  assert.deepEqual(await subjects('feature'), ['feature only', 'base'], 'each worktree uses its own HEAD')
  await git.raw(['switch', '-c', 'review', featureHash])
  assert.deepEqual(await subjects('repo'), ['feature only', 'base'], 'switching branches changes the history scope')
  assert.equal((await repositoryLog(paths.WORKSPACE_PROJECT, 'repo', 1)).length, 1)
  await git.raw(['switch', '--detach', base])
  assert.deepEqual(await subjects('repo'), ['base'], 'detached HEAD does not expose unrelated refs')
  await git.raw(['switch', '--orphan', 'empty'])
  assert.deepEqual(await subjects('repo'), [], 'an unborn branch stays empty even when other refs have commits')
  await git.raw(['switch', 'main'])
  await git.raw(['merge', '--no-ff', '-m', 'merge feature', 'feat/task'])
  assert.deepEqual(await subjects('repo'), ['merge feature', 'feature only', 'base'], 'merged branch commits remain part of current history')
})
