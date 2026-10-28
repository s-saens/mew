import type { SessionInfo } from '@agentclientprotocol/sdk'

export type SessionSearchResult = Omit<SessionInfo, 'cwd'> & { cwd?: string; snippet?: string; score?: number }
export const MAX_HISTORY_QUERY_LENGTH = 256

export function normalizeHistorySearch(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
}

const CONCEPTS = [
  ['에이전트패널', '에이전트창', 'agentpanel', 'agent pane', 'agent window', 'AI 패널'],
  ['히스토리', '대화기록', '대화이력', 'conversation history', 'chat history', 'session history'],
  ['파일탐색기', '파일트리', 'file explorer', 'file tree'],
  ['대기열', '대기큐', '메시지큐', 'message queue', 'queued messages'],
  ['첨부파일', '파일첨부', 'attachment', 'attached file'],
  ['예약작업', '반복작업', 'scheduled task', 'cron'],
  ['단축키', '키보드바로가기', 'keyboard shortcut', 'hotkey'],
  ['설정', 'settings', 'configuration'],
] as const

/** OR groups of AND terms. Compact text makes Korean spacing differences immaterial. */
export function historySearchTerms(query: string): string[][] {
  const trimmed = query.trim().slice(0, MAX_HISTORY_QUERY_LENGTH)
  const compact = normalizeHistorySearch(trimmed)
  if (!compact) return []
  const terms = trimmed.split(/\s+/u).map(normalizeHistorySearch).filter(Boolean).slice(0, 8)
  const groups = [[compact], terms]
  for (const aliases of CONCEPTS) {
    const normalized = aliases.map(normalizeHistorySearch)
    const match = normalized.find(alias => compact.includes(alias))
    if (!match) continue
    const remainder = compact.replace(match, '')
    for (const alias of aliases) {
      const expanded = alias.split(/\s+/u).map(normalizeHistorySearch).filter(Boolean)
      groups.push(remainder ? [...expanded, remainder] : expanded)
    }
  }
  return [...new Map(groups.filter(group => group.length).map(group => [JSON.stringify(group), group])).values()].slice(0, 20)
}

export function scoreHistorySearch(text: string, query: string): number {
  const normalized = normalizeHistorySearch(text)
  let score = 0
  for (const [index, group] of historySearchTerms(query).entries()) {
    if (group.every(term => normalized.includes(term))) score = Math.max(score, 100 - index)
  }
  return score
}

export function historySessionIdScore(id: string, query: string): number {
  const value = normalizeHistorySearch(query)
  if (!value) return 0
  const normalized = normalizeHistorySearch(id)
  return normalized === value ? 10_000 : normalized.includes(value) ? 5_000 : 0
}

export function historySearchSnippet(text: string, query: string): string {
  const flat = text.replace(/\s+/gu, ' ').trim()
  const normalized = normalizeHistorySearch(flat)
  const group = historySearchTerms(query).find(terms => terms.every(term => normalized.includes(term)))
  const match = group ? Math.min(...group.map(term => normalized.indexOf(term))) : 0
  let offset = 0, position = 0
  for (const character of flat) {
    if (position >= match) break
    position += normalizeHistorySearch(character).length
    offset += character.length
  }
  const start = Math.max(0, offset - 45)
  const end = Math.min(flat.length, start + 180)
  return `${start ? '…' : ''}${flat.slice(start, end)}${end < flat.length ? '…' : ''}`
}

export function mergeSessionSearchResults(results: SessionSearchResult[], query: string, limit = 50): SessionSearchResult[] {
  const unique = new Map<string, SessionSearchResult>()
  for (const result of results) {
    const score = Math.max(result.score ?? 0, historySessionIdScore(result.sessionId, query), scoreHistorySearch(result.title ?? '', query))
    if (query.trim() && !score) continue
    const previous = unique.get(result.sessionId)
    const next = { ...result, score }
    if (!previous) unique.set(result.sessionId, next)
    else {
      const best = score > (previous.score ?? 0) ? next : previous
      unique.set(result.sessionId, {
        ...best,
        title: best.title || previous.title || next.title,
        snippet: best.snippet || previous.snippet || next.snippet,
        updatedAt: [previous.updatedAt, next.updatedAt].filter((value): value is string => !!value).sort().at(-1),
      })
    }
  }
  return [...unique.values()].sort((left, right) =>
    (query.trim() ? (right.score ?? 0) - (left.score ?? 0) : 0)
    || (right.updatedAt ?? '').localeCompare(left.updatedAt ?? '')
    || left.sessionId.localeCompare(right.sessionId),
  ).slice(0, limit)
}
