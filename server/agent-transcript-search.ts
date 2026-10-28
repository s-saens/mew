import crypto from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import {
  MAX_HISTORY_QUERY_LENGTH,
  historySearchSnippet,
  historySearchTerms,
  historySessionIdScore,
  mergeSessionSearchResults,
  normalizeHistorySearch,
  type SessionSearchResult,
} from '../shared/agent-session-search.ts'

const SEGMENT_CHARS = 16 * 1024
const OVERLAP_CHARS = 1024
const RESULT_LIMIT = 50

export type SessionSearchText = { role: 'user' | 'assistant'; text: string; messageId?: string } | { role: null }
export type SessionSearchSource = {
  key: string
  runtime: string
  cwd: string
  sessionId: string
  revision: string
  count: number
  updatedAt: number
}
type SearchState = { revision: string; count: number }
type StoredState = SearchState & {
  title: string | null
  title_pending: number
  tail_id: number | null
  tail_role: string | null
  tail_message_id: string | null
}
type SessionRow = { key: string; session_id: string; title: string | null; updated_at: number }

function scope(runtime: string, cwd: string): string {
  return crypto.createHash('sha256').update(JSON.stringify([runtime, cwd.toLocaleLowerCase()])).digest('hex')
}

/** Additive tables keep older supervisors' version-1 transcript readers and writers compatible. */
export function initializeAgentSessionSearch(store: DatabaseSync): void {
  store.exec(`
    CREATE TABLE IF NOT EXISTS history_search_sessions (
      key TEXT PRIMARY KEY, runtime TEXT NOT NULL, cwd TEXT NOT NULL,
      session_id TEXT NOT NULL, normalized_id TEXT NOT NULL,
      revision TEXT NOT NULL, count INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      title TEXT, title_pending INTEGER NOT NULL DEFAULT 0,
      tail_id INTEGER, tail_role TEXT, tail_message_id TEXT
    );
    CREATE INDEX IF NOT EXISTS history_search_scope ON history_search_sessions(runtime,cwd,updated_at DESC);
    CREATE TABLE IF NOT EXISTS history_search_messages (
      id INTEGER PRIMARY KEY, session_key TEXT NOT NULL,
      body TEXT NOT NULL, normalized TEXT NOT NULL, scope TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS history_search_message_session ON history_search_messages(session_key,id);
    CREATE INDEX IF NOT EXISTS history_search_message_scope ON history_search_messages(scope);
    CREATE VIRTUAL TABLE IF NOT EXISTS history_search_fts USING fts5(
      normalized, scope, content='history_search_messages', content_rowid='id', tokenize='trigram'
    );
    CREATE TRIGGER IF NOT EXISTS history_search_insert AFTER INSERT ON history_search_messages BEGIN
      INSERT INTO history_search_fts(rowid,normalized,scope) VALUES(new.id,new.normalized,new.scope);
    END;
    CREATE TRIGGER IF NOT EXISTS history_search_delete AFTER DELETE ON history_search_messages BEGIN
      INSERT INTO history_search_fts(history_search_fts,rowid,normalized,scope) VALUES('delete',old.id,old.normalized,old.scope);
    END;
    CREATE TRIGGER IF NOT EXISTS history_search_update AFTER UPDATE ON history_search_messages BEGIN
      INSERT INTO history_search_fts(history_search_fts,rowid,normalized,scope) VALUES('delete',old.id,old.normalized,old.scope);
      INSERT INTO history_search_fts(rowid,normalized,scope) VALUES(new.id,new.normalized,new.scope);
    END;
  `)
}

export function readAgentSessionSearchState(store: DatabaseSync, key: string): SearchState | undefined {
  return store.prepare('SELECT revision,count FROM history_search_sessions WHERE key=?').get(key) as SearchState | undefined
}

export function removeAgentSessionSearch(store: DatabaseSync, key: string): void {
  store.prepare('DELETE FROM history_search_messages WHERE session_key=?').run(key)
  store.prepare('DELETE FROM history_search_sessions WHERE key=?').run(key)
}

function textEnd(text: string, end: number): number {
  const unit = text.charCodeAt(end - 1)
  return unit >= 0xd800 && unit <= 0xdbff ? end - 1 : end
}

