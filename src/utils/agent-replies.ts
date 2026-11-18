import { agentReplyExcerpt, type AgentReplyReference } from '../../shared/agent-reply.ts'
import { withoutAttachmentTokens } from './agent-attachments.ts'
import type { Item } from './agentFold.ts'

export function agentBubbleId(item: Item): string | undefined {
  if (item.kind === 'error') return undefined
  return item.bubbleId ?? (/^(?:m|turn)\d+$/.test(item.key) ? item.key : undefined)
}

export function agentReplyReference(item: Item, sessionId?: string): AgentReplyReference | undefined {
  const targetId = agentBubbleId(item)
  if (!targetId || item.kind === 'error') return undefined
  let excerpt = ''
  if (item.kind === 'user') {
    excerpt = agentReplyExcerpt(withoutAttachmentTokens(item.text))
  } else {
    for (const child of item.children) {
      if (child.kind !== 'agent' || !/\S/.test(child.text)) continue
      const next = agentReplyExcerpt(`${excerpt} ${child.text}`)
      if (next === excerpt && excerpt) break
      excerpt = next
    }
  }
  return excerpt ? { targetId, kind: item.kind, excerpt, ...(sessionId ? { sessionId } : {}) } : undefined
}
