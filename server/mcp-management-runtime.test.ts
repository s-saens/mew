import './test-isolated-data.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { AgentSession } from './agentAcp.ts'
import { McpManagementStore, resolveMcpUsage } from './mcp-management.ts'
import { markSharedMcpConnected, clearSharedMcpAuth } from './shared-mcp-oauth.ts'
import { sharedMcpDirectory, sharedMcpRuntimeName, sharedMcpServers } from './shared-mcp.ts'
import type { McpManagementMutation } from '../shared/mcp-management.ts'

type Mutation = McpManagementMutation extends infer T ? T extends McpManagementMutation ? Omit<T, 'cwd' | 'revision'> : never : never

function fixture(t: test.TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-mcp-runtime-'))
  const cwd = path.join(root, 'project'), directory = sharedMcpDirectory()
  fs.mkdirSync(cwd)
  fs.mkdirSync(directory, { recursive: true })
  t.after(() => {
    fs.rmSync(root, { recursive: true, force: true })
    fs.rmSync(directory, { recursive: true, force: true })
  })
  fs.writeFileSync(path.join(directory, 'servers.json'), JSON.stringify({ mcpServers: {
    api: { url: 'https://api.example.test/mcp' },
    bindings: { url: 'https://bindings.example.test/mcp', enabled: false },
    independent: { command: process.execPath, args: ['fixture-unused.js'] },
    waiting: { url: 'https://waiting.example.test/mcp' },
  } }))
  const store = new McpManagementStore(directory)
  const mutate = (change: Mutation) => store.mutate({ ...change, cwd, revision: store.list(cwd).revision })
  return { root, cwd, directory, store, mutate }
}

