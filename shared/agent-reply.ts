export type AgentReplyReference = {
  targetId: string
  kind: 'user' | 'turn'
  excerpt: string
  sessionId?: string
}

const MAX_EXCERPT_POINTS = 180
export const AGENT_REPLY_CONTEXT_LIMIT = 12_000
const BUBBLE_ID = /^(?:[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}|(?:m|turn)\d{1,16})$/
const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/
const WHITESPACE = /\s/u

export function agentReplyExcerpt(text: string): string {
  let excerpt = '', count = 0, space = false
  for (const character of text) {
    if (WHITESPACE.test(character)) {
      space = count > 0
      continue
    }
    if (space) {
      if (count + 1 === MAX_EXCERPT_POINTS) break
      excerpt += ' '
      count++
      space = false
    }
    excerpt += character
    if (++count === MAX_EXCERPT_POINTS) break
  }
  return excerpt
}

export function validAgentReply(value: unknown): AgentReplyReference | undefined {
  if (!value || typeof value !== 'object') return undefined
  const { targetId, kind, excerpt, sessionId } = value as Partial<AgentReplyReference>
  if (typeof targetId !== 'string' || !BUBBLE_ID.test(targetId) || kind !== 'user' && kind !== 'turn'
    || (targetId.startsWith('m') && kind !== 'user') || (targetId.startsWith('turn') && kind !== 'turn')
    || typeof excerpt !== 'string' || excerpt.length > MAX_EXCERPT_POINTS * 2 || excerpt !== agentReplyExcerpt(excerpt) || !excerpt
    || sessionId !== undefined && (typeof sessionId !== 'string' || !SESSION_ID.test(sessionId))) return undefined
  return { targetId, kind, excerpt, ...(sessionId === undefined ? {} : { sessionId }) }
}

const CLOSING = '\n</mew-reply>\n\nUser request:\n'

/** Give the runtime bounded source context while leaving the authored request recoverable on replay. */
export function agentReplyPrompt(text: string, reply: AgentReplyReference, source: string): string {
  const quoted = source.split(/\r?\n/).map(line => `> ${line}`).join('\n')
  const metadata = encodeURIComponent(JSON.stringify(reply))
  return `<mew-reply version="1" ref="${metadata}" length="${quoted.length}">\n${quoted}${CLOSING}${text}`
}

export function restoredAgentReplyPrompt(prompt: string): { reply: AgentReplyReference; text: string } | null {
  const opening = /^<mew-reply version="1" ref="([^"\r\n]{1,4096})" length="(\d{1,5})">\n/.exec(prompt)
  if (!opening) return null
  const end = opening[0].length + Number(opening[2])
  if (!prompt.startsWith(CLOSING, end)) return null
  try {
    const reply = validAgentReply(JSON.parse(decodeURIComponent(opening[1])))
    return reply ? { reply, text: prompt.slice(end + CLOSING.length) } : null
  } catch {
    return null
  }
}
