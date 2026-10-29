import test, { type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { WebSocket } from 'ws'
import { watchRemoteHeartbeat } from './remote-access-heartbeat.ts'

const HEARTBEAT = '{"type":"heartbeat"}'

class Socket extends EventEmitter {
  readyState: number = WebSocket.OPEN
  sent: string[] = []
  callbacks: ((error?: Error) => void)[] = []
  terminated = 0
  sendError: 'callback' | 'throw' | undefined
  send(raw: string, callback: (error?: Error) => void) {
    this.sent.push(raw); this.callbacks.push(callback)
    if (this.sendError === 'throw') throw new Error('send failed')
    callback(this.sendError === 'callback' ? new Error('send failed') : undefined)
  }
  terminate() { this.terminated++; this.readyState = WebSocket.CLOSED; this.emit('close') }
}

function fixture(t: TestContext) {
  let now = 0, interval!: () => void
  t.mock.method(performance, 'now', () => now)
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] })
  const originalInterval = globalThis.setInterval
  t.mock.method(globalThis, 'setInterval', (callback: () => void, delay?: number) => {
    interval = callback
    return originalInterval(callback, delay)
  })
  const socket = new Socket(), stop = watchRemoteHeartbeat(socket as unknown as WebSocket)
  t.after(stop)
  return { socket, stop, interval: () => interval(), advance(ms: number) { now += ms; t.mock.timers.tick(ms) }, jump(ms: number) { now += ms } }
}

test('an OPEN socket with successful sends and no reply is retried after five seconds and terminated after thirty seconds', t => {
  const { socket, advance } = fixture(t)
  advance(20_000)
  assert.deepEqual(socket.sent, [HEARTBEAT])
  advance(5_000)
  assert.deepEqual(socket.sent, [HEARTBEAT, HEARTBEAT])
  assert.equal(socket.terminated, 0)
  advance(4_999)
  assert.equal(socket.terminated, 0)
  advance(1)
  assert.equal(socket.terminated, 1)
  advance(120_000)
  assert.equal(socket.terminated, 1)
  assert.equal(socket.sent.length, 2)
})

test('heartbeat replies keep the twenty-second cadence without retry traffic', t => {
  const { socket, advance } = fixture(t)
  for (let index = 0; index < 6; index++) {
    advance(20_000)
    socket.emit('message', Buffer.from(HEARTBEAT))
    assert.equal(socket.terminated, 0)
    assert.equal(socket.sent.length, index + 1)
  }
  advance(20_000); advance(5_000)
  assert.equal(socket.terminated, 0)
  advance(5_000)
  assert.equal(socket.terminated, 1)
})

test('a reply to the retry cancels termination and the next heartbeat keeps its normal cadence', t => {
  const { socket, advance } = fixture(t)
  advance(20_000); advance(5_000)
  socket.emit('message', Buffer.from(HEARTBEAT))
  advance(5_000)
  assert.equal(socket.terminated, 0)
  assert.equal(socket.sent.length, 2)
  advance(10_000)
  assert.equal(socket.sent.length, 3)
  socket.emit('message', Buffer.from(HEARTBEAT))
  advance(5_000)
  assert.equal(socket.terminated, 0)
})

test('outgoing heartbeats, unrelated messages and pong do not count as heartbeat replies', t => {
  const { socket, advance } = fixture(t)
  advance(20_000)
  socket.emit('message', Buffer.from('{"type":"online"}'))
  socket.emit('pong')
  advance(5_000); advance(5_000)
  assert.equal(socket.terminated, 1)
})

test('a connecting socket is not probed and gets a full response deadline once open', t => {
  const { socket, advance } = fixture(t)
  socket.readyState = WebSocket.CONNECTING
  advance(20_000)
  assert.equal(socket.sent.length, 0)
  socket.readyState = WebSocket.OPEN; socket.emit('open')
  advance(20_000); advance(5_000)
  assert.equal(socket.terminated, 0)
  advance(5_000)
  assert.equal(socket.terminated, 1)
})

test('an overdue heartbeat after host sleep gets one fresh retry deadline even when the interval callback runs first', t => {
  const { socket, advance, jump, interval } = fixture(t)
  advance(20_000)
  jump(120_000)
  interval()
  assert.equal(socket.sent.length, 1, 'the interval cannot replace a pending response check')
  advance(5_000)
  assert.equal(socket.sent.length, 2)
  assert.equal(socket.terminated, 0, 'a late initial timeout sends one confirmation instead of terminating')
  socket.emit('message', Buffer.from(HEARTBEAT))
  advance(5_000)
  assert.equal(socket.terminated, 0)
})

test('an overdue unanswered retry still terminates instead of extending recovery indefinitely', t => {
  const { socket, advance, jump } = fixture(t)
  advance(20_000); advance(5_000)
  jump(120_000)
  advance(5_000)
  assert.equal(socket.terminated, 1)
  assert.equal(socket.sent.length, 2)
})

for (const mode of ['callback', 'throw'] as const) test(`a heartbeat ${mode} failure terminates the socket`, t => {
  const { socket, advance } = fixture(t)
  socket.sendError = mode
  advance(20_000)
  assert.equal(socket.terminated, 1)
  advance(120_000)
  assert.equal(socket.sent.length, 1)
})

for (const mode of ['close', 'dispose'] as const) test(`${mode} clears a pending reply timer and stops heartbeat traffic`, t => {
  const { socket, stop, advance } = fixture(t)
  advance(20_000)
  if (mode === 'close') socket.emit('close')
  else stop()
  socket.callbacks[0](new Error('late send failure'))
  advance(120_000)
  assert.equal(socket.terminated, 0)
  assert.equal(socket.sent.length, 1)
  assert.equal(socket.listenerCount('message'), 0)
})

test('late send failures from an answered probe cannot terminate a newer heartbeat', t => {
  const { socket, advance } = fixture(t)
  advance(20_000)
  socket.emit('message', Buffer.from(HEARTBEAT))
  advance(20_000)
  socket.callbacks[0](new Error('late send failure'))
  assert.equal(socket.terminated, 0)
  socket.emit('message', Buffer.from(HEARTBEAT))
  advance(5_000)
  assert.equal(socket.terminated, 0)
})
