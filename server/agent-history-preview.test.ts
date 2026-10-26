import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { HistoryIndex, expandHistoryWork } from '../shared/agent-history.ts'
import { agentDisplayEvent, compactHistoryWork } from '../shared/agent-display.ts'
import type { AgentEvent } from './agentAcp.ts'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-history-preview-'))
process.env.MEW_DATA_DIR = root
const { readAgentHistoryPreview } = await import('./agent-history-preview.ts')
const { writeAgentTranscript, readAgentTranscript, transcriptKey, closeTranscriptDatabase } = await import('./agentTranscript.ts')
after(() => { closeTranscriptDatabase(); fs.rmSync(root, { recursive: true, force: true }) })
const message = (role: 'user' | 'agent', text: string, messageId?: string): AgentEvent => ({
  type: 'update', update: { sessionUpdate: role === 'user' ? 'user_message_chunk' : 'agent_message_chunk', content: { type: 'text', text }, ...(messageId ? { messageId } : {}) },
} as AgentEvent)

test('absent display storage is optional and preview never creates it', async () => {
  assert.equal(await readAgentHistoryPreview('codex', '/workspace', 'absent'), null)
  assert.equal(fs.existsSync(path.join(root, 'agent-transcripts')), false)
})

test('preview matches the last 20 whole questions across read batches without parsing older records', async () => {
  const events: AgentEvent[] = [{ type: 'models', models: { currentModelId: 'saved', availableModels: [] } }]
  for (let i = 0; i < 100; i++) {
    events.push(message('user', `Question ${i}`, String(i)), message('user', ' continued', String(i)), { type: 'turn_start', startedAt: 100 })
    for (let j = 0; j < 30; j++) events.push(message('agent', `Answer ${i}/${j}`))
    events.push({ type: 'turn_end', stopReason: 'end_turn', durationMs: 1200 })
  }
  assert.equal(writeAgentTranscript('codex', '/workspace', 'long', events), true)
  const index = new HistoryIndex<AgentEvent>('saved')
  for (const event of events) index.push(event)
  const expected = index.page(events, 'long')
  const store = new DatabaseSync(path.join(root, 'agent-transcripts', 'transcripts.sqlite'))
  store.prepare('UPDATE events SET payload=? WHERE session_key=? AND seq=0').run('not JSON', transcriptKey('codex', '/workspace', 'long'))
  store.close()
  let ticks = 0
  const heartbeat = setInterval(() => ticks++, 1)
  try {
    const [preview, duplicate] = await Promise.all([
      readAgentHistoryPreview('codex', '/workspace', 'long'), readAgentHistoryPreview('codex', '/workspace', 'long'),
    ])
    assert.deepEqual(preview, { sessionId: 'long', start: expected.start, events: expected.events })
    assert.equal(preview, duplicate, 'concurrent subscribers share one pending worker read')
    assert.ok(ticks > 0, 'the host keeps processing events while preview is read')
    assert.equal('generation' in preview!, false, 'preview cannot be used as a reconnect cursor')
    assert.equal(await readAgentHistoryPreview('claude', '/workspace', 'long'), null)
    assert.equal(await readAgentHistoryPreview('codex', '/other', 'long'), null)
  } finally { clearInterval(heartbeat) }
})

test('one long streamed question is not split or mistaken for many questions', async () => {
  const events: AgentEvent[] = Array.from({ length: 600 }, () => message('user', 'one long question', 'one'))
  events.push(message('agent', 'one answer'))
  assert.equal(writeAgentTranscript('codex', '/workspace', 'streamed', events), true)
  assert.deepEqual(await readAgentHistoryPreview('codex', '/workspace', 'streamed'), { sessionId: 'streamed', start: 0, events })
  assert.deepEqual(readAgentTranscript('codex', '/workspace', 'streamed'), events, 'preview leaves the writer transcript intact')
})

test('large saved tool results preview as bounded display events while the source transcript stays intact', async () => {
  const events: AgentEvent[] = [message('user', 'Question')]
  for (let i = 0; i < 5; i++) events.push({
    type: 'update', update: { sessionUpdate: 'tool_call', toolCallId: `tool-${i}`, title: 'Read fixture', status: 'completed', rawOutput: { result: 'x'.repeat(1024 * 1024) } },
  })
  events.push(message('agent', 'Answer'))
  assert.ok(Buffer.byteLength(JSON.stringify(events)) > 4 * 1024 * 1024)
  assert.equal(writeAgentTranscript('codex', '/workspace', 'large-tools', events), true)
  const preview = await readAgentHistoryPreview('codex', '/workspace', 'large-tools')
  assert.deepEqual(preview, { sessionId: 'large-tools', start: 0, events: events.map(agentDisplayEvent) })
  assert.ok(Buffer.byteLength(JSON.stringify(preview)) < 2048)
  assert.deepEqual(readAgentTranscript('codex', '/workspace', 'large-tools'), events)
})

