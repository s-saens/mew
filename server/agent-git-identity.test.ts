import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-agent-git-identity-'))
process.env.MEW_DATA_DIR = path.join(root, 'data')
process.env.MEW_WORKSPACE = root
const { upsertUser } = await import('./auth.ts')
const { gitConnections } = await import('./git-connections.ts')
const { agentGitEnv } = await import('./agent-git-identity.ts')
const { workspaceContext, pathsForWorkspace } = await import('./paths.ts')
const { AgentSession } = await import('./agentAcp.ts')
for (const [email, displayName] of [['alice@example.test', 'Alice Profile'], ['bob@example.test', 'Bob Profile']]) {
  upsertUser(email, { displayName, hash: 'unused-fixture', role: 'owner', mustChangePassword: false, createdAt: 0, passwordChangedAt: 0 })
}
gitConnections.set('alice@example.test', { provider: 'github', host: 'github.com', login: 'alice', identity: { name: 'Alice GitHub', email: '123+alice@users.noreply.github.com' }, accessToken: 'private-fixture-token' })
test.after(() => fs.rmSync(root, { recursive: true, force: true }))

const stub = path.join(root, 'agent.mjs')
fs.writeFileSync(stub, `
import { AgentSideConnection, ndJsonStream, PROTOCOL_VERSION } from ${JSON.stringify(import.meta.resolve('@agentclientprotocol/sdk'))};
import { Readable, Writable } from 'node:stream';
import { execFileSync, spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
new AgentSideConnection(() => ({
 initialize: async () => {
  execFileSync('git', ['commit', '--allow-empty', '-m', 'agent commit']);
  if (process.env.MEW_TEST_GIT_REPORT) {
   const result = spawnSync('git', ['credential', 'fill'], {input:'protocol=https\\nhost=github.com\\npath=owner/repo.git\\n\\n', encoding:'utf8'});
   writeFileSync(process.env.MEW_TEST_GIT_REPORT, JSON.stringify({alice:result.status === 0 && result.stdout.includes('password=private-fixture-token')}));
  }
  return {protocolVersion: PROTOCOL_VERSION, agentCapabilities: {}};
 },
 newSession: async () => ({sessionId:'fixture-session'}),
 cancel: async () => {}, prompt: async () => ({stopReason:'end_turn'})
}), ndJsonStream(Writable.toWeb(process.stdout), Readable.toWeb(process.stdin)));
`)

