import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { simpleGit } from 'simple-git'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-branch-delete-'))
const paths = await import('./paths.ts')
const originalRoot = paths.WORKSPACE_ROOT
paths.setWorkspaceRoot(root)
const { repositoryBranches, runBranchAction } = await import('./gitWorkbench.ts')
after(() => {
  paths.setWorkspaceRoot(originalRoot)
  fs.rmSync(root, { recursive: true, force: true })
})

test('branches put main/master first and remotes last; deletion protects active and unmerged work', async () => {
  const directory = path.join(root, 'repo')
  fs.mkdirSync(directory)
  const git = simpleGit(directory)
  await git.init(['--initial-branch=main'])
  await git.addConfig('user.name', 'Mew Test')
  await git.addConfig('user.email', 'mew@example.com')
  await git.commit('base', ['--allow-empty'])
  const base = (await git.revparse(['HEAD'])).trim()
  for (const name of ['master', 'aaa/merged', 'zzz/merged']) await git.raw(['branch', name])
  await git.raw(['tag', 'v1'])
  await git.addRemote('origin', directory)
  await git.raw(['update-ref', 'refs/remotes/origin/topic', base])
  await git.raw(['update-ref', 'refs/remotes/other/topic', base])
  assert.deepEqual((await repositoryBranches(paths.WORKSPACE_PROJECT, 'repo')).map(item => item.name), [
    'main', 'master', 'aaa/merged', 'zzz/merged', 'v1', 'origin/topic', 'other/topic',
  ])

  await git.raw(['switch', '-c', 'unmerged'])
  await git.commit('unique work', ['--allow-empty'])
  const unique = (await git.revparse(['HEAD'])).trim()
  await git.raw(['update-ref', 'refs/remotes/origin/unmerged', unique])
  await git.raw(['branch', '--set-upstream-to=origin/unmerged', 'unmerged'])
  await git.raw(['switch', '-c', 'task/current', 'main'])
  await git.raw(['worktree', 'add', '-b', 'task/worktree', path.join(root, 'worktree')])
  fs.writeFileSync(path.join(directory, 'draft.txt'), 'staged work\n')
  await git.add('draft.txt')
  fs.writeFileSync(path.join(directory, 'draft.txt'), 'unstaged work\n')

  for (const ref of ['refs/heads/main', 'refs/heads/master', 'refs/remotes/origin/topic', 'refs/tags/v1', 'main', '--force', 'refs/heads/missing']) {
    await assert.rejects(runBranchAction(paths.WORKSPACE_PROJECT, 'repo', 'delete', ref))
  }
  for (const name of ['task/current', 'task/worktree']) {
    await assert.rejects(runBranchAction(paths.WORKSPACE_PROJECT, 'repo', 'delete', `refs/heads/${name}`), /사용 중/)
  }
  await assert.rejects(runBranchAction(paths.WORKSPACE_PROJECT, 'repo', 'delete', 'refs/heads/unmerged'), /병합되지 않은/)
  assert.equal((await git.revparse(['unmerged'])).trim(), unique, 'a matching upstream never permits losing unmerged local work')
  const result = await runBranchAction(paths.WORKSPACE_PROJECT, 'repo', 'delete', 'refs/heads/aaa/merged')
  assert.equal(result.branch, 'task/current')
  assert.equal((await repositoryBranches(paths.WORKSPACE_PROJECT, 'repo')).some(item => item.name === 'aaa/merged'), false)
  assert.equal((await git.revparse(['HEAD'])).trim(), base)
  assert.equal(fs.readFileSync(path.join(directory, 'draft.txt'), 'utf8'), 'unstaged work\n')
  assert.equal(await git.raw(['show', ':draft.txt']), 'staged work\n')
  assert.equal((await git.revparse(['refs/remotes/origin/topic'])).trim(), base)
})
