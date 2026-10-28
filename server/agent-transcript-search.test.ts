import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { AgentEvent } from './agentAcp.ts'

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-transcript-search-'))
process.env.MEW_DATA_DIR = dataDir
const { searchAgentTranscripts, writeAgentTranscript, closeTranscriptDatabase, transcriptKey } = await import('./agentTranscript.ts')
after(() => { closeTranscriptDatabase(); fs.rmSync(dataDir, { recursive: true, force: true }) })
const message = (role: 'user' | 'assistant', text: string): AgentEvent => ({ type: 'update', update: {
  sessionUpdate: role === 'user' ? 'user_message_chunk' : 'agent_message_chunk', content: { type: 'text', text },
} })
const ids = (cwd: string, query: string, runtime = 'codex') => searchAgentTranscripts(runtime, cwd, query).map(item => item.sessionId)
const openStore = () => new DatabaseSync(path.join(dataDir, 'agent-transcripts', 'transcripts.sqlite'))

test('conversation topics match Korean spacing and English aliases, excluding work and system details', () => {
  const cwd = '/search/topics'
  const events: AgentEvent[] = [message('user', '에이전트 패널을 고쳐 줘'), message('assistant', 'Agent window keyboard focus was improved.'),
    { type: 'update', update: { sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: '비공개생각단어' } } },
    { type: 'update', update: { sessionUpdate: 'tool_call', toolCallId: 'tool', title: '도구전용단어', rawOutput: '도구출력전용단어', status: 'completed' } },
    { type: 'error', message: '시스템오류전용단어' }]
  assert.equal(writeAgentTranscript('codex', cwd, 'topics', events), true)
  assert.deepEqual(ids(cwd, '에이전트패널'), ['topics'])
  assert.deepEqual(ids(cwd, 'agent panel'), ['topics'])
  assert.deepEqual(ids(cwd, 'keyboard focus'), ['topics'])
  for (const query of ['비공개생각단어', '도구전용단어', '도구출력전용단어', '시스템오류전용단어']) assert.deepEqual(ids(cwd, query), [])
  const result = searchAgentTranscripts('codex', cwd, 'keyboard')[0]
  assert.equal(result.title, '에이전트 패널을 고쳐 줘')
  assert.match(result.snippet ?? '', /keyboard/)
})

test('streaming chunks remain searchable across saves and full replacements discard old terms', () => {
  const cwd = '/search/stream'
  const events = [message('user', '질문'), message('assistant', '에이전')]
  assert.equal(writeAgentTranscript('codex', cwd, 'stream', events), true)
  events.push(message('assistant', '트 패널을'), message('assistant', ' 정리했어요'))
  assert.equal(writeAgentTranscript('codex', cwd, 'stream', events), true)
  assert.deepEqual(ids(cwd, '에이전트패널'), ['stream'])
  assert.equal(writeAgentTranscript('codex', cwd, 'stream', [message('user', '교체된 새 대화')]), true)
  assert.deepEqual(ids(cwd, '에이전트패널'), [])
  assert.deepEqual(ids(cwd, '교체된'), ['stream'])
})

test('a title preserves spaces when the first user message arrives across incremental saves', () => {
  const cwd = '/search/title'
  const events = [message('user', '에이전트 ')]
  writeAgentTranscript('codex', cwd, 'title', events)
  events.push(message('user', '패널 작업'))
  writeAgentTranscript('codex', cwd, 'title', events)
  assert.equal(searchAgentTranscripts('codex', cwd, '패널')[0].title, '에이전트 패널 작업')
})

test('queries respect runtime and cwd boundaries while retaining existing case-insensitive cwd behavior', () => {
  const body = [message('user', '격리검색어')]
  writeAgentTranscript('codex', '/search/Scope', 'allowed', body)
  writeAgentTranscript('codex', '/search/Other', 'other-project', body)
  writeAgentTranscript('claude', '/search/Scope', 'other-runtime', body)
  assert.deepEqual(ids('/search/scope', '격리검색어'), ['allowed'])
  assert.deepEqual(ids('/search/scope', 'other'), [])
  assert.deepEqual(ids('/search/scope', '격리검색어', 'claude'), ['other-runtime'])
})

