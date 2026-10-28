// SQLite contains Mew's display transcript; ACP remains the runtime context authority.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync, type StatementSync } from 'node:sqlite'
import { DATA_DIR, readJsonFile } from './dataDir.ts'
import type { AgentEvent } from './agentAcp.ts'
import type { SessionSearchResult } from '../shared/agent-session-search.ts'
import {
  initializeAgentSessionSearch, queryAgentSessionSearch, readAgentSessionSearchState,
  updateAgentSessionSearch, type SessionSearchSource, type SessionSearchText,
} from './agent-transcript-search.ts'

const TRANSCRIPT_DIR = path.join(DATA_DIR, 'agent-transcripts')
let database: DatabaseSync | null = null
const statements = new Map<string, StatementSync>()
const written = new WeakMap<AgentEvent[], { key: string; count: number; revision: string }>()

export function transcriptKey(runtime: string, cwd: string, sessionId: string): string {
  return crypto.createHash('sha256').update(JSON.stringify([runtime, cwd, sessionId])).digest('hex')
}

function db(): DatabaseSync {
  if (database) return database
  fs.mkdirSync(TRANSCRIPT_DIR, { recursive: true, mode: 0o700 })
  const file = path.join(TRANSCRIPT_DIR, 'transcripts.sqlite')
  const opened = new DatabaseSync(file)
  try {
    fs.chmodSync(file, 0o600)
    const version = Number(opened.prepare('PRAGMA user_version').get()?.user_version ?? 0)
    if (version > 1) throw new Error('지원하지 않는 전사 DB 버전')
    opened.exec(`PRAGMA busy_timeout=1000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS sessions (
        key TEXT PRIMARY KEY, runtime TEXT NOT NULL, cwd TEXT NOT NULL, session_id TEXT NOT NULL,
        revision TEXT NOT NULL, count INTEGER NOT NULL, updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS events (
        session_key TEXT NOT NULL, seq INTEGER NOT NULL, payload TEXT NOT NULL,
        PRIMARY KEY (session_key, seq)
      ) WITHOUT ROWID; PRAGMA user_version=1;`)
    initializeAgentSessionSearch(opened)
    database = opened
    return opened
  } catch (error) { opened.close(); throw error }
}

export function closeTranscriptDatabase(): void { statements.clear(); database?.close(); database = null }

function prepare(store: DatabaseSync, sql: string): StatementSync {
  let statement = statements.get(sql)
  if (!statement) { statement = store.prepare(sql); statements.set(sql, statement) }
  return statement
}

/** Same append-only array: serialize/insert only its new tail. A restored array replaces atomically. */
export function writeAgentTranscript(runtime: string, cwd: string, sessionId: string, events: AgentEvent[], onlyIfMissing = false): boolean {
  if (!sessionId) return false
  try {
    const store = db(), key = transcriptKey(runtime, cwd, sessionId)
    const previous = written.get(events)
    store.exec('BEGIN IMMEDIATE')
    let count = 0, revision = crypto.randomUUID() as string
    try {
      const current = prepare(store, 'SELECT count, revision FROM sessions WHERE key=?').get(key)
      if (onlyIfMissing && current) { store.exec('COMMIT'); return true }
      if (previous?.key === key && current && (current.revision !== previous.revision || current.count !== previous.count)) {
        throw new Error('다른 writer가 변경한 전사를 오래된 버퍼로 덮어쓸 수 없습니다')
      }
      if (previous?.key === key && previous.count <= events.length
        && current?.revision === previous.revision && current?.count === previous.count) {
        count = previous.count
        revision = previous.revision
        if (count === events.length) { store.exec('COMMIT'); return true }
      } else {
        prepare(store, 'DELETE FROM events WHERE session_key=?').run(key)
      }
      const insert = prepare(store, 'INSERT INTO events(session_key,seq,payload) VALUES(?,?,?)')
      for (let i = count; i < events.length; i++) insert.run(key, i, JSON.stringify(events[i]))
      prepare(store, `INSERT INTO sessions VALUES(?,?,?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET
        revision=excluded.revision, count=excluded.count, updated_at=excluded.updated_at`)
        .run(key, runtime, cwd, sessionId, revision, events.length, Date.now())
      const indexed = readAgentSessionSearchState(store, key)
      const searchStart = indexed?.revision === revision && indexed.count <= events.length ? indexed.count : 0
      updateAgentSessionSearch(store, { key, runtime, cwd, sessionId, revision, count: events.length, updatedAt: Date.now() },
        searchText(events, searchStart), searchStart)
      store.exec('COMMIT')
      written.set(events, { key, count: events.length, revision })
      return true
    } catch (error) { store.exec('ROLLBACK'); throw error }
  } catch (error) {
    console.error('[mew:agent] 전사 저장 실패:', error)
    return false
  }
}