/** Caller owns the transaction. The iterable may stream rows without retaining the conversation. */
export function updateAgentSessionSearch(store: DatabaseSync, source: SessionSearchSource, records: Iterable<SessionSearchText>, start = 0): void {
  const previous = start > 0
    ? store.prepare('SELECT * FROM history_search_sessions WHERE key=?').get(source.key) as StoredState | undefined
    : undefined
  if (!previous) removeAgentSessionSearch(store, source.key)
  const sourceScope = scope(source.runtime, source.cwd)
  let title = previous?.title ?? null
  let titlePending = previous?.title_pending === 1
  let tailRole = previous?.tail_role ?? null
  let tailMessageId = previous?.tail_message_id ?? null
  let tailId = previous?.tail_id ?? null
  let body = tailId === null ? '' : String(store.prepare('SELECT body FROM history_search_messages WHERE id=?').get(tailId)?.body ?? '')
  let dirty = false
  const insert = store.prepare('INSERT INTO history_search_messages(session_key,body,normalized,scope) VALUES(?,?,?,?)')
  const replace = store.prepare('UPDATE history_search_messages SET body=?,normalized=? WHERE id=?')
  const flush = () => {
    if (!dirty) return
    const normalized = normalizeHistorySearch(body)
    if (tailId === null) tailId = Number(insert.run(source.key, body, normalized, sourceScope).lastInsertRowid)
    else replace.run(body, normalized, tailId)
    dirty = false
  }
  for (const record of records) {
    if (record.role === null) {
      flush()
      tailRole = null; tailMessageId = null; tailId = null; body = ''; titlePending = false
      continue
    }
    if (!record.text) continue
    const messageId = record.messageId ?? null
    if (tailRole !== record.role || messageId !== null && tailMessageId !== null && messageId !== tailMessageId) {
      flush()
      tailId = null; body = ''
      tailMessageId = null
      titlePending = false
    }
    if (title === null && record.role === 'user') { title = ''; titlePending = true }
    if (titlePending && record.role === 'user') title = `${title ?? ''}${record.text}`.replace(/\s+/gu, ' ').trimStart().slice(0, 128)
    if (record.role !== 'user') titlePending = false
    tailRole = record.role
    tailMessageId = messageId ?? tailMessageId
    let offset = 0
    while (offset < record.text.length) {
      if (body.length >= SEGMENT_CHARS - 1) {
        flush()
        body = body.slice(-OVERLAP_CHARS)
        tailId = null
      }
      const end = textEnd(record.text, Math.min(record.text.length, offset + SEGMENT_CHARS - body.length))
      if (end <= offset) break
      body += record.text.slice(offset, end)
      offset = end
      dirty = true
    }
  }
  flush()
  store.prepare(`INSERT INTO history_search_sessions
    (key,runtime,cwd,session_id,normalized_id,revision,count,updated_at,title,title_pending,tail_id,tail_role,tail_message_id)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET
      runtime=excluded.runtime,cwd=excluded.cwd,session_id=excluded.session_id,normalized_id=excluded.normalized_id,
      revision=excluded.revision,count=excluded.count,updated_at=excluded.updated_at,title=excluded.title,
      title_pending=excluded.title_pending,tail_id=excluded.tail_id,tail_role=excluded.tail_role,tail_message_id=excluded.tail_message_id`)
    .run(source.key, source.runtime, source.cwd.toLocaleLowerCase(), source.sessionId, normalizeHistorySearch(source.sessionId),
      source.revision, source.count, source.updatedAt, title || null, Number(titlePending), tailId, tailRole, tailMessageId)
}

function result(row: SessionRow, cwd: string, score = 0, snippet?: string): SessionSearchResult {
  return { sessionId: row.session_id, cwd, title: row.title?.trim() || null, updatedAt: new Date(row.updated_at).toISOString(), score, ...(snippet ? { snippet } : {}) }
}

function quoted(term: string): string { return `"${term.replaceAll('"', '""')}"` }

/** FTS selects scoped candidates; short terms use the same normalized substring contract. */
export function queryAgentSessionSearch(store: DatabaseSync, runtime: string, cwd: string, input: string): SessionSearchResult[] {
  const query = input.trim().slice(0, MAX_HISTORY_QUERY_LENGTH)
  const normalizedCwd = cwd.toLocaleLowerCase()
  const rows = (sql: string, values: (string | number)[]) => store.prepare(sql).all(...values) as SessionRow[]
  if (!query) return rows(`SELECT key,session_id,title,updated_at FROM history_search_sessions
    WHERE runtime=? AND cwd=? ORDER BY updated_at DESC LIMIT ?`, [runtime, normalizedCwd, RESULT_LIMIT]).map(row => result(row, cwd))
  const normalized = normalizeHistorySearch(query)
  if (!normalized) return []
  const found = rows(`SELECT key,session_id,title,updated_at FROM history_search_sessions
    WHERE runtime=? AND cwd=? AND instr(normalized_id,?)>0
    ORDER BY CASE WHEN normalized_id=? THEN 0 ELSE 1 END,updated_at DESC LIMIT ?`,
  [runtime, normalizedCwd, normalized, normalized, RESULT_LIMIT])
    .map(row => result(row, cwd, historySessionIdScore(row.session_id, query)))
  const sourceScope = scope(runtime, cwd)
  const findSnippet = store.prepare('SELECT body FROM history_search_messages WHERE session_key=? AND instr(normalized,?)>0 ORDER BY id LIMIT 1')
  for (const [index, group] of historySearchTerms(query).entries()) {
    const values: (string | number)[] = [runtime, normalizedCwd]
    const conditions = group.map(term => {
      if ([...term].length >= 3) {
        values.push(`scope:${quoted(sourceScope)} AND normalized:${quoted(term)}`)
        return `key IN (SELECT m.session_key FROM history_search_messages m
          JOIN history_search_fts f ON f.rowid=m.id WHERE history_search_fts MATCH ?)`
      }
      values.push(sourceScope, term)
      return 'key IN (SELECT session_key FROM history_search_messages WHERE scope=? AND instr(normalized,?)>0)'
    })
    values.push(RESULT_LIMIT)
    const matches = rows(`SELECT key,session_id,title,updated_at FROM history_search_sessions
      WHERE runtime=? AND cwd=? AND ${conditions.join(' AND ')} ORDER BY updated_at DESC LIMIT ?`, values)
    for (const row of matches) {
      const body = findSnippet.get(row.key, group[0])?.body
      found.push(result(row, cwd, 100 - index, typeof body === 'string' ? historySearchSnippet(body, query) : undefined))
    }
  }
  return mergeSessionSearchResults(found, query, RESULT_LIMIT)
}
