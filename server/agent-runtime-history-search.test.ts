import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const temporary = await fsp.mkdtemp(path.join(os.tmpdir(), 'mew-runtime-history-search-'))
const saved = Object.fromEntries(['MEW_DATA_DIR', 'CODEX_HOME', 'CLAUDE_CONFIG_DIR', 'MEW_AGENT_CONFIG_DIR'].map(key => [key, process.env[key]]))
process.env.MEW_DATA_DIR = path.join(temporary, 'data')
// Every runtime lookup, including module initialization, points at synthetic history.
process.env.CODEX_HOME = path.join(temporary, 'codex')
process.env.CLAUDE_CONFIG_DIR = path.join(temporary, 'claude')
process.env.MEW_AGENT_CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR
const { searchRuntimeHistory } = await import('./agent-runtime-history-search.ts')
const { writeAgentSetting, deleteAgentSetting } = await import('./agentSettings.ts')

function jsonl(...entries: unknown[]): string { return entries.map(entry => `${JSON.stringify(entry)}\n`).join('') }
function meta(id: string, cwd: string, extra: Record<string, unknown> = {}) {
  return { type: 'session_meta', payload: { id, cwd, ...extra } }
}
function codexMessage(role: string, text: string, extra: Record<string, unknown> = {}) {
  return { type: 'response_item', payload: { type: 'message', role, content: [{ type: role === 'user' ? 'input_text' : 'output_text', text }], ...extra } }
}
function claudeMessage(role: string, text: string, cwd: string, extra: Record<string, unknown> = {}) {
  return { type: role, cwd, message: { content: [{ type: 'text', text }] }, ...extra }
}
async function fixture(name: string) {
  const root = path.join(temporary, name)
  const cwd = path.join(root, 'workspace')
  const codex = path.join(root, 'codex')
  const claude = path.join(root, 'claude')
  await fsp.mkdir(cwd, { recursive: true })
  process.env.CODEX_HOME = codex
  process.env.CLAUDE_CONFIG_DIR = claude
  process.env.MEW_AGENT_CONFIG_DIR = claude
  return { root, cwd, codex, claude, claudeDir: path.join(claude, 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-')) }
}
async function write(file: string, body: string, timestamp?: string) {
  await fsp.mkdir(path.dirname(file), { recursive: true })
  await fsp.writeFile(file, body)
  if (timestamp) await fsp.utimes(file, new Date(timestamp), new Date(timestamp))
  return file
}

test('Codex의 질문과 나중 답변을 검색하고 ID exact와 partial을 보존한다', async () => {
  const f = await fixture('codex-content')
  const id = 'aaa-bbb-123'
  await write(path.join(f.codex, 'sessions/2026/10/28/rollout-one.jsonl'), jsonl(
    meta(id, f.cwd), codexMessage('user', '처음에는 짧은 질문'),
    { type: 'response_item', payload: { type: 'function_call_output', output: 'x'.repeat(70_000) } },
    codexMessage('assistant', '에이전트 패널의 히스토리 검색을 고쳤습니다.'),
  ))
  const [result] = await searchRuntimeHistory('codex', f.cwd, '에이전트패널')
  assert.equal(result.sessionId, id)
  assert.equal(result.title, '처음에는 짧은 질문')
  assert.match(result.snippet!, /에이전트 패널/)
  assert.equal((await searchRuntimeHistory('codex', f.cwd, id))[0]?.sessionId, id)
  assert.equal((await searchRuntimeHistory('codex', f.cwd, 'bbb123'))[0]?.sessionId, id)
  assert.equal((await searchRuntimeHistory('codex', f.cwd, 'agent panel'))[0]?.sessionId, id)
})

test('Codex는 50개 밖의 오래된 archived 세션과 구두점 검색을 놓치지 않는다', async () => {
  const f = await fixture('codex-old')
  await write(path.join(f.codex, 'archived_sessions/2025/01/01/old.jsonl'), jsonl(
    meta('old-archive', f.cwd), codexMessage('user', '옛날질문'), codexMessage('assistant', '이 대화에서 uncommonneedle을 다룹니다.'),
  ), '2025-01-01T00:00:00Z')
  await Promise.all(Array.from({ length: 52 }, (_, index) => write(
    path.join(f.codex, 'sessions/2026/10/28', `recent-${index}.jsonl`),
    jsonl(meta(`recent-${index}`, f.cwd), codexMessage('user', '일반 대화')),
    '2026-10-28T00:00:00Z',
  )))
  assert.equal((await searchRuntimeHistory('codex', f.cwd, 'uncommonneedle'))[0]?.sessionId, 'old-archive')
  assert.equal((await searchRuntimeHistory('codex', f.cwd, 'old-archive'))[0]?.sessionId, 'old-archive')
})

test('시스템·개발자·도구·생각과 다른 프로젝트·하위 에이전트는 Codex 검색에 들어가지 않는다', async () => {
  const f = await fixture('codex-exclusions')
  await write(path.join(f.codex, 'sessions/2026/10/28/main.jsonl'), jsonl(
    meta('main', f.cwd), codexMessage('user', '사용자대화'),
    codexMessage('developer', 'developeronlyneedle'), codexMessage('system', 'systemonlyneedle'),
    codexMessage('assistant', 'thoughtonlyneedle', { channel: 'analysis' }),
    { type: 'response_item', payload: { type: 'function_call_output', output: 'toolonlyneedle' } },
    { type: 'response_item', payload: { type: 'reasoning', content: [{ type: 'text', text: 'reasoningonlyneedle' }] } },
  ))
  await write(path.join(f.codex, 'sessions/2026/10/28/foreign.jsonl'), jsonl(
    meta('foreign', `${f.cwd}-elsewhere`), codexMessage('user', 'foreignonlyneedle'),
  ))
  await write(path.join(f.codex, 'sessions/2026/10/28/child.jsonl'), jsonl(
    meta('child', f.cwd, { source: { subagent: { thread_spawn: { parent_thread_id: 'main' } } } }),
    codexMessage('user', 'subagentonlyneedle'),
  ))
  for (const query of ['developeronlyneedle', 'systemonlyneedle', 'thoughtonlyneedle', 'toolonlyneedle', 'reasoningonlyneedle', 'foreignonlyneedle', 'subagentonlyneedle', 'foreign', 'child']) {
    assert.deepEqual(await searchRuntimeHistory('codex', f.cwd, query), [], query)
  }
})

test('Claude 첫 질문 뒤의 답변·한 글자·메시지 사이의 검색어를 찾고 메타/도구는 제외한다', async () => {
  const f = await fixture('claude-content')
  await write(path.join(f.claudeDir, 'claude-id.jsonl'), jsonl(
    claudeMessage('user', '<local-command-caveat>CLI generated</local-command-caveat>', f.cwd),
    claudeMessage('user', '처음 질문 파일탐색기', f.cwd),
    claudeMessage('assistant', '에이전트 패널과 답변을 연결하고 큐도 개선했습니다.', f.cwd),
    claudeMessage('user', 'sidechainneedle', f.cwd, { isSidechain: true }),
    claudeMessage('user', 'metaneedle', f.cwd, { isMeta: true }),
    { type: 'user', cwd: f.cwd, message: { content: [{ type: 'tool_result', content: 'toolneedle' }] } },
    { type: 'assistant', cwd: f.cwd, message: { content: [{ type: 'thinking', thinking: 'thinkingneedle' }] } },
  ))
  const [result] = await searchRuntimeHistory('claude', f.cwd, '에이전트패널')
  assert.equal(result.sessionId, 'claude-id')
  assert.equal(result.title, '처음 질문 파일탐색기')
  assert.equal((await searchRuntimeHistory('claude', f.cwd, '큐'))[0]?.sessionId, 'claude-id')
  assert.equal((await searchRuntimeHistory('claude', f.cwd, '파일탐색기 개선'))[0]?.sessionId, 'claude-id')
  for (const query of ['CLI generated', 'sidechainneedle', 'metaneedle', 'toolneedle', 'thinkingneedle']) {
    assert.deepEqual(await searchRuntimeHistory('claude', f.cwd, query), [], query)
  }
  assert.deepEqual(await searchRuntimeHistory('codex', f.cwd, '에이전트패널'), [])
})

test('Claude 폴더명 충돌을 cwd로 검증하며 symlink·subagent 폴더와 파일을 읽지 않는다', async () => {
  const f = await fixture('claude-scopes')
  const collision = `${f.cwd}/a/b`
  const requested = `${f.cwd}/a-b`
  const directory = path.join(f.claude, 'projects', requested.replace(/[^a-zA-Z0-9]/g, '-'))
  assert.equal(requested.replace(/[^a-zA-Z0-9]/g, '-'), collision.replace(/[^a-zA-Z0-9]/g, '-'))
  await write(path.join(directory, 'matching.jsonl'), jsonl(claudeMessage('user', 'scopekeyword', requested)))
  await write(path.join(directory, 'foreign.jsonl'), jsonl(claudeMessage('user', 'scopekeyword', collision)))
  await write(path.join(directory, 'agent-child.jsonl'), jsonl(claudeMessage('user', 'scopekeyword', requested)))
  await write(path.join(directory, 'main/subagents/child.jsonl'), jsonl(claudeMessage('user', 'scopekeyword', requested)))
  const outside = await write(path.join(f.root, 'outside.jsonl'), jsonl(claudeMessage('user', 'scopekeyword', requested)))
  await fsp.symlink(outside, path.join(directory, 'link.jsonl'))
  const symlinkDir = path.join(f.claude, 'projects', f.cwd.replace(/[^a-zA-Z0-9]/g, '-'))
  await fsp.symlink(directory, symlinkDir, 'dir')
  assert.deepEqual((await searchRuntimeHistory('claude', requested, 'scopekeyword')).map(value => value.sessionId), ['matching'])
  assert.deepEqual(await searchRuntimeHistory('claude', f.cwd, 'scopekeyword'), [])
})

test('변경되지 않은 파일은 다시 읽지 않고 변경·삭제된 파일만 색인을 갱신한다', async t => {
  const f = await fixture('incremental')
  const file = await write(path.join(f.codex, 'sessions/2026/10/28/main.jsonl'), jsonl(
    meta('indexed-id', f.cwd), codexMessage('user', 'beforekeyword'),
  ))
  const other = await write(path.join(f.codex, 'sessions/2026/10/28/other.jsonl'), jsonl(
    meta('other-id', f.cwd), codexMessage('user', 'stablekeyword'),
  ))
  const reads: string[] = []
  const original = fs.createReadStream
  t.mock.method(fs, 'createReadStream', (...args: Parameters<typeof fs.createReadStream>) => {
    reads.push(String(args[0]))
    return original(...args)
  })
  assert.equal((await searchRuntimeHistory('codex', f.cwd, 'beforekeyword'))[0]?.sessionId, 'indexed-id')
  assert.equal(reads.length, 2)
  reads.length = 0
  assert.equal((await searchRuntimeHistory('codex', f.cwd, 'stablekeyword'))[0]?.sessionId, 'other-id')
  assert.equal(reads.length, 0)
  await fsp.appendFile(file, jsonl(codexMessage('assistant', 'afterkeyword')))
  assert.equal((await searchRuntimeHistory('codex', f.cwd, 'afterkeyword'))[0]?.sessionId, 'indexed-id')
  assert.deepEqual(reads, [file])
  reads.length = 0
  await write(file, jsonl(meta('indexed-id', f.cwd), codexMessage('user', 'replacedkeyword')))
  assert.deepEqual(await searchRuntimeHistory('codex', f.cwd, 'beforekeyword'), [])
  assert.equal((await searchRuntimeHistory('codex', f.cwd, 'replacedkeyword'))[0]?.sessionId, 'indexed-id')
  assert.deepEqual(reads, [file])
  await fsp.rm(file)
  assert.deepEqual(await searchRuntimeHistory('codex', f.cwd, 'replacedkeyword'), [])
  assert.equal(reads.includes(other), false)
})

test('동시에 시작한 같은 범위의 검색은 초기 색인을 공유하고 SQLite 파일을 남긴다', async t => {
  const f = await fixture('concurrent')
  await write(path.join(f.claudeDir, 'one.jsonl'), jsonl(claudeMessage('user', 'concurrentkeyword', f.cwd)))
  const original = fs.createReadStream
  let reads = 0
  t.mock.method(fs, 'createReadStream', (...args: Parameters<typeof fs.createReadStream>) => {
    reads++
    return original(...args)
  })
  const results = await Promise.all(Array.from({ length: 4 }, () => searchRuntimeHistory('claude', f.cwd, 'concurrentkeyword')))
  assert.equal(reads, 1)
  assert.ok(results.every(value => value[0]?.sessionId === 'one'))
  const directory = path.join(process.env.MEW_DATA_DIR!, 'agent-runtime-search')
  const files = (await fsp.readdir(directory)).filter(file => file.endsWith('.sqlite'))
  assert.ok(files.length > 0)
  let persisted = false
  for (const file of files) {
    const store = new DatabaseSync(path.join(directory, file), { readOnly: true })
    try { persisted ||= !!store.prepare('SELECT 1 FROM history_search_sessions WHERE session_id=?').get('one') }
    finally { store.close() }
  }
  assert.equal(persisted, true)
})

test('공급자 홈 환경변수와 저장된 런타임 env를 적용하고 지원하지 않는 런타임은 읽지 않는다', async () => {
  const f = await fixture('runtime-env')
  const override = path.join(f.root, 'custom-codex-home')
  await write(path.join(override, 'sessions/2026/10/28/custom.jsonl'), jsonl(meta('custom-home', f.cwd), codexMessage('user', 'customkeyword')))
  writeAgentSetting('codex', { env: { CODEX_HOME: override } })
  try {
    assert.equal((await searchRuntimeHistory('codex', f.cwd, 'customkeyword'))[0]?.sessionId, 'custom-home')
    assert.deepEqual(await searchRuntimeHistory('unknown', f.cwd, 'customkeyword'), [])
    assert.deepEqual(await searchRuntimeHistory('codex', 'relative/path', 'customkeyword'), [])
  } finally { deleteAgentSetting('codex') }
})

test('손상된 줄과 거대 도구 출력은 건너뛰고 뒤의 대화를 계속 검색한다', async () => {
  const f = await fixture('malformed')
  const file = path.join(f.codex, 'sessions/2026/10/28/partial.jsonl')
  await write(file, jsonl(meta('partial-id', f.cwd))
    + '{invalid json}\n'
    + jsonl({ type: 'response_item', payload: { type: 'function_call_output', output: 'x'.repeat(8 * 1024 * 1024 + 10) } })
    + jsonl(codexMessage('user', 'recoverablekeyword'))
    + '{"unfinished":')
  assert.equal((await searchRuntimeHistory('codex', f.cwd, 'recoverablekeyword'))[0]?.sessionId, 'partial-id')
})

test('Codex bootstrap과 Mew 주입 안내를 제외하고 사용자가 직접 쓴 태그는 보존한다', async () => {
  const f = await fixture('injected-context')
  const injected = '<mew-context version="1">\nYou are working through mew. This is application context.\nhiddencontextneedle\n</mew-context>'
  await write(path.join(f.codex, 'sessions/2026/10/28/context.jsonl'), jsonl(
    meta('context-id', f.cwd),
    codexMessage('user', '# AGENTS.md instructions for /synthetic/project\n\n<INSTRUCTIONS>\nbootstrapneedle\n</INSTRUCTIONS>\n<environment_context>environmentneedle</environment_context>'),
    codexMessage('user', '<environment_context>standaloneenvironmentneedle</environment_context>'),
    codexMessage('user', `actualrequestneedle${injected}`),
    codexMessage('user', '이 <mew-context version="1">usertagneedle</mew-context> 태그를 설명해줘'),
    codexMessage('user', '<mew-context version="1">literalcontextneedle</mew-context>'),
  ))
  const [result] = await searchRuntimeHistory('codex', f.cwd, 'actualrequestneedle')
  assert.equal(result?.title, 'actualrequestneedle')
  for (const query of ['hiddencontextneedle', 'bootstrapneedle', 'environmentneedle', 'standaloneenvironmentneedle']) {
    assert.deepEqual(await searchRuntimeHistory('codex', f.cwd, query), [], query)
  }
  assert.equal((await searchRuntimeHistory('codex', f.cwd, 'usertagneedle'))[0]?.sessionId, 'context-id')
  assert.equal((await searchRuntimeHistory('codex', f.cwd, 'literalcontextneedle'))[0]?.sessionId, 'context-id')
})

test('원본 읽기 오류를 빈 검색으로 감추지 않고 변경된 원본의 오래된 색인을 제거한다', async t => {
  const f = await fixture('source-error')
  const file = await write(path.join(f.codex, 'sessions/2026/10/28/error.jsonl'), jsonl(
    meta('error-id', f.cwd), codexMessage('user', 'stalesourceneedle'),
  ))
  assert.equal((await searchRuntimeHistory('codex', f.cwd, 'stalesourceneedle'))[0]?.sessionId, 'error-id')
  await fsp.appendFile(file, jsonl(codexMessage('assistant', 'newcontentneedle')))
  t.mock.method(fs, 'createReadStream', () => { throw new Error('synthetic source read failure') })
  await assert.rejects(searchRuntimeHistory('codex', f.cwd, 'stalesourceneedle'), /could not be completely indexed/)
  const directory = path.join(process.env.MEW_DATA_DIR!, 'agent-runtime-search')
  for (const file of (await fsp.readdir(directory)).filter(value => value.endsWith('.sqlite'))) {
    const store = new DatabaseSync(path.join(directory, file), { readOnly: true })
    try { assert.equal(store.prepare('SELECT 1 FROM history_search_sessions WHERE session_id=?').get('error-id'), undefined) }
    finally { store.close() }
  }
})

test.after(async () => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  await fsp.rm(temporary, { recursive: true, force: true })
})