test('exact and partial session IDs find sessions outside the recent fifty and rank before content', () => {
  const cwd = '/search/old'
  writeAgentTranscript('codex', cwd, 'older-session-1234', [message('user', '아주 오래된 작업')])
  for (let i = 0; i < 55; i++) writeAgentTranscript('codex', cwd, `recent-${i}`, [message('user', i === 0 ? 'older-session-1234 관련 메모' : `최근 작업 ${i}`)])
  const store = openStore()
  try {
    store.prepare('UPDATE history_search_sessions SET updated_at=0 WHERE session_id=?').run('older-session-1234')
  } finally { store.close() }
  assert.equal(ids(cwd, '').length, 50)
  assert.equal(ids(cwd, '').includes('older-session-1234'), false)
  assert.equal(ids(cwd, 'older-session-1234')[0], 'older-session-1234')
  assert.equal(ids(cwd, 'session-1234')[0], 'older-session-1234')
  assert.deepEqual(ids(cwd, '아주 오래된'), ['older-session-1234'])
})

test('short terms, punctuation, compatibility characters and terms across separate messages work', () => {
  const cwd = '/search/terms'
  writeAgentTranscript('codex', cwd, 'terms', [message('user', '한 글자와 ＡＢＣ 설정'), message('assistant', '둘째 메시지에 패널 표시')])
  assert.deepEqual(ids(cwd, '한'), ['terms'])
  assert.deepEqual(ids(cwd, '글자'), ['terms'])
  assert.deepEqual(ids(cwd, 'abc'), ['terms'])
  assert.deepEqual(ids(cwd, '설정 패널'), ['terms'])
  assert.deepEqual(ids(cwd, '설정" OR *'), [])
  assert.deepEqual(ids(cwd, '"설정"'), ['terms'])
})

test('long messages are indexed in bounded segments without losing a match at a segment boundary or tail', () => {
  const cwd = '/search/segments'
  const text = `${'x'.repeat(16 * 1024 - 3)}에이전트 패널${'y'.repeat(60 * 1024)} 마지막꼬리단어`
  writeAgentTranscript('codex', cwd, 'segments', [message('user', '긴 답변 확인'), message('assistant', text)])
  assert.deepEqual(ids(cwd, '에이전트패널'), ['segments'])
  assert.deepEqual(ids(cwd, '마지막꼬리단어'), ['segments'])
  const store = openStore()
  try {
    const longest = Number(store.prepare('SELECT max(length(body)) AS size FROM history_search_messages').get()?.size)
    assert.ok(longest <= 16 * 1024, `largest segment was ${longest}`)
  } finally { store.close() }
})

test('existing version-one and live older-writer transcripts are lazily indexed by revision and count', () => {
  const cwd = '/search/backfill', sessionId = 'old-writer', key = transcriptKey('codex', cwd, sessionId)
  writeAgentTranscript('codex', '/search/initialize', 'initialize', [])
  const store = openStore()
  const insert = store.prepare('INSERT INTO events(session_key,seq,payload) VALUES(?,?,?)')
  try {
    store.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?,?)').run(key, 'codex', cwd, sessionId, 'old-revision', 3, Date.now())
    insert.run(key, 0, JSON.stringify(message('user', '예전제목')))
    insert.run(key, 1, JSON.stringify(message('assistant', '기존꼬리')))
    insert.run(key, 2, '{broken')
    assert.deepEqual(ids(cwd, '기존꼬리'), [sessionId])
    insert.run(key, 3, JSON.stringify(message('assistant', '추가단어')))
    store.prepare('UPDATE sessions SET count=4 WHERE key=?').run(key)
    assert.deepEqual(ids(cwd, '기존꼬리추가단어'), [sessionId])
    store.prepare('DELETE FROM events WHERE session_key=?').run(key)
    insert.run(key, 0, JSON.stringify(message('user', '새버전문장')))
    store.prepare('UPDATE sessions SET count=1,revision=? WHERE key=?').run('replacement', key)
    assert.deepEqual(ids(cwd, '기존꼬리'), [])
    assert.deepEqual(ids(cwd, '새버전문장'), [sessionId])
    assert.equal(store.prepare('PRAGMA user_version').get()?.user_version, 1)
  } finally { store.close() }
})

