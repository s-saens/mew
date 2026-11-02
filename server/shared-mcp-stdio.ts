import { fileURLToPath } from 'node:url'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import { createSharedMcpConnection, expandSharedMcpValue, sharedMcpEnvironment } from './shared-mcp-oauth.ts'
import { readSharedMcpConfig } from './shared-mcp.ts'
import type { SharedMcpConfig } from './shared-mcp.ts'

export function createSharedMcpLocalTransport(config: SharedMcpConfig) {
  if (!config.command) throw new Error('Select a local MCP server.')
  const environment = sharedMcpEnvironment(config)
  return new StdioClientTransport({ command: expandSharedMcpValue(config.command, environment),
    args: (config.args ?? []).map(arg => expandSharedMcpValue(arg, environment)), env: environment, cwd: config.cwd, stderr: 'ignore' })
}

/** Forward protocol messages in both directions, including notifications and server requests. */
export async function relaySharedMcp(local: Transport, remote: Transport) {
  let closed = false
  const close = async () => {
    if (closed) return
    closed = true
    await Promise.allSettled([local.close(), remote.close()])
  }
  local.onclose = () => { void close() }
  remote.onclose = () => { void close() }
  local.onerror = () => { void close() }
  remote.onerror = () => { void close() }
  local.onmessage = message => {
    if ('method' in message && message.method === 'initialize') {
      const version = message.params?.protocolVersion
      if (typeof version === 'string') remote.setProtocolVersion?.(version)
    }
    void remote.send(message).catch(async () => {
      if ('id' in message && 'method' in message) await local.send({ jsonrpc: '2.0', id: message.id, error: { code: -32603, message: 'MCP connection unavailable. Connect the server in Mew.' } }).catch(() => {})
      await close()
    })
  }
  remote.onmessage = message => { void local.send(message).catch(() => close()) }
  try { await remote.start(); await local.start() } catch (error) { await close(); throw error }
  return close
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const directory = process.argv[2], name = process.argv[3]
  if (!directory || !name) process.exit(1)
  try {
    const config = readSharedMcpConfig(directory, name)
    if (config.enabled === false) throw new Error('MCP is disabled.')
    const transport = config.command ? createSharedMcpLocalTransport(config) : undefined
    const connection = transport ? { transport, close: () => transport.close() } : createSharedMcpConnection(directory, name)
    const close = await relaySharedMcp(new StdioServerTransport(), connection.transport)
    process.stdin.once('end', () => { void close().finally(() => connection.close()) })
    process.once('SIGTERM', () => { void close().finally(() => connection.close()) })
    process.once('SIGINT', () => { void close().finally(() => connection.close()) })
  } catch { process.stderr.write('MCP connection unavailable. Connect the server in Mew.\n'); process.exitCode = 1 }
}
