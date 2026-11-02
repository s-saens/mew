import './test-isolated-data.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import http from 'node:http'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { AgentHarnessStore } from './agent-harness.ts'
import { AgentSession } from './agentAcp.ts'
import { runWithAgentAccount } from './agent-account-settings.ts'
import { upsertUser, removeUser } from './auth.ts'
import { normalizeSharedMcpConfig, readSharedMcpConfig, sharedMcpConfigIdentity, sharedMcpDirectory, sharedMcpRuntimeName, sharedMcpServers } from './shared-mcp.ts'

function fixture(t: test.TestContext) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-shared-mcp-'))
  const home = path.join(directory, 'home'), cwd = path.join(directory, 'project'), mewMcpDir = path.join(directory, 'private-mcp')
  fs.mkdirSync(home); fs.mkdirSync(cwd)
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const write = (file: string, value: unknown) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value)) }
  return { directory, home, cwd, mewMcpDir, write, store: new AgentHarnessStore({ home, env: {}, mewMcpDir }) }
}

test('shared MCP normalizes native transports, preserves environment references and rejects unsupported settings', () => {
  assert.deepEqual(normalizeSharedMcpConfig({ type: 'local', command: ['node', 'server.js'], environment: { TOKEN: 'secret' } }, 'opencode'), { command: 'node', args: ['server.js'], env: { TOKEN: 'secret' } })
  assert.deepEqual(normalizeSharedMcpConfig({ url: 'https://mcp.example.test/mcp', http_headers: { Version: 'one' }, env_http_headers: { 'X-Key': 'TEST_KEY' }, bearer_token_env_var: 'TEST_TOKEN' }, 'codex'), { type: 'http', url: 'https://mcp.example.test/mcp', headers: { Version: 'one', 'X-Key': '${TEST_KEY}', Authorization: 'Bearer ${TEST_TOKEN}' } })
  assert.deepEqual(normalizeSharedMcpConfig({ type: 'sse', url: 'http://127.0.0.1:9999/sse', disabled: true }), { enabled: false, type: 'sse', url: 'http://127.0.0.1:9999/sse' })
  for (const value of [{ url: 'http://outside.test/mcp' }, { url: 'https://user:password@example.test/mcp' }, { command: 'node', url: 'https://example.test' }, { command: 'node', args: [1] }, { command: 'node', cwd: './relative' }, { url: 'https://example.test', cwd: '/unexpected' }, { command: 'node', headers: {} }, { url: 'https://example.test', headers: { Host: 'one\r\ntwo' } }, { url: 'https://example.test', oauth: { unsupported: 'value' } }]) assert.throws(() => normalizeSharedMcpConfig(value))
})

test('Mew imports native definitions without changing their source or leaking credentials in inventory', async t => {
  const f = fixture(t), native = path.join(f.home, '.claude.json')
  const source = { mcpServers: { cloudflare: { type: 'http', url: 'https://mcp.example.test/mcp', headers: { Authorization: 'Bearer fixture-private' } } }, account: 'leave-alone' }
  f.write(native, source)
  let inventory = await f.store.list(f.cwd, 'mcp')
  assert.equal(inventory.scopes[0].id, 'mew')
  const original = inventory.items.find(item => item.name === 'cloudflare')!
  const target = inventory.locations.find(location => location.agent === 'mew')!
  const detail = await f.store.detail(f.cwd, 'mcp', original.id)
  await f.store.mutate({ cwd: f.cwd, kind: 'mcp', action: 'import', id: original.id, revision: detail.revision, target: target.id })
  assert.deepEqual(JSON.parse(fs.readFileSync(native, 'utf8')), source)
  assert.equal(readSharedMcpConfig(f.mewMcpDir, 'cloudflare').headers?.Authorization, 'Bearer fixture-private')
  inventory = await f.store.list(f.cwd, 'mcp')
  assert.doesNotMatch(JSON.stringify(inventory), /fixture-private|leave-alone/)
  const common = inventory.items.find(item => item.location === target.id)!
  assert.equal(common.writable, true)
  await assert.rejects(f.store.mutate({ cwd: f.cwd, kind: 'mcp', action: 'import', id: original.id, revision: detail.revision, target: target.id }), /같은 이름/)
  const commonDetail = await f.store.detail(f.cwd, 'mcp', common.id)
  await assert.rejects(f.store.mutate({ cwd: f.cwd, kind: 'mcp', action: 'move', id: common.id, revision: commonDetail.revision, target: original.location }), /공통/)
  if (process.platform !== 'win32') {
    assert.equal(fs.statSync(f.mewMcpDir).mode & 0o777, 0o700)
    assert.equal(fs.statSync(target.path).mode & 0o777, 0o600)
  }
})

