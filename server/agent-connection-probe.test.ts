import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { WebSocket } from 'ws'
import { AGENT_CONNECTION_PROBE_MAX_ID_LENGTH } from '../shared/agent-connection.ts'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-agent-probe-'))
process.env.MEW_WORKSPACE = root
process.env.MEW_DATA_DIR = path.join(root, 'data')
const entered = path.join(root, 'initialize-entered')
const release = path.join(root, 'initialize-release')
const calls = path.join(root, 'calls')
const stub = path.join(root, 'agent.mjs')
fs.writeFileSync(stub, `
import fs from 'node:fs';
import { Readable, Writable } from 'node:stream';
import { AgentSideConnection, ndJsonStream, PROTOCOL_VERSION } from ${JSON.stringify(import.meta.resolve('@agentclientprotocol/sdk'))};
const record = method => fs.appendFileSync(${JSON.stringify(calls)}, method + '\\n');
new AgentSideConnection(conn => ({
  initialize: async () => {
    record('initialize');
    fs.writeFileSync(${JSON.stringify(entered)}, '');
    while (!fs.existsSync(${JSON.stringify(release)})) await new Promise(resolve => setTimeout(resolve, 5));
    return { protocolVersion: PROTOCOL_VERSION, agentCapabilities: {} };
  },
  newSession: async () => { record('session/new'); return { sessionId: 'probe-fixture' }; },
  prompt: async () => { record('prompt'); return { stopReason: 'end_turn' }; },
  cancel: async () => {},
}), ndJsonStream(Writable.toWeb(process.stdout), Readable.toWeb(process.stdin)));
`)
process.env.MEW_AGENT_CLAUDE_CMD = process.execPath
process.env.MEW_AGENT_CLAUDE_ARGS = stub

const { AGENT_WS_PATH, attachAgentWebSocket } = await import('./agentWs.ts')
const { shutdownAgentHostsForWorkspace } = await import('./agentHost.ts')
const { readAgentTranscript, closeTranscriptDatabase } = await import('./agentTranscript.ts')

test('connection probes bypass pending ACP startup, ignore malformed IDs, and enforce socket access', { timeout: 15_000 }, async t => {
  let authorized = true
  const server = http.createServer()
  attachAgentWebSocket(server, { authorize: () => authorized })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as { port: number }
  const url = `ws://127.0.0.1:${port}${AGENT_WS_PATH}?runtime=claude&tab=probe&cwd=${encodeURIComponent(root)}`
  const ws = new WebSocket(url)
  const messages: { type: string; id?: unknown; connectionProbe?: boolean; events?: { type: string }[] }[] = []
  ws.on('message', raw => messages.push(JSON.parse(raw.toString())))
  t.after(async () => {
    ws.terminate()
    fs.writeFileSync(release, '')
    shutdownAgentHostsForWorkspace(root)
    server.close()
    closeTranscriptDatabase()
    await new Promise(resolve => setTimeout(resolve, 200))
    fs.rmSync(root, { recursive: true, force: true })
  })
  const until = async (predicate: () => boolean) => {
    const deadline = Date.now() + 5_000
    while (!predicate()) {
      if (Date.now() > deadline) throw new Error(`Timed out; received ${messages.map(message => message.type).join(', ')}`)
      await new Promise(resolve => setTimeout(resolve, 5))
    }
  }

  await until(() => messages.some(message => message.type === 'ready'))
  assert.equal(messages[0].type, 'ready')
  assert.equal(messages[0].connectionProbe, true)
  ws.send(JSON.stringify({ type: 'ping', id: 'before-agent-ready' }))
  await until(() => messages.some(message => message.type === 'pong'))
  assert.deepEqual(messages.filter(message => message.type === 'pong'), [{ type: 'pong', id: 'before-agent-ready' }])
  assert.ok(messages.every(message => ['ready', 'pong'].includes(message.type)), 'probe completes without session readiness or a transcript event')
  assert.equal(fs.existsSync(release), false, 'ACP initialize remains gated')

  await until(() => fs.existsSync(entered))
  const boundedId = 'x'.repeat(AGENT_CONNECTION_PROBE_MAX_ID_LENGTH)
  for (const id of [undefined, '', null, 1, {}, [], 'x'.repeat(AGENT_CONNECTION_PROBE_MAX_ID_LENGTH + 1)]) {
    ws.send(JSON.stringify({ type: 'ping', id }))
  }
  ws.send(JSON.stringify({ type: 'ping', id: boundedId }))
  await until(() => messages.some(message => message.type === 'pong' && message.id === boundedId))
  assert.deepEqual(messages.filter(message => message.type === 'pong').map(message => message.id), ['before-agent-ready', boundedId], 'malformed probes are ignored without closing the healthy socket')
  assert.deepEqual(fs.readFileSync(calls, 'utf8').trim().split('\n'), ['initialize'], 'probes never reach the agent command queue')

  fs.writeFileSync(release, '')
  await until(() => messages.some(message => message.type === 'meta'))
  assert.deepEqual(fs.readFileSync(calls, 'utf8').trim().split('\n'), ['initialize', 'session/new'])
  assert.ok(messages.filter(message => message.type === 'replay').every(message => message.events?.every(event => !['ping', 'pong'].includes(event.type))))
  assert.ok((readAgentTranscript('claude', root, 'probe-fixture') ?? []).every(event => !['ping', 'pong'].includes(event.type)), 'probes do not enter persisted conversation records')

  const closed = new Promise<void>(resolve => ws.once('close', () => resolve()))
  authorized = false
  ws.send(JSON.stringify({ type: 'ping', id: 'revoked-probe' }))
  await closed
  assert.equal(messages.some(message => message.type === 'pong' && message.id === 'revoked-probe'), false, 'a probe cannot bypass a revoked socket permission')

  const denied = new WebSocket(url)
  denied.on('error', () => {})
  const deniedStatus = new Promise<number | undefined>(resolve => denied.once('unexpected-response', (_request, response) => {
    resolve(response.statusCode)
    response.resume()
    denied.terminate()
  }))
  assert.equal(await deniedStatus, 401, 'unauthorized clients cannot reach probe negotiation')
})