async function until(condition: () => boolean) {
  const deadline = Date.now() + 5_000
  while (!condition()) {
    assert.ok(Date.now() < deadline, 'The fake ACP request did not finish')
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}

test('project and group usage refreshes on ACP new/load/clear while retaining readiness and internal tools', { timeout: 25_000 }, async t => {
  const f = fixture(t)
  const created = f.mutate({ action: 'create-group', name: 'Development services', members: ['api', 'bindings'] })
  const group = created.groups.find(group => group.name === 'Development services')!
  f.mutate({ action: 'usage', scope: 'common', target: 'group', id: group.id, enabled: false })
  f.mutate({ action: 'usage', scope: 'common', target: 'server', id: 'bindings', enabled: true })
  assert.deepEqual([...resolveMcpUsage(f.cwd, f.directory).enabledNames].sort(), ['independent', 'waiting'])
  f.mutate({ action: 'usage', scope: 'project', target: 'group', id: group.id, enabled: true })
  for (const name of ['api', 'bindings', 'independent']) markSharedMcpConnected(f.directory, name)

  const adapter = path.join(f.root, 'adapter.mjs'), requests = path.join(f.root, 'requests.jsonl')
  fs.writeFileSync(adapter, `import fs from 'node:fs';
import { Readable, Writable } from 'node:stream';
import { AgentSideConnection, ndJsonStream, PROTOCOL_VERSION } from ${JSON.stringify(import.meta.resolve('@agentclientprotocol/sdk'))};
const record = (method, params) => fs.appendFileSync(${JSON.stringify(requests)}, JSON.stringify({ method, ...params }) + '\\n');
new AgentSideConnection(() => ({
  initialize: async () => ({ protocolVersion: PROTOCOL_VERSION, agentCapabilities: { loadSession: true } }),
  newSession: async params => { record('new', params); return { sessionId: 'managed-fixture' }; },
  loadSession: async params => { record('load', params); return {}; },
  cancel: async () => {},
}), ndJsonStream(Writable.toWeb(process.stdout), Readable.toWeb(process.stdin)));
`)
  const readRequests = (): Array<{ method: string; mcpServers: Array<{ name: string }> }> => fs.existsSync(requests)
    ? fs.readFileSync(requests, 'utf8').trim().split('\n').map(line => JSON.parse(line)) : []
  const internal = ['mew-debugger', 'mewpet-fixture'].map(name => ({ name, command: process.execPath, args: [], env: [] }))
  const runtimes = ['codex', 'claude', 'antigravity']
  for (const [index, runtime] of runtimes.entries()) {
    f.mutate({ action: 'usage', scope: 'project', target: 'group', id: group.id, enabled: true })
    f.mutate({ action: 'usage', scope: 'project', target: 'server', id: 'api', enabled: true })
    markSharedMcpConnected(f.directory, 'bindings')
    const session = await AgentSession.start(runtime, { cmd: process.execPath, args: [adapter] }, f.cwd, undefined, undefined, undefined, { mcpServers: internal })
    try {
      assert.equal(readRequests().length, index * 3 + 1)
      f.mutate({ action: 'usage', scope: 'project', target: 'group', id: group.id, enabled: false })
      // Editing usage does not rewrite an already-created conversation.
      assert.equal(readRequests().length, index * 3 + 1)
      await session.loadSession('saved-managed-fixture')
      f.mutate({ action: 'usage', scope: 'project', target: 'group', id: group.id, enabled: true })
      f.mutate({ action: 'usage', scope: 'project', target: 'server', id: 'api', enabled: false })
      clearSharedMcpAuth(f.directory, 'bindings')
      session.clearAfterQueue()
      await until(() => readRequests().length === (index + 1) * 3 && !session.busy)
    } finally { await session.disposeAndWait() }
  }
  const expected = runtimes.flatMap(() => [
    ['api', 'bindings', 'independent'],
    ['independent'],
    ['independent'],
  ])
  assert.deepEqual(readRequests().map(request => request.method), runtimes.flatMap(() => ['new', 'load', 'new']))
  for (const [index, request] of readRequests().entries()) {
    assert.deepEqual(request.mcpServers.map(server => server.name), [
      ...expected[index].map(sharedMcpRuntimeName), ...internal.map(server => server.name),
    ])
  }
})

test('an explicit effective preference can enable a disabled source without changing its definition', t => {
  const f = fixture(t)
  const file = path.join(f.directory, 'servers.json'), before = fs.readFileSync(file, 'utf8')
  assert.ok(!sharedMcpServers(f.directory).some(server => server.name === sharedMcpRuntimeName('bindings')))
  f.mutate({ action: 'usage', scope: 'project', target: 'server', id: 'bindings', enabled: true })
  const policy = resolveMcpUsage(f.cwd, f.directory)
  assert.ok(sharedMcpServers(f.directory, () => true, policy.include).some(server => server.name === sharedMcpRuntimeName('bindings')))
  f.mutate({ action: 'usage', scope: 'project', target: 'server', id: 'bindings', enabled: null })
  assert.equal(resolveMcpUsage(f.cwd, f.directory).include('bindings'), false)
  assert.equal(fs.readFileSync(file, 'utf8'), before)
})

test('the stdio bridge accepts a centrally enabled source whose registry default is disabled', { timeout: 10_000 }, async t => {
  const f = fixture(t), fixtureScript = path.join(f.root, 'mcp-fixture.mjs')
  fs.writeFileSync(fixtureScript, `import readline from 'node:readline';
const input = readline.createInterface({ input: process.stdin });
input.on('line', line => {
  const request = JSON.parse(line);
  if (request.id === undefined) return;
  const result = request.method === 'initialize'
    ? { protocolVersion: request.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'disabled-default-fixture', version: '1' } }
    : request.method === 'tools/list' ? { tools: [{ name: 'available', inputSchema: { type: 'object' } }] } : {};
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\\n');
});
`)
  fs.writeFileSync(path.join(f.directory, 'servers.json'), JSON.stringify({ mcpServers: {
    fixture: { command: process.execPath, args: [fixtureScript], enabled: false },
  } }))
  f.mutate({ action: 'usage', scope: 'project', target: 'server', id: 'fixture', enabled: true })
  const binding = sharedMcpServers(f.directory, () => true, resolveMcpUsage(f.cwd, f.directory).include)[0]
  assert.ok('command' in binding)
  const environment = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined))
  const client = new Client({ name: 'management-bridge-fixture', version: '1' })
  const transport = new StdioClientTransport({ command: binding.command, args: binding.args, env: environment, stderr: 'ignore' })
  try {
    await client.connect(transport)
    assert.equal((await client.listTools()).tools[0].name, 'available')
  } finally { await client.close() }
})
