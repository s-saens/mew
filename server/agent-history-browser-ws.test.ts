import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { WebSocket } from 'ws'
import type { AgentEvent } from './agentAcp.ts'
import type { HistoryPreview } from '../shared/agent-history.ts'
import type { SessionSearchResult } from '../shared/agent-session-search.ts'

type BrowserMessage = {
  type: string
  requestId?: string
  sessionHistoryPreviews?: boolean
  sessions?: SessionSearchResult[]
  pending?: boolean
  preview?: HistoryPreview<AgentEvent> | null
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-history-browser-ws-'))
process.env.MEW_DATA_DIR = path.join(root, 'data')
process.env.MEW_WORKSPACE = root
const stub = path.join(root, 'agent.mjs')
fs.writeFileSync(stub, `import { AgentSideConnection, ndJsonStream, PROTOCOL_VERSION } from ${JSON.stringify(import.meta.resolve('@agentclientprotocol/sdk'))};
import fs from 'node:fs';import {Readable,Writable} from 'node:stream';
const root=${JSON.stringify(root)};
new AgentSideConnection(()=>({
 initialize:async()=>{fs.writeFileSync(root+'/initialize-entered','');
  while(!fs.existsSync(root+'/initialize-release'))await new Promise(resolve=>setTimeout(resolve,10));
  return {protocolVersion:PROTOCOL_VERSION,agentCapabilities:{loadSession:true}}},
 newSession:async()=>({sessionId:'current-session'}),
 loadSession:async()=>{fs.writeFileSync(root+'/load-entered','');return{}},cancel:async()=>({})
}),ndJsonStream(Writable.toWeb(process.stdout),Readable.toWeb(process.stdin)));`)
process.env.MEW_AGENT_CODEX_CMD = process.execPath
process.env.MEW_AGENT_CODEX_ARGS = stub
const { attachAgentWebSocket } = await import('./agentWs.ts')
const { shutdownAgentHostsForWorkspace } = await import('./agentHost.ts')
const { writeAgentTranscript, closeTranscriptDatabase } = await import('./agentTranscript.ts')
const { closeSessionSearchWorker } = await import('./agent-session-search-service.ts')

test('history browsing uses saved metadata and bounded previews before ACP initialization without loading the selected session', { timeout: 15_000 }, async t => {
  const saved: AgentEvent[] = []
  for (let i = 0; i < 5; i++) saved.push(
    { type: 'update', update: { sessionUpdate: 'user_message_chunk', content: { type: 'text', text: `Saved question ${i}` } } },
    { type: 'update', update: { sessionUpdate: 'tool_call', toolCallId: `tool-${i}`, title: 'Read', rawOutput: 'private tool output' } },
    { type: 'update', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: `Saved answer ${i}` } } },
  )
  assert.equal(writeAgentTranscript('codex', root, 'saved-session', saved), true)
  assert.equal(writeAgentTranscript('codex', root, 'second-saved', saved), true)
  const foreign = path.join(root, 'foreign')
  fs.mkdirSync(foreign)
  assert.equal(writeAgentTranscript('codex', foreign, 'foreign-session', saved), true)
  assert.equal(writeAgentTranscript('claude', root, 'foreign-runtime', saved), true)
  let allowed = true
  const server = http.createServer()
  attachAgentWebSocket(server, { authorize: () => allowed })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as { port: number }
  const ws = new WebSocket(`ws://127.0.0.1:${port}/api/agent/ws?runtime=codex&tab=history-browser&cwd=${encodeURIComponent(root)}&history=1`)
  const messages: BrowserMessage[] = []
  ws.on('message', raw => messages.push(JSON.parse(raw.toString())))
  t.after(async () => {
    ws.terminate()
    await closeSessionSearchWorker()
    shutdownAgentHostsForWorkspace(root)
    server.close()
    closeTranscriptDatabase()
    await new Promise(resolve => setTimeout(resolve, 150))
    fs.rmSync(root, { recursive: true, force: true })
  })
  async function until(predicate: () => boolean) {
    const deadline = Date.now() + 8_000
    while (!predicate()) {
      if (Date.now() > deadline) throw new Error(`Timed out: ${JSON.stringify(messages)}`)
      await new Promise(resolve => setTimeout(resolve, 10))
    }
  }
  await until(() => messages.some(message => message.type === 'ready'))
  assert.equal(messages.find(message => message.type === 'ready')?.sessionHistoryPreviews, true)
  ws.send(JSON.stringify({ type: 'list_sessions', localOnly: true, requestId: 'warm' }))
  ws.send(JSON.stringify({ type: 'list_sessions', requestId: 'normal' }))
  for (const [sessionId, requestId] of [['saved-session', 'preview'], ['second-saved', 'second'], ['saved-session', 'excess']]) {
    ws.send(JSON.stringify({ type: 'preview_session', sessionId, requestId }))
  }
  ws.send(JSON.stringify({ type: 'preview_session', sessionId: '../saved-session', requestId: 'invalid-session' }))
  ws.send(JSON.stringify({ type: 'preview_session', sessionId: 'saved-session', requestId: 'x'.repeat(101) }))
  ws.send(JSON.stringify({ type: 'preview_session', sessionId: 'saved-session', requestId: '' }))
  await until(() => messages.some(message => message.type === 'sessions' && message.requestId === 'warm')
    && messages.some(message => message.type === 'sessions' && message.requestId === 'normal' && !message.pending)
    && messages.filter(message => message.type === 'session_preview').length === 3)
  const warm = messages.find(message => message.type === 'sessions' && message.requestId === 'warm')!
  assert.deepEqual(warm.sessions!.map(session => session.sessionId).sort(), ['saved-session', 'second-saved'])
  assert.equal(warm.pending, undefined)
  assert.equal(messages.find(message => message.requestId === 'excess')?.preview, null)
  const preview = messages.find(message => message.requestId === 'preview')!.preview!
  assert.equal(preview.sessionId, 'saved-session')
  assert.equal(preview.start, 6)
  assert.match(JSON.stringify(preview.events), /Saved question 2/)
  assert.doesNotMatch(JSON.stringify(preview.events), /Saved question 1|private tool output/)
  assert.ok(preview.events.some(event => event.type === 'work_pending'))
  assert.equal('generation' in preview, false)
  assert.equal(messages.some(message => message.type === 'meta' || message.type === 'history'), false)
  assert.equal(fs.existsSync(path.join(root, 'load-entered')), false)
  assert.equal(messages.some(message => message.requestId === 'invalid-session' || message.requestId === '' || (message.requestId?.length ?? 0) > 100), false)
  ws.send(JSON.stringify({ type: 'preview_session', sessionId: 'foreign-session', requestId: 'foreign' }))
  await until(() => messages.some(message => message.requestId === 'foreign'))
  assert.equal(messages.find(message => message.requestId === 'foreign')?.preview, null)

  // Hold read completion, then revoke permission: the asynchronous response must recheck access.
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  let entered = false
  const access = fsp.access
  t.mock.method(fsp, 'access', async (...args: Parameters<typeof fsp.access>) => {
    if (String(args[0]).endsWith('transcripts.sqlite')) { entered = true; await gate }
    return access(...args)
  })
  ws.send(JSON.stringify({ type: 'preview_session', sessionId: 'saved-session', requestId: 'revoked' }))
  await until(() => entered)
  allowed = false
  release()
  await until(() => ws.readyState === WebSocket.CLOSED)
  assert.equal(messages.some(message => message.requestId === 'revoked'), false)
  assert.equal(fs.existsSync(path.join(root, 'load-entered')), false)
})
