import { useCallback, useMemo, useRef, useState } from 'react'
import type { AgentAttachmentRef } from '../../shared/agent-attachment'
import type { AgentEvent, AgentMessageSettings, Item, SessionMeta } from '../utils/agentFold'
import { uuid } from '../utils/uuid'

type Prompt = { text: string; attachments: AgentAttachmentRef[]; settings: AgentMessageSettings }
type Feedback = {
  user: Extract<Item, { kind: 'user' }>
  afterKey: string | null
  startupId?: number
  sent: boolean
  echoed: boolean
  waiting: boolean
  queuedCount: number
}

/** Local display feedback never enters the sequenced transcript or its cache. */
export function useAgentPromptFeedback(items: Item[]) {
  const current = useRef<Feedback | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const update = useCallback((next: Feedback | null) => {
    current.current = next
    setFeedback(next)
  }, [])
  const clear = useCallback(() => update(null), [update])
  const begin = useCallback((prompt: Prompt, afterKey: string | null, queued: string[], startupId?: number) => {
    if (current.current?.waiting) return
    update({ user: { key: `local-${uuid()}`, kind: 'user', text: prompt.text, images: [],
      attachments: prompt.attachments, settings: prompt.settings }, afterKey, startupId,
      sent: startupId === undefined, echoed: false, waiting: true,
      queuedCount: queued.filter(text => text === prompt.text).length })
  }, [update])
  const markSent = useCallback((text: string) => {
    const value = current.current
    if (value?.user.text === text && !value.sent) update({ ...value, sent: true })
  }, [update])
  const cancelStartup = useCallback((id: number) => {
    if (current.current?.startupId === id) clear()
  }, [clear])
  const observe = useCallback((events: AgentEvent[]) => {
    let next = current.current
    if (!next?.sent) return
    for (const event of events) {
      if (event.type === 'reset') { next = null; break }
      if (event.type === 'update' && event.update.sessionUpdate === 'user_message_chunk'
        && event.update.content.type === 'text' && event.update.content.text === next.user.text) {
        next = { ...next, echoed: true }
      }
      if (event.type === 'turn_start' && next.echoed) { next = null; break }
      if (event.type === 'error' || event.type === 'fatal' || event.type === 'turn_end') {
        next = next.echoed ? null : { ...next, waiting: false }
        break
      }
    }
    if (next !== current.current) update(next)
  }, [update])
  const acknowledgeQueue = useCallback((meta: SessionMeta, buffered: AgentEvent[]) => {
    const value = current.current
    // A later identical queued prompt can be acknowledged before this frame's echo is painted.
    if (value && buffered.some(event => event.type === 'update'
      && event.update.sessionUpdate === 'user_message_chunk' && event.update.content.text === value.user.text)) return
    if (value?.sent && !value.echoed
      && meta.queued.filter(text => text === value.user.text).length > value.queuedCount) clear()
  }, [clear])
  const replace = useCallback(() => {
    if (current.current?.sent) clear()
  }, [clear])
  const disconnect = useCallback(() => {
    const value = current.current
    if (value?.sent) update({ ...value, waiting: false })
  }, [update])
  const displayItems = useMemo(() => {
    if (!feedback) return items
    const result = items.slice()
    // Keep a rejected local question ahead of the server's error message.
    const anchor = feedback.afterKey === null ? -1 : result.findIndex(item => item.key === feedback.afterKey)
    const index = feedback.afterKey !== null && anchor === -1 ? result.length : anchor + 1
    if (!feedback.echoed) result.splice(index, 0, feedback.user)
    if (feedback.waiting) result.push({ key: `${feedback.user.key}:reply`, kind: 'turn', children: [],
      done: false, stopReason: null, startedAt: null, durationMs: null })
    return result
  }, [feedback, items])
  return { displayItems, waiting: feedback?.waiting ?? false, replyKey: feedback ? `${feedback.user.key}:reply` : null,
    begin, markSent, cancelStartup, observe, acknowledgeQueue, replace, disconnect, clear }
}
