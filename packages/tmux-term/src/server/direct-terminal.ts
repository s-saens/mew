import * as pty from 'node-pty'
import { execFile } from 'node:child_process'
import { WebSocket } from 'ws'
import { preparePtyHelper } from './pty-helper.ts'

export type DirectTerminalKind = 'shell' | 'zellij' | 'screen'
interface DirectSession { process: pty.IPty; clients: Map<WebSocket, () => boolean>; output: string }
const sessions = new Map<string, DirectSession>()
const OUTPUT_LIMIT = 256 * 1024

export function directTerminalSpec(kind: DirectTerminalKind, name: string): { command: string; args: string[] } {
  if (kind === 'zellij') return { command: 'zellij', args: ['attach', '--create', name] }
  if (kind === 'screen') return { command: 'screen', args: ['-D', '-RR', name] }
  return process.platform === 'win32'
    ? { command: process.env.ComSpec || 'powershell.exe', args: [] }
    : { command: process.env.SHELL || '/bin/sh', args: ['-l'] }
}

export function createDirectTerminal(name: string, kind: DirectTerminalKind, cwd: string, env: NodeJS.ProcessEnv = process.env, onExit?: () => void): void {
  if (sessions.has(name)) return
  const spec = directTerminalSpec(kind, name)
  preparePtyHelper()
  const terminal = pty.spawn(spec.command, spec.args, { name: 'xterm-256color', cols: 80, rows: 24, cwd, env: env as Record<string, string> })
  const session: DirectSession = { process: terminal, clients: new Map(), output: '' }
  sessions.set(name, session)
  terminal.onData(data => {
    session.output = (session.output + data).slice(-OUTPUT_LIMIT)
    for (const [client, authorized] of session.clients) {
      if (!authorized()) client.terminate()
      else if (client.readyState === WebSocket.OPEN) client.send(Buffer.from(data))
    }
  })
  terminal.onExit(() => {
    if (sessions.get(name) === session) { sessions.delete(name); onExit?.() }
    for (const client of session.clients.keys()) if (client.readyState === WebSocket.OPEN) client.close(4001, 'Terminal exited')
    session.clients.clear()
  })
}

export function hasDirectTerminal(name: string): boolean { return sessions.has(name) }
export function directTerminalNames(): string[] { return [...sessions.keys()] }

export function connectDirectTerminal(name: string, ws: WebSocket, cols: number, rows: number, authorized: () => boolean): void {
  if (!authorized()) { ws.terminate(); return }
  const session = sessions.get(name)
  if (!session) { ws.close(4001, 'Terminal exited'); return }
  session.clients.set(ws, authorized)
  // A reconnect retains the browser's xterm buffer; clear it before replaying our snapshot.
  ws.send(Buffer.from('\x1bc'))
  if (session.output) ws.send(Buffer.from(session.output))
  try { session.process.resize(cols, rows) } catch { ws.close(4001, 'Terminal exited'); return }
  ws.on('message', raw => {
    if (!authorized()) { ws.terminate(); return }
    let msg: { type?: string; data?: string; cols?: number; rows?: number }
    try { msg = JSON.parse(raw.toString()) } catch { return }
    try {
      if (msg.type === 'input' && typeof msg.data === 'string') session.process.write(msg.data)
      else if (msg.type === 'resize' && typeof msg.cols === 'number' && Number.isFinite(msg.cols) && typeof msg.rows === 'number' && Number.isFinite(msg.rows)) {
        session.process.resize(Math.min(500, Math.max(10, Math.trunc(msg.cols))), Math.min(200, Math.max(4, Math.trunc(msg.rows))))
      }
    } catch { ws.close(4001, 'Terminal exited') }
  })
  ws.on('close', () => { session.clients.delete(ws) })
}

export async function stopDirectTerminal(name: string, kind: DirectTerminalKind): Promise<void> {
  const session = sessions.get(name)
  if (session) {
    sessions.delete(name)
    for (const client of session.clients.keys()) if (client.readyState === WebSocket.OPEN) client.close(4001, 'Terminal closed')
    session.clients.clear()
    try { session.process.kill() } catch { /* already exited */ }
  }
  if (kind === 'zellij' || kind === 'screen') {
    const args = kind === 'zellij' ? ['delete-session', '--force', name] : ['-S', name, '-X', 'quit']
    await new Promise<void>((resolve, reject) => execFile(kind, args, error => error ? reject(error) : resolve()))
  }
}
