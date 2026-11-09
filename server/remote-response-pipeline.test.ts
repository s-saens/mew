import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { remoteDispatcher } from './remote-access-dispatch.ts'
import { REMOTE_LIMITS, type RemoteFrame } from '../shared/remote-access.ts'
import type { AuthenticatedSession } from './auth.ts'

const account: AuthenticatedSession = { email: 'owner@example.test', user: { hash: '', role: 'owner', mustChangePassword: false, createdAt: 1, passwordChangedAt: 0 } }
const tick = () => new Promise<void>(resolve => setImmediate(resolve))
async function until(predicate: () => boolean) { for (let i = 0; i < 1000; i++) { if (predicate()) return; await tick() }; throw new Error('Timed out') }

function fixture() {
  const body = Buffer.concat(Array.from({ length: 8 }, (_, index) => Buffer.alloc(REMOTE_LIMITS.chunk, index)))
  const server = http.createServer((_req, res) => res.end(body))
  const frames: RemoteFrame[] = [], acks: (() => void)[] = [], failures: (() => void)[] = []
  let revision = '1', closed = false
  const dispatcher = remoteDispatcher(server, { send: raw => {
    const frame = JSON.parse(raw) as RemoteFrame
    frames.push(frame)
    return frame.type === 'chunk' ? new Promise<void>((resolve, reject) => { acks.push(resolve); failures.push(() => reject(new Error('send-failed'))) }) : Promise.resolve()
  }, close: () => { closed = true } }, () => account, 'https://mew.run', { alive: () => true, accessRevision: () => revision })
  const start = (responseWindow = 8) => dispatcher.receive(JSON.stringify({ type: 'request', id: 'read', method: 'GET', path: '/api/file', headers: {}, responseWindow }))
  return { dispatcher, frames, acks, failures, body, start, revoke: () => { revision = '2'; dispatcher.revalidate() }, closed: () => closed }
}

test('response chunks pipeline two acknowledgements in order and end only after they complete', async t => {
  const h = fixture(); t.after(() => h.dispatcher.close())
  await h.start(); await until(() => h.acks.length === 2)
  assert.deepEqual(h.frames.map(frame => frame.type), ['response', 'chunk', 'chunk'])
  for (let i = 0; i < 8; i++) { await until(() => h.acks.length > i); h.acks[i](); await tick() }
  await until(() => h.frames.some(frame => frame.type === 'end'))
  const chunks = h.frames.filter((frame): frame is Extract<RemoteFrame, { type: 'chunk' }> => frame.type === 'chunk')
  assert.equal(chunks.length, 8)
  assert.deepEqual(Buffer.concat(chunks.map(frame => Buffer.from(frame.data, 'base64'))), h.body)
  assert.equal(h.frames.at(-1)?.type, 'end')
  assert.equal(h.closed(), false)
})

test('failed acknowledgements interrupt both a one-credit wait and a later pending send', async t => {
  for (const responseWindow of [1, 8]) {
    const h = fixture(); t.after(() => h.dispatcher.close())
    await h.start(responseWindow); await until(() => h.acks.length === (responseWindow === 1 ? 1 : 2))
    h.failures[responseWindow === 1 ? 0 : 1]()
    await until(() => h.frames.some(frame => frame.type === 'error' && frame.code === 'response-interrupted'))
    h.acks.forEach(ack => ack()); await tick(); await tick()
    assert.equal(h.frames.filter(frame => frame.type === 'chunk').length, responseWindow === 1 ? 1 : 2)
    assert.equal(h.frames.some(frame => frame.type === 'end'), false)
    assert.equal(h.closed(), false)
  }
})

test('cancellation and permission revocation stop pending response work', async t => {
  for (const action of ['cancel', 'revoke'] as const) {
    const h = fixture(); t.after(() => h.dispatcher.close())
    await h.start(); await until(() => h.acks.length === 2)
    if (action === 'cancel') await h.dispatcher.receive(JSON.stringify({ type: 'cancel', id: 'read' }))
    else h.revoke()
    h.acks.forEach(ack => ack()); await tick(); await tick()
    assert.equal(h.frames.filter(frame => frame.type === 'chunk').length, 2)
    assert.equal(h.frames.some(frame => frame.type === 'end'), false)
    assert.equal(h.frames.some(frame => frame.type === 'error' && frame.code === 'permission-revoked'), action === 'revoke')
  }
})
