import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { mergeSessionSearchResults, type SessionSearchResult } from '../shared/agent-session-search.ts'
import { resolvedSpec } from './agentRuntimes.ts'
import { stripLocalCommandMeta } from './agentSessionList.ts'
import { initializeAgentSessionSearch, queryAgentSessionSearch, removeAgentSessionSearch, updateAgentSessionSearch } from './agent-transcript-search.ts'
import { DATA_DIR } from './dataDir.ts'
import { protectDirectory } from './platform/storage.ts'

type Runtime = 'codex' | 'claude'
type Source = { file: string; mtimeMs: number; size: number }
type RecordValue = { role: 'user' | 'assistant'; text: string } | { role: null }
type Entry = Record<string, unknown>
const MAX_LINE_LENGTH = 8 * 1024 * 1024
const syncing = new Map<string, Promise<void>>()
const directories = new Map<string, { mtimeMs: number; names: fs.Dirent[] }>()

function digest(value: string): string { return createHash('sha256').update(value).digest('hex') }
function sameCwd(left: string, right: string): boolean {
  return path.resolve(left).toLocaleLowerCase() === path.resolve(right).toLocaleLowerCase()
}

function runtimeHome(runtime: Runtime): string {
  const key = runtime === 'codex' ? 'CODEX_HOME' : 'CLAUDE_CONFIG_DIR'
  return path.resolve(resolvedSpec(runtime)?.env?.[key] || process.env[key] || path.join(os.homedir(), runtime === 'codex' ? '.codex' : '.claude'))
}

async function directoryEntries(directory: string): Promise<fs.Dirent[]> {
  try {
    const stat = await fsp.lstat(directory)
    if (!stat.isDirectory() || stat.isSymbolicLink()) return []
    const cached = directories.get(directory)
    if (cached?.mtimeMs === stat.mtimeMs) return cached.names
    const names = await fsp.readdir(directory, { withFileTypes: true })
    // Keep only a bounded discovery cache; file contents live in SQLite.
    if (directories.size >= 2048) directories.delete(directories.keys().next().value!)
    directories.set(directory, { mtimeMs: stat.mtimeMs, names })
    return names
  } catch (error) {
    directories.delete(directory)
    if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) return []
    throw error
  }
}

async function sources(runtime: Runtime, home: string, cwd: string): Promise<Source[]> {
  const files: string[] = []
  if (runtime === 'claude') {
    const projects = path.join(home, 'projects')
    const target = cwd.replace(/[^a-zA-Z0-9]/g, '-').toLocaleLowerCase()
    for (const directory of await directoryEntries(projects)) {
      if (!directory.isDirectory() || directory.name.toLocaleLowerCase() !== target) continue
      const root = path.join(projects, directory.name)
      for (const entry of await directoryEntries(root)) {
        if (entry.isFile() && entry.name.endsWith('.jsonl') && !entry.name.startsWith('agent-')) files.push(path.join(root, entry.name))
      }
    }
  } else {
    const walk = async (directory: string, depth: number): Promise<void> => {
      for (const entry of await directoryEntries(directory)) {
        const full = path.join(directory, entry.name)
        if (entry.isFile() && entry.name.endsWith('.jsonl')) files.push(full)
        else if (entry.isDirectory() && depth < 3 && /^\d{2,4}$/.test(entry.name)) await walk(full, depth + 1)
      }
    }
    await walk(path.join(home, 'sessions'), 0)
    await walk(path.join(home, 'archived_sessions'), 0)
  }
  const found: Source[] = []
  // Stat in small batches so large histories do not flood the filesystem queue.
  for (let start = 0; start < files.length; start += 32) {
    await Promise.all(files.slice(start, start + 32).map(async file => {
      try {
        const stat = await fsp.lstat(file)
        if (stat.isFile() && !stat.isSymbolicLink()) found.push({ file, mtimeMs: stat.mtimeMs, size: stat.size })
      } catch (error) {
        if (!['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error
      }
    }))
  }
  return found
}

/** Bound individual JSONL lines so discarded tool results cannot grow parser memory without limit. */
async function* lines(file: string): AsyncGenerator<string> {
  const input = fs.createReadStream(file, { encoding: 'utf8', highWaterMark: 64 * 1024 })
  let partial = '', skipping = false
  try {
    for await (const chunk of input) {
      const text = chunk as string
      let start = 0
      for (let end = text.indexOf('\n'); end !== -1; end = text.indexOf('\n', start)) {
        const part = text.slice(start, end)
        if (!skipping && partial.length + part.length <= MAX_LINE_LENGTH) yield partial + part
        partial = ''
        skipping = false
        start = end + 1
      }
      if (!skipping) {
        const part = text.slice(start)
        if (partial.length + part.length > MAX_LINE_LENGTH) { partial = ''; skipping = true }
        else partial += part
      }
    }
    if (!skipping && partial.trim()) yield partial
  } finally { input.destroy() }
}

function object(value: unknown): Entry | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Entry : null
}

function textContent(content: unknown, runtime: Runtime): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.flatMap(block => {
    const value = object(block)
    return value && typeof value.text === 'string'
      && (runtime === 'claude' ? value.type === 'text' : value.type === 'input_text' || value.type === 'output_text')
      ? [value.text] : []
  }).join('\n')
}

