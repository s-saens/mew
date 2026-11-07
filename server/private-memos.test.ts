import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { once } from 'node:events'
import type { IncomingMessage } from 'node:http'
import express from 'express'
import { WebSocket } from 'ws'
import * as Y from 'yjs'

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-private-memos-'))
process.env.MEW_DATA_DIR = directory
test.after(() => fs.rmSync(directory, { recursive: true, force: true }))

test('private memo index and CRDT edits persist; deleted handles cannot recreate content', async () => {
  const { createPrivateMemoTab, readPrivateMemoTabs, createPrivateMemoDoc, privateMemoRoom, deletePrivateMemoTab } = await import('./private-memos.ts')
  const owner = 'storage@example.test', other = 'other-storage@example.test'
  const tab = createPrivateMemoTab(owner), second = createPrivateMemoTab(owner)
  assert.equal(tab.name, 'Memo 1')
  assert.equal(second.name, 'Memo 2')
  assert.deepEqual(readPrivateMemoTabs(owner), [tab, second])
  assert.deepEqual(readPrivateMemoTabs(other), [])
  assert.throws(() => createPrivateMemoDoc(privateMemoRoom(other, tab.id)))
  let room = createPrivateMemoDoc(privateMemoRoom(owner, tab.id))
  const client = new Y.Doc()
  try {
    Y.applyUpdate(client, room.encodeStateAsUpdate())
    client.getText('draft').insert(0, 'private text')
    room.applyUpdate(Y.encodeStateAsUpdate(client))
    const saved = room.encodeStateAsUpdate()
    room.destroy(); room = createPrivateMemoDoc(privateMemoRoom(owner, tab.id))
    assert.deepEqual(room.encodeStateAsUpdate(), saved, 'CRDT identities persist across reopen')
    assert.equal(room.applyUpdate(Y.encodeStateAsUpdate(client)), null, 'a reconnect never duplicates edits')
    assert.equal(deletePrivateMemoTab(other, tab.id), false)
    assert.equal(deletePrivateMemoTab(owner, tab.id), true)
    assert.deepEqual(readPrivateMemoTabs(owner), [second])
    client.getText('draft').insert(0, 'stale')
    assert.throws(() => room.applyUpdate(Y.encodeStateAsUpdate(client)), /deleted/)
    assert.throws(() => createPrivateMemoDoc(privateMemoRoom(owner, tab.id)))
    assert.equal(fs.existsSync(path.join(directory, 'private-memos', encodeURIComponent(owner), `${tab.id}.json`)), false)
    assert.equal(deletePrivateMemoTab(owner, 'shared'), false, 'the permanent shared tab is not part of the private index')
  } finally { room.destroy(); client.destroy() }
})

test('private memo room authorization follows ownership, current sessions, feature access and deletion', async () => {
  const { createSession, destroySession, upsertUser } = await import('./auth.ts')
  const { authorizeCollab } = await import('./reqAuth.ts')
  const { setFeature } = await import('./access-policy.ts')
  const { createPrivateMemoTab, privateMemoRoom, deletePrivateMemoTab } = await import('./private-memos.ts')
  const { PRIVATE_MEMO_PROJECT, privateMemoOwner, isMemoRoom, privateMemoPath } = await import('../shared/shared-memo.ts')
  const owner = 'access@example.test', other = 'other-access@example.test'
  for (const account of [owner, other]) upsertUser(account, { hash: 'unused', role: 'owner', createdAt: 0, passwordChangedAt: 0, mustChangePassword: false })
  const token = createSession(owner), otherToken = createSession(other), tab = createPrivateMemoTab(owner)
  const room = privateMemoRoom(owner, tab.id)
  const request = (session = token, key = room) => ({ url: `/api/collab?room=${encodeURIComponent(key)}`, headers: { cookie: session ? `mew_session=${session}` : '' } }) as IncomingMessage
  try {
    assert.equal(privateMemoOwner(room), owner)
    assert.equal(isMemoRoom(room), true)
    assert.equal(privateMemoPath(owner, tab.id), `${encodeURIComponent(owner)}/${tab.id}`)
    assert.equal(authorizeCollab(request()), true)
    assert.equal(authorizeCollab(request(otherToken)), false, 'even another owner cannot enter a private tab')
    assert.equal(authorizeCollab(request('')), false)
    assert.equal(authorizeCollab(request(token, `${PRIVATE_MEMO_PROJECT}:../${tab.id}`)), false)
    assert.equal(authorizeCollab(request(token, `${room}/extra`)), false)
    setFeature(owner, 'collaboration', false)
    assert.equal(authorizeCollab(request()), false)
    setFeature(owner, 'collaboration', true)
    deletePrivateMemoTab(owner, tab.id)
    assert.equal(authorizeCollab(request()), false)
  } finally { destroySession(token); destroySession(otherToken) }
})

