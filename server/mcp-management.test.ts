import './test-isolated-data.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { McpManagementError, McpManagementStore, CLOUDFLARE_MCP_URL, isCloudflareMcp, resolveMcpUsage } from './mcp-management.ts'
import { readSharedMcpConfig, sharedMcpConfigIdentity } from './shared-mcp.ts'
import type { SharedMcpConfig } from './shared-mcp.ts'
import type { McpManagementMutation } from '../shared/mcp-management.ts'

function fixture(t: test.TestContext, servers: Record<string, SharedMcpConfig> = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-mcp-management-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const cwd = path.join(directory, 'project'), registry = path.join(directory, 'private-mcp')
  fs.mkdirSync(path.join(cwd, '.git'), { recursive: true })
  fs.mkdirSync(registry)
  const configFile = path.join(registry, 'servers.json')
  fs.writeFileSync(configFile, JSON.stringify({ mcpServers: servers }))
  const store = new McpManagementStore(registry)
  const mutate = (action: Omit<McpManagementMutation, 'cwd' | 'revision'> | Record<string, unknown>) => store.mutate({ cwd, revision: store.list(cwd).revision, ...action } as McpManagementMutation)
  return { directory, cwd, registry, configFile, store, mutate }
}

test('Cloudflare inference accepts official hosts only and never groups a matching name', () => {
  for (const url of ['https://mcp.cloudflare.com/mcp', 'https://bindings.mcp.cloudflare.com/sse', 'https://builds.mcp.cloudflare.com/mcp', 'https://API.MCP.CLOUDFLARE.COM/mcp']) assert.equal(isCloudflareMcp({ url }), true, url)
  for (const url of ['https://mcp.cloudflare.com.evil.test/mcp', 'https://evilmcp.cloudflare.com/mcp', 'https://cloudflare.com/mcp', 'https://cloudflare.com@evil.test/mcp', 'https://token@mcp.cloudflare.com/mcp', 'http://mcp.cloudflare.com/mcp', 'not a url']) assert.equal(isCloudflareMcp({ url }), false, url)
  assert.equal(isCloudflareMcp({}), false)
})

test('list infers a virtual group without changing registry, metadata, auth, or project files', t => {
  const f = fixture(t, { api: { url: CLOUDFLARE_MCP_URL }, bindings: { url: 'https://bindings.mcp.cloudflare.com/mcp' }, cloudflare: { command: 'node', args: ['server.js'] } })
  const before = fs.readFileSync(f.configFile, 'utf8')
  const result = f.store.list(f.cwd)
  assert.deepEqual(result.groups.map(group => [group.id, group.suggested, group.members]), [['cloudflare', true, ['api', 'bindings']]])
  assert.equal(result.servers.find(server => server.name === 'cloudflare')!.groupId, null)
  assert.equal(fs.readFileSync(f.configFile, 'utf8'), before)
  assert.deepEqual(fs.readdirSync(f.registry), ['servers.json'])
  assert.equal(fs.existsSync(path.join(f.cwd, '.mew')), false)
})

test('summaries strip remote paths/query and all local environment, arguments and credential values', t => {
  const f = fixture(t, {
    remote: { url: 'https://api.example.test/private-secret?token=query-secret', headers: { Authorization: 'Bearer header-secret' }, env: { TOKEN: 'env-secret' }, oauth: { client_secret: 'oauth-secret' } },
    local: { command: '/home/private-secret/node', args: ['argument-secret'], env: { TOKEN: 'local-secret' } },
  })
  const inventory = f.store.list(f.cwd)
  assert.deepEqual(inventory.servers.map(server => server.endpoint), ['stdio', 'https://api.example.test'])
  assert.doesNotMatch(JSON.stringify(inventory), /private-secret|query-secret|header-secret|env-secret|oauth-secret|argument-secret|local-secret/)
})