function userText(text: string, runtime: Runtime): string {
  if (runtime === 'codex' && (
    /^\s*<environment_context>[\s\S]*<\/environment_context>\s*$/.test(text)
    || /^\s*# AGENTS\.md instructions for [^\r\n]+\r?\n+<INSTRUCTIONS>[\s\S]*<\/INSTRUCTIONS>(?:\s*<environment_context>[\s\S]*<\/environment_context>)?\s*$/.test(text)
  )) return ''
  const marker = '<mew-context version="1">'
  const start = text.lastIndexOf(marker)
  if (start >= 0 && text.trimEnd().endsWith('</mew-context>')
    && text.slice(start + marker.length).trimStart().startsWith('You are working through mew.')) return text.slice(0, start).trim()
  return text.trim()
}

async function indexSource(store: DatabaseSync, runtime: Runtime, cwd: string, source: Source): Promise<string | null> {
  store.exec('DELETE FROM pending_history_messages')
  const add = store.prepare('INSERT INTO pending_history_messages(role,text) VALUES(?,?)')
  let sessionId: string | null = runtime === 'claude' ? path.basename(source.file, '.jsonl') : null
  let matchedCwd = false, count = 0
  for await (const line of lines(source.file)) {
    count++
    let entry: Entry | null
    try { entry = object(JSON.parse(line)) } catch { continue }
    if (!entry || entry.isSidechain === true) continue
    let role: 'user' | 'assistant' | null = null, text = ''
    if (runtime === 'codex') {
      const payload = object(entry.payload)
      if (!payload) continue
      if (entry.type === 'session_meta') {
        const origin = payload.source
        if (typeof origin === 'string' && origin.toLowerCase().includes('subagent')
          || object(origin)?.subagent !== undefined || typeof payload.parent_thread_id === 'string') return null
        if (typeof payload.cwd !== 'string' || !sameCwd(payload.cwd, cwd)) return null
        if (typeof payload.id !== 'string' || !payload.id.trim()) return null
        sessionId = payload.id
        matchedCwd = true
      } else if (entry.type === 'response_item' && payload.type === 'message'
        && (payload.role === 'user' || payload.role === 'assistant') && payload.channel !== 'analysis') {
        role = payload.role
        text = textContent(payload.content, runtime)
      }
    } else {
      if (typeof entry.cwd === 'string') {
        if (!sameCwd(entry.cwd, cwd)) return null
        matchedCwd = true
      }
      if (entry.isMeta === true) continue
      if (entry.type === 'user' || entry.type === 'assistant') {
        role = entry.type
        text = textContent(object(entry.message)?.content, runtime)
        if (role === 'user') text = stripLocalCommandMeta(text)
      }
    }
    if (role === 'user') text = userText(text, runtime)
    if (role && text.trim()) {
      add.run(role, text)
      add.run(null, '')
    }
  }
  if (!sessionId || !matchedCwd) return null
  const key = digest(source.file)
  const records = function* (): Generator<RecordValue> {
    for (const row of store.prepare('SELECT role,text FROM pending_history_messages ORDER BY rowid').iterate()) {
      yield row.role === 'user' || row.role === 'assistant' ? { role: row.role, text: String(row.text) } : { role: null }
    }
  }
  updateAgentSessionSearch(store, {
    key, runtime, cwd, sessionId, revision: `${source.mtimeMs}:${source.size}`, count, updatedAt: source.mtimeMs,
  }, records())
  return key
}

