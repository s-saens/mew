import { createContext, createElement, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { openMewSocket } from '../utils/remote-transport'
import type { WorkspaceScope } from '../../shared/workspace-scope'
import type { ActiveMewSessions } from '../../shared/active-sessions'
import { SESSION_ACTIVITY_INTERVAL_MS } from '../../shared/active-sessions'

export type PresenceView = {
  scope?: Readonly<WorkspaceScope>
  workspacePath?: string | null
  active: boolean
  focus: { path: string | null; project: string; workspaceLabel: string | null; color: string; runningAgents: number }
  tree: (signal?: { project?: string; version?: number; parents?: string[] }) => void
  workspace?: () => void
  receive: (participants: Record<string, string[]>, sessions: ActiveMewSessions | null) => void
}

/** One account connection carries all visible project roots and one active browser focus. */
export class WorkspacePresence {
  private views = new Map<object, PresenceView>()
  private socket: WebSocket | null = null
  private retry: ReturnType<typeof setTimeout> | undefined
  private heartbeat: ReturnType<typeof setInterval> | undefined
  private closed = true
  private participants: Record<string, string[]> = {}
  private roots: Record<string, Record<string, string[]>> = {}
  private sessions: ActiveMewSessions | null = null

  private readonly socketFactory: typeof openMewSocket
  constructor(socketFactory = openMewSocket) { this.socketFactory = socketFactory }

  register(key: object, view: PresenceView) { this.views.set(key, view); this.sendState(); this.deliver(key, view) }
  remove(key: object) { this.views.delete(key); this.sendState() }
  private send(value: unknown) { if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(value)) }
  private sendState = () => {
    const scopes = new Map<string, Readonly<WorkspaceScope>>()
    const runningByRoot = new Map<string, number>()
    for (const view of this.views.values()) if (view.scope) scopes.set(JSON.stringify(view.scope), view.scope)
    for (const view of this.views.values()) {
      const root = view.scope?.workspacePath ?? view.workspacePath ?? 'legacy'
      runningByRoot.set(root, Math.max(runningByRoot.get(root) ?? 0, view.focus.runningAgents))
    }
    this.send({ type: 'workspace-subscriptions', scopes: [...scopes.values()] })
    const active = [...this.views.values()].find(view => view.active)
    if (active) this.send({ type: 'focus', ...active.focus, runningAgents: [...runningByRoot.values()].reduce((sum, count) => sum + count, 0), visible: !document.hidden, workspaceScope: active.scope ?? null })
  }
  private deliver(_key: object, view: PresenceView) {
    const source = view.scope ? this.roots[view.scope.workspacePath] ?? {} : this.participants
    const prefix = view.focus.project + ':'
    view.receive(Object.fromEntries(Object.entries(source).filter(([path]) => path.startsWith(prefix)).map(([path, colors]) => [path.slice(prefix.length), colors])), this.sessions)
  }
  private receive = (event: MessageEvent) => {
    if (typeof event.data !== 'string') return
    let message: Record<string, unknown>
    try { message = JSON.parse(event.data) } catch { return }
    if (message.type === 'participants') {
      this.participants = message.participants as Record<string, string[]> ?? {}
      this.roots = message.workspaceParticipants as typeof this.roots ?? {}
      this.sessions = message.activeSessions as ActiveMewSessions ?? null
      for (const [key, view] of this.views) this.deliver(key, view)
    } else if (message.type === 'tree') {
      for (const view of this.views.values()) if (!message.workspacePath || !view.scope || message.workspacePath === view.scope.workspacePath) view.tree(message)
    } else if (message.type === 'workspace') {
      for (const view of this.views.values()) if (!view.scope || message.workspacePath === view.scope.workspacePath) view.workspace?.()
    } else if (message.type === 'theme' || message.type === 'projects-deleted' || message.type === 'permissions') {
      window.dispatchEvent(new Event(message.type === 'theme' ? 'mew:theme-changed' : message.type === 'permissions' ? 'mew:permissions-changed' : 'mew:projects-deleted'))
      if (message.type === 'permissions') for (const view of this.views.values()) view.tree()
    } else if (message.type === 'editor-tabs' || message.type === 'agent-tabs') {
      if (typeof message.workspacePath === 'string') window.dispatchEvent(new CustomEvent(`mew:${message.type}-changed`, { detail: { workspacePath: message.workspacePath } }))
    } else if (message.type === 'chat' || message.type === 'comments') {
      window.dispatchEvent(new CustomEvent('mew:signal', { detail: message }))
    }
  }
  private connect = () => {
    if (this.closed) return
    const socket = this.socketFactory(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api/presence`)
    this.socket = socket
    socket.onopen = () => { if (this.socket !== socket) return; this.sendState(); window.dispatchEvent(new Event('mew:permissions-changed')) }
    socket.onmessage = this.receive
    socket.onclose = () => { if (this.socket !== socket) return; this.socket = null; if (!this.closed) this.retry = setTimeout(this.connect, 3000) }
  }
  private refresh = () => {
    this.sendState()
    if (!document.hidden) {
      for (const view of this.views.values()) { view.tree(); view.workspace?.() }
    }
  }
  start() {
    this.closed = false; this.connect()
    this.heartbeat = setInterval(this.sendState, SESSION_ACTIVITY_INTERVAL_MS)
    document.addEventListener('visibilitychange', this.refresh)
    window.addEventListener('mew:remote-reconnected', this.refresh)
    window.addEventListener('online', this.refresh)
    return () => this.close()
  }
  close() {
    this.closed = true; clearTimeout(this.retry); clearInterval(this.heartbeat)
    const socket = this.socket; this.socket = null; socket?.close()
    document.removeEventListener('visibilitychange', this.refresh)
    window.removeEventListener('mew:remote-reconnected', this.refresh)
    window.removeEventListener('online', this.refresh)
  }
}

const PresenceContext = createContext<WorkspacePresence | null>(null)
export function WorkspacePresenceProvider({ children }: { children: ReactNode }) {
  const [connection] = useState(() => new WorkspacePresence())
  useEffect(() => connection.start(), [connection])
  return createElement(PresenceContext.Provider, { value: connection }, children)
}

export function useSharedWorkspacePresence(view: Omit<PresenceView, 'receive'>) {
  const connection = useContext(PresenceContext)
  const key = useRef({})
  const [state, setState] = useState<{ participants: Record<string, string[]>; activeSessions: ActiveMewSessions | null }>({ participants: {}, activeSessions: null })
  const current = useRef(view)
  current.current = view
  useEffect(() => {
    if (!connection) return
    const registered = { ...current.current, tree: (signal?: Parameters<PresenceView['tree']>[0]) => current.current.tree(signal),
      workspace: () => current.current.workspace?.(), receive: (participants: Record<string, string[]>, activeSessions: ActiveMewSessions | null) => {
        setState(previous => JSON.stringify(previous) === JSON.stringify({ participants, activeSessions }) ? previous : { participants, activeSessions })
      } }
    connection.register(key.current, registered)
    const identity = key.current
    return () => connection.remove(identity)
  }, [connection, view.scope, view.workspacePath, view.active, view.focus.path, view.focus.project, view.focus.workspaceLabel, view.focus.color, view.focus.runningAgents])
  return { connection, state }
}