test('one custom group per server; explicit ungrouping suppresses inferred membership', t => {
  const f = fixture(t, { cf: { url: 'https://builds.mcp.cloudflare.com/mcp' }, local: { command: 'node' } })
  let result = f.mutate({ action: 'create-group', name: 'Development', members: ['cf', 'local'] })
  const first = result.groups.find(group => group.name === 'Development')!.id
  assert.equal(result.servers.find(server => server.name === 'cf')!.groupId, first)
  result = f.mutate({ action: 'create-group', name: 'Services', members: ['cf'] })
  const second = result.groups.find(group => group.name === 'Services')!.id
  assert.deepEqual(result.groups.find(group => group.id === first)!.members, ['local'])
  assert.deepEqual(result.groups.find(group => group.id === second)!.members, ['cf'])
  result = f.mutate({ action: 'assign', names: ['cf'], groupId: null })
  assert.equal(result.servers.find(server => server.name === 'cf')!.groupId, null)
  assert.equal(result.servers.find(server => server.name === 'cf')!.inferredGroup, false)
  assert.equal(new McpManagementStore(f.registry).list(f.cwd).servers.find(server => server.name === 'cf')!.groupId, null)
})

test('group gate preserves individual preferences across all off/on transitions', t => {
  const f = fixture(t, { api: { url: CLOUDFLARE_MCP_URL }, builds: { url: 'https://builds.mcp.cloudflare.com/mcp' } })
  f.mutate({ action: 'usage', target: 'server', id: 'builds', scope: 'common', enabled: false })
  let result = f.mutate({ action: 'usage', target: 'group', id: 'cloudflare', scope: 'common', enabled: false })
  assert.equal(result.groups[0].enabledCount, 0)
  assert.equal(result.servers.find(server => server.name === 'api')!.usage.enabled, true)
  assert.equal(result.servers.find(server => server.name === 'api')!.effectiveEnabled, false)
  assert.equal(resolveMcpUsage(f.cwd, f.registry).enabledNames.size, 0)
  result = f.mutate({ action: 'usage', target: 'group', id: 'cloudflare', scope: 'common', enabled: true })
  assert.equal(result.groups[0].enabledCount, 1)
  assert.equal(result.servers.find(server => server.name === 'builds')!.usage.enabled, false)
  assert.deepEqual([...resolveMcpUsage(f.cwd, f.registry).enabledNames], ['api'])
})

test('project overrides inherit/reset and use nearest project boundary without changing common choices', t => {
  const f = fixture(t, { api: { url: CLOUDFLARE_MCP_URL }, off: { command: 'node', enabled: false } })
  const nested = path.join(f.cwd, 'src', 'feature')
  fs.mkdirSync(nested, { recursive: true })
  f.mutate({ action: 'usage', target: 'server', id: 'api', scope: 'common', enabled: false })
  let result = f.mutate({ action: 'usage', target: 'server', id: 'api', scope: 'project', enabled: true })
  assert.deepEqual(result.servers.find(server => server.name === 'api')!.usage, { common: false, project: true, enabled: true })
  assert.equal(f.store.list(nested).projectRoot, f.cwd)
  assert.equal(resolveMcpUsage(nested, f.registry).include('api'), true)
  f.mutate({ action: 'usage', target: 'server', id: 'off', scope: 'project', enabled: true })
  assert.equal(resolveMcpUsage(f.cwd, f.registry).include('off'), true)
  result = f.mutate({ action: 'usage', target: 'server', id: 'api', scope: 'project', enabled: null })
  assert.deepEqual(result.servers.find(server => server.name === 'api')!.usage, { common: false, project: null, enabled: false })
  const other = path.join(f.directory, 'other')
  fs.mkdirSync(path.join(other, '.git'), { recursive: true })
  assert.equal(f.store.list(other).servers.find(server => server.name === 'off')!.effectiveEnabled, false)
  const project = JSON.parse(fs.readFileSync(path.join(f.cwd, '.mew', 'mcp-usage.json'), 'utf8'))
  assert.deepEqual(Object.keys(project).sort(), ['usage', 'version'])
  assert.deepEqual(Object.keys(project.usage).sort(), ['groups', 'servers'])
})

