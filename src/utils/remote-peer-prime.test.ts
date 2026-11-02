import test, { type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { primeRemotePeer, takePrimedRemotePeer } from './remote-peer-prime.ts'

const url = 'wss://mew.example.test/central/signal?role=browser&bootstrap=1&owner=owner&name=home'
const admission = 'fixture.signed.capability'
const slot = Symbol.for('mewlink.remote-peer-prime')
const sdp = 'v=0\r\na=fingerprint:sha-256 AA:BB\r\n'
class Channel extends EventTarget {
  readyState = 'connecting'
  closes = 0
  close() { if (this.readyState === 'closed') return; this.readyState = 'closed'; this.closes++; this.dispatchEvent(new Event('close')) }
}
class Peer extends EventTarget {
  static instances: Peer[] = []
  static offer = () => Promise.resolve({ type: 'offer', sdp })
  static createChannelError = false
  connectionState = 'new'
  closes = 0
  offers = 0
  descriptions: unknown[] = []
  configuration: unknown
  channel = new Channel()
  label = ''
  options: unknown
  localDescription: unknown
  constructor(configuration: unknown) { super(); this.configuration = configuration; Peer.instances.push(this) }
  createDataChannel(label: string, options: unknown) { if (Peer.createChannelError) throw new Error('channel-failure'); this.label = label; this.options = options; return this.channel }
  createOffer() { this.offers++; return Peer.offer() }
  async setLocalDescription(value: unknown) { this.descriptions.push(value); this.localDescription = { type: 'offer', sdp: `${sdp}a=candidate:local\r\n` } }
  close() { if (this.connectionState === 'closed') return; this.connectionState = 'closed'; this.closes++; this.dispatchEvent(new Event('connectionstatechange')) }
  candidate(value: unknown) { this.dispatchEvent(Object.assign(new Event('icecandidate'), { candidate: value === null ? null : { toJSON: () => value } })) }
}

function fixture(t: TestContext) {
  const browser = new EventTarget(), values = { location: new URL('https://mew.example.test/owner/home'), window: browser, RTCPeerConnection: Peer, RTCDataChannel: Channel }
  const previous = new Map<string, PropertyDescriptor | undefined>()
  for (const [key, value] of Object.entries(values)) { previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, value }) }
  Peer.instances = []; Peer.offer = () => Promise.resolve({ type: 'offer', sdp }); Peer.createChannelError = false
  t.mock.timers.enable({ apis: ['setTimeout'] })
  t.after(() => {
    browser.dispatchEvent(new Event('pagehide'))
    for (const peer of Peer.instances) { peer.channel.close(); peer.close() }
    for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key) }
  })
  return browser
}

test('one exact controller adopts the original candidate-free offer, ordered channel and ICE FIFO once', async t => {
  const browser = fixture(t)
  const prepared = primeRemotePeer(url, admission)
  assert.equal(primeRemotePeer(url, admission), prepared)
  const peer = Peer.instances[0]!, first = { candidate: 'candidate:first', sdpMid: '0', sdpMLineIndex: 0, usernameFragment: 'fixture' }, second = { candidate: 'candidate:second' }
  peer.candidate(first); peer.candidate(null); peer.candidate(second)
  const adopted = takePrimedRemotePeer(url, admission)!
  assert.equal(adopted.descriptionPromise, prepared)
  assert.equal(Peer.instances.length, 1)
  assert.equal(adopted.peer, peer)
  assert.equal(adopted.channel, peer.channel)
  assert.equal(peer.label, 'mew-app')
  assert.deepEqual(peer.options, { ordered: true })
  assert.deepEqual(peer.configuration, { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }] })
  assert.deepEqual(await adopted.descriptionPromise, { type: 'offer', sdp })
  assert.equal(peer.offers, 1)
  assert.deepEqual(adopted.candidates, [first, second])
  assert.equal(takePrimedRemotePeer(url, admission), undefined)
  peer.candidate({ candidate: 'candidate:late' }); peer.channel.dispatchEvent(new Event('error'))
  browser.dispatchEvent(new Event('pagehide')); t.mock.timers.tick(20_000)
  assert.deepEqual(adopted.candidates, [first, second], 'prime handlers detach before controller adoption')
  assert.equal(peer.closes, 0)
  assert.equal(peer.channel.closes, 0)
})

