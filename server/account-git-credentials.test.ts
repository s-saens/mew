import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-git-shell-'))
process.env.MEW_DATA_DIR = path.join(root, 'data')
process.env.MEW_WORKSPACE = root
const { upsertUser } = await import('./auth.ts')
const { gitConnections } = await import('./git-connections.ts')
const { accountGitCredentialEnv, accountFromGitCapability } = await import('./account-git-credentials.ts')
const accounts = ['alice@example.test', 'bob@example.test']
for (const email of accounts) upsertUser(email, { displayName: email, hash: 'fixture', role: 'owner', mustChangePassword: false, createdAt: 1, passwordChangedAt: 0 })
for (const [index, email] of accounts.entries()) gitConnections.set(email, { provider: 'github', host: 'github.com', login: `user${index}`, identity: { name: `User ${index}`, email }, accessToken: `fixture-token-${index}` })
test.after(() => fs.rmSync(root, { recursive: true, force: true }))

function fill(env: NodeJS.ProcessEnv, host = 'github.com', protocol = 'https', repo = 'owner/repo.git') {
  return spawnSync('git', ['credential', 'fill'], { input: `protocol=${protocol}\nhost=${host}\npath=${repo}\n\n`, env, encoding: 'utf8' })
}

test('Git credentials follow the initiating Mew account, not host or repository configuration', () => {
  const home = path.join(root, 'home'); fs.mkdirSync(home)
  fs.writeFileSync(path.join(home, '.gitconfig'), '[credential "https://github.com"]\n\thelper = !f() { echo username=other; echo password=os-token; }; f\n')
  const base = { ...process.env, HOME: home, GITHUB_TOKEN: 'host-token' }
  const alice = accountGitCredentialEnv(base, accounts[0])
  const bob = accountGitCredentialEnv(base, accounts[1])
  for (const [index, env] of [alice, bob].entries()) {
    const result = fill(env)
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, new RegExp(`password=fixture-token-${index}`))
    assert.doesNotMatch(result.stdout, /os-token|host-token/)
    assert.equal(JSON.stringify(env).includes(`fixture-token-${index}`), false)
    assert.equal(env.GITHUB_TOKEN, undefined)
    assert.equal(accountFromGitCapability(env.MEW_GIT_ACCOUNT_CAPABILITY_FILE!), accounts[index])
  }
  const repo = path.join(root, 'repo'); fs.mkdirSync(repo); execFileSync('git', ['init', '-q'], { cwd: repo })
  execFileSync('git', ['remote', 'add', 'origin', 'git@github.com:owner/repo.git'], { cwd: repo })
  const remote = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: repo, env: alice, encoding: 'utf8' }).trim()
  assert.equal(remote, 'https://github.com/owner/repo.git')
})

test('disconnection and account replacement invalidate access without OS credential fallback', () => {
  const env = accountGitCredentialEnv(process.env, accounts[0])
  gitConnections.remove(accounts[0])
  assert.notEqual(fill(env).status, 0)
  assert.notEqual(fill(env, 'other.example').status, 0)
  assert.notEqual(fill(env, 'github.com', 'https', 'invalid/path/extra').status, 0)
  upsertUser(accounts[0], { displayName: 'New account', hash: 'fixture', role: 'owner', mustChangePassword: false, createdAt: 2, passwordChangedAt: 0 })
  assert.throws(() => accountFromGitCapability(env.MEW_GIT_ACCOUNT_CAPABILITY_FILE!))
})