test('deferred preview uses three whole turns and keeps its original sequence range separate from legacy readers', async () => {
  const events: AgentEvent[] = []
  for (let i = 0; i < 8; i++) events.push(message('user', `Question ${i}`), {
    type: 'update', update: { sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'Work '.repeat(10_000) } },
  }, {
    type: 'update', update: { sessionUpdate: 'tool_call', toolCallId: `tool-${i}`, title: 'Read fixture', status: 'completed' },
  }, message('agent', `Answer ${i}`))
  assert.equal(writeAgentTranscript('codex', '/workspace', 'deferred', events), true)
  const [deferred, legacy] = await Promise.all([
    readAgentHistoryPreview('codex', '/workspace', 'deferred', { deferWork: true, turns: 3 }),
    readAgentHistoryPreview('codex', '/workspace', 'deferred'),
  ])
  assert.deepEqual(deferred, { sessionId: 'deferred', start: 20, events: compactHistoryWork(events.slice(20)) })
  assert.equal(expandHistoryWork(deferred!.events).length + deferred!.start, events.length)
  assert.deepEqual(legacy, { sessionId: 'deferred', start: 0, events })
  assert.deepEqual(readAgentTranscript('codex', '/workspace', 'deferred'), events)
})

test('recent turns ignore oversized or damaged older payloads in the same read batch', async () => {
  const events: AgentEvent[] = [message('user', 'Older question'), {
    type: 'update', update: { sessionUpdate: 'tool_call', toolCallId: 'old-tool', title: 'Older tool', rawOutput: 'x'.repeat(8 * 1024 * 1024) },
  }, message('agent', 'Older answer')]
  for (let i = 0; i < 3; i++) events.push(message('user', `Recent question ${i}`), message('agent', `Recent answer ${i}`))
  assert.ok(events.length < 256)
  assert.equal(writeAgentTranscript('codex', '/workspace', 'older-oversized', events), true)
  assert.deepEqual(await readAgentHistoryPreview('codex', '/workspace', 'older-oversized', { deferWork: true, turns: 3 }), {
    sessionId: 'older-oversized', start: 3, events: events.slice(3),
  })
  const damaged = events.map(event => agentDisplayEvent(event))
  assert.equal(writeAgentTranscript('codex', '/workspace', 'older-damaged', damaged), true)
  const store = new DatabaseSync(path.join(root, 'agent-transcripts', 'transcripts.sqlite'))
  try { store.prepare('UPDATE events SET payload=? WHERE session_key=? AND seq=1').run('not JSON', transcriptKey('codex', '/workspace', 'older-damaged')) }
  finally { store.close() }
  assert.deepEqual(await readAgentHistoryPreview('codex', '/workspace', 'older-damaged', { deferWork: true, turns: 3 }), {
    sessionId: 'older-damaged', start: 3, events: damaged.slice(3),
  })
})

test('reverse preview boundaries match forward indexing for mixed streamed questions and neutral events', async () => {
  const neutral: AgentEvent = { type: 'models', models: { currentModelId: 'saved', availableModels: [] } }
  const events: AgentEvent[] = [neutral,
    message('user', 'Initial without id'), message('user', 'First id', 'a'), message('user', 'No id continuation'),
    neutral, message('user', 'Same id continuation', 'a'), message('user', 'Next id', 'b'), message('agent', 'First answer'),
    message('user', 'Without id again'), neutral, message('user', 'New id', 'c'), message('user', 'Missing id'),
    message('user', 'Same c id', 'c'), message('user', 'Different id', 'd'), message('agent', 'Second answer'),
    message('user', 'Final question', 'e'), message('user', 'Final continuation'), neutral, message('agent', 'Final answer'), neutral,
  ]
  const index = new HistoryIndex<AgentEvent>('expected')
  for (const event of events) index.push(event)
  assert.equal(writeAgentTranscript('codex', '/workspace', 'mixed-boundaries', events), true)
  for (const turns of [1, 2, 3, index.boundaries.length, 20]) {
    const expected = index.page(events, 'mixed-boundaries', { turns })
    assert.deepEqual(await readAgentHistoryPreview('codex', '/workspace', 'mixed-boundaries', { turns }), {
      sessionId: 'mixed-boundaries', start: expected.start, events: expected.events,
    }, `same whole-question range for ${turns} turns`)
  }
})