test('usage changes preserve registry bytes and credential identity', t => {
  const f = fixture(t, { private: { url: CLOUDFLARE_MCP_URL, headers: { Authorization: 'Bearer preserved-secret' }, enabled: false } })
  const original = fs.readFileSync(f.configFile, 'utf8'), identity = sharedMcpConfigIdentity(readSharedMcpConfig(f.registry, 'private'))
  fs.mkdirSync(path.join(f.registry, 'auth'))
  fs.writeFileSync(path.join(f.registry, 'auth', 'fixture.json'), '{"token":"credential-secret"}')
  f.mutate({ action: 'usage', scope: 'common', target: 'server', id: 'private', enabled: true })
  assert.equal(resolveMcpUsage(f.cwd, f.registry).include('private'), true)
  assert.equal(fs.readFileSync(f.configFile, 'utf8'), original)
  assert.equal(sharedMcpConfigIdentity(readSharedMcpConfig(f.registry, 'private')), identity)
  assert.equal(fs.readFileSync(path.join(f.registry, 'auth', 'fixture.json'), 'utf8'), '{"token":"credential-secret"}')
  assert.doesNotMatch(fs.readFileSync(path.join(f.registry, 'management.json'), 'utf8'), /secret|Authorization/)
})

test('rename and remove custom groups preserve members, native configs and explicit ungrouping', t => {
  const f = fixture(t, { cf: { url: CLOUDFLARE_MCP_URL }, local: { command: 'node' } })
  const original = fs.readFileSync(f.configFile, 'utf8')
  let result = f.mutate({ action: 'create-group', name: 'My services', members: ['cf', 'local'] })
  const id = result.groups.find(group => !group.suggested)!.id
  result = f.mutate({ action: 'rename-group', id, name: 'Team services' })
  assert.deepEqual(result.groups.find(group => group.id === id)!.members, ['cf', 'local'])
  f.mutate({ action: 'usage', scope: 'project', target: 'group', id, enabled: false })
  result = f.mutate({ action: 'remove-group', id })
  assert.equal(result.groups.some(group => group.id === id), false)
  assert.ok(result.servers.every(server => server.groupId === null && server.effectiveEnabled))
  assert.equal(fs.readFileSync(f.configFile, 'utf8'), original)
  assert.throws(() => f.mutate({ action: 'remove-group', id: 'cloudflare' }), /사용자 묶음/)
})

test('stale registry, metadata or project revisions reject without overwriting edits', t => {
  const f = fixture(t, { local: { command: 'node' } })
  const stale = f.store.list(f.cwd).revision
  f.mutate({ action: 'usage', scope: 'common', target: 'server', id: 'local', enabled: false })
  assert.throws(() => f.store.mutate({ cwd: f.cwd, revision: stale, action: 'usage', scope: 'project', target: 'server', id: 'local', enabled: true }), (error: unknown) => error instanceof McpManagementError && error.status === 409)
  const beforeRegistry = f.store.list(f.cwd).revision
  fs.writeFileSync(f.configFile, '{"mcpServers":{"local":{"command":"new-command"}}}')
  assert.throws(() => f.store.mutate({ cwd: f.cwd, revision: beforeRegistry, action: 'create-group', name: 'Stale' }), /다른 곳/)
  assert.equal(f.store.list(f.cwd).groups.length, 0)
  const beforeProject = f.store.list(f.cwd).revision
  f.mutate({ action: 'usage', scope: 'project', target: 'server', id: 'local', enabled: true })
  assert.throws(() => f.store.mutate({ cwd: f.cwd, revision: beforeProject, action: 'create-group', name: 'Stale' }), /다른 곳/)
})

test('corrupt metadata and duplicate names fail without replacing original content', t => {
  const f = fixture(t, { local: { command: 'node' } })
  f.mutate({ action: 'create-group', name: 'Services' })
  assert.throws(() => f.mutate({ action: 'create-group', name: ' services ' }), /같은 이름/)
  assert.throws(() => f.mutate({ action: 'create-group', name: 'Cloudflare' }), /같은 이름/)
  const file = path.join(f.registry, 'management.json')
  fs.writeFileSync(file, '{broken')
  assert.throws(() => f.store.list(f.cwd), /형식/)
  assert.equal(fs.readFileSync(file, 'utf8'), '{broken')
})

