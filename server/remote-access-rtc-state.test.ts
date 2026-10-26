import test, { type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { EventEmitter } from 'node:events'
import { Script } from 'node:vm'
import { createWslLoopbackCandidate } from './remote-access-ice.ts'

function fixture(t: TestContext, start = true, wsl = false) {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let state: (value: string) => void = () => {}, closes = 0, cleaned = 0, constructed = 0, descriptions = 0, mappings = 0, warmClosed = 0
  const candidates: string[] = [], messages: Record<string, any>[] = [], configurations: Record<string, any>[] = []
  const warmChannels: Record<string, any>[] = [], mapped: string[] = []
  class Peer {
    constructor(_name: string, config: Record<string, any>) { constructed++; configurations.push(config) }
    onLocalDescription() {}
    onLocalCandidate() {}
    onDataChannel() {}
    onStateChange(callback: typeof state) { state = callback }
    createDataChannel(label: string, options: Record<string, any>) { warmChannels.push({ label, ...options }); return { close() { warmClosed++ } } }
    localDescription() { return { sdp: 'a=mid:0\r\na=candidate:warmed 1 UDP 2122317823 192.168.50.2 55001 typ host\r\n' } }
    setRemoteDescription() { descriptions++ }
    addRemoteCandidate(candidate: string) { candidates.push(candidate) }
    close() { closes++; state('closed') }
  }
  const process = Object.assign(new EventEmitter(), { connected: true, send(value: Record<string, any>) { messages.push(value) }, disconnect(this: EventEmitter & { connected: boolean }) { this.connected = false; this.emit('disconnect') } })
  const source = fs.readFileSync(new URL('./remote-access-rtc.mjs', import.meta.url), 'utf8').replace(/^import .+\n/gm, '')
  new Script(source, { filename: 'remote-access-rtc.mjs' }).runInNewContext({
    rtc: { PeerConnection: Peer, cleanup() { cleaned++ } }, createWslLoopbackCandidate: () => wsl ? createWslLoopbackCandidate('microsoft') : () => undefined,
    nativeConnectivity: () => { mappings++; return { candidate(candidate: string) { mapped.push(candidate) }, connected() {}, close() {} } }, publicV4: () => false, isIP: () => 0,
    process, Buffer, Date, setTimeout, clearTimeout, setInterval: () => 1, clearInterval() {},
  })
  if (start) process.emit('message', { type: 'start', stun: [], sdp: 'fixture' })
  t.after(() => process.emit('message', { type: 'close' }))
  return { state: (value: string) => state(value), closed: () => closes, cleaned: () => cleaned, constructed: () => constructed, descriptions: () => descriptions, mappings: () => mappings, warmClosed: () => warmClosed, candidates, mapped, warmChannels, configurations, messages, process }
}

test('native standby pregathers one private ICE peer without remote SDP or router mappings until start', t => {
  const h = fixture(t, false)
  h.process.emit('message', { type: 'prewarm', stun: [] })
  h.process.emit('message', { type: 'prewarm', stun: [] })
  assert.equal(h.constructed(), 1)
  assert.equal(h.descriptions(), 0)
  assert.equal(h.mappings(), 0)
  assert.deepEqual(h.warmChannels, [{ label: 'mew-warmup', negotiated: true, id: 1022 }])
  assert.equal(h.messages.some(value => value.type === 'candidate' || value.type === 'answer'), false)
  assert.equal(h.configurations[0].disableFingerprintVerification, undefined)
  assert.equal(h.configurations[0].portRangeBegin, 55000)
  assert.equal(h.configurations[0].portRangeEnd, 55031)
  const candidate = 'candidate:fixture 1 UDP 2122317823 192.168.50.2 55001 typ host'
  h.process.emit('message', { type: 'candidate', candidate: { candidate, sdpMid: '0' } })
  assert.equal(h.candidates.length, 0)
  h.process.emit('message', { type: 'start', stun: [], sdp: 'fixture' })
  h.process.emit('message', { type: 'start', stun: [], sdp: 'fixture' })
  assert.equal(h.constructed(), 1)
  assert.equal(h.descriptions(), 1)
  assert.equal(h.mappings(), 1)
  assert.equal(h.warmClosed(), 1)
  assert.deepEqual(h.mapped, ['candidate:warmed 1 UDP 2122317823 192.168.50.2 55001 typ host'])
  assert.equal(h.messages.some(value => value.type === 'candidate'), false, 'candidates already carried by the signed answer do not get sent twice')
  assert.deepEqual(h.candidates, [candidate])
})

test('native standby closes when start changes its prewarmed ICE configuration', async t => {
  const h = fixture(t, false)
  h.process.emit('message', { type: 'prewarm', stun: ['stun:stun.cloudflare.com:3478'] })
  h.process.emit('message', { type: 'start', stun: [], sdp: 'fixture' })
  assert.equal(h.descriptions(), 0)
  assert.equal(h.messages.filter(value => value.type === 'error').length, 1)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(h.closed(), 1)
  assert.equal(h.cleaned(), 1)
})

test('pregathered WSL host candidates still derive the scoped loopback path only after actual start', t => {
  const h = fixture(t, false, true)
  h.process.emit('message', { type: 'prewarm', stun: [] })
  assert.equal(h.messages.some(value => value.type === 'candidate'), false)
  h.process.emit('message', { type: 'start', stun: [], sdp: 'fixture' })
  const candidates = h.messages.filter(value => value.type === 'candidate')
  assert.equal(candidates.length, 1)
  assert.match(candidates[0].candidate.candidate, /^candidate:mewloopback 1 UDP \d+ 127\.0\.0\.1 55001 typ host$/)
  assert.equal(candidates[0].candidate.sdpMid, '0')
})

test('cancelling an unused native helper closes its warm channel and ICE socket without a router mapping', t => {
  const h = fixture(t, false)
  h.process.emit('message', { type: 'prewarm', stun: [] })
  h.process.emit('message', { type: 'close' })
  h.process.emit('message', { type: 'start', stun: [], sdp: 'late-offer' })
  assert.equal(h.warmClosed(), 1)
  assert.equal(h.closed(), 1)
  assert.equal(h.cleaned(), 1)
  assert.equal(h.descriptions(), 0)
  assert.equal(h.mappings(), 0)
  assert.equal(h.process.connected, false)
})

test('native RTC keeps a temporarily disconnected peer alive and cancels its recovery timeout', t => {
  const h = fixture(t)
  h.state('connected'); h.state('disconnected')
  assert.equal(h.closed(), 0)
  t.mock.timers.tick(14_999)
  h.state('connected')
  t.mock.timers.tick(15_000)
  assert.equal(h.closed(), 0)
  assert.equal(h.process.connected, true)
})

test('native RTC ends a persistent disconnect once after the original deadline', async t => {
  const h = fixture(t)
  h.state('disconnected')
  t.mock.timers.tick(10_000)
  h.state('disconnected')
  t.mock.timers.tick(5000)
  assert.equal(h.closed(), 1)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(h.cleaned(), 1)
  assert.equal(h.process.connected, false)
})

for (const cause of ['failed', 'closed', 'parent']) {
  test(`native RTC ${cause} closes immediately during the recovery window`, async t => {
    const h = fixture(t)
    h.state('disconnected')
    if (cause === 'parent') h.process.emit('message', { type: 'close' }); else h.state(cause)
    assert.equal(h.closed(), 1)
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(h.cleaned(), 1)
    t.mock.timers.tick(15_000)
    assert.equal(h.closed(), 1)
  })
}
