import './test-isolated-data.ts'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { gitConnections } from './git-connections.ts'
import { commandWithGitIdentity } from './command-git-identity.ts'

test('command invocations use the initiating account without changing the shared shell or repository', { skip: process.platform === 'win32' }, t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-command-identity-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
  git('init', '-q')
  git('config', 'user.name', 'Host')
  git('config', 'user.email', 'host@example.test')
  gitConnections.set('alice@example.test', { provider: 'github', host: 'github.com', login: 'alice', identity: { name: "Alice O'Neil", email: 'alice@users.noreply.github.com' }, accessToken: 'fixture-secret' })
  gitConnections.set('bob@example.test', { provider: 'github', host: 'github.com', login: 'bob', identity: { name: 'Bob', email: 'bob@example.test' }, accessToken: 'other-secret' })
  const alice = commandWithGitIdentity('git commit --allow-empty -qm first', 'alice@example.test')
  const bob = commandWithGitIdentity('git commit --allow-empty -qm second', 'bob@example.test')
  assert.ok(!alice.includes('fixture-secret'))
  const output = execFileSync('/bin/sh', ['-c', `${alice}\n${bob}\nprintf '%s' "$GIT_AUTHOR_EMAIL"`], { cwd: root, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_EMAIL: 'shell@example.test', GIT_AUTHOR_DATE: '2000-01-01T00:00:00Z' } })
  assert.equal(output, 'shell@example.test')
  assert.equal(git('log', '-1', '--format=%an|%ae|%cn|%ce'), 'Bob|bob@example.test|Bob|bob@example.test')
  assert.equal(git('log', '-1', '--skip=1', '--format=%an|%ae|%cn|%ce'), "Alice O'Neil|alice@users.noreply.github.com|Alice O'Neil|alice@users.noreply.github.com")
  assert.notEqual(git('log', '-1', '--format=%aI').slice(0, 4), '2000')
  assert.equal(git('config', 'user.email'), 'host@example.test')
  const fallback = commandWithGitIdentity('git commit --allow-empty -qm fallback', 'carol@example.test')
  execFileSync('/bin/sh', ['-c', fallback], { cwd: root })
  assert.equal(git('log', '-1', '--format=%an|%ae'), 'carol|carol@example.test')
})
