import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import type { AgentReplyReference } from '../../shared/agent-reply.ts'
import type { HistoryPage } from '../../shared/agent-history.ts'
import { agentBubbleId, agentReplyReference } from '../utils/agent-replies.ts'
import { foldEvents, type AgentEvent, type Item } from '../utils/agentFold.ts'
import type { CachedHistory } from '../utils/agent-history-cache.ts'
import { uuid } from '../utils/uuid.ts'

type TargetResponse = { type: 'history_target'; requestId: string; page: HistoryPage<AgentEvent> | null }
type TargetRequest = {
  requestId: string
  reply: AgentReplyReference
  generation: string
  sessionId: string
  timer: ReturnType<typeof setTimeout>
}
const legacyBubbleKey = /^(?:m|turn)\d+$/

function findTarget(items: Item[], reply: AgentReplyReference) {
  const legacy = legacyBubbleKey.test(reply.targetId)
  return items.find(item => item.kind === reply.kind
    && (agentBubbleId(item) === reply.targetId || legacy && item.key === reply.targetId)
    && (!legacy || agentReplyReference(item)?.excerpt === reply.excerpt))
}

export function useAgentMessageJump({ container, history, socket, liveItems, previewSessionId, sessionId, expand, beforeScroll }: {
  container: RefObject<HTMLDivElement | null>
  history: RefObject<CachedHistory | null>
  socket: RefObject<WebSocket | null>
  liveItems: Item[]
  previewSessionId: string | undefined
  sessionId: string | null
  expand: (key: string) => void
  beforeScroll: (top: number) => void
}) {
  const anchorPrefix = useId()
  const [targetItems, setTargetItems] = useState<Item[] | null>(null)
  const [notice, setNotice] = useState<'loading' | 'missing' | null>(null)
  const [focusTarget, setFocusTarget] = useState<{ key: string; bubbleId: string } | null>(null)
  const pending = useRef<TargetRequest | null>(null)

  const cancelRequest = useCallback(() => {
    if (pending.current) clearTimeout(pending.current.timer)
    pending.current = null
  }, [])
  const reset = useCallback(() => {
    cancelRequest()
    setTargetItems(null)
    setNotice(null)
    setFocusTarget(null)
  }, [cancelRequest])
  const reveal = useCallback((key: string, bubbleId: string) => {
    setNotice(null)
    expand(key)
    setFocusTarget({ key, bubbleId })
  }, [expand])

  const jump = useCallback((reply: AgentReplyReference) => {
    cancelRequest()
    const current = history.current
    const visibleSessionId = previewSessionId ?? current?.sessionId ?? sessionId
    if (reply.sessionId && reply.sessionId !== visibleSessionId) {
      setNotice('missing')
      return
    }
    const node = container.current?.ownerDocument.getElementById(`${anchorPrefix}-${reply.targetId}`)
    if (!legacyBubbleKey.test(reply.targetId) && node?.dataset.agentMessageKind === reply.kind && node.dataset.agentItemKey) {
      return reveal(node.dataset.agentItemKey, reply.targetId)
    }
    if (targetItems) {
      const target = findTarget(targetItems, reply)
      if (target) return reveal(target.key, agentBubbleId(target)!)
    }
    const liveTarget = findTarget(liveItems, reply)
    if (liveTarget) {
      setTargetItems(null)
      return reveal(liveTarget.key, agentBubbleId(liveTarget)!)
    }
    const ws = socket.current
    if (previewSessionId || !current || ws?.readyState !== WebSocket.OPEN) {
      setNotice('missing')
      return
    }
    const { generation, sessionId: currentSessionId } = current
    const requestId = uuid()
    pending.current = { requestId, reply, generation, sessionId: currentSessionId, timer: setTimeout(() => {
      cancelRequest()
      setNotice('missing')
    }, 5000) }
    setNotice('loading')
    try {
      ws.send(JSON.stringify({ type: 'history_target', requestId, generation, targetId: reply.targetId }))
    } catch {
      cancelRequest()
      setNotice('missing')
    }
  }, [anchorPrefix, cancelRequest, container, history, liveItems, previewSessionId, reveal, sessionId, socket, targetItems])

  const accept = useCallback(({ requestId, page }: TargetResponse) => {
    const request = pending.current
    if (!request || request.requestId !== requestId) return
    cancelRequest()
    const current = history.current
    if (!current || current.generation !== request.generation || current.sessionId !== request.sessionId) {
      setNotice(null)
      return
    }
    if (!page || page.mode !== 'target' || page.generation !== request.generation || page.sessionId !== request.sessionId
      || page.start < 0 || page.end > page.total || page.events.length !== page.end - page.start) {
      setNotice('missing')
      return
    }
    const items = foldEvents(page.events, undefined, page.start)
    const target = findTarget(items, request.reply)
    if (!target) {
      setNotice('missing')
      return
    }
    setTargetItems(items)
    reveal(target.key, agentBubbleId(target)!)
  }, [cancelRequest, history, reveal])

  useLayoutEffect(() => {
    if (!focusTarget) return
    const el = container.current
    const node = el?.ownerDocument.getElementById(`${anchorPrefix}-${focusTarget.bubbleId}`)
    if (!el || !node) return
    node.focus({ preventScroll: true })
    const top = el.getBoundingClientRect().top + el.clientTop + (Number.parseFloat(getComputedStyle(el).paddingTop) || 0)
    el.scrollTo({ top: node.getBoundingClientRect().top - top + el.scrollTop, behavior: 'instant' })
    beforeScroll(el.scrollTop)
  }, [anchorPrefix, beforeScroll, container, focusTarget])

  useEffect(() => {
    if (!focusTarget) return
    const timer = setTimeout(() => setFocusTarget(null), 1700)
    return () => clearTimeout(timer)
  }, [focusTarget])
  useEffect(() => {
    if (notice !== 'missing') return
    const timer = setTimeout(() => setNotice(null), 3500)
    return () => clearTimeout(timer)
  }, [notice])
  useEffect(() => cancelRequest, [cancelRequest])

  return { jump, accept, reset, targetItems, highlightedKey: focusTarget?.key, notice, anchorPrefix }
}
