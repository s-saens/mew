import { useCallback, useEffect, useMemo, useState, type RefObject } from 'react'
import { uuid } from '../utils/uuid.ts'
import { createAgentTabPreviews, type AgentTabPreview } from '../utils/agent-tab-previews.ts'
import type { SessionInfo } from '../utils/agentFold.ts'

type Pending = { resolve: (preview: AgentTabPreview | null) => void; release: () => void }

/** Prepare history rows without changing the live provider session or its authoritative cursor. */
export function useAgentSessionPreviews(cacheKey: string, runtime: string, cwd: string, socket: RefObject<WebSocket | null>, sessions: SessionInfo[] | null, enabled: boolean) {
  const [revision, refresh] = useState(0)
  const [focusedId, focus] = useState<string | null>(null)
  const scope = useMemo(() => ({ cacheKey, pending: new Map<string, Pending>() }), [cacheKey])
  const previews = useMemo(() => createAgentTabPreviews((target, signal) => new Promise(resolve => {
    const current = socket.current
    if (current?.readyState !== WebSocket.OPEN || signal.aborted) { resolve(null); return }
    const requestId = uuid()
    const aborted = () => { scope.pending.delete(requestId); resolve(null) }
    const release = () => signal.removeEventListener('abort', aborted)
    scope.pending.set(requestId, { resolve, release })
    signal.addEventListener('abort', aborted, { once: true })
    try { current.send(JSON.stringify({ type: 'preview_session', sessionId: target.sessionId, requestId })) }
    catch { scope.pending.delete(requestId); release(); resolve(null) }
  }), () => refresh(value => value + 1)), [scope, socket])
  const target = useCallback((sessionId: string) => ({ id: sessionId, runtime, cwd, sessionId }), [runtime, cwd])
  const recent = sessions?.slice(0, 6).map(session => session.sessionId) ?? []
  if (focusedId && sessions?.some(session => session.sessionId === focusedId) && !recent.includes(focusedId)) recent.push(focusedId)
  const signature = JSON.stringify(recent)
  useEffect(() => {
    const ids = JSON.parse(signature) as string[]
    previews.update(enabled ? ids.map(target) : [], focusedId, { retainCached: enabled })
  }, [previews, enabled, signature, focusedId, target])
  const reset = useCallback(() => {
    previews.dispose()
    for (const pending of scope.pending.values()) { pending.release(); pending.resolve(null) }
    scope.pending.clear()
  }, [previews, scope])
  const accept = useCallback((response: { requestId: string; preview: AgentTabPreview | null }) => {
    const pending = scope.pending.get(response.requestId)
    if (!pending) return
    scope.pending.delete(response.requestId)
    pending.release()
    pending.resolve(response.preview)
  }, [scope])
  useEffect(() => reset, [reset])
  const get = useCallback((sessionId: string) => previews.get(target(sessionId)), [previews, target])
  return { revision, get, prepare: focus, accept, reset }
}