test('scoped creation preserves unrelated registry content and keeps project credentials out of usage files', t => {
  const f = fixture(t, { preserved: { command: 'node', args: ['keep-me'] } })
  const other = path.join(f.directory, 'other')
  fs.mkdirSync(path.join(other, '.git'), { recursive: true })
  const registry = JSON.parse(fs.readFileSync(f.configFile, 'utf8'))
  registry.unrelated = { keep: 'unchanged' }
  fs.writeFileSync(f.configFile, JSON.stringify(registry))
  let result = f.mutate({ action: 'create-server', name: 'project-api', scope: 'project', content: JSON.stringify({ url: 'https://example.test/mcp', headers: { Authorization: 'Bearer private-token' } }) })
  assert.deepEqual(result.servers.find(server => server.name === 'project-api')!.usage, { common: false, project: true, enabled: true })
  assert.equal(readSharedMcpConfig(f.registry, 'project-api').enabled, false)
  assert.equal(resolveMcpUsage(other, f.registry).include('project-api'), false)
  assert.deepEqual(readSharedMcpConfig(f.registry, 'preserved'), { command: 'node', args: ['keep-me'] })
  assert.deepEqual(JSON.parse(fs.readFileSync(f.configFile, 'utf8')).unrelated, { keep: 'unchanged' })
  assert.doesNotMatch(fs.readFileSync(path.join(f.cwd, '.mew', 'mcp-usage.json'), 'utf8'), /private-token|Authorization|https:/)
  result = f.mutate({ action: 'create-server', name: 'common-off', scope: 'common', content: JSON.stringify({ command: 'node', enabled: false }) })
  assert.deepEqual(result.servers.find(server => server.name === 'common-off')!.usage, { common: false, project: null, enabled: false })
  f.mutate({ action: 'create-server', name: 'common-on', scope: 'common', content: JSON.stringify({ command: 'node' }) })
  assert.equal(resolveMcpUsage(other, f.registry).include('common-on'), true)
})

test('creation refuses collisions, invalid configs and stale revisions without writing', t => {
  const f = fixture(t, { taken: { command: 'node' } })
  const before = fs.readFileSync(f.configFile, 'utf8')
  assert.throws(() => f.mutate({ action: 'create-server', name: 'taken', scope: 'common', content: '{"command":"new"}' }), /같은 이름/)
  assert.throws(() => f.mutate({ action: 'create-server', name: 'bad', scope: 'project', content: '{"url":"http://outside.test"}' }), /연결 설정/)
  assert.throws(() => f.mutate({ action: 'create-server', name: '../escape', scope: 'project', content: '{"command":"node"}' }), /이름/)
  const stale = f.store.list(f.cwd).revision
  f.mutate({ action: 'usage', target: 'server', id: 'taken', scope: 'common', enabled: false })
  assert.throws(() => f.store.mutate({ cwd: f.cwd, revision: stale, action: 'create-server', name: 'stale', scope: 'common', content: '{"command":"node"}' }), /다른 곳/)
  assert.equal(fs.readFileSync(f.configFile, 'utf8'), before)
})

test('creation rejects an oversized combined registry before changing any saved state', t => {
  const config = { command: 'node', args: ['x'.repeat(1_100_000)] }
  const f = fixture(t, { preserved: config })
  const original = fs.readFileSync(f.configFile, 'utf8')
  assert.ok(Buffer.byteLength(JSON.stringify(config), 'utf8') < 2 * 1024 * 1024)
  assert.throws(() => f.mutate({ action: 'create-server', name: 'too-large', scope: 'project', content: JSON.stringify(config) }), /2MB/)
  assert.equal(fs.readFileSync(f.configFile, 'utf8'), original)
  assert.deepEqual(f.store.list(f.cwd).servers.map(server => server.name), ['preserved'])
  assert.equal(fs.existsSync(path.join(f.registry, 'management.json')), false)
  assert.equal(fs.existsSync(path.join(f.cwd, '.mew', 'mcp-usage.json')), false)
})

