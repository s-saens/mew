import { parentPort } from 'node:worker_threads'
import { runWithAgentAccount } from './agent-account-settings.ts'
import { searchAgentTranscripts } from './agentTranscript.ts'
import { searchRuntimeHistory } from './agent-runtime-history-search.ts'
import { mergeSessionSearchResults } from '../shared/agent-session-search.ts'

const port = parentPort!
let pending = Promise.resolve()
port.on('message', (request: { id: number; runtime: string; cwd: string; query: string; account: string | null }) => {
  pending = pending.then(async () => {
    const sources = await runWithAgentAccount(request.account, () => Promise.allSettled([
      Promise.resolve().then(() => searchAgentTranscripts(request.runtime, request.cwd, request.query)),
      request.query ? searchRuntimeHistory(request.runtime, request.cwd, request.query) : Promise.resolve([]),
    ]))
    port.postMessage({ id: request.id, result: {
      sessions: mergeSessionSearchResults(sources.flatMap(source => source.status === 'fulfilled' ? source.value : []), request.query),
      ...(sources.some(source => source.status === 'rejected') ? { error: '일부 대화를 검색하지 못했습니다' } : {}),
    } })
  }).catch(() => port.postMessage({ id: request.id, result: { sessions: [], error: '대화 검색에 실패했습니다' } }))
})