test('read-only native MCP may be imported; stale revisions and invalid targets preserve both originals', async t => {
  const f = fixture(t), source = path.join(f.home, '.codex/plugins/cache/publisher/plugin/1.0/.mcp.json')
  f.write(source, { mcpServers: { plugin: { command: 'node', args: ['server.js'] } } })
  const inventory = await f.store.list(f.cwd, 'mcp'), item = inventory.items.find(item => item.name === 'plugin')!, target = inventory.locations.find(location => location.agent === 'mew')!
  assert.equal(item.writable, false)
  const detail = await f.store.detail(f.cwd, 'mcp', item.id)
  f.write(source, { mcpServers: { plugin: { command: 'node', args: ['new.js'] } } })
  await assert.rejects(f.store.mutate({ cwd: f.cwd, kind: 'mcp', action: 'import', id: item.id, revision: detail.revision, target: target.id }), /다른 곳/)
  assert.equal(fs.existsSync(target.path), false)
  const fresh = await f.store.detail(f.cwd, 'mcp', item.id)
  await assert.rejects(f.store.mutate({ cwd: f.cwd, kind: 'mcp', action: 'import', id: item.id, revision: fresh.revision, target: '/forged' }), /위치/)
  await f.store.mutate({ cwd: f.cwd, kind: 'mcp', action: 'import', id: item.id, revision: fresh.revision, target: target.id })
  assert.deepEqual(readSharedMcpConfig(f.mewMcpDir, 'plugin').args, ['new.js'])
  assert.equal(readSharedMcpConfig(f.mewMcpDir, 'plugin').cwd, f.cwd)
  assert.ok(fs.existsSync(source))
})

test('import carries only referenced runtime environment values into the private shared definition', async t => {
  const f = fixture(t)
  const store = new AgentHarnessStore({ home: f.home, env: {}, mewMcpDir: f.mewMcpDir, runtimeEnvs: { claude: { CF_TOKEN: 'fixture-private', UNRELATED_SECRET: 'never-copy' } } })
  f.write(path.join(f.home, '.claude.json'), { mcpServers: { cloudflare: { type: 'http', url: 'https://example.test/mcp', headers: { Authorization: 'Bearer ${CF_TOKEN}' }, env: { CF_TOKEN: '${CF_TOKEN}' } } } })
  const inventory = await store.list(f.cwd, 'mcp'), item = inventory.items[0], target = inventory.locations.find(location => location.agent === 'mew')!
  const detail = await store.detail(f.cwd, 'mcp', item.id)
  await store.mutate({ cwd: f.cwd, kind: 'mcp', action: 'import', id: item.id, revision: detail.revision, target: target.id })
  assert.deepEqual(readSharedMcpConfig(f.mewMcpDir, 'cloudflare').env, { CF_TOKEN: 'fixture-private' })
  assert.doesNotMatch(fs.readFileSync(target.path, 'utf8'), /UNRELATED_SECRET|never-copy/)
})

test('removing an account clears its shared MCP definitions and credentials before the email can be reused', () => {
  const email = 'shared-mcp-deleted@example.test'
  upsertUser(email, { role: 'owner', hash: 'fixture', mustChangePassword: false, createdAt: 1, passwordChangedAt: 0 })
  const directory = sharedMcpDirectory(email)
  fs.mkdirSync(path.join(directory, 'auth'), { recursive: true })
  fs.writeFileSync(path.join(directory, 'servers.json'), '{"mcpServers":{"demo":{"command":"node"}}}')
  fs.writeFileSync(path.join(directory, 'auth/fixture.json'), '{"token":"fixture-private"}')
  assert.equal(removeUser(email), true)
  assert.equal(fs.existsSync(directory), false)
  upsertUser(email, { role: 'owner', hash: 'new-fixture', mustChangePassword: false, createdAt: 2, passwordChangedAt: 0 })
  assert.deepEqual(sharedMcpServers(sharedMcpDirectory(email)), [])
})

test('shared identities are stable, isolate changed credentials and skip disabled definitions', t => {
  const f = fixture(t), config = { type: 'http' as const, url: 'https://example.test/mcp', headers: { A: 'one', B: 'two' } }
  assert.equal(sharedMcpConfigIdentity(config), sharedMcpConfigIdentity({ headers: { B: 'two', A: 'one' }, enabled: false, url: config.url, type: 'http' }))
  assert.notEqual(sharedMcpConfigIdentity(config), sharedMcpConfigIdentity({ ...config, headers: { A: 'new' } }))
  f.write(path.join(f.mewMcpDir, 'servers.json'), { mcpServers: { 'a.b': config, a_b: { command: 'node', enabled: false } } })
  const servers = sharedMcpServers(f.mewMcpDir)
  assert.equal(servers.length, 1)
  assert.equal(servers[0].name, sharedMcpRuntimeName('a.b'))
  assert.notEqual(sharedMcpRuntimeName('a.b'), sharedMcpRuntimeName('a_b'))
  assert.doesNotMatch(JSON.stringify(servers), /https:|headers|one|two/)
})