function* searchText(events: AgentEvent[], start: number): Iterable<SessionSearchText> {
  for (let i = start; i < events.length; i++) {
    const event = events[i]
    if (event.type === 'turn_end') { yield { role: null }; continue }
    if (event.type !== 'update') continue
    const update = event.update
    if (update.sessionUpdate !== 'user_message_chunk' && update.sessionUpdate !== 'agent_message_chunk' || update.content.type !== 'text') continue
    yield {
      role: update.sessionUpdate === 'user_message_chunk' ? 'user' : 'assistant',
      text: update.content.text,
      ...('messageId' in update && typeof update.messageId === 'string' ? { messageId: update.messageId } : {}),
    }
  }
}

type SearchSourceRow = {
  key: string; runtime: string; cwd: string; session_id: string; revision: string; count: number; updated_at: number
}

/** Existing or older supervisors' transcripts are projected once per changed revision/count. */
function backfillTranscriptSearch(store: DatabaseSync, runtime: string, cwd: string): void {
  const sources = prepare(store, `SELECT s.key,s.runtime,s.cwd,s.session_id,s.revision,s.count,s.updated_at
    FROM sessions s LEFT JOIN history_search_sessions h ON h.key=s.key
    WHERE s.runtime=? AND (h.key IS NULL OR h.revision<>s.revision OR h.count<>s.count)`).all(runtime) as SearchSourceRow[]
  for (const source of sources) {
    if (source.cwd.toLocaleLowerCase() !== cwd.toLocaleLowerCase()) continue
    store.exec('BEGIN IMMEDIATE')
    try {
      const current = prepare(store, 'SELECT * FROM sessions WHERE key=?').get(source.key) as SearchSourceRow | undefined
      if (current) {
        const indexed = readAgentSessionSearchState(store, current.key)
        const start = indexed?.revision === current.revision && indexed.count <= current.count ? indexed.count : 0
        const rows = prepare(store, `SELECT
          CASE WHEN json_valid(payload) THEN json_extract(payload,'$.type') END AS type,
          CASE WHEN json_valid(payload) AND json_extract(payload,'$.type')='update'
            AND json_extract(payload,'$.update.sessionUpdate') IN ('user_message_chunk','agent_message_chunk')
            AND json_extract(payload,'$.update.content.type')='text'
          THEN json_extract(payload,'$.update.sessionUpdate','$.update.content.text','$.update.messageId') END AS message
          FROM events WHERE session_key=? AND seq>=? ORDER BY seq`).iterate(current.key, start)
        const records = function* (): Iterable<SessionSearchText> {
          for (const row of rows) {
            if (row.type === 'turn_end') { yield { role: null }; continue }
            if (typeof row.message !== 'string') continue
            const [role, text, messageId] = JSON.parse(row.message) as [string, unknown, unknown]
            if (typeof text !== 'string') continue
            yield { role: role === 'user_message_chunk' ? 'user' : 'assistant', text,
              ...(typeof messageId === 'string' ? { messageId } : {}) }
          }
        }
        const input: SessionSearchSource = { key: current.key, runtime: current.runtime, cwd: current.cwd,
          sessionId: current.session_id, revision: current.revision, count: current.count, updatedAt: current.updated_at }
        updateAgentSessionSearch(store, input, records(), start)
      }
      store.exec('COMMIT')
    } catch (error) { store.exec('ROLLBACK'); throw error }
  }
}

export function searchAgentTranscripts(runtime: string, cwd: string, query: string): SessionSearchResult[] {
  const store = db()
  backfillTranscriptSearch(store, runtime, cwd)
  return queryAgentSessionSearch(store, runtime, cwd, query)
}

function importLegacy(runtime: string, cwd: string, sessionId: string): void {
  const key = transcriptKey(runtime, cwd, sessionId)
  if (prepare(db(), 'SELECT key FROM sessions WHERE key=?').get(key)) return
  const value = readJsonFile<unknown>(path.join(TRANSCRIPT_DIR, `${key}.json`))
  if (!value || typeof value !== 'object' || Array.isArray(value)) return
  const stored = value as { version?: number; runtime?: string; cwd?: string; sessionId?: string; events?: AgentEvent[] }
  // v1 was truncated. Never promote it to a complete transcript.
  if (stored.version !== 2 || stored.runtime !== runtime || stored.cwd !== cwd || stored.sessionId !== sessionId
    || !Array.isArray(stored.events) || !stored.events.every(event => event && typeof event.type === 'string')) return
  if (!writeAgentTranscript(runtime, cwd, sessionId, stored.events, true)) throw new Error('기존 전사 이전 실패')
}

