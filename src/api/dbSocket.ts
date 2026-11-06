import type { WorkspaceScope } from '../../shared/workspace-scope.ts'
import type { DbEvent } from '@mew/editor'
import { getProject } from './client'
import { createWorkspaceTransport } from './workspace-transport.ts'

type Listener = (event: DbEvent) => void
type Room = { project: string; dbId: string; set: Set<Listener> }
type Connection = { subscribe(dbId: string, onEvent: Listener, project: string): () => void }

// Multiple views of one root share its connection; identically named rooms in other roots never do.
const connections = new Map<string, Connection>()

function createConnection(scope: Readonly<WorkspaceScope> | undefined, connectionKey: string): Connection {
  const listeners = new Map<string, Room>()
  let ws: WebSocket | null = null
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  const transport = createWorkspaceTransport(scope)

  function send(type: 'subscribe' | 'unsubscribe', project: string, dbId: string) {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type, project, dbId }))
  }

  function ensureSocket() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const socket = transport.openSocket(`${protocol}//${location.host}/api/db/ws`)
    ws = socket
    socket.onopen = () => {
      if (ws !== socket) return
      for (const entry of listeners.values()) send('subscribe', entry.project, entry.dbId)
    }
    socket.onmessage = event => {
      if (ws !== socket || typeof event.data !== 'string') return
      try {
        const msg = JSON.parse(event.data) as { type?: string; project?: string; dbId?: string; event?: DbEvent }
        if (msg.type !== 'db.event' || !msg.dbId || !msg.event) return
        const entry = listeners.get(JSON.stringify([msg.project, msg.dbId]))
        if (entry && entry.project === msg.project) for (const fn of entry.set) fn(msg.event)
      } catch { /* Malformed events cannot cross room boundaries. */ }
    }
    socket.onclose = () => {
      if (ws !== socket) return
      ws = null
      if (listeners.size > 0 && !retryTimer) {
        retryTimer = setTimeout(() => {
          retryTimer = null
          if (listeners.size > 0) ensureSocket()
        }, 3000)
      }
    }
  }

  const connection: Connection = {
    subscribe(dbId, onEvent, project) {
      connections.set(connectionKey, connection)
      const key = JSON.stringify([project, dbId])
      let entry = listeners.get(key)
      if (!entry) {
        entry = { project, dbId, set: new Set() }
        listeners.set(key, entry)
      }
      const first = entry.set.size === 0
      entry.set.add(onEvent)
      ensureSocket()
      if (first) send('subscribe', project, dbId)
      let subscribed = true
      return () => {
        if (!subscribed) return
        subscribed = false
        const current = listeners.get(key)
        if (!current) return
        current.set.delete(onEvent)
        if (!current.set.size) {
          listeners.delete(key)
          send('unsubscribe', project, dbId)
        }
        if (!listeners.size) {
          if (retryTimer) clearTimeout(retryTimer)
          retryTimer = null
          const socket = ws
          ws = null
          socket?.close()
          if (connections.get(connectionKey) === connection) connections.delete(connectionKey)
        }
      }
    },
  }
  return connection
}

/** Capture both root identities, while retaining the selected API project for each room. */
export function createDbSubscriptions(scope?: Readonly<WorkspaceScope>, currentProject = () => getProject()) {
  const captured = scope ? Object.freeze({ ...scope }) : undefined
  const key = JSON.stringify(captured ? [captured.workspacePath, captured.projectPath] : [])
  return (dbId: string, onEvent: Listener, project = currentProject()): (() => void) => {
    let connection = connections.get(key)
    if (!connection) {
      connection = createConnection(captured, key)
      connections.set(key, connection)
    }
    return connection.subscribe(dbId, onEvent, project)
  }
}

export const subscribeDb = createDbSubscriptions()
