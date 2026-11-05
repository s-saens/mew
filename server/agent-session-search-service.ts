import { mergeSessionSearchResults, type SessionSearchResult } from '../shared/agent-session-search.ts'
import { Worker } from 'node:worker_threads'
import { agentSettingsAccount } from './agent-account-settings.ts'

type SearchResult = { sessions: SessionSearchResult[]; error?: string }
let worker: Worker | null = null
let sequence = 0
const pending = new Map<number, { resolve: (result: SearchResult) => void; reject: (error: Error) => void }>()

function searchWorker(): Worker {
  if (worker) return worker
  const current = new Worker(new URL('./agent-session-search-worker.ts', import.meta.url))
  worker = current
  current.on('message', (message: { id: number; result: SearchResult }) => {
    const request = pending.get(message.id)
    if (!request) return
    pending.delete(message.id)
    request.resolve(message.result)
    if (!pending.size) current.unref()
  })
  const failed = (error: Error) => {
    if (worker !== current) return
    worker = null
    for (const request of pending.values()) request.reject(error)
    pending.clear()
  }
  current.on('error', failed)
  current.on('exit', () => failed(new Error('대화 검색 작업이 종료되었습니다')))
  return current
}

function searchIndex(runtime: string, cwd: string, query: string, localOnly = false): Promise<SearchResult> {
  const current = searchWorker(), id = ++sequence
  current.ref()
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    try { current.postMessage({ id, runtime, cwd, query, localOnly, account: agentSettingsAccount() }) }
    catch (error) {
      pending.delete(id)
      if (!pending.size) current.unref()
      reject(error)
    }
  })
}

export async function closeSessionSearchWorker(): Promise<void> {
  const current = worker
  worker = null
  for (const request of pending.values()) request.reject(new Error('대화 검색 작업이 종료되었습니다'))
  pending.clear()
  await current?.terminate()
}

export async function searchSessionHistory(
  runtime: string,
  cwd: string,
  query: string,
  listSessions: () => Promise<SessionSearchResult[]>,
  onPartial?: (result: SearchResult) => void,
): Promise<SearchResult> {
  const sources: PromiseSettledResult<SearchResult>[] = []
  let completed = 0
  const merged = (): SearchResult => ({
    sessions: mergeSessionSearchResults(sources.flatMap(source => source.status === 'fulfilled' ? source.value.sessions : []), query),
    ...(sources.some(source => source.status === 'rejected' || !!source.value.error) ? { error: '일부 대화를 검색하지 못했습니다' } : {}),
  })
  await Promise.all([
    searchIndex(runtime, cwd, query),
    Promise.resolve().then(listSessions).then(sessions => ({ sessions } as SearchResult)),
  ].map(async (source, index) => {
    try { sources[index] = { status: 'fulfilled', value: await source } }
    catch (reason) { sources[index] = { status: 'rejected', reason } }
    if (++completed === 1) onPartial?.(merged())
  }))
  return merged()
}

/** Warm the saved metadata list without provider listing or original-history indexing. */
export function searchLocalSessionHistory(runtime: string, cwd: string, query = ''): Promise<SearchResult> {
  return searchIndex(runtime, cwd, query, true)
}