export function readAgentTranscript(runtime: string, cwd: string, sessionId: string): AgentEvent[] | null {
  try {
    importLegacy(runtime, cwd, sessionId)
    const key = transcriptKey(runtime, cwd, sessionId)
    if (!prepare(db(), 'SELECT key FROM sessions WHERE key=?').get(key)) return null
    return readAgentTranscriptRange(runtime, cwd, sessionId, 0, Number.MAX_SAFE_INTEGER)
  } catch (error) {
    console.error('[mew:agent] 전사 읽기 실패:', error)
    return null
  }
}

/** Indexed half-open range, without parsing the rest of the conversation. */
export function readAgentTranscriptRange(runtime: string, cwd: string, sessionId: string, start: number, end: number): AgentEvent[] {
  return prepare(db(), 'SELECT payload FROM events WHERE session_key=? AND seq>=? AND seq<? ORDER BY seq')
    .all(transcriptKey(runtime, cwd, sessionId), start, end).map(row => JSON.parse(String(row.payload)) as AgentEvent)
}

/** ACP may replay whole messages while the saved transcript contains streaming chunks. */
function conversationTurns(events: AgentEvent[]): { events: AgentEvent[]; identity: string; userIdentity: string }[] {
  const turns: { events: AgentEvent[]; identity: string; userIdentity: string }[] = []
  let group: AgentEvent[] = [], messages: { role: string; content: unknown[] }[] = [], hasUser = false, replied = false
  const flush = () => {
    if (group.length) turns.push({
      events: group,
      identity: JSON.stringify(messages),
      userIdentity: JSON.stringify(messages.filter(message => message.role === 'user_message_chunk')),
    })
    group = []; messages = []; hasUser = false; replied = false
  }
  for (const event of events) {
    const update = event.type === 'update' ? event.update : null
    const user = update?.sessionUpdate === 'user_message_chunk'
    if (user && hasUser && replied) flush()
    group.push(event)
    if (user) hasUser = true
    else if (event.type === 'turn_end' || update && ['agent_message_chunk', 'agent_thought_chunk', 'tool_call', 'tool_call_update'].includes(update.sessionUpdate)) replied = true
    if (update?.sessionUpdate !== 'user_message_chunk' && update?.sessionUpdate !== 'agent_message_chunk') continue
    const role = update.sessionUpdate
    let message = messages.at(-1)
    if (!message || message.role !== role) { message = { role, content: [] }; messages.push(message) }
    const content = update.content
    if (content.type === 'text') {
      const last = message.content.at(-1)
      if (typeof last === 'string') message.content[message.content.length - 1] = last + content.text
      else message.content.push(content.text)
    } else message.content.push(content)
  }
  flush()
  return turns
}

/** Fresh history wins; matching questions also keep Mew's settings and cancellation. */
export function reconcileAgentTranscript(saved: AgentEvent[] | null, loaded: AgentEvent[]): AgentEvent[] {
  if (!saved?.length) return loaded
  // Some ACP adapters restore context without replaying conversation messages.
  if (!loaded.some(event => event.type === 'update' && ['user_message_chunk', 'agent_message_chunk', 'agent_thought_chunk', 'tool_call', 'tool_call_update'].includes(event.update.sessionUpdate))) return saved
  const cached = conversationTurns(saved), fresh = conversationTurns(loaded)
  let matching = true
  let matchingUsers = true
  return fresh.flatMap((turn, index) => {
    const previous = cached[index]
    matching = matching && !!previous && previous.identity === turn.identity && previous.events.some(event => event.type === 'turn_end')
    matchingUsers = matchingUsers && !!previous && previous.userIdentity === turn.userIdentity
    if (matching) return previous.events
    // ACP can omit intermediate replies or replay different answer text. Settings belong to
    // the submitted question, so retain them independently of answer/turn_end equality.
    // Stop at the first changed question: repeated text in a different turn is not a match.
    if (!matchingUsers) return turn.events
    // ACP history can omit partial answers and turn_end. Cancellation belongs to the
    // submitted question even when the replayed answer differs from the live stream.
    const cancelled = previous.events.findLast(event => event.type === 'turn_end' && event.stopReason === 'cancelled')
    const events = cancelled && !turn.events.some(event => event.type === 'turn_end')
      ? [...turn.events, cancelled] : turn.events
    const settings = previous.events.flatMap(event =>
      event.type === 'update' && event.update.sessionUpdate === 'user_message_chunk' && event.settings ? [event.settings] : [])
    const first = settings[0]
    if (!first || settings.some(value => value.model !== first.model || value.thinking !== first.thinking || value.permission !== first.permission)) return events
    return events.map(event =>
      event.type === 'update' && event.update.sessionUpdate === 'user_message_chunk' && !event.settings
        ? { ...event, settings: first }
        : event)
  })
}