test('unchanged queries never rewrite indexed messages and append saves only touch the current tail', () => {
  const cwd = '/search/incremental'
  const events: AgentEvent[] = [message('user', '첫 질문'), message('assistant', '첫 답변'), { type: 'turn_end', stopReason: 'end_turn', durationMs: 1 },
    message('user', '다음 질문'), message('assistant', '계속')]
  writeAgentTranscript('codex', cwd, 'incremental-search', events)
  const store = openStore()
  try {
    store.exec(`CREATE TABLE search_writes(kind TEXT);
      CREATE TRIGGER search_observe_update AFTER UPDATE ON history_search_messages BEGIN INSERT INTO search_writes VALUES('update'); END;
      CREATE TRIGGER search_observe_insert AFTER INSERT ON history_search_messages BEGIN INSERT INTO search_writes VALUES('insert'); END;
      CREATE TRIGGER search_observe_delete AFTER DELETE ON history_search_messages BEGIN INSERT INTO search_writes VALUES('delete'); END;`)
    ids(cwd, '질문'); ids(cwd, '답변')
    assert.equal(store.prepare('SELECT count(*) AS count FROM search_writes').get()?.count, 0)
    events.push(message('assistant', '되는 답변'))
    assert.equal(writeAgentTranscript('codex', cwd, 'incremental-search', events), true)
    assert.deepEqual(store.prepare('SELECT kind FROM search_writes').all().map(row => row.kind), ['update'])
    assert.deepEqual(ids(cwd, '계속되는답변'), ['incremental-search'])
  } finally {
    store.exec('DROP TRIGGER search_observe_update; DROP TRIGGER search_observe_insert; DROP TRIGGER search_observe_delete; DROP TABLE search_writes')
    store.close()
  }
})

test('legacy backfill streams large tool payloads once and retains only conversation text in its index', t => {
  const cwd = '/search/legacy-volume'
  const store = openStore()
  const payload = JSON.stringify({ type: 'update', update: { sessionUpdate: 'tool_call', title: 'ignored tool', rawOutput: 'x'.repeat(1024 * 1024) } })
  try {
    store.exec('BEGIN')
    const session = store.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?,?)')
    const event = store.prepare('INSERT INTO events(session_key,seq,payload) VALUES(?,?,?)')
    for (let i = 0; i < 12; i++) {
      const sessionId = `legacy-volume-${i}`, key = transcriptKey('codex', cwd, sessionId)
      session.run(key, 'codex', cwd, sessionId, 'legacy', 3, Date.now())
      event.run(key, 0, JSON.stringify(message('user', `대형기록검증 ${i}`)))
      event.run(key, 1, payload)
      event.run(key, 2, JSON.stringify(message('assistant', '검색대상본문')))
    }
    store.exec('COMMIT')
    const start = performance.now()
    assert.equal(ids(cwd, '검색대상본문').length, 12)
    const first = performance.now() - start
    const warmStart = performance.now()
    assert.equal(ids(cwd, '검색대상본문').length, 12)
    t.diagnostic(`12 MiB synthetic legacy backfill: ${first.toFixed(1)} ms; unchanged query: ${(performance.now() - warmStart).toFixed(1)} ms`)
    const max = Number(store.prepare('SELECT max(length(m.body)) AS size FROM history_search_messages m JOIN history_search_sessions s ON s.key=m.session_key WHERE s.cwd=?').get(cwd)?.size)
    assert.ok(max < 100, 'large tool payloads are not copied into the search index')
  } finally { store.close() }
})

test('a failed search-index update rolls back both the transcript and its search projection', () => {
  const cwd = '/search/rollback'
  const events = [message('user', '보존할질문'), message('assistant', '기존답변')]
  writeAgentTranscript('codex', cwd, 'rollback-search', events)
  const store = openStore()
  try {
    store.exec(`CREATE TRIGGER search_fail_update BEFORE UPDATE ON history_search_messages BEGIN SELECT RAISE(ABORT,'search failure'); END;`)
    events.push(message('assistant', '실패할추가'))
    assert.equal(writeAgentTranscript('codex', cwd, 'rollback-search', events), false)
    assert.deepEqual(ids(cwd, '기존답변'), ['rollback-search'])
    assert.deepEqual(ids(cwd, '실패할추가'), [])
    assert.equal(store.prepare('SELECT count FROM sessions WHERE key=?').get(transcriptKey('codex', cwd, 'rollback-search'))?.count, 2)
  } finally { store.exec('DROP TRIGGER search_fail_update'); store.close() }
})