test('memo tab REST is account scoped and deletion evicts connected sockets', async () => {
  const { createSession, destroySession, upsertUser } = await import('./auth.ts')
  const { attachAuthContext, authorizeCollab } = await import('./reqAuth.ts')
  const { createMemoTabRouter } = await import('./memo-tab-routes.ts')
  const { attachCollabWebSocket } = await import('./collab.ts')
  const { privateMemoRoom } = await import('./private-memos.ts')
  const owner = 'routes@example.test', other = 'other-routes@example.test'
  for (const account of [owner, other]) upsertUser(account, { hash: 'unused', role: 'member', createdAt: 0, passwordChangedAt: 0, mustChangePassword: false })
  const token = createSession(owner), otherToken = createSession(other)
  const app = express()
  app.use(express.json(), attachAuthContext)
  app.use('/api/memo-tabs', createMemoTabRouter())
  const server = http.createServer(app)
  attachCollabWebSocket(server as unknown as Parameters<typeof attachCollabWebSocket>[0], { authorize: authorizeCollab })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  const call = (method: string, suffix = '', session = token) => fetch(`http://127.0.0.1:${port}/api/memo-tabs${suffix}`, { method, headers: { cookie: session ? `mew_session=${session}` : '' } })
  let ws: WebSocket | undefined
  try {
    assert.equal((await call('GET', '', '')).status, 403)
    const created = await call('POST')
    assert.equal(created.status, 201)
    const { tab } = await created.json() as { tab: { id: string; name: string } }
    assert.deepEqual(await (await call('GET')).json(), { ownerId: owner, tabs: [tab] })
    assert.deepEqual(await (await call('GET', '', otherToken)).json(), { ownerId: other, tabs: [] })
    assert.equal((await call('DELETE', `/${tab.id}`, otherToken)).status, 404)
    assert.equal((await call('DELETE', '/shared')).status, 404)
    const room = privateMemoRoom(owner, tab.id)
    ws = new WebSocket(`ws://127.0.0.1:${port}/api/collab?room=${encodeURIComponent(room)}`, { headers: { cookie: `mew_session=${token}` } })
    await once(ws, 'open')
    const closed = once(ws, 'close')
    assert.equal((await call('DELETE', `/${tab.id}`)).status, 200)
    const [code] = await closed
    assert.equal(code, 1008)
    assert.deepEqual(await (await call('GET')).json(), { ownerId: owner, tabs: [] })
    await new Promise<void>((resolve, reject) => {
      const stale = new WebSocket(`ws://127.0.0.1:${port}/api/collab?room=${encodeURIComponent(room)}`, { headers: { cookie: `mew_session=${token}` } })
      stale.on('open', () => { stale.terminate(); reject(new Error('Deleted room reconnected')) })
      stale.on('unexpected-response', (_req, response) => { assert.equal(response.statusCode, 401); response.resume(); resolve() })
      stale.on('error', () => {})
    })
  } finally {
    ws?.terminate()
    await new Promise<void>(resolve => server.close(() => resolve()))
    destroySession(token); destroySession(otherToken)
  }
})