test('generated mixed histories retain the same recent range as the forward index', async () => {
  for (let fixture = 1; fixture <= 5; fixture++) {
    let seed = fixture
    const events: AgentEvent[] = [{ type: 'models', models: { currentModelId: 'saved', availableModels: [] } }]
    for (let i = 0; i < 120; i++) {
      seed = (seed * 1_664_525 + 1_013_904_223) >>> 0
      switch (seed % 7) {
        case 0: case 1: case 2:
          events.push(message('user', `Question ${i}`, [undefined, 'a', 'b'][seed % 3]))
          break
        case 3: events.push(message('agent', `Answer ${i}`)); break
        case 4: events.push({ type: 'turn_start', startedAt: i }); break
        case 5: events.push({ type: 'turn_end', stopReason: 'end_turn', durationMs: i }); break
        default: events.push({ type: 'error', message: `Error ${i}` })
      }
    }
    const sessionId = `generated-boundaries-${fixture}`
    const index = new HistoryIndex<AgentEvent>('expected')
    for (const event of events) index.push(event)
    const expected = index.page(events, sessionId, { turns: 3 })
    assert.equal(writeAgentTranscript('codex', '/workspace', sessionId, events), true)
    assert.deepEqual(await readAgentHistoryPreview('codex', '/workspace', sessionId, { turns: 3 }), {
      sessionId, start: expected.start, events: expected.events,
    }, `generated fixture ${fixture}`)
  }
})

test('preview rejects an oversized raw event before parsing even when its display projection would be small', async () => {
  const events: AgentEvent[] = [message('user', 'Question'), {
    type: 'update', update: { sessionUpdate: 'tool_call', toolCallId: 'large', title: 'Read fixture', rawOutput: 'x'.repeat(8 * 1024 * 1024) },
  }]
  assert.equal(writeAgentTranscript('codex', '/workspace', 'oversized-tool', events), true)
  assert.equal(await readAgentHistoryPreview('codex', '/workspace', 'oversized-tool'), null)
  assert.deepEqual(readAgentTranscript('codex', '/workspace', 'oversized-tool'), events)
})

test('preview retains a separate raw scan budget after projecting large tool records', async () => {
  const result = 'x'.repeat(1024 * 1024)
  const events: AgentEvent[] = [message('user', 'Question')]
  for (let i = 0; i < 65; i++) events.push({
    type: 'update', update: { sessionUpdate: 'tool_call', toolCallId: `tool-${i}`, title: 'Read fixture', rawOutput: result },
  })
  assert.equal(writeAgentTranscript('codex', '/workspace', 'scan-budget', events), true)
  assert.equal(await readAgentHistoryPreview('codex', '/workspace', 'scan-budget'), null)
  const check = new DatabaseSync(path.join(root, 'agent-transcripts', 'transcripts.sqlite'), { readOnly: true })
  try { assert.equal(check.prepare('SELECT count FROM sessions WHERE key=?').get(transcriptKey('codex', '/workspace', 'scan-budget'))?.count, events.length) }
  finally { check.close() }
})

test('oversized or damaged snapshots fall back to ACP without altering saved data', async () => {
  const events = [message('user', 'large question'), message('agent', 'x'.repeat(4 * 1024 * 1024))]
  assert.equal(writeAgentTranscript('codex', '/workspace', 'large', events), true)
  assert.equal(await readAgentHistoryPreview('codex', '/workspace', 'large'), null)
  const broken = [message('user', 'broken'), message('agent', 'answer')]
  assert.equal(writeAgentTranscript('codex', '/workspace', 'broken', broken), true)
  const store = new DatabaseSync(path.join(root, 'agent-transcripts', 'transcripts.sqlite'))
  const key = transcriptKey('codex', '/workspace', 'broken')
  store.prepare('UPDATE events SET payload=? WHERE session_key=? AND seq=1').run('not JSON', key)
  store.close()
  assert.equal(await readAgentHistoryPreview('codex', '/workspace', 'broken'), null)
  const check = new DatabaseSync(path.join(root, 'agent-transcripts', 'transcripts.sqlite'), { readOnly: true })
  try { assert.equal(check.prepare('SELECT payload FROM events WHERE session_key=? AND seq=1').get(key)?.payload, 'not JSON') }
  finally { check.close() }
})