for (const changed of ['url', 'admission']) test(`changed ${changed} cannot adopt another public endpoint`, t => {
  fixture(t); primeRemotePeer(url, admission)
  assert.throws(() => takePrimedRemotePeer(changed === 'url' ? `${url}&hint=other` : url, changed === 'admission' ? 'another.signed.capability' : admission), /연결 설정이 변경/)
  assert.equal(Peer.instances[0]!.closes, 1)
  assert.equal(Peer.instances[0]!.channel.closes, 1)
  assert.equal(takePrimedRemotePeer(url, admission), undefined)
})

test('a new configuration replaces and closes unused preparation', t => {
  fixture(t); primeRemotePeer(url, admission); primeRemotePeer(url, 'another.signed.capability')
  assert.equal(Peer.instances.length, 2)
  assert.equal(Peer.instances[0]!.closes, 1)
  assert.equal(takePrimedRemotePeer(url, 'another.signed.capability')!.peer, Peer.instances[1])
})

test('repeated priming cannot extend the ten-second expiry and page exit cancels unused preparation', t => {
  const browser = fixture(t)
  primeRemotePeer(url, admission); t.mock.timers.tick(9999); primeRemotePeer(url, admission); t.mock.timers.tick(1)
  assert.equal(Peer.instances.length, 1)
  assert.equal(Peer.instances[0]!.closes, 1)
  assert.equal(takePrimedRemotePeer(url, admission), undefined)
  primeRemotePeer(url, admission); browser.dispatchEvent(new Event('pagehide'))
  assert.equal(Peer.instances[1]!.closes, 1)
  assert.equal(Peer.instances[1]!.channel.closes, 1)
})

test('cancellation while an offer is pending never sets a local description', async t => {
  const browser = fixture(t)
  let resolve!: (value: { type: string; sdp: string }) => void
  Peer.offer = () => new Promise(complete => { resolve = complete })
  primeRemotePeer(url, admission)
  browser.dispatchEvent(new Event('pagehide')); resolve({ type: 'offer', sdp })
  await Promise.resolve(); await Promise.resolve()
  assert.equal(Peer.instances[0]!.descriptions.length, 0)
  assert.equal(takePrimedRemotePeer(url, admission), undefined)
})

test('an adopted pending offer completes under its controller ownership', async t => {
  const browser = fixture(t)
  let resolve!: (value: { type: string; sdp: string }) => void
  Peer.offer = () => new Promise(complete => { resolve = complete })
  primeRemotePeer(url, admission)
  const adopted = takePrimedRemotePeer(url, admission)!
  browser.dispatchEvent(new Event('pagehide')); t.mock.timers.tick(20_000)
  resolve({ type: 'offer', sdp })
  assert.deepEqual(await adopted.descriptionPromise, { type: 'offer', sdp })
  assert.equal(Peer.instances[0]!.closes, 0)
})

test('more than 128 candidates closes unused ICE state rather than growing its FIFO', t => {
  fixture(t); primeRemotePeer(url, admission)
  for (let index = 0; index < 129; index++) Peer.instances[0]!.candidate({ candidate: `candidate:${index}` })
  assert.equal(takePrimedRemotePeer(url, admission), undefined)
  assert.equal(Peer.instances[0]!.closes, 1)
})

for (const value of [{ candidate: 'a'.repeat(4097) }, { candidate: '가'.repeat(1400) }, { candidate: 42 }, { candidate: 'candidate:x', sdpMLineIndex: -1 }]) test('invalid or over-4KiB candidates cancel unused preparation: ' + JSON.stringify(value).slice(0, 60), t => {
  fixture(t); primeRemotePeer(url, admission); Peer.instances[0]!.candidate(value)
  assert.equal(Peer.instances[0]!.closes, 1)
  assert.equal(takePrimedRemotePeer(url, admission), undefined)
})

