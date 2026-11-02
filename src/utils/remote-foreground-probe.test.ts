import assert from 'node:assert/strict'
import test, { type TestContext } from 'node:test'
import type { RemoteFrame } from '../../shared/remote-access.ts'
import { createRemoteForegroundProbe } from './remote-foreground-probe.ts'

function deferred<Value>() {
  let resolve!: (value: Value) => void
  const promise = new Promise<Value>(done => { resolve = done })
  return { promise, resolve }
}

function fixture(t: TestContext) {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let now = 0
  t.mock.method(performance, 'now', () => now)
  const channel = Object.assign(new EventTarget(), { bufferedAmount: 0 })
  const peer = { getStats: async () => new Map<string, Record<string, unknown>>() }
  const frames: RemoteFrame[] = []
  const transport = { forward: async (frame: RemoteFrame) => { frames.push(frame) } }
  const failed = t.mock.fn()
  const probe = createRemoteForegroundProbe(peer as unknown as RTCPeerConnection, channel as RTCDataChannel, failed)
  t.after(probe.cancel)
  return { channel, peer, frames, transport, failed, probe, tick(ms: number) { now += ms; t.mock.timers.tick(ms) } }
}

const settle = () => new Promise(resolve => setImmediate(resolve))

test('canceling queued admission ignores its late completion and removes its listener', async t => {
  const f = fixture(t), admission = deferred<void>(), stats = deferred<Map<string, Record<string, unknown>>>()
  const removed = t.mock.method(f.channel, 'removeEventListener')
  f.peer.getStats = () => stats.promise
  f.transport.forward = frame => {
    f.frames.push(frame)
    return frame.type === 'request' ? admission.promise : Promise.resolve()
  }
  f.probe.check(f.transport)
  await settle()
  f.tick(250)
  assert.equal(f.failed.mock.callCount(), 0, 'local queue waiting is not a peer failure')
  assert.deepEqual(f.frames.map(frame => frame.type), ['request', 'cancel'])
  assert.equal(removed.mock.callCount(), 1)
  f.probe.cancel()
  admission.resolve()
  stats.resolve(new Map())
  await settle()
  f.tick(1000)
  assert.equal(f.failed.mock.callCount(), 0)
  assert.equal(removed.mock.callCount(), 1, 'late callbacks cannot recreate a canceled listener or timer')
})

test('a canceled probe cannot change its replacement through late stats or an old response', async t => {
  const f = fixture(t), stats = deferred<Map<string, Record<string, unknown>>>()
  f.peer.getStats = () => stats.promise
  f.probe.check(f.transport)
  await settle()
  const oldId = f.frames[0].id
  f.probe.cancel()
  f.tick(10)
  f.peer.getStats = async () => new Map()
  f.probe.check(f.transport, true)
  await settle()
  stats.resolve(new Map([
    ['transport', { type: 'transport', selectedCandidatePairId: 'pair' }],
    ['pair', { type: 'candidate-pair', currentRoundTripTime: 3 }],
  ]))
  f.channel.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type: 'response', id: oldId, status: 200, headers: {} }) }))
  await settle()
  f.tick(249)
  assert.equal(f.failed.mock.callCount(), 0)
  f.tick(1)
  assert.equal(f.failed.mock.callCount(), 1, 'old RTT and replies cannot extend or satisfy the replacement deadline')
  f.tick(1000)
  assert.equal(f.failed.mock.callCount(), 1)
})

test('a matching response cancels the deadline even when optional RTC stats fail', async t => {
  const f = fixture(t)
  f.peer.getStats = async () => { throw new Error('stats unavailable') }
  f.probe.check(f.transport)
  f.probe.check(f.transport, true)
  await settle()
  assert.equal(f.frames.length, 1, 'foreground event bursts share one probe')
  f.tick(200)
  f.channel.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type: 'response', id: f.frames[0].id, status: 200, headers: {} }) }))
  f.tick(1000)
  assert.equal(f.failed.mock.callCount(), 0)
  assert.deepEqual(f.frames.map(frame => frame.type), ['request', 'cancel'])
})

test('reset cancels the probe and permits a fresh foreground check without the old throttle', async t => {
  const f = fixture(t)
  f.probe.check(f.transport)
  await settle()
  f.tick(10)
  f.probe.reset()
  f.probe.check(f.transport)
  await settle()
  const requests = f.frames.filter(frame => frame.type === 'request')
  assert.equal(requests.length, 2)
  assert.notEqual(requests[0].id, requests[1].id)
  f.probe.cancel()
  f.tick(1000)
  assert.equal(f.failed.mock.callCount(), 0)
})
