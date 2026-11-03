import type { ChatMessage } from '../api/client.ts'
import type { NoticeInput } from './mewcat-notification-rules.ts'

/** Establish history silently, then announce new incoming messages independently of read receipts. */
export function createChatNoticeTracker(identity: string): (messages: readonly ChatMessage[]) => NoticeInput[] {
  let initialized = false
  let latestTime = -Infinity
  const observed = new Set<string>()

  return messages => {
    const previousTime = latestTime
    const notices: NoticeInput[] = []
    for (const message of [...messages].sort((a, b) => a.time - b.time)) {
      const known = observed.has(message.id)
      if (known) observed.delete(message.id)
      observed.add(message.id)
      if (observed.size > 1000) {
        const oldest = observed.values().next().value
        if (oldest !== undefined) observed.delete(oldest)
      }
      latestTime = Math.max(latestTime, message.time)
      if (!initialized || known || message.time <= previousTime || message.author === identity) continue
      if (message.to?.length && !message.to.includes(identity)) continue
      notices.push({
        key: `chat:${message.id}`,
        kind: 'chat',
        level: 'success',
        source: message.author,
        target: 'chat',
        chatConversation: message.to?.length ? message.author : 'group',
      })
    }
    initialized = true
    return notices
  }
}