async function synchronize(file: string, runtime: Runtime, home: string, cwd: string): Promise<void> {
  const found = await sources(runtime, home, cwd)
  const store = new DatabaseSync(file)
  const failures: unknown[] = []
  try {
    store.exec('PRAGMA busy_timeout=1000; PRAGMA journal_mode=WAL; PRAGMA temp_store=FILE')
    initializeAgentSessionSearch(store)
    store.exec(`CREATE TABLE IF NOT EXISTS runtime_history_sources (
      file TEXT PRIMARY KEY, mtime REAL NOT NULL, size INTEGER NOT NULL, session_key TEXT
    ); CREATE TEMP TABLE pending_history_messages(role TEXT, text TEXT NOT NULL)`)
    const previous = new Map(store.prepare('SELECT file,mtime,size,session_key FROM runtime_history_sources').all().map(row => [String(row.file), row]))
    const record = store.prepare('INSERT OR REPLACE INTO runtime_history_sources(file,mtime,size,session_key) VALUES(?,?,?,?)')
    for (const source of found) {
      const old = previous.get(source.file)
      previous.delete(source.file)
      if (old?.mtime === source.mtimeMs && old.size === source.size) continue
      store.exec('BEGIN')
      try {
        if (typeof old?.session_key === 'string') removeAgentSessionSearch(store, old.session_key)
        const key = await indexSource(store, runtime, cwd, source)
        record.run(source.file, source.mtimeMs, source.size, key)
        store.exec('COMMIT')
      } catch (error) {
        store.exec('ROLLBACK')
        // Never keep searchable stale data after a changed source becomes unreadable.
        if (typeof old?.session_key === 'string') removeAgentSessionSearch(store, old.session_key)
        store.prepare('DELETE FROM runtime_history_sources WHERE file=?').run(source.file)
        if (!['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) failures.push(error)
      }
    }
    store.exec('BEGIN')
    try {
      for (const [missing, old] of previous) {
        if (typeof old.session_key === 'string') removeAgentSessionSearch(store, old.session_key)
        store.prepare('DELETE FROM runtime_history_sources WHERE file=?').run(missing)
      }
      store.exec('COMMIT')
    } catch (error) { store.exec('ROLLBACK'); throw error }
  } finally { store.close() }
  if (failures.length) throw new AggregateError(failures, 'Runtime history could not be completely indexed')
}

/** Search only the selected runtime and verified project; the index is optional and rebuildable. */
export async function searchRuntimeHistory(runtime: string, cwd: string, query: string): Promise<SessionSearchResult[]> {
  if (runtime !== 'codex' && runtime !== 'claude' || !path.isAbsolute(cwd)) return []
  const home = runtimeHome(runtime)
  const directory = path.join(DATA_DIR, 'agent-runtime-search')
  const file = path.join(directory, `${digest(JSON.stringify([runtime, home, cwd]))}.sqlite`)
  protectDirectory(directory)
  let pending = syncing.get(file)
  if (!pending) {
    pending = synchronize(file, runtime, home, cwd).finally(() => syncing.delete(file))
    syncing.set(file, pending)
  }
  await pending
  const store = new DatabaseSync(file, { readOnly: true })
  try { return mergeSessionSearchResults(queryAgentSessionSearch(store, runtime, cwd, query), query) }
  finally { store.close() }
}