test('a project registration remains disabled everywhere after a metadata-save failure', t => {
  const f = fixture(t), originalRename = fs.renameSync
  const failedTarget = path.join(f.registry, 'management.json')
  t.mock.method(fs, 'renameSync', (source: fs.PathLike, destination: fs.PathLike) => {
    if (destination === failedTarget) throw new Error('fixture-disk-failure')
    return originalRename(source, destination)
  })
  assert.throws(() => f.mutate({ action: 'create-server', name: 'retained', scope: 'project', content: '{"command":"node"}' }), /모두 저장하지 못했습니다/)
  assert.equal(readSharedMcpConfig(f.registry, 'retained').enabled, false)
  assert.equal(resolveMcpUsage(f.cwd, f.registry).include('retained'), false)
  assert.equal(fs.existsSync(path.join(f.cwd, '.mew', 'mcp-usage.json')), false)
})

test('Cloudflare consolidation creates the unified definition first and disables only explicitly selected common connections', t => {
  const f = fixture(t, { builds: { url: 'https://builds.mcp.cloudflare.com/mcp', headers: { Authorization: 'Bearer preserved' } }, browser: { url: 'https://browser.mcp.cloudflare.com/mcp' }, local: { command: 'node' } })
  const original = readSharedMcpConfig(f.registry, 'builds')
  const result = f.mutate({ action: 'consolidate-cloudflare', name: 'cloudflare', disable: ['builds'], scope: 'common' })
  assert.deepEqual(readSharedMcpConfig(f.registry, 'builds'), original)
  assert.deepEqual(readSharedMcpConfig(f.registry, 'cloudflare'), { type: 'http', url: CLOUDFLARE_MCP_URL })
  assert.equal(result.servers.find(server => server.name === 'builds')!.effectiveEnabled, false)
  assert.equal(result.servers.find(server => server.name === 'browser')!.effectiveEnabled, true)
  assert.equal(result.servers.find(server => server.name === 'local')!.effectiveEnabled, true)
  assert.equal(result.cloudflare.existingUnified, 'cloudflare')
  assert.equal(fs.existsSync(path.join(f.registry, 'auth')), false)
})

test('Cloudflare consolidation reuses unified endpoint without changing identity and honors project-only replacements', t => {
  const f = fixture(t, { api: { url: CLOUDFLARE_MCP_URL, enabled: false, headers: { Authorization: 'Bearer retained' } }, builds: { url: 'https://builds.mcp.cloudflare.com/mcp' } })
  const original = fs.readFileSync(f.configFile, 'utf8')
  f.mutate({ action: 'usage', target: 'group', id: 'cloudflare', scope: 'common', enabled: false })
  const result = f.mutate({ action: 'consolidate-cloudflare', name: 'ignored-existing', disable: ['builds'], scope: 'project' })
  assert.equal(fs.readFileSync(f.configFile, 'utf8'), original)
  assert.equal(result.servers.find(server => server.name === 'api')!.effectiveEnabled, true)
  assert.equal(result.servers.find(server => server.name === 'builds')!.effectiveEnabled, false)
  assert.deepEqual(result.servers.find(server => server.name === 'builds')!.usage, { common: true, project: false, enabled: false })
})

test('adding a project-only unified connection leaves every other project disabled by default', t => {
  const f = fixture(t, { builds: { url: 'https://builds.mcp.cloudflare.com/mcp' } })
  const other = path.join(f.directory, 'other')
  fs.mkdirSync(path.join(other, '.git'), { recursive: true })
  const result = f.mutate({ action: 'consolidate-cloudflare', name: 'api', disable: [], scope: 'project' })
  assert.equal(readSharedMcpConfig(f.registry, 'api').enabled, false)
  assert.deepEqual(result.servers.find(server => server.name === 'api')!.usage, { common: false, project: true, enabled: true })
  assert.equal(resolveMcpUsage(f.cwd, f.registry).include('api'), true)
  assert.equal(resolveMcpUsage(other, f.registry).include('api'), false)
  assert.deepEqual(f.store.list(other).servers.find(server => server.name === 'api')!.usage, { common: false, project: null, enabled: false })
})