test('ACP child commits as its initiating account and preserves shared Git configuration', async () => {
  const cwd = path.join(root, 'repo')
  fs.mkdirSync(cwd)
  const git = (...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
  git('init', '-q')
  git('config', 'user.name', 'OS User')
  git('config', 'user.email', 'os@example.test')
  for (const [email, expected] of [
    ['alice@example.test', 'Alice GitHub|123+alice@users.noreply.github.com'],
    ['bob@example.test', 'Bob Profile|bob@example.test'],
  ]) {
    const session = await workspaceContext.run(pathsForWorkspace(root, email), () => AgentSession.start('identity-fixture', {
      cmd: process.execPath, args: [stub], env: { GIT_AUTHOR_NAME: 'Wrong Runtime', GIT_AUTHOR_EMAIL: 'wrong@example.test', GIT_AUTHOR_DATE: '2000-01-01T00:00:00Z' },
    }, cwd))
    try {
      assert.equal(git('log', '-1', '--format=%an|%ae;%cn|%ce'), `${expected};${expected}`)
      assert.notEqual(git('log', '-1', '--format=%aI').slice(0, 4), '2000')
    } finally { session.dispose() }
  }
  assert.equal(git('config', 'user.name'), 'OS User')
  assert.equal(git('config', 'user.email'), 'os@example.test')
})

test('ACP Git authentication follows its initiating Mew account without OS credential fallback', async () => {
  const fixture = path.join(root, 'credential-agent.mjs')
  fs.writeFileSync(fixture, `
import { AgentSideConnection, ndJsonStream, PROTOCOL_VERSION } from ${JSON.stringify(import.meta.resolve('@agentclientprotocol/sdk'))};
import { Readable, Writable } from 'node:stream';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
new AgentSideConnection(() => ({
 initialize: async () => {
  const result = spawnSync('git', ['credential', 'fill'], {input: 'protocol=https\\nhost=github.com\\npath=owner/repo.git\\n\\n', encoding:'utf8'});
  writeFileSync(process.env.MEW_CREDENTIAL_TEST_REPORT, JSON.stringify({ok:result.status === 0, alice:result.stdout.includes('password=private-fixture-token'), os:result.stdout.includes('password=os-fallback-token')}));
  return {protocolVersion: PROTOCOL_VERSION, agentCapabilities:{}};
 },
 newSession: async () => ({sessionId:'credential-fixture'}),
 cancel: async () => {}, prompt: async () => ({stopReason:'end_turn'})
}), ndJsonStream(Writable.toWeb(process.stdout), Readable.toWeb(process.stdin)));
`)
  const home = path.join(root, 'credential-home')
  fs.mkdirSync(home)
  fs.writeFileSync(path.join(home, '.gitconfig'), '[credential]\n\thelper = "!f() { echo username=os; echo password=os-fallback-token; }; f"\n')
  for (const [email, expected] of [
    ['alice@example.test', { ok: true, alice: true, os: false }],
    ['bob@example.test', { ok: false, alice: false, os: false }],
  ] as const) {
    const report = path.join(root, `${email}-credential.json`)
    const session = await workspaceContext.run(pathsForWorkspace(root, email), () => AgentSession.start('identity-fixture', {
      cmd: process.execPath, args: [fixture], env: { HOME: home, MEW_CREDENTIAL_TEST_REPORT: report },
    }, root))
    try { assert.deepEqual(JSON.parse(fs.readFileSync(report, 'utf8')), expected) } finally { session.dispose() }
  }
})

test('supervisor inherits account attribution and scoped auth without tokens or mutations to parent env', () => {
  const base = { PATH: '/fixture', GIT_AUTHOR_NAME: 'OS User', GIT_AUTHOR_DATE: 'old' }
  const env = workspaceContext.run(pathsForWorkspace(root, 'alice@example.test'), () => agentGitEnv(base))
  assert.equal(env.GIT_COMMITTER_EMAIL, '123+alice@users.noreply.github.com')
  assert.equal(env.GIT_AUTHOR_DATE, undefined)
  assert.equal(env.PATH, '/fixture')
  assert.equal(JSON.stringify(env).includes('private-fixture-token'), false)
  assert.equal(base.GIT_AUTHOR_NAME, 'OS User')
  assert.deepEqual(agentGitEnv(base, null), base)
  assert.throws(() => agentGitEnv(base, 'missing@example.test'), /로그인 계정/)
})

test('detached supervisor keeps the initiating identity when another account reconnects', async () => {
  process.env.MEW_AGENT_CODEX_CMD = process.execPath
  process.env.MEW_AGENT_CODEX_ARGS = stub
  process.env.MEW_TEST_GIT_REPORT = path.join(root, 'detached-git-auth.json')
  const { connectAgentHost, shutdownAgentHostsForWorkspace } = await import('./agentHost.ts')
  const cwd = path.join(root, 'supervised-repo')
  fs.mkdirSync(cwd)
  const git = (...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
  git('init', '-q')
  git('config', 'user.name', 'OS User')
  git('config', 'user.email', 'os@example.test')
  let markReady!: () => void
  let failReady!: (error: Error) => void
  const ready = new Promise<void>((resolve, reject) => { markReady = resolve; failReady = reject })
  const client = await workspaceContext.run(pathsForWorkspace(root, 'alice@example.test'), () => connectAgentHost('codex', 'identity-tab', cwd, {
    onEvent: event => { if (event.type === 'meta') markReady() },
    onFatal: message => failReady(new Error(message)),
  }))
  try {
    await ready
    const other = await workspaceContext.run(pathsForWorkspace(root, 'bob@example.test'), () => connectAgentHost('codex', 'identity-tab', cwd))
    other.close()
    assert.equal(git('log', '-1', '--format=%an|%ae;%cn|%ce'), 'Alice GitHub|123+alice@users.noreply.github.com;Alice GitHub|123+alice@users.noreply.github.com')
    assert.deepEqual(JSON.parse(fs.readFileSync(process.env.MEW_TEST_GIT_REPORT!, 'utf8')), { alice: true })
    assert.equal(git('rev-list', '--count', 'HEAD'), '1')
    assert.equal(git('config', 'user.email'), 'os@example.test')
  } finally { client.close(); await shutdownAgentHostsForWorkspace(cwd); delete process.env.MEW_TEST_GIT_REPORT }
})
