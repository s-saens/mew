import './test-isolated-data.ts'
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ProjectRegistry } from './project-registry.ts'
import { GitConnectionError, GitConnections } from './git-connections.ts'
import { ProjectGit, publicCloneUrl } from './project-git.ts'
import type { withGitCredential } from './git-execution.ts'

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-project-git-'))
let sequence = 0
function fixture() {
  const root = path.join(temporary, String(sequence++))
  return { registry: new ProjectRegistry(path.join(root, 'data'), path.join(root, 'projects')), connections: new GitConnections(path.join(root, 'credentials')) }
}
function connect(connections: GitConnections, owner = 'a@example.test') {
  return connections.set(owner, { provider: 'github', host: 'github.com', login: 'example', identity: { name: 'Example', email: 'example@example.test' }, accessToken: 'fixture-secret-token' })
}
after(() => fs.rmSync(temporary, { recursive: true, force: true }))

test('public clones use the repository name, isolate host credentials, and register only for the creator', async () => {
  const { registry, connections } = fixture()
  let calls = 0
  const service = new ProjectGit(registry, connections, fetch, async (args, options) => {
    calls++
    assert.equal(args.at(-2), 'https://gitlab.com/group/subgroup/example.git')
    assert.equal(args.at(-1), path.join(registry.managedRoot, 'example'))
    assert.equal(options.cwd, args.at(-1))
    assert.equal(options.env.GIT_TERMINAL_PROMPT, '0')
    assert.equal(options.env.GIT_CONFIG_GLOBAL, process.platform === 'win32' ? 'NUL' : '/dev/null')
    assert.ok(args.includes('credential.helper='))
    assert.ok(args.includes('http.followRedirects=false'))
    assert.ok(args.includes('protocol.allow=never'))
    assert.ok(args.includes('init.templateDir='))
    assert.ok(args.includes('core.hooksPath=/dev/null'))
    fs.mkdirSync(path.join(options.cwd, '.git'))
    fs.writeFileSync(path.join(options.cwd, 'README.md'), 'repository fixture')
  })
  const result = await service.clone('a@example.test', 'https://gitlab.com/group/subgroup/example.git')
  assert.equal(result.managed, true)
  assert.equal(result.mine, true)
  assert.deepEqual(registry.readMine('a@example.test')?.paths, [result.path])
  assert.equal(registry.list('b@example.test')[0].mine, false)
  await assert.rejects(service.clone('b@example.test', 'https://gitlab.com/group/subgroup/example.git'), error => (error as { status: number }).status === 409)
  assert.equal(calls, 1, 'duplicate destination is rejected before Git runs')
  assert.equal(fs.readFileSync(path.join(result.path, 'README.md'), 'utf8'), 'repository fixture')
})

test('failed clones remove their reserved directory and never register or pin a partial repository', async () => {
  const { registry, connections } = fixture()
  const service = new ProjectGit(registry, connections, fetch, async (_args, options) => {
    fs.writeFileSync(path.join(options.cwd, 'partial'), 'incomplete')
    throw new Error('remote failure that must not escape to clients')
  })
  await assert.rejects(service.clone('a@example.test', 'https://github.com/org/failure.git'), error => (error as Error).message.includes('복제하지 못했습니다') && !(error as Error).message.includes('remote failure'))
  assert.deepEqual(registry.list('a@example.test'), [])
  assert.equal(registry.readMine('a@example.test'), null)
  assert.equal(fs.existsSync(path.join(registry.managedRoot, 'failure')), false)
})

