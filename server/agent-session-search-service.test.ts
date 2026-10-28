import test from 'node:test'
import assert from 'node:assert/strict'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { Worker } from 'node:worker_threads'
import type { AgentEvent } from './agentAcp.ts'
import type { SessionSearchResult } from '../shared/agent-session-search.ts'

const temporary = await fsp.mkdtemp(path.join(os.tmpdir(), 'mew-session-search-service-'))
const saved = Object.fromEntries(['MEW_DATA_DIR', 'CODEX_HOME', 'CLAUDE_CONFIG_DIR', 'MEW_AGENT_CONFIG_DIR', 'MEW_AGENT_ACCOUNT'].map(key => [key, process.env[key]]))
const data = path.join(temporary, 'data')
const codex = path.join(temporary, 'codex')
process.env.MEW_DATA_DIR = data
process.env.CODEX_HOME = codex
process.env.CLAUDE_CONFIG_DIR = path.join(temporary, 'claude')
process.env.MEW_AGENT_CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR
delete process.env.MEW_AGENT_ACCOUNT
const { searchSessionHistory, closeSessionSearchWorker } = await import('./agent-session-search-service.ts')
const { writeAgentTranscript, closeTranscriptDatabase } = await import('./agentTranscript.ts')
const { runWithAgentAccount } = await import('./agent-account-settings.ts')
const { writeAgentSetting } = await import('./agentSettings.ts')

const message = (role: 'user' | 'assistant', text: string): AgentEvent => ({ type: 'update', update: {
  sessionUpdate: role === 'user' ? 'user_message_chunk' : 'agent_message_chunk', content: { type: 'text', text },
} })
const emptyList = async (): Promise<SessionSearchResult[]> => []
const ids = (sessions: SessionSearchResult[]): string[] => sessions.map(session => session.sessionId)
const project = (name: string): string => path.join(temporary, 'projects', name)

function transcript(runtime: string, cwd: string, sessionId: string, text: string): void {
  assert.equal(writeAgentTranscript(runtime, cwd, sessionId, [message('user', `질문 ${sessionId}`), message('assistant', text)]), true)
}

async function raw(home: string, cwd: string, id: string, text: string): Promise<void> {
  const directory = path.join(home, 'sessions', '2026', '10', '28')
  await fsp.mkdir(directory, { recursive: true })
  const entries = [
    { type: 'session_meta', payload: { id, cwd } },
    { type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: `원본 질문 ${id}` }] } },
    { type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] } },
  ]
  await fsp.writeFile(path.join(directory, `${id}.jsonl`), entries.map(entry => `${JSON.stringify(entry)}\n`).join(''))
}

test('worker의 Mew·원본 결과와 어댑터 목록을 합치고 같은 세션을 한 번만 표시한다', async () => {
  const cwd = project('union')
  transcript('codex', cwd, 'shared-session', 'unionneedle을 Mew 전사에 보존했습니다.')
  transcript('codex', cwd, 'mew-only', 'unionneedle을 Mew에서만 찾습니다.')
  await raw(codex, cwd, 'shared-session', 'unionneedle의 공급자 원본입니다.')
  await raw(codex, cwd, 'raw-only', 'unionneedle을 원본에서만 찾습니다.')
  let calls = 0
  const result = await searchSessionHistory('codex', cwd, 'unionneedle', async () => {
    calls++
    return [
      { sessionId: 'shared-session', cwd, title: 'unionneedle 중복 세션', updatedAt: '2026-01-01T00:00:00Z' },
      { sessionId: 'adapter-only', cwd, title: 'unionneedle 어댑터 결과', updatedAt: '2026-01-02T00:00:00Z' },
    ]
  })
  assert.equal(calls, 1)
  assert.equal(result.error, undefined)
  assert.deepEqual(ids(result.sessions).sort(), ['adapter-only', 'mew-only', 'raw-only', 'shared-session'])
  assert.match(result.sessions.find(session => session.sessionId === 'shared-session')?.snippet ?? '', /unionneedle/)
})

test('세션 ID의 완전 일치와 부분 일치는 본문 일치보다 먼저 표시된다', async () => {
  const cwd = project('id-priority'), id = 'target-session-123'
  transcript('codex', cwd, id, '해당 세션의 원래 답변')
  transcript('codex', cwd, 'content-only', `${id}을 다른 대화 본문에서 언급합니다.`)
  await raw(codex, cwd, id, '같은 ID를 가진 공급자 원본')
  const result = await searchSessionHistory('codex', cwd, id, async () => [
    { sessionId: `${id}-extra`, cwd, title: 'ID 부분 일치', updatedAt: '2026-10-28T00:00:00Z' },
  ])
  assert.equal(result.error, undefined)
  assert.deepEqual(ids(result.sessions), [id, `${id}-extra`, 'content-only'])
  const partial = await searchSessionHistory('codex', cwd, 'session123', emptyList)
  assert.equal(partial.sessions[0]?.sessionId, id)
})

