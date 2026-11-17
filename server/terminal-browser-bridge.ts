import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { sendTerminalBrowserRequest } from '@mew/tmux-term/server'
import { browserDesktopTarget } from './browser-desktop.ts'

const bridges = new Map<string, { env: NodeJS.ProcessEnv; close: () => void }>()
const pending = new Map<string, Promise<NodeJS.ProcessEnv>>()
const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`

export async function terminalBrowserBridge(session: string, account: string): Promise<NodeJS.ProcessEnv> {
  const existing = bridges.get(session)
  if (existing) return existing.env
  const inFlight = pending.get(session)
  if (inFlight) return inFlight
  const task = createBridge(session, account)
  pending.set(session, task)
  try { return await task } finally { pending.delete(session) }
}

async function createBridge(session: string, account: string): Promise<NodeJS.ProcessEnv> {
  if (process.platform === 'win32') return {}
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-open-'))
  const socketPath = path.join(directory, 's')
  const executable = path.join(directory, 'browser')
  const helper = fileURLToPath(new URL('./terminal-browser-helper.cjs', import.meta.url))
  fs.writeFileSync(executable, `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(helper)} "$@"\n`, { mode: 0o700 })
  const server = net.createServer({ allowHalfOpen: true }, connection => {
    let data = ''
    connection.setTimeout(5000, () => connection.destroy())
    connection.on('error', () => {})
    connection.on('data', chunk => { data += chunk.toString(); if (data.length > 16384) connection.destroy() })
    connection.on('end', () => {
      let sent = false
      try {
        const value: unknown = JSON.parse(data)
        if (value && typeof value === 'object' && 'url' in value && typeof value.url === 'string') {
          const url = browserDesktopTarget(value.url)
          if (url !== 'about:blank') sent = sendTerminalBrowserRequest(session, account, url)
        }
      } catch { /* malformed and rejected targets fail closed */ }
      connection.end(sent ? 'ok\n' : 'error\n')
    })
  })
  try { await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(socketPath, () => { server.off('error', reject); resolve() }) }) }
  catch (error) { fs.rmSync(directory, { recursive: true, force: true }); throw error }
  server.unref()
  const env = { BROWSER: executable, MEW_TERMINAL_BROWSER_SOCKET: socketPath }
  bridges.set(session, { env, close: () => { server.close(); fs.rmSync(directory, { recursive: true, force: true }) } })
  return env
}

export function closeTerminalBrowserBridge(session: string) {
  const bridge = bridges.get(session)
  if (bridge) { bridges.delete(session); bridge.close() }
}

process.once('exit', () => { for (const bridge of bridges.values()) bridge.close() })
