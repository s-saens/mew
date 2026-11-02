import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { PassThrough } from 'node:stream'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js'
import { relaySharedMcp, createSharedMcpLocalTransport } from './shared-mcp-stdio.ts'
import { sharedMcpEnvironment } from './shared-mcp-oauth.ts'

test('stdio bridge forwards notifications, server requests, responses and negotiated protocol without interpreting payloads', async () => {
  const input = new PassThrough(), output = new PassThrough()
  let text = ''; output.on('data', data => { text += data.toString() })
  const received: JSONRPCMessage[] = []
  let version = '', closed = false
  const remote: Transport = { start: async () => {}, send: async message => { received.push(message) }, close: async () => { closed = true }, setProtocolVersion: value => { version = value } }
  const close = await relaySharedMcp(new StdioServerTransport(input, output), remote)
  const request = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25' } }
  const notification = { jsonrpc: '2.0', method: 'notifications/initialized' }
  const serverRequest: JSONRPCMessage = { jsonrpc: '2.0', id: 'server-2', method: 'roots/list' }
  const response: JSONRPCMessage = { jsonrpc: '2.0', id: 'server-2', result: { roots: [] } }
  input.write(JSON.stringify(request) + '\n' + JSON.stringify(notification) + '\n')
  remote.onmessage?.(serverRequest)
  input.write(JSON.stringify(response) + '\n')
  assert.deepEqual(received, [request, notification, response])
  assert.deepEqual(JSON.parse(text), serverRequest)
  assert.equal(version, '2025-11-25')
  await close()
  assert.equal(closed, true)
  assert.equal(input.listenerCount('data'), 0)
})

test('local MCP factory expands explicit environment references and fails safely on missing values', async () => {
  const transport = createSharedMcpLocalTransport({ command: '${MEW_MCP_FIXTURE_COMMAND}', env: { MEW_MCP_FIXTURE_COMMAND: process.execPath }, args: ['-e', 'process.stdin.resume()'] })
  await transport.start()
  assert.ok(transport.pid)
  await transport.close()
  assert.throws(() => createSharedMcpLocalTransport({ command: '${MEW_MISSING_MCP_FIXTURE_VARIABLE}' }), error => error instanceof Error && error.message === 'A required MCP environment variable is unavailable.')
})

test('local MCP keeps its source working directory for relative scripts', { timeout: 5000 }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-mcp-cwd-'))
  fs.writeFileSync(path.join(directory, 'relative-server.cjs'), `process.stdout.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/message',params:{level:'info',data:'relative-fixture'}})+'\\n');process.stdin.resume()`)
  const transport = createSharedMcpLocalTransport({ command: process.execPath, args: ['relative-server.cjs'], cwd: directory })
  try {
    const received = new Promise<JSONRPCMessage>((resolve, reject) => { transport.onmessage = resolve; transport.onerror = reject })
    await transport.start()
    assert.deepEqual(await received, { jsonrpc: '2.0', method: 'notifications/message', params: { level: 'info', data: 'relative-fixture' } })
  } finally { await transport.close(); fs.rmSync(directory, { recursive: true, force: true }) }
})

test('shared environment resolves materialized references independent of field order and rejects cycles', () => {
  const environment = sharedMcpEnvironment({ env: { TOKEN: '${MEW_SHARED_FIXTURE_SECRET}', MEW_SHARED_FIXTURE_SECRET: 'private-fixture' } })
  assert.equal(environment.TOKEN, 'private-fixture')
  assert.throws(() => sharedMcpEnvironment({ env: { MEW_SHARED_FIXTURE_A: '${MEW_SHARED_FIXTURE_B}', MEW_SHARED_FIXTURE_B: '${MEW_SHARED_FIXTURE_A}' } }), /circular reference/)
})