test('worker는 선택한 런타임과 프로젝트 범위의 전사와 원본만 검색한다', async () => {
  const cwd = project('scope'), other = project('other-scope')
  transcript('codex', cwd, 'allowed-mew', 'scopeneedle')
  transcript('codex', other, 'other-project-mew', 'scopeneedle')
  transcript('claude', cwd, 'other-runtime-mew', 'scopeneedle')
  await raw(codex, cwd, 'allowed-raw', 'scopeneedle')
  await raw(codex, other, 'other-project-raw', 'scopeneedle')
  const result = await searchSessionHistory('codex', cwd, 'scopeneedle', emptyList)
  assert.equal(result.error, undefined)
  assert.deepEqual(ids(result.sessions).sort(), ['allowed-mew', 'allowed-raw'])
  const claude = await searchSessionHistory('claude', cwd, 'scopeneedle', emptyList)
  assert.deepEqual(ids(claude.sessions), ['other-runtime-mew'])
})

test('빈 검색은 Mew 최근 기록과 어댑터 목록을 표시하고 원본 본문 색인은 시작하지 않는다', async () => {
  const cwd = project('recent')
  transcript('codex', cwd, 'recent-mew', '최근 Mew 대화')
  await raw(codex, cwd, 'raw-waiting-for-query', '본문 검색 때 찾을 대화')
  const directory = path.join(data, 'agent-runtime-search')
  const before = (await fsp.readdir(directory)).filter(file => file.endsWith('.sqlite')).length
  const result = await searchSessionHistory('codex', cwd, '', async () => [
    { sessionId: 'recent-adapter', cwd, title: '어댑터 최근 대화', updatedAt: '2026-10-28T00:00:00Z' },
  ])
  assert.equal(result.error, undefined)
  assert.deepEqual(ids(result.sessions).sort(), ['recent-adapter', 'recent-mew'])
  assert.equal((await fsp.readdir(directory)).filter(file => file.endsWith('.sqlite')).length, before)
})

test('어댑터 조회가 실패해도 worker 결과를 보존하고 부분 검색 오류를 알린다', async () => {
  const cwd = project('adapter-error')
  transcript('codex', cwd, 'retained-mew', 'adaptererrorneedle')
  await raw(codex, cwd, 'retained-raw', 'adaptererrorneedle')
  const result = await searchSessionHistory('codex', cwd, 'adaptererrorneedle', async () => { throw new Error('synthetic adapter failure') })
  assert.deepEqual(ids(result.sessions).sort(), ['retained-mew', 'retained-raw'])
  assert.equal(result.error, '일부 대화를 검색하지 못했습니다')
})

test('원본 SQLite 색인이 손상되어도 Mew·어댑터 결과를 보존하고 부분 오류를 알린다', async () => {
  const cwd = project('runtime-error')
  transcript('codex', cwd, 'retained-transcript', 'runtimeerrorneedle')
  await raw(codex, cwd, 'raw-error-index', 'runtimeerrorneedle')
  const first = await searchSessionHistory('codex', cwd, 'runtimeerrorneedle', emptyList)
  assert.deepEqual(ids(first.sessions).sort(), ['raw-error-index', 'retained-transcript'])
  const directory = path.join(data, 'agent-runtime-search')
  let corrupted = false
  for (const name of (await fsp.readdir(directory)).filter(file => file.endsWith('.sqlite'))) {
    const file = path.join(directory, name)
    const store = new DatabaseSync(file, { readOnly: true })
    let matches: boolean
    try { matches = !!store.prepare('SELECT 1 FROM history_search_sessions WHERE session_id=?').get('raw-error-index') }
    finally { store.close() }
    if (matches) { await fsp.writeFile(file, 'synthetic invalid SQLite database'); corrupted = true; break }
  }
  assert.equal(corrupted, true)
  const result = await searchSessionHistory('codex', cwd, 'runtimeerrorneedle', async () => [
    { sessionId: 'retained-adapter', cwd, title: 'runtimeerrorneedle 어댑터 대화' },
  ])
  assert.deepEqual(ids(result.sessions).sort(), ['retained-adapter', 'retained-transcript'])
  assert.equal(result.error, '일부 대화를 검색하지 못했습니다')
})

