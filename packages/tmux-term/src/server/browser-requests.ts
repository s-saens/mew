import { WebSocket } from 'ws'

type Viewer = { socket: WebSocket; account: () => string | null; lastInput: number }
const viewers = new Map<string, Set<Viewer>>()

export function registerTerminalBrowserViewer(session: string, socket: WebSocket, account: () => string | null) {
  const entries = viewers.get(session) ?? new Set<Viewer>()
  const viewer = { socket, account, lastInput: Date.now() }
  entries.add(viewer)
  viewers.set(session, entries)
  socket.on('message', () => { viewer.lastInput = Date.now() })
  socket.once('close', () => { entries.delete(viewer); if (!entries.size) viewers.delete(session) })
}

export function sendTerminalBrowserRequest(session: string, account: string, url: string): boolean {
  const eligible = [...(viewers.get(session) ?? [])].filter(viewer => viewer.socket.readyState === WebSocket.OPEN && viewer.account() === account)
  eligible.sort((a, b) => b.lastInput - a.lastInput)
  if (!eligible.length) return false
  eligible[0].socket.send('\0' + JSON.stringify({ type: 'browser-open', url }))
  return true
}
