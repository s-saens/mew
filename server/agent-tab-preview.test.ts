import './test-isolated-data.ts'
import assert from 'node:assert/strict'
import childProcess from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import { syncBuiltinESMExports } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import express from 'express'
import { setFeature } from './access-policy.ts'
import { readAgentTabPreview } from './agent-tab-preview.ts'
import { closeTranscriptDatabase, writeAgentTranscript } from './agentTranscript.ts'
import type { AgentEvent } from './agentAcp.ts'
import { createSession, destroySession, upsertUser } from './auth.ts'
import { attachAuthContext, type RequestAuth } from './reqAuth.ts'
import { createUserUiRouter } from './user-ui-routes.ts'
import { writeAgentTabs } from './userUiState.ts'

const message = (role: 'user' | 'agent', text: string): AgentEvent => ({
  type: 'update', update: { sessionUpdate: role === 'user' ? 'user_message_chunk' : 'agent_message_chunk', content: { type: 'text', text } },
} as AgentEvent)

test('saved tab preview reads account-owned text without starting ACP and discards stale reads', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-agent-tab-preview-'))
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-agent-tab-preview-cwd-'))
  const alice = 'preview-alice@example.test', bob = 'preview-bob@example.test'
  const auth: RequestAuth = { role: 'member', email: alice, mustChangePassword: false }
  const tokens = [alice, bob].map(email => {
    upsertUser(email, { hash: '', role: 'member', mustChangePassword: false, createdAt: Date.now(), passwordChangedAt: 0 })
    setFeature(email, 'agent', true)
    return createSession(email)
  })
  const save = (email = alice, sessionId = 'alice', runtime = 'codex', cwd = outside) => writeAgentTabs(email, root, {
    tabs: [{ id: 'tab', label: 'Saved', runtime, cwd, sessionIds: { [JSON.stringify([runtime, cwd])]: sessionId } }], activeId: 'tab',
  })
  save()
  save(bob, 'bob')
  const events = Array.from({ length: 5 }, (_, i) => [message('user', `Question ${i}`), message('agent', `Answer ${i}`)]).flat()
  assert.equal(writeAgentTranscript('codex', outside, 'alice', events), true)
  assert.equal(writeAgentTranscript('codex', outside, 'bob', [message('user', 'Bob private')]), true)
  const app = express()
  app.use(attachAuthContext, createUserUiRouter((res, _error) => res.status(500).json({ error: 'Internal error' })))
  const server = http.createServer(app)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  const request = (query = '', token = tokens[0]) => fetch(`${origin}/agent-tabs/history?workspace=${encodeURIComponent(root)}&tab=tab${query}`, {
    headers: token ? { Cookie: `mew_session=${token}` } : {},
  })
  t.after(async () => {
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
    closeTranscriptDatabase()
    fs.rmSync(root, { recursive: true, force: true })
    fs.rmSync(outside, { recursive: true, force: true })
  })

  await t.test('route uses the saved account/runtime/cwd/session and reads three turns while spawn is forbidden', async () => {
    const spawned = t.mock.method(childProcess, 'spawn', () => { throw new Error('Preview must not start processes') })
    syncBuiltinESMExports()
    try {
      const response = await request('&email=' + bob + '&runtime=claude&cwd=/other&sessionId=bob')
      assert.equal(response.status, 200)
      assert.deepEqual(await response.json(), { preview: { sessionId: 'alice', start: 4, events: events.slice(4) } })
      assert.deepEqual(await (await request('', tokens[1])).json(), { preview: { sessionId: 'bob', start: 0, events: [message('user', 'Bob private')] } })
      assert.equal(spawned.mock.callCount(), 0)
    } finally { spawned.mock.restore(); syncBuiltinESMExports() }
  })

  await t.test('guests and terminal-only accounts cannot read agent transcripts', async () => {
    assert.equal((await request('', '')).status, 403)
    setFeature(alice, 'agent', false)
    setFeature(alice, 'terminal', true)
    try { assert.equal((await request()).status, 403) }
    finally { setFeature(alice, 'agent', true) }
  })

  await t.test('missing, closed, unsaved, terminal and unavailable transcripts return null', async () => {
    for (const state of [
      { tabs: [], activeId: null },
      { tabs: [{ id: 'other', label: 'Other', runtime: 'codex', cwd: outside }], activeId: 'other' },
      { tabs: [{ id: 'tab', label: 'Fresh', runtime: 'codex', cwd: outside }], activeId: 'tab' },
    ]) {
      writeAgentTabs(alice, root, state)
      assert.deepEqual(await (await request()).json(), { preview: null })
    }
    save(alice, 'shell', 'tmux')
    assert.deepEqual(await (await request()).json(), { preview: null })
    save(alice, 'not-stored')
    assert.deepEqual(await (await request()).json(), { preview: null })
    save()
    assert.equal(await readAgentTabPreview(() => auth, outside, 'tab'), null)
  })

  await t.test('request validation follows existing directory and tab constraints', async () => {
    for (const [workspace, id] of [['relative', 'tab'], [path.join(root, 'missing'), 'tab'], [root, '../tab']]) {
      await assert.rejects(readAgentTabPreview(() => auth, workspace, id), { status: 400 })
    }
    save(alice, 'alice', 'codex', path.join(root, 'missing'))
    assert.equal((await request()).status, 400)
    save()
  })

  await t.test('tab closure and runtime, cwd or session changes during I/O discard the old preview', async () => {
    for (const change of [
      () => writeAgentTabs(alice, root, { tabs: [], activeId: null }),
      () => save(alice, 'next'),
      () => save(alice, 'alice', 'claude'),
      () => save(alice, 'alice', 'codex', root),
    ]) {
      save()
      const preview = await readAgentTabPreview(() => auth, root, 'tab', async (runtime, cwd, sessionId, options) => {
        assert.deepEqual([runtime, cwd, sessionId, options], ['codex', outside, 'alice', { deferWork: true, turns: 3 }])
        change()
        return { sessionId: 'alice', start: 0, events }
      })
      assert.equal(preview, null)
    }
    save()
  })

  await t.test('permission and account/session revocation during I/O block the response', async () => {
    await assert.rejects(readAgentTabPreview(() => auth, root, 'tab', async () => {
      setFeature(alice, 'agent', false)
      return { sessionId: 'alice', start: 0, events }
    }), { status: 403 })
    setFeature(alice, 'agent', true)
    let current = auth
    await assert.rejects(readAgentTabPreview(() => current, root, 'tab', async () => {
      current = { ...auth, email: bob }
      return { sessionId: 'alice', start: 0, events }
    }), { status: 403 })
    current = auth
    await assert.rejects(readAgentTabPreview(() => current, root, 'tab', async () => {
      current = { role: 'guest', email: null, mustChangePassword: false }
      return { sessionId: 'alice', start: 0, events }
    }), { status: 403 })
    destroySession(tokens[0])
    assert.equal((await request()).status, 403)
  })
})