test('동시 계정 요청의 CODEX_HOME 설정을 worker에 전달하고 각 계정의 원본 홈을 사용한다', async () => {
  const cwd = project('account-homes')
  const alice = 'alice-search@example.test', bob = 'bob-search@example.test'
  const aliceHome = path.join(temporary, 'alice-codex'), bobHome = path.join(temporary, 'bob-codex')
  runWithAgentAccount(alice, () => writeAgentSetting('codex', { env: { CODEX_HOME: aliceHome } }))
  runWithAgentAccount(bob, () => writeAgentSetting('codex', { env: { CODEX_HOME: bobHome } }))
  await raw(aliceHome, cwd, 'alice-home-session', 'accounthomeneedle')
  await raw(bobHome, cwd, 'bob-home-session', 'accounthomeneedle')
  await raw(codex, cwd, 'global-home-session', 'accounthomeneedle')
  const [aliceResult, bobResult, globalResult] = await Promise.all([
    runWithAgentAccount(alice, () => searchSessionHistory('codex', cwd, 'accounthomeneedle', emptyList)),
    runWithAgentAccount(bob, () => searchSessionHistory('codex', cwd, 'accounthomeneedle', emptyList)),
    runWithAgentAccount(null, () => searchSessionHistory('codex', cwd, 'accounthomeneedle', emptyList)),
  ])
  assert.equal(aliceResult.error, undefined)
  assert.equal(bobResult.error, undefined)
  assert.equal(globalResult.error, undefined)
  assert.deepEqual(ids(aliceResult.sessions), ['alice-home-session'])
  assert.deepEqual(ids(bobResult.sessions), ['bob-home-session'])
  assert.deepEqual(ids(globalResult.sessions), ['global-home-session'])
})

test('연속 검색은 worker를 재사용하고 종료 후 새 worker에서 검색을 복구한다', async t => {
  await closeSessionSearchWorker()
  const cwd = project('worker-lifecycle')
  transcript('codex', cwd, 'worker-first', 'lifecyclefirstneedle')
  const threads: number[] = []
  const original = Worker.prototype.postMessage
  t.mock.method(Worker.prototype, 'postMessage', function(this: Worker, ...args: Parameters<Worker['postMessage']>) {
    threads.push(this.threadId)
    return original.apply(this, args)
  })
  const first = await searchSessionHistory('codex', cwd, 'lifecyclefirstneedle', emptyList)
  assert.deepEqual(ids(first.sessions), ['worker-first'])
  transcript('codex', cwd, 'worker-next', 'lifecyclenextneedle')
  const next = await searchSessionHistory('codex', cwd, 'lifecyclenextneedle', emptyList)
  assert.deepEqual(ids(next.sessions), ['worker-next'])
  assert.equal(threads.length, 2)
  assert.equal(threads[0], threads[1])
  await closeSessionSearchWorker()
  const recovered = await searchSessionHistory('codex', cwd, 'lifecyclenextneedle', emptyList)
  assert.deepEqual(ids(recovered.sessions), ['worker-next'])
  assert.equal(recovered.error, undefined)
  assert.equal(threads.length, 3)
  assert.notEqual(threads[0], threads[2])
})

test('진행 중 worker 종료는 어댑터 결과와 오류를 돌려주고 다음 검색은 복구된다', async () => {
  await closeSessionSearchWorker()
  const cwd = project('worker-cancel')
  transcript('codex', cwd, 'cancel-recover-mew', 'cancelrecoverneedle')
  const pending = searchSessionHistory('codex', cwd, 'cancelrecoverneedle', async () => [
    { sessionId: 'cancel-adapter', cwd, title: 'cancelrecoverneedle 어댑터 대화' },
  ])
  await closeSessionSearchWorker()
  const cancelled = await pending
  assert.deepEqual(ids(cancelled.sessions), ['cancel-adapter'])
  assert.equal(cancelled.error, '일부 대화를 검색하지 못했습니다')
  const recovered = await searchSessionHistory('codex', cwd, 'cancelrecoverneedle', emptyList)
  assert.deepEqual(ids(recovered.sessions), ['cancel-recover-mew'])
  assert.equal(recovered.error, undefined)
})

test.after(async () => {
  await closeSessionSearchWorker()
  closeTranscriptDatabase()
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  await fsp.rm(temporary, { recursive: true, force: true })
})