test('connected private GitHub clones use the requesting account and the exact scoped helper', async () => {
  const { registry, connections } = fixture(), connection = connect(connections)
  connect(connections, 'b@example.test')
  let authenticated = false, ran = false
  const credential: typeof withGitCredential = async (record, target, run) => {
    assert.equal(record.id, connection.id)
    assert.deepEqual(target, { provider: 'github', host: 'github.com', url: 'https://github.com/org/private.git', path: 'org/private.git' })
    authenticated = true
    return run({ GIT_TERMINAL_PROMPT: '0', MEW_GIT_CREDENTIAL_SOCKET: 'fixture-socket' }, ['credential.helper=fixture-helper'])
  }
  const service = new ProjectGit(registry, connections, fetch, async (args, options) => {
    assert.equal(authenticated, true)
    assert.equal(options.env.MEW_GIT_CREDENTIAL_SOCKET, 'fixture-socket')
    assert.ok(args.includes('credential.helper=fixture-helper'))
    assert.ok(!JSON.stringify({ args, env: options.env }).includes('fixture-secret-token'))
    fs.mkdirSync(path.join(options.cwd, '.git'))
    ran = true
  }, credential)
  await service.clone('a@example.test', 'https://github.com/org/private.git')
  assert.equal(ran, true)
})

test('repository listing returns public, private and organization repositories across every page without exposing tokens', async () => {
  const { registry, connections } = fixture(), record = connect(connections)
  const calls: string[] = []
  const request: typeof fetch = async (input, init) => {
    const url = new URL(String(input))
    calls.push(url.toString())
    assert.equal(url.origin, 'https://api.github.com')
    assert.equal(url.searchParams.get('affiliation'), 'owner,collaborator,organization_member')
    assert.equal(url.searchParams.get('visibility'), 'all')
    assert.ok(init?.headers)
    assert.equal((init.headers as Record<string, string>).Authorization, `Bearer ${record.accessToken}`)
    assert.equal(init?.redirect, 'error')
    return new Response(JSON.stringify(url.searchParams.get('page') === '1'
      ? [{ name: 'public', full_name: 'example/public', clone_url: 'https://github.com/example/public.git', private: false }]
      : [{ name: 'private', full_name: 'organization/private', clone_url: 'https://github.com/organization/private.git', private: true }]), { headers: url.searchParams.get('page') === '1' ? { link: '<https://malicious.invalid/token>; rel="next"' } : {} })
  }
  const service = new ProjectGit(registry, connections, request)
  const result = await service.repositories('a@example.test')
  assert.deepEqual(result, { connected: true, repositories: [
    { name: 'public', fullName: 'example/public', url: 'https://github.com/example/public.git', private: false },
    { name: 'private', fullName: 'organization/private', url: 'https://github.com/organization/private.git', private: true },
  ] })
  assert.equal(calls.length, 2)
  assert.ok(!JSON.stringify(result).includes(record.accessToken))
  assert.deepEqual(await service.repositories('b@example.test'), { connected: false, repositories: [] })
  assert.equal(calls.length, 2, 'disconnected accounts make no provider request')
})

test('repository listing reports revoked and temporarily unavailable connections and rejects late account replacement', async () => {
  for (const status of [401, 403, 500]) {
    const { registry, connections } = fixture()
    connect(connections)
    const service = new ProjectGit(registry, connections, async () => new Response('', { status }))
    await assert.rejects(service.repositories('a@example.test'), error => error instanceof GitConnectionError && error.status === (status === 401 ? 428 : 503))
  }
  const { registry, connections } = fixture()
  connect(connections)
  const service = new ProjectGit(registry, connections, async () => {
    connections.remove('a@example.test')
    return new Response('[]')
  })
  await assert.rejects(service.repositories('a@example.test'), GitConnectionError)
})

test('clone URLs cannot use local transports, embedded credentials, redirects, traversal or unregistered hosts', () => {
  for (const input of [null, '', '--upload-pack=evil', 'file:///tmp/repository', 'git@github.com:org/repo.git', 'https://a:b@github.com/org/repo', 'http://github.com/org/repo', 'https://github.com/org/repo?token=secret', 'https://github.com/org/repo#fragment', 'https://github.com:444/org/repo', 'https://github.com/org/../repo', 'https://github.com/org/%2e%2e/repo', 'https://127.0.0.1/org/repo', 'https://example.org/org/repo']) assert.throws(() => publicCloneUrl(input))
  assert.equal(publicCloneUrl('https://github.com/org/repo.git').hostname, 'github.com')
  assert.equal(publicCloneUrl('https://gitlab.com/group/subgroup/repo.git').hostname, 'gitlab.com')
})
