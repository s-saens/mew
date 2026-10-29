import test, { type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { WebSocket } from 'ws'
import { watchRemoteHeartbeat } from './remote-access-heartbeat.ts'

class Socket extends EventEmitter {
  readyState: number = WebSocket.OPEN
  sent: string[] = []
  terminated = 0
  sendError: 'callback' | 'throw' | undefined
  send(raw: string, callback: (error?: Error) => void) {
    this.sent.push(raw)
    if (this.sendError === 'throw') throw new Error('send failed')
    callback(this.sendError === 'callback' ? new Error('send failed') : undefined)
  }
  terminate() { this.terminated++; this.readyState = WebSocket.CLOSED; this.emit('close') }
}

function fixture(t: TestContext) {
  let now = 0
  t.mock.method(performance, 'now', () => now)
  t.mock.timers.enable({ apis: ['setInterval'] })
  const socket = new Socket(), stop = watchRemoteHeartbeat(socket as unknown as WebSocket)
  t.after(stop)
  return { socket, stop, advance(ms: number) { now += ms; t.mock.timers.tick(ms) } }
}

test('an OPEN signaling socket with successful sends and no heartbeat reply is terminated after sixty seconds', t => {
  const { socket, advance } = fixture(t)
  advance(20_000); advance(20_000)
  assert.deepEqual(socket.sent, ['{"type":"heartbeat"}', '{"type":"heartbeat"}'])
  assert.equal(socket.terminated, 0)
  advance(20_000)
  assert.equal(socket.terminated, 1)
  advance(120_000)
  assert.equal(socket.terminated, 1)
})

test('heartbeat replies keep the host online and the deadline starts at the last reply', t => {
  const { socket, advance } = fixture(t)
  for (let index = 0; index < 6; index++) {
    advance(20_000)
    socket.emit('message', Buffer.from('{"type":"heartbeat"}'))
    assert.equal(socket.terminated, 0)
  }
  advance(20_000); advance(20_000)
  assert.equal(socket.terminated, 0)
  advance(20_000)
  assert.equal(socket.terminated, 1)
})

test('outgoing heartbeats and unrelated messages do not count as heartbeat replies', t => {
  const { socket, advance } = fixture(t)
  for (let index = 0; index < 2; index++) {
    advance(20_000)
    socket.emit('message', Buffer.from('{"type":"online"}'))
    socket.emit('pong')
  }
  advance(20_000)
  assert.equal(socket.terminated, 1)
})

test('opening a socket starts a fresh response deadline after the handshake', t => {
  const { socket, advance } = fixture(t)
  socket.readyState = WebSocket.CONNECTING
  advance(20_000)
  assert.equal(socket.sent.length, 0)
  socket.readyState = WebSocket.OPEN; socket.emit('open')
  advance(20_000); advance(20_000)
  assert.equal(socket.terminated, 0)
  advance(20_000)
  assert.equal(socket.terminated, 1)
})

for (const mode of ['callback', 'throw'] as const) test(`a heartbeat ${mode} failure terminates the socket`, t => {
  const { socket, advance } = fixture(t)
  socket.sendError = mode
  advance(20_000)
  assert.equal(socket.terminated, 1)
})

for (const mode of ['close', 'dispose'] as const) test(`${mode} stops heartbeat traffic and timeout cleanup`, t => {
  const { socket, stop, advance } = fixture(t)
  if (mode === 'close') socket.emit('close')
  else stop()
  advance(120_000)
  assert.equal(socket.terminated, 0)
  assert.equal(socket.sent.length, 0)
  assert.equal(socket.listenerCount('message'), 0)
})
