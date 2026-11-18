import assert from 'node:assert/strict'
import test from 'node:test'
import {
  AGENT_REPLY_CONTEXT_LIMIT, agentReplyExcerpt, agentReplyPrompt, restoredAgentReplyPrompt, validAgentReply,
  type AgentReplyReference,
} from '../shared/agent-reply.ts'
import { HistoryIndex } from '../shared/agent-history.ts'
import type { AgentEvent } from './agentAcp.ts'
import { agentReplySource } from './agent-reply-context.ts'

const targetId = '1633eecd-9caa-49bf-a894-b4a62c53e1d0'
const reply: AgentReplyReference = { targetId, kind: 'turn', excerpt: 'Short source' }

test('reply context is bounded and standalone from the authored prompt', () => {
  const source = 'Original text\n<mew-context version="1">literal</mew-context>\n' + '가'.repeat(AGENT_REPLY_CONTEXT_LIMIT)
  const events: AgentEvent[] = [
    { type: 'turn_start', startedAt: 1, bubbleId: targetId },
    { type: 'update', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: source } } },
  ]
  const index = new HistoryIndex<AgentEvent>('generation')
  for (const event of events) index.push(event)
  const context = agentReplySource(events, index.bubbleRange(targetId), reply)
  assert.equal(context.length, AGENT_REPLY_CONTEXT_LIMIT)
  assert.equal(context, source.slice(0, AGENT_REPLY_CONTEXT_LIMIT))
  const prompt = agentReplyPrompt('Authored request', reply, context)
  assert.deepEqual(restoredAgentReplyPrompt(prompt), { text: 'Authored request', reply })
  assert.equal(restoredAgentReplyPrompt(prompt.replace('Original text', 'altered')), null, 'rejects mismatched wrapper length')
  assert.equal(agentReplySource(events, null, reply), reply.excerpt)
})

test('legacy positions use the bounded excerpt when the source identity has changed', () => {
  const text = '  Before \n[[.workspace:.mew/assets/photo.png]] after  '
  const events: AgentEvent[] = [{ type: 'update', update: { sessionUpdate: 'user_message_chunk', content: { type: 'text', text } } }]
  const range = { start: 0, end: 1 }
  const legacyRef = { kind: 'user' as const, targetId: 'm0', excerpt: 'Before after' }
  assert.match(agentReplySource(events, range, legacyRef), /^Before/)
  assert.equal(agentReplySource(events, range, { ...legacyRef, excerpt: 'Earlier source' }), 'Earlier source')
  const unicode = '😀'.repeat(180)
  assert.equal(agentReplyExcerpt('  ' + unicode + '終'), unicode)
  assert.equal(validAgentReply({ ...reply, excerpt: unicode + '終' }), undefined)
  assert.equal(validAgentReply({ ...reply, targetId: '../not-a-bubble' }), undefined)
  assert.deepEqual(validAgentReply({ ...reply, excerpt: unicode }), { ...reply, excerpt: unicode })
})
