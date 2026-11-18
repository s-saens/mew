import { withoutAttachmentTokens } from '../shared/agent-attachment.ts'
import { AGENT_REPLY_CONTEXT_LIMIT, agentReplyExcerpt, type AgentReplyReference } from '../shared/agent-reply.ts'
import { selectedRuntimePrompt } from '../shared/selected-runtime-prompt.ts'
import type { AgentEvent } from './agentAcp.ts'

export function agentReplySource(
  events: readonly AgentEvent[], range: { start: number; end: number } | null, reply: AgentReplyReference,
): string {
  if (!range) return reply.excerpt
  const position = /^(?:m|turn)(\d+)$/.exec(reply.targetId)
  const sequence = position ? Number(position[1]) : -1
  let found = false, text = '', previousMessage: string | undefined, continuingAnswer = false
  for (let index = range.start; index < range.end; index++) {
    const event = events[index]
    const update = event.type === 'update' ? event.update : null
    const user = update?.sessionUpdate === 'user_message_chunk'
    if (!found) {
      const matches = position ? index === sequence : 'bubbleId' in event && event.bubbleId === reply.targetId
      if (!matches) continue
      if ((reply.kind === 'user') !== user) return reply.excerpt
      found = true
    }
    if (reply.kind === 'user') {
      if (!user) {
        if (event.type === 'user_images' || event.type === 'user_attachments') continue
        break
      }
      const { content, messageId } = update as typeof update & { messageId?: string }
      if (text && messageId && messageId !== previousMessage) break
      const body = content.type === 'text' ? selectedRuntimePrompt(content.text)?.text ?? content.text : `[${content.type}]`
      text += (text ? '\n' : '') + body.slice(0, AGENT_REPLY_CONTEXT_LIMIT - text.length)
      previousMessage = messageId ?? previousMessage
    } else if (update?.sessionUpdate === 'agent_message_chunk') {
      const { content, messageId } = update as typeof update & { messageId?: string }
      const separate = text && (!continuingAnswer || messageId && messageId !== previousMessage)
      const body = content.type === 'text' ? content.text : `[${content.type}]`
      text += (separate ? '\n\n' : '') + body.slice(0, AGENT_REPLY_CONTEXT_LIMIT - text.length)
      continuingAnswer = true
      previousMessage = messageId ?? previousMessage
    } else if (event.type === 'turn_end' || user) break
    else if (event.type === 'permission' || event.type === 'error'
      || update?.sessionUpdate === 'agent_thought_chunk' || update?.sessionUpdate === 'tool_call') continuingAnswer = false
    if (text.length >= AGENT_REPLY_CONTEXT_LIMIT) break
  }
  if (reply.kind === 'user') text = withoutAttachmentTokens(text)
  text = text.slice(0, AGENT_REPLY_CONTEXT_LIMIT).replace(/[\uD800-\uDBFF]$/, '').trim()
  if (!text || position && agentReplyExcerpt(text) !== reply.excerpt) return reply.excerpt
  return text
}