for (const cause of ['peer', 'channel']) test(`${cause} failure cancels unused public preparation`, t => {
  fixture(t); primeRemotePeer(url, admission)
  const peer = Peer.instances[0]!
  if (cause === 'peer') { peer.connectionState = 'failed'; peer.dispatchEvent(new Event('connectionstatechange')) }
  else peer.channel.dispatchEvent(new Event('error'))
  assert.equal(peer.closes, 1)
  assert.equal(peer.channel.closes, 1)
  assert.equal(takePrimedRemotePeer(url, admission), undefined)
})

test('native offer and channel creation failures release unused endpoints', async t => {
  fixture(t)
  Peer.createChannelError = true
  assert.throws(() => primeRemotePeer(url, admission), /channel-failure/)
  assert.equal(Peer.instances[0]!.closes, 1)
  Peer.createChannelError = false; Peer.offer = () => Promise.reject(new Error('offer-failure'))
  primeRemotePeer(url, admission)
  await Promise.resolve(); await Promise.resolve()
  assert.equal(Peer.instances[1]!.closes, 1)
  assert.equal(takePrimedRemotePeer(url, admission), undefined)
})

test('malformed shared slots and candidate accessors are rejected without invoking their getters or callbacks', t => {
  fixture(t); primeRemotePeer(url, admission)
  const entry = Object.getOwnPropertyDescriptor(window, slot)!.value
  let called = false
  entry.candidates.push(Object.defineProperty({}, 'candidate', { get() { called = true; throw new Error('candidate-getter') } }))
  assert.equal(takePrimedRemotePeer(url, admission), undefined)
  assert.equal(called, false)
  assert.equal(Peer.instances[0]!.closes, 1)
  const foreign = new Peer({})
  Object.defineProperty(window, slot, { configurable: true, value: { version: 2, peer: foreign, channel: foreign.channel, dispose() { called = true } } })
  assert.equal(takePrimedRemotePeer(url, admission), undefined)
  assert.equal(called, false)
  assert.equal(foreign.closes, 1)
  Object.defineProperty(window, slot, { configurable: true, get() { called = true; throw new Error('slot-getter') } })
  primeRemotePeer(url, admission)
  assert.equal(called, false)
  assert.ok(takePrimedRemotePeer(url, admission))
})

test('prototype impostors and indexed candidate getters do not cross the shared slot', t => {
  fixture(t); primeRemotePeer(url, admission)
  const entry = Object.getOwnPropertyDescriptor(window, slot)!.value
  let called = false
  Object.defineProperty(entry.candidates, '0', { configurable: true, get() { called = true; throw new Error('indexed-getter') } })
  assert.equal(takePrimedRemotePeer(url, admission), undefined)
  assert.equal(called, false)
  primeRemotePeer(url, admission)
  const next = Object.getOwnPropertyDescriptor(window, slot)!.value
  Object.setPrototypeOf(next, { privateKey: 'not-owned' })
  assert.equal(takePrimedRemotePeer(url, admission), undefined)
  assert.equal(Peer.instances[1]!.closes, 1)
})

test('preparation stores only public endpoint state and performs no authentication or network signaling', t => {
  fixture(t); primeRemotePeer(url, admission)
  const entry = Object.getOwnPropertyDescriptor(window, slot)!.value
  assert.deepEqual(Object.keys(entry).sort(), ['admission', 'candidates', 'channel', 'descriptionPromise', 'dispose', 'failed', 'peer', 'url', 'version'])
  assert.equal(entry.session, undefined)
  assert.equal(entry.keyPair, undefined)
  assert.equal(entry.socket, undefined)
})

for (const target of ['wss://other.example.test/central/signal?role=browser&bootstrap=1', 'ws://mew.example.test/central/signal?role=browser&bootstrap=1', 'wss://mew.example.test/api/workspace?role=browser&bootstrap=1']) test('only the same-origin bootstrap endpoint may prepare public ICE: ' + target, t => {
  fixture(t); assert.throws(() => primeRemotePeer(target, admission), /주소 설정/); assert.equal(Peer.instances.length, 0)
})