test('independent runtime bridge processes use the same private HTTP definition for tools, resources and prompts', { timeout: 10_000 }, async t => {
  const f = fixture(t), methods: string[] = []
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST') { res.writeHead(405).end(); return }
    if (req.headers.authorization !== 'Bearer shared-fixture') { res.writeHead(401).end(); return }
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', () => {
      const input = JSON.parse(body)
      methods.push(input.method)
      if (input.id === undefined) { res.writeHead(202).end(); return }
      const result = input.method === 'initialize' ? { protocolVersion: input.params.protocolVersion, capabilities: { tools: {}, resources: {}, prompts: {} }, serverInfo: { name: 'common-fixture', version: '1' } }
        : input.method === 'tools/list' ? { tools: [{ name: 'echo', inputSchema: { type: 'object' } }] }
          : input.method === 'resources/list' ? { resources: [{ uri: 'fixture://shared', name: 'shared' }] }
            : input.method === 'prompts/list' ? { prompts: [{ name: 'shared' }] }
              : { content: [{ type: 'text', text: 'shared-connection' }] }
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', id: input.id, result }))
    })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) })
  const port = (server.address() as { port: number }).port
  f.write(path.join(f.mewMcpDir, 'servers.json'), { mcpServers: { common: { type: 'http', url: `http://127.0.0.1:${port}/mcp`, headers: { Authorization: 'Bearer shared-fixture' } } } })
  await Promise.all(['claude-fixture', 'codex-fixture'].map(async name => {
    const client = new Client({ name, version: '1' })
    const binding = sharedMcpServers(f.mewMcpDir)[0]
    assert.ok('command' in binding)
    const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined))
    const transport = new StdioClientTransport({ command: binding.command, args: binding.args, env, stderr: 'ignore' })
    try {
      await client.connect(transport)
      assert.equal((await client.listTools()).tools[0].name, 'echo')
      assert.equal((await client.listResources()).resources[0].uri, 'fixture://shared')
      assert.equal((await client.listPrompts()).prompts[0].name, 'shared')
      assert.deepEqual((await client.callTool({ name: 'echo', arguments: {} })).content, [{ type: 'text', text: 'shared-connection' }])
    } finally { await client.close() }
  }))
  assert.equal(methods.filter(method => method === 'initialize').length, 2)
})

test('shared MCPs stay account-specific and are injected into every ACP new/load/clear request', async t => {
  const f = fixture(t), account = 'shared-mcp-owner@example.test'
  const ownDirectory = runWithAgentAccount(account, () => sharedMcpDirectory())
  const otherDirectory = runWithAgentAccount('shared-mcp-other@example.test', () => sharedMcpDirectory())
  assert.notEqual(ownDirectory, otherDirectory)
  f.write(path.join(ownDirectory, 'servers.json'), { mcpServers: { common: { command: process.execPath, args: ['fixture.js'] } } })
  assert.equal(sharedMcpServers(otherDirectory).length, 0)
  const received = path.join(f.directory, 'requests.jsonl'), adapter = path.join(f.directory, 'adapter.mjs')
  const sdkUrl = pathToFileURL(path.resolve('node_modules/@agentclientprotocol/sdk/dist/acp.js')).href
  fs.writeFileSync(adapter, `import fs from 'node:fs';
import {AgentSideConnection,ndJsonStream,PROTOCOL_VERSION} from ${JSON.stringify(sdkUrl)};
import {Readable,Writable} from 'node:stream';
const record=(method,params)=>fs.appendFileSync(${JSON.stringify(received)},JSON.stringify({method,...params})+'\\n');
new AgentSideConnection(()=>({initialize:async()=>({protocolVersion:PROTOCOL_VERSION,agentCapabilities:{loadSession:true}}),newSession:async p=>{record('new',p);return {sessionId:'shared-fixture'}},loadSession:async p=>{record('load',p);return {}},cancel:async()=>{}}),ndJsonStream(Writable.toWeb(process.stdout),Readable.toWeb(process.stdin)));`)
  for (const runtime of ['codex', 'claude']) {
    f.write(path.join(ownDirectory, 'servers.json'), { mcpServers: { common: { command: process.execPath, args: ['fixture.js'] } } })
    const session = await runWithAgentAccount(account, () => AgentSession.start(runtime, { cmd: process.execPath, args: [adapter] }, f.cwd))
    try {
      f.write(path.join(ownDirectory, 'servers.json'), { mcpServers: { replacement: { command: process.execPath, args: ['new.js'] } } })
      await session.loadSession('restored-fixture')
      f.write(path.join(ownDirectory, 'servers.json'), { mcpServers: {} })
      session.clearAfterQueue()
      const deadline = Date.now() + 5000
      const expected = runtime === 'codex' ? 3 : 6
      while (fs.readFileSync(received, 'utf8').trim().split('\n').length < expected && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10))
    } finally { await session.disposeAndWait() }
  }
  const requests = fs.readFileSync(received, 'utf8').trim().split('\n').map(line => JSON.parse(line))
  assert.deepEqual(requests.map(request => request.method), ['new', 'load', 'new', 'new', 'load', 'new'])
  for (const [index, request] of requests.entries()) {
    const names = request.mcpServers.map((server: { name: string }) => server.name)
    assert.deepEqual(names, index % 3 === 0 ? [sharedMcpRuntimeName('common')] : index % 3 === 1 ? [sharedMcpRuntimeName('replacement')] : [])
  }
})
