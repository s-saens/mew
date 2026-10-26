import fs from 'node:fs/promises'
import path from 'node:path'
import { DatabaseSync, type StatementSync } from 'node:sqlite'
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads'
import { HISTORY_PAGE_TURNS, validHistoryRequest, type HistoryPreview, type HistoryRequest } from '../shared/agent-history.ts'
import { agentDisplayEvent, compactHistoryWork, isHistoryWorkEvent } from '../shared/agent-display.ts'
import type { AgentEvent } from './agentAcp.ts'
import { transcriptKey } from './agentTranscript.ts'
import { DATA_DIR } from './dataDir.ts'

const MAX_BYTES = 4 * 1024 * 1024
const MAX_SCAN_BYTES = 64 * 1024 * 1024
const MAX_EVENT_BYTES = 8 * 1024 * 1024
const MAX_SCAN_EVENTS = 50_000
const TIMEOUT_MS = 500
const pending = new Map<string, Promise<HistoryPreview<AgentEvent> | null>>()
type Input = { file: string; key: string; sessionId: string; options: Pick<HistoryRequest, 'deferWork' | 'turns'> }

/** Optional preview I/O and parsing run beside ACP startup, without opening or migrating the writer DB. */
export function readAgentHistoryPreview(runtime: string, cwd: string, sessionId: string, request: Pick<HistoryRequest, 'deferWork' | 'turns'> = {}): Promise<HistoryPreview<AgentEvent> | null> {
  const key = transcriptKey(runtime, cwd, sessionId)
  const options = validHistoryRequest(request)
  const pendingKey = `${key}:${options.turns ?? 20}:${options.deferWork === true}`
  const existing = pending.get(pendingKey)
  if (existing) return existing
  const read = (async () => {
    const file = path.join(DATA_DIR, 'agent-transcripts', 'transcripts.sqlite')
    try { await fs.access(file) } catch { return null }
    return new Promise<HistoryPreview<AgentEvent> | null>(resolve => {
      const worker = new Worker(new URL(import.meta.url), {
        workerData: { file, key, sessionId, options } satisfies Input,
        resourceLimits: { maxOldGenerationSizeMb: 64 },
      })
      let settled = false
      const finish = (value: HistoryPreview<AgentEvent> | null) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(value)
        void worker.terminate()
      }
      const timer = setTimeout(() => finish(null), TIMEOUT_MS)
      timer.unref()
      worker.once('message', finish)
      worker.once('error', () => finish(null))
      worker.once('exit', () => finish(null))
    })
  })().catch(() => null).finally(() => pending.delete(pendingKey))
  pending.set(pendingKey, read)
  return read
}

/** Match HistoryIndex's forward user boundaries without loading the surrounding tool bodies. */
function previewStart(query: StatementSync, key: string, total: number, turns: number): number | null {
  let scanned = 0, boundaries = 0, recent: number | null = null
  let firstUser: number | null = null, identifiedUser: number | null = null, messageId: unknown
  const boundary = (seq: number) => {
    if (++boundaries === turns) recent = seq
  }
  for (let seq = total - 1; seq >= 0; seq--) {
    if (total - seq > MAX_SCAN_EVENTS) return null
    const row = query.get(Math.min(MAX_EVENT_BYTES, MAX_SCAN_BYTES - scanned), key, seq)
    const bytes = Number(row?.bytes)
    if (!row || !Number.isSafeInteger(bytes) || bytes <= 0 || (scanned += bytes) > MAX_SCAN_BYTES) return null
    // Invalid or oversized older rows cannot affect an already confirmed recent boundary. An earlier
    // valid question still has to establish that the preamble is outside this window.
    if (typeof row.boundary !== 'string') {
      if (recent === null) return null
      continue
    }
    const [type, update, id] = JSON.parse(row.boundary) as [string, string, unknown]
    if (type === 'update' && update === 'user_message_chunk') {
      if (recent !== null) return recent
      firstUser = seq
      if (id) {
        if (identifiedUser !== null && id !== messageId) {
          boundary(identifiedUser)
          if (recent !== null) return recent
        }
        identifiedUser = seq
        messageId = id
      }
    } else if (['turn_start', 'permission', 'error', 'fatal', 'work_pending'].includes(type)
      || type === 'update' && ['agent_message_chunk', 'agent_thought_chunk', 'tool_call', 'tool_call_update'].includes(update)) {
      if (recent !== null) continue
      if (identifiedUser !== null) boundary(identifiedUser)
      if (firstUser !== null && firstUser !== identifiedUser) boundary(firstUser)
      if (boundaries > turns) return recent
      firstUser = identifiedUser = null
      messageId = undefined
    }
  }
  // With at most the requested number of questions, retain the original preamble.
  return 0
}

function readPreview({ file, key, sessionId, options }: Input): HistoryPreview<AgentEvent> | null {
  const store = new DatabaseSync(file, { readOnly: true })
  try {
    store.exec('PRAGMA busy_timeout=50; BEGIN')
    const total = Number(store.prepare('SELECT count FROM sessions WHERE key=?').get(key)?.count ?? 0)
    if (!Number.isSafeInteger(total) || total <= 0) return null
    const boundaries = store.prepare(`SELECT length(CAST(payload AS BLOB)) AS bytes,
      CASE WHEN length(CAST(payload AS BLOB))<=? THEN
        CASE WHEN json_valid(payload) THEN json_extract(payload, '$.type', '$.update.sessionUpdate', '$.update.messageId') END
      END AS boundary
      FROM events WHERE session_key=? AND seq=?`)
    const start = previewStart(boundaries, key, total, options.turns ?? HISTORY_PAGE_TURNS)
    if (start === null) return null
    const query = store.prepare('SELECT CASE WHEN length(CAST(payload AS BLOB))<=? THEN payload END AS payload FROM events WHERE session_key=? AND seq=?')
    const events: AgentEvent[] = []
    let bytes = Buffer.byteLength(JSON.stringify({ sessionId, start, events }), 'utf8')
    for (let seq = start; seq < total; seq++) {
      const payload = query.get(MAX_EVENT_BYTES, key, seq)?.payload
      if (typeof payload !== 'string') return null
      const source = JSON.parse(payload) as AgentEvent
      const event: AgentEvent = options.deferWork && isHistoryWorkEvent(source)
        ? { type: 'work_pending', count: 1 } : agentDisplayEvent(source)
      bytes += Buffer.byteLength(JSON.stringify(event), 'utf8') + 1
      if (bytes > MAX_BYTES) return null
      events.push(event)
    }
    return { sessionId, start, events: options.deferWork ? compactHistoryWork(events) : events }
  } finally { store.close() }
}

if (!isMainThread) {
  let preview: HistoryPreview<AgentEvent> | null = null
  try { preview = readPreview(workerData as Input) } catch { /* ACP still restores unavailable or damaged records. */ }
  parentPort?.postMessage(preview)
}