test('project consolidation retains a custom unified membership and leaves other project gates unchanged', t => {
  const f = fixture(t, { api: { url: CLOUDFLARE_MCP_URL, headers: { Authorization: 'Bearer retained' } } })
  const other = path.join(f.directory, 'other')
  fs.mkdirSync(path.join(other, '.git'), { recursive: true })
  const created = f.mutate({ action: 'create-group', name: 'Development', members: ['api'] })
  const group = created.groups.find(group => group.name === 'Development')!
  f.mutate({ action: 'usage', scope: 'common', target: 'group', id: group.id, enabled: false })
  const original = fs.readFileSync(f.configFile, 'utf8')
  assert.equal(resolveMcpUsage(other, f.registry).include('api'), false)
  const result = f.mutate({ action: 'consolidate-cloudflare', scope: 'project', name: 'api', disable: [] })
  assert.equal(result.servers.find(server => server.name === 'api')!.groupId, group.id)
  assert.equal(result.servers.find(server => server.name === 'api')!.effectiveEnabled, true)
  assert.deepEqual(result.groups.find(item => item.id === group.id)!.usage, { common: false, project: true, enabled: true })
  assert.equal(resolveMcpUsage(other, f.registry).include('api'), false)
  assert.equal(f.store.list(other).servers.find(server => server.name === 'api')!.groupId, group.id)
  assert.equal(fs.readFileSync(f.configFile, 'utf8'), original)
})

test('common consolidation respects explicit custom and ungrouped unified memberships', t => {
  const f = fixture(t, { api: { url: CLOUDFLARE_MCP_URL } })
  const created = f.mutate({ action: 'create-group', name: 'Services', members: ['api'] })
  const group = created.groups.find(group => group.name === 'Services')!
  const original = fs.readFileSync(f.configFile, 'utf8')
  let result = f.mutate({ action: 'consolidate-cloudflare', scope: 'common', name: 'api', disable: [] })
  assert.equal(result.servers.find(server => server.name === 'api')!.groupId, group.id)
  f.mutate({ action: 'assign', names: ['api'], groupId: null })
  result = f.mutate({ action: 'consolidate-cloudflare', scope: 'common', name: 'api', disable: [] })
  assert.equal(result.servers.find(server => server.name === 'api')!.groupId, null)
  assert.equal(result.groups.some(item => item.id === 'cloudflare'), false)
  assert.equal(fs.readFileSync(f.configFile, 'utf8'), original)
})

test('consolidation rejects collisions, non-Cloudflare selections and unified replacement without changes', t => {
  const f = fixture(t, { taken: { command: 'node' }, builds: { url: 'https://builds.mcp.cloudflare.com/mcp' }, adversary: { url: 'https://mcp.cloudflare.com.evil.test/mcp' } })
  const before = fs.readFileSync(f.configFile, 'utf8')
  assert.throws(() => f.mutate({ action: 'consolidate-cloudflare', name: 'taken', disable: ['builds'], scope: 'common' }), /같은 이름/)
  assert.throws(() => f.mutate({ action: 'consolidate-cloudflare', name: 'api', disable: ['adversary'], scope: 'common' }), /대체할/)
  assert.equal(fs.readFileSync(f.configFile, 'utf8'), before)
  assert.equal(fs.existsSync(path.join(f.registry, 'management.json')), false)
  f.mutate({ action: 'consolidate-cloudflare', name: 'api', disable: [], scope: 'common' })
  assert.throws(() => f.mutate({ action: 'consolidate-cloudflare', name: 'api', disable: ['api'], scope: 'common' }), /대체할/)
})

test('linked metadata cannot redirect mutations into another file', t => {
  if (process.platform === 'win32') { t.skip('POSIX symbolic links'); return }
  const f = fixture(t, { local: { command: 'node' } }), outside = path.join(f.directory, 'outside.json')
  const original = '{"version":1,"groups":[],"assignments":{},"usage":{"servers":{},"groups":{}}}'
  fs.writeFileSync(outside, original)
  fs.symlinkSync(outside, path.join(f.registry, 'management.json'))
  assert.throws(() => f.mutate({ action: 'usage', target: 'server', id: 'local', scope: 'common', enabled: false }), /심볼릭/)
  assert.equal(fs.readFileSync(outside, 'utf8'), original)
})
