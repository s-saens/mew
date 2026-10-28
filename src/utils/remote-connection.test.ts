import test, { type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { importJWK, SignJWT, type JWK } from 'jose'
import { remoteKeyPair } from '../../shared/remote-access-crypto.ts'
import { REMOTE_TOKEN_CLOCK_TOLERANCE } from '../../shared/remote-access.ts'
import { bootstrapRemoteConnection, connectRemote } from './remote-connection.ts'
import type { RemoteBootstrapContext, RemoteConnectionTarget } from '../../shared/remote-bootstrap.ts'
import { activeRemoteTransport } from './remote-transport.ts'

class FakeChannel extends EventTarget {
  readyState = 'open'
  bufferedAmount = 0
  sent: string[] = []
  onopen?: () => void
  onclose?: () => void
  send(value: string) { this.sent.push(value) }
  message(value: unknown) { this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(value) })) }
  close() { if (this.readyState === 'closed') return; this.readyState = 'closed'; this.dispatchEvent(new Event('close')); this.onclose?.() }
}
const fingerprint = Array(32).fill('AB').join(':')
const sdp = `v=0\r\na=fingerprint:sha-256 ${fingerprint}\r\n`
class FakePeer {
  static latest: FakePeer
  connectionState = 'new'
  remoteDescription?: { type: string; sdp: string }
  async setRemoteDescription(value: { type: string; sdp: string }) { this.remoteDescription = value }
  channel = new FakeChannel()
  onconnectionstatechange?: () => void
  onicecandidate?: (event: { candidate: { candidate: string; toJSON(): RTCIceCandidateInit } }) => void
  constructor() { FakePeer.latest = this }
  createDataChannel() { return this.channel }
  async createOffer() { return { type: 'offer', sdp } }
  async setLocalDescription() {}
  state(value: string) { this.connectionState = value; this.onconnectionstatechange?.() }
  close() { this.state('closed') }
  candidate(index: number) { const candidate = { candidate: `candidate:fixture-${index} 1 udp 1 192.0.2.1 5000 typ host`, sdpMid: '0' }; this.onicecandidate?.({ candidate: { ...candidate, toJSON: () => candidate } }) }
}
class FakeSignal {
  static OPEN = 1
  static latest: FakeSignal
  readyState = 1
  sent: { type: string }[] = []
  onmessage?: (event: { data: string }) => void
  onerror?: () => void
  onclose?: (event?: { code: number }) => void
  url: string
  protocols?: string | string[]
  constructor(url: string, protocols?: string | string[]) { this.url = url; this.protocols = protocols; FakeSignal.latest = this }
  send(value: string) { this.sent.push(JSON.parse(value)) }
  close(code = 1006) { if (this.readyState === 3) return; this.readyState = 3; this.onclose?.({ code }) }
}
function fixture(t: TestContext, authenticated = true, options: Parameters<typeof connectRemote>[2] = {}, centralKey: JWK | ((signal: AbortSignal) => Promise<Response>) = {}, bootstrap?: { target: RemoteConnectionTarget; identity?: boolean; admission?: string }) {
  const browser = new EventTarget(), document = Object.assign(new EventTarget(), { visibilityState: 'visible' })
  const values = { RTCPeerConnection: FakePeer, WebSocket: FakeSignal, location: { origin: 'https://app.example.test' }, window: browser, document }
  const previous = new Map<string, PropertyDescriptor | undefined>()
  for (const [key, value] of Object.entries(values)) { previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, value }) }
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1_900_000_000_000 })
  const states: string[] = [], errors: (string | undefined)[] = []
  let keyRequests = 0
  let keySignal: AbortSignal | null = null
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
    keyRequests++
    keySignal = init?.signal ?? null
    return typeof centralKey === 'function' ? centralKey(keySignal!) : Response.json(centralKey)
  })
  const observe = (state: string, error?: string) => { states.push(state); if (state === 'error') errors.push(error) }
  const pending = bootstrap && bootstrapRemoteConnection(bootstrap.target, { identity: bootstrap.identity, admission: bootstrap.admission })
  const close = pending?.close ?? connectRemote('instance', observe, options)
  t.after(() => { close(); for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key) } })
  const peer = FakePeer.latest, signal = FakeSignal.latest
  if (authenticated) { peer.state('connected'); peer.channel.message({ type: 'authenticated', protocol: 1 }); assert.equal(states.at(-1), 'connected') }
  return { peer, signal, states, errors, browser, document, close, pending, observe, keyRequests: () => keyRequests, keySignal: () => keySignal }
}

test('a subsecond interruption preserves the transport without showing recovery or repeating connected', t => {
  const { peer, states } = fixture(t), transport = activeRemoteTransport()
  peer.state('disconnected')
  assert.equal(peer.channel.readyState, 'open')
  assert.equal(activeRemoteTransport(), transport)
  t.mock.timers.tick(999)
  assert.deepEqual(states, ['connected'])
  peer.state('connected')
  t.mock.timers.tick(5000)
  assert.equal(peer.channel.readyState, 'open')
  assert.equal(activeRemoteTransport(), transport)
  assert.deepEqual(states, ['connected'])
})

test('a longer interruption shows recovery after one second and keeps the same transport when it recovers', t => {
  const { peer, signal, states } = fixture(t), transport = activeRemoteTransport(), sent = peer.channel.sent.length
  const renewals = () => signal.sent.filter(value => value.type === 'renew').length
  const before = renewals()
  peer.state('disconnected')
  t.mock.timers.tick(1000)
  assert.deepEqual(states, ['connected', 'reconnecting'])
  assert.equal(activeRemoteTransport(), transport)
  t.mock.timers.tick(3999)
  peer.state('connected')
  t.mock.timers.tick(5000)
  assert.equal(peer.channel.readyState, 'open')
  assert.equal(activeRemoteTransport(), transport)
  assert.deepEqual(states, ['connected', 'reconnecting', 'connected'])
  assert.equal(renewals(), before + 1, 'recovery refreshes the authorization on the existing connection')
  assert.equal(peer.channel.sent.length, sent, 'recovery cannot replay authentication or application writes')
})

test('a pending write completes on its original transport after a two second interruption without replay', async t => {
  const { peer, states } = fixture(t), transport = activeRemoteTransport()!
  const pending = transport.fetch('/api/files', { method: 'POST', body: 'unsaved draft' })
  const frames = () => peer.channel.sent.map(value => JSON.parse(value) as { type: string; id: string; path?: string })
  await until(() => frames().some(frame => frame.type === 'end'))
  const request = frames().find(frame => frame.type === 'request')!
  const sent = peer.channel.sent.length
  peer.state('disconnected')
  t.mock.timers.tick(2000)
  assert.equal(activeRemoteTransport(), transport)
  assert.equal(transport.requests.size, 1, 'a transient disconnect cannot cancel an in-flight write')
  peer.state('connected')
  peer.channel.message({ type: 'response', id: request.id, status: 204, headers: {} })
  peer.channel.message({ type: 'end', id: request.id })
  assert.equal((await pending).status, 204)
  assert.equal(frames().filter(frame => frame.type === 'request' && frame.path === '/api/files').length, 1)
  assert.equal(peer.channel.sent.length, sent, 'the original write is neither replaced nor sent again')
  assert.deepEqual(states, ['connected', 'reconnecting', 'connected'])
})

test('repeated disconnected events cannot extend the bounded recovery deadline', t => {
  const { peer, states } = fixture(t)
  peer.state('disconnected')
  t.mock.timers.tick(1000)
  peer.state('disconnected')
  t.mock.timers.tick(3999)
  assert.equal(peer.channel.readyState, 'open')
  assert.equal(states.filter(state => state === 'reconnecting').length, 1)
  peer.state('disconnected')
  t.mock.timers.tick(1)
  assert.equal(peer.channel.readyState, 'closed')
  assert.equal(activeRemoteTransport(), null)
  assert.equal(states.filter(state => state === 'error').length, 1)
})

test('each recovered interruption gets a fresh grace period and cancels its previous notice', t => {
  const { peer, states } = fixture(t), transport = activeRemoteTransport()
  peer.state('disconnected')
  t.mock.timers.tick(600)
  peer.state('connected')
  peer.state('disconnected')
  t.mock.timers.tick(999)
  assert.deepEqual(states, ['connected'])
  t.mock.timers.tick(1)
  assert.deepEqual(states, ['connected', 'reconnecting'])
  t.mock.timers.tick(3999)
  assert.equal(activeRemoteTransport(), transport)
  peer.state('connected')
  t.mock.timers.tick(5000)
  assert.equal(activeRemoteTransport(), transport)
  assert.deepEqual(states, ['connected', 'reconnecting', 'connected'])
})

test('disposing a connection during silent recovery cancels its pending notice and deadline', t => {
  const { peer, states, close } = fixture(t)
  peer.state('disconnected')
  t.mock.timers.tick(500)
  close()
  t.mock.timers.tick(10_000)
  assert.deepEqual(states, ['connected'])
  assert.equal(activeRemoteTransport(), null)
})

for (const cause of ['failed', 'closed', 'signaling', 'channel']) {
  test(`${cause} still terminates immediately during recovery`, t => {
    const { peer, signal, states } = fixture(t)
    peer.state('disconnected')
    if (cause === 'signaling') signal.close()
    else if (cause === 'channel') peer.channel.close()
    else peer.state(cause)
    assert.equal(peer.channel.readyState, 'closed')
    assert.equal(states.filter(state => state === 'error').length, 1)
    t.mock.timers.tick(5000)
    assert.equal(states.includes('reconnecting'), false, 'termination cannot leave a late recovery notice')
  })
}

test('returning to the foreground immediately renews the existing authorization and cleanup removes listeners', t => {
  const { browser, document, signal, close } = fixture(t)
  const count = () => signal.sent.filter(value => value.type === 'renew').length
  const initial = count()
  document.visibilityState = 'hidden'; document.dispatchEvent(new Event('visibilitychange'))
  assert.equal(count(), initial)
  document.visibilityState = 'visible'; document.dispatchEvent(new Event('visibilitychange'))
  assert.equal(count(), initial + 1)
  browser.dispatchEvent(new Event('pageshow'))
  assert.equal(count(), initial + 2)
  browser.dispatchEvent(new Event('online'))
  assert.equal(count(), initial + 3)
  close()
  browser.dispatchEvent(new Event('pageshow')); document.dispatchEvent(new Event('visibilitychange'))
  assert.equal(count(), initial + 3)
})

async function until(done: () => boolean) {
  const deadline = performance.now() + 1000
  while (performance.now() < deadline) { if (done()) return; await new Promise(resolve => setImmediate(resolve)) }
  assert.fail('Signaling did not finish')
}

test('offer preparation overlaps signaling latency and cannot send a connect before the challenge', async t => {
  let offers = 0, prepared = false
  t.mock.method(FakePeer.prototype, 'createOffer', async () => {
    offers++
    await new Promise(resolve => setTimeout(resolve, 180))
    return { type: 'offer', sdp }
  })
  t.mock.method(FakePeer.prototype, 'setLocalDescription', async () => { prepared = true })
  const { signal, errors } = fixture(t, false)
  const start = Date.now()
  assert.equal(offers, 1, 'ICE preparation starts while the WebSocket is still negotiating')
  t.mock.timers.tick(180)
  await until(() => prepared)
  assert.equal(signal.sent.length, 0, 'local preparation cannot authorize a connection')
  t.mock.timers.tick(20)
  signal.onmessage?.({ data: JSON.stringify({ type: 'challenge', protocol: 1 }) })
  await until(() => signal.sent.length > 0 || errors.length > 0)
  assert.deepEqual(errors, [])
  assert.equal(signal.sent[0].type, 'connect')
  assert.equal(offers, 1)
  assert.equal(Date.now() - start, 200, '180ms preparation is hidden inside the 200ms signaling handshake')
})

test('closing during offer preparation prevents late peer mutations and signaling', async t => {
  let release!: () => void, applied = false
  t.mock.method(FakePeer.prototype, 'createOffer', async () => {
    await new Promise<void>(resolve => { release = resolve })
    return { type: 'offer', sdp }
  })
  t.mock.method(FakePeer.prototype, 'setLocalDescription', async () => { applied = true })
  const { signal, close, errors } = fixture(t, false)
  signal.onmessage?.({ data: JSON.stringify({ type: 'challenge', protocol: 1 }) })
  close()
  release()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(applied, false)
  assert.deepEqual(signal.sent, [])
  assert.deepEqual(errors, [])
})

test('public key export overlaps a pending offer but connect still requires both preparations', async t => {
  const keyPair = await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify'])
  const exportKey = crypto.subtle.exportKey.bind(crypto.subtle)
  let release!: () => void, exported = false
  t.mock.method(FakePeer.prototype, 'createOffer', async () => { await new Promise<void>(resolve => { release = resolve }); return { type: 'offer', sdp } })
  t.mock.method(crypto.subtle, 'exportKey', async (...args: Parameters<typeof exportKey>) => { const value = await Reflect.apply(exportKey, crypto.subtle, args); exported = true; return value })
  const { signal, errors } = fixture(t, false, { keyPair })
  signal.onmessage?.({ data: JSON.stringify({ type: 'challenge', protocol: 1 }) })
  await until(() => exported)
  assert.deepEqual(signal.sent, [], 'an exported key cannot replace the still pending offer')
  release()
  await until(() => signal.sent.length > 0 || errors.length > 0)
  assert.deepEqual(errors, [])
  assert.equal(signal.sent[0].type, 'connect')
})

test('closing during public key export prevents a late connect after both preparations finish', async t => {
  const keyPair = await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify']), publicKey = await crypto.subtle.exportKey('jwk', keyPair.publicKey)
  let release!: (value: JWK) => void
  t.mock.method(crypto.subtle, 'exportKey', () => new Promise<JWK>(resolve => { release = resolve }))
  const { signal, close, errors } = fixture(t, false, { keyPair })
  signal.onmessage?.({ data: JSON.stringify({ type: 'challenge', protocol: 1 }) })
  await until(() => !!release)
  close(); release(publicKey)
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(signal.sent, [])
  assert.deepEqual(errors, [])
})

test('local ICE candidates follow connect immediately in FIFO order before the ticket without authorizing the transport', async t => {
  const { peer, signal, errors } = fixture(t, false)
  peer.candidate(1); peer.candidate(2)
  assert.deepEqual(signal.sent, [], 'public preparation cannot send before the challenge')
  signal.onmessage?.({ data: JSON.stringify({ type: 'challenge', protocol: 1 }) })
  await until(() => signal.sent.length >= 3 || errors.length > 0)
  peer.candidate(3)
  assert.deepEqual(signal.sent.map(value => value.type), ['connect', 'candidate', 'candidate', 'candidate'])
  assert.deepEqual(signal.sent.slice(1).map(value => (value as unknown as { candidate: RTCIceCandidateInit }).candidate.candidate), [1, 2, 3].map(index => `candidate:fixture-${index} 1 udp 1 192.0.2.1 5000 typ host`))
  assert.equal(activeRemoteTransport(), null)
  assert.equal(peer.remoteDescription, undefined)
  assert.deepEqual(peer.channel.sent, [])
  assert.deepEqual(errors, [])
})

test('the early ICE burst reserves one of the central queue slots for connect and releases its bounded remainder only after a verified ticket', async t => {
  const central = await remoteKeyPair(), host = await remoteKeyPair()
  const { peer, signal, errors } = fixture(t, false, {}, central.publicKey)
  for (let index = 0; index < 128; index++) peer.candidate(index)
  signal.onmessage?.({ data: JSON.stringify({ type: 'challenge', protocol: 1 }) })
  await until(() => signal.sent.length === 128 || errors.length > 0)
  for (let index = 128; index < 132; index++) peer.candidate(index)
  assert.equal(signal.sent.length, 128, 'connect plus queued and live early candidates cannot exceed the 128-message admission queue')
  assert.equal(signal.sent.filter(value => value.type === 'candidate').length, 127)
  const claims = { connection: 'connection', challenge: 'challenge', generation: 'generation', fingerprint, authMode: 'local', instanceKey: host.publicKey }
  const ticket = await new SignJWT(claims).setProtectedHeader({ alg: 'EdDSA' }).setIssuer('https://app.example.test').setAudience('instance').setSubject('connection-subject').setJti('early-candidates').setIssuedAt().setExpirationTime('60s').sign(await importJWK(central.privateKey, 'EdDSA'))
  signal.onmessage?.({ data: JSON.stringify({ type: 'ticket', connection: 'connection', ticket }) })
  await until(() => signal.sent.length === 133 || errors.length > 0)
  assert.deepEqual(errors, [])
  assert.equal(signal.sent.filter(value => value.type === 'candidate').length, 132)
  assert.equal(activeRemoteTransport(), null, 'a valid ticket still does not bypass peer authentication')
})

test('cancelled negotiation cannot emit a late ICE candidate or release queued preparation', async t => {
  const { peer, signal, close, errors } = fixture(t, false)
  peer.candidate(1)
  close(); peer.candidate(2)
  signal.onmessage?.({ data: JSON.stringify({ type: 'challenge', protocol: 1 }) })
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(signal.sent, [])
  assert.deepEqual(errors, [])
})

test('preparation failures are held until the signaling challenge and reported once', async t => {
  t.mock.method(FakePeer.prototype, 'createOffer', async () => { throw new Error('fixture-offer-failed') })
  const { signal, errors } = fixture(t, false)
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(errors, [])
  signal.onmessage?.({ data: JSON.stringify({ type: 'challenge', protocol: 1 }) })
  await until(() => errors.length > 0)
  assert.deepEqual(errors, ['fixture-offer-failed'])
  assert.deepEqual(signal.sent, [])
})

test('central renewal requests work in hidden tabs without running the browser interval', async t => {
  const { signal, document, close, errors } = fixture(t)
  document.visibilityState = 'hidden'
  const count = () => signal.sent.filter(value => value.type === 'renew').length
  const initial = count()
  signal.onmessage?.({ data: JSON.stringify({ type: 'renew', connection: '' }) })
  await until(() => count() > initial || errors.length > 0)
  assert.deepEqual(errors, [])
  assert.equal(count(), initial + 1)
  close()
  signal.onmessage?.({ data: JSON.stringify({ type: 'renew', connection: '' }) })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(count(), initial + 1)
})

test('renewal requests cannot cross connection boundaries', async t => {
  const { signal, errors, peer } = fixture(t)
  signal.onmessage?.({ data: JSON.stringify({ type: 'renew', connection: 'another-connection' }) })
  await until(() => errors.length > 0)
  assert.equal(peer.channel.readyState, 'closed')
})

test('a saved local bearer is sent only on the first peer authentication, outside browser signaling', async t => {
  const central = await remoteKeyPair(), host = await remoteKeyPair()
  const session = 's'.repeat(43), { peer, signal, errors, keyRequests } = fixture(t, false, { launch: 'one-time-launch', session }, central.publicKey)
  assert.equal(keyRequests(), 1, 'key preparation starts before the signaling challenge')
  assert.match(signal.url, /[?&]role=browser(?:&|$)/)
  signal.onmessage?.({ data: JSON.stringify({ type: 'challenge', protocol: 1 }) })
  await until(() => signal.sent.length > 0 || errors.length > 0)
  assert.equal(errors.length, 0)
  assert.equal(JSON.stringify(signal.sent).includes(session), false)
  const claims = { connection: 'connection', challenge: 'challenge', generation: 'generation', fingerprint, authMode: 'local', instanceKey: host.publicKey }
  const ticket = await new SignJWT(claims).setProtectedHeader({ alg: 'EdDSA' }).setIssuer('https://app.example.test').setAudience('instance').setSubject('connection-subject').setJti('fixture').setIssuedAt().setExpirationTime('60s').sign(await importJWK(central.privateKey, 'EdDSA'))
  signal.onmessage?.({ data: JSON.stringify({ type: 'ticket', connection: 'connection', ticket }) })
  await until(() => peer.channel.sent.length > 0 || errors.length > 0)
  assert.equal(errors.length, 0)
  const authentication = JSON.parse(peer.channel.sent[0])
  assert.equal(authentication.type, 'authenticate')
  assert.equal(authentication.session, session)
  assert.equal(keyRequests(), 1, 'the ticket reuses the key prepared during negotiation')
  assert.equal((signal.sent[0] as Record<string, unknown>).serverRenewal, true)
  const count = () => signal.sent.filter(value => value.type === 'renew').length
  signal.onmessage?.({ data: JSON.stringify({ type: 'renew', connection: 'connection' }) })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(count(), 0, 'a slow RTC handshake must not renew before peer authentication')
  assert.deepEqual(errors, [])
  peer.channel.message({ type: 'authenticated', protocol: 1 })
  const initial = count()
  signal.onmessage?.({ data: JSON.stringify({ type: 'renew', connection: 'connection' }) })
  await until(() => count() > initial || errors.length > 0)
  assert.deepEqual(errors, [])
  assert.equal(count(), initial + 1)
})

for (const issuer of ['https://mew.run', 'https://mew.saens.kr', 'https://other.example.test']) {
  test(`a migrated browser only accepts its launch response's configured ticket issuers: ${issuer}`, async t => {
    const central = await remoteKeyPair(), host = await remoteKeyPair()
    const { peer, signal, errors } = fixture(t, false, { centralOrigin: 'https://mew.run', ticketIssuers: ['https://mew.run', 'https://mew.saens.kr'] }, central.publicKey)
    signal.onmessage?.({ data: JSON.stringify({ type: 'challenge', protocol: 1 }) })
    await until(() => signal.sent.length > 0 || errors.length > 0)
    const ticket = await new SignJWT({ connection: 'connection', challenge: 'challenge', generation: 'generation', fingerprint, authMode: 'local', instanceKey: host.publicKey }).setProtectedHeader({ alg: 'EdDSA' }).setIssuer(issuer).setAudience('instance').setSubject('connection-subject').setJti('migration-fixture').setIssuedAt().setExpirationTime('60s').sign(await importJWK(central.privateKey, 'EdDSA'))
    signal.onmessage?.({ data: JSON.stringify({ type: 'ticket', connection: 'connection', ticket }) })
    await until(() => peer.channel.sent.length > 0 || errors.length > 0)
    assert.equal(errors.length, issuer === 'https://other.example.test' ? 1 : 0)
    assert.equal(peer.channel.sent.length, issuer === 'https://other.example.test' ? 0 : 1)
  })
}
for (const stage of ['ticket', 'answer']) for (const skew of [1, REMOTE_TOKEN_CLOCK_TOLERANCE, REMOTE_TOKEN_CLOCK_TOLERANCE + 1, -63]) {
  test(`browser ${stage} verification enforces the clock tolerance with a ${skew}s clock offset`, async t => {
    const central = await remoteKeyPair(), host = await remoteKeyPair()
    const { peer, signal, states, errors } = fixture(t, false, {}, central.publicKey)
    signal.onmessage?.({ data: JSON.stringify({ type: 'challenge', protocol: 1 }) })
    await until(() => signal.sent.length > 0 || errors.length > 0)
    assert.equal(signal.sent[0]?.type, 'connect')
    const now = Math.floor(Date.now() / 1000)
    const sign = async (issuer: string, audience: string, sub: string, claims: Record<string, unknown>, key: typeof central.privateKey, offset: number) => new SignJWT(claims).setProtectedHeader({ alg: 'EdDSA' }).setIssuer(issuer).setAudience(audience).setSubject(sub).setJti('fixture').setIssuedAt(now + offset).setExpirationTime(now + offset + 60).sign(await importJWK(key, 'EdDSA'))
    const bound = { connection: 'connection', challenge: 'challenge', generation: 'generation', fingerprint }
    const ticket = await sign('https://app.example.test', 'instance', 'account', { ...bound, authMode: 'local', instanceKey: host.publicKey }, central.privateKey, stage === 'ticket' ? skew : 0)
    signal.onmessage?.({ data: JSON.stringify({ type: 'ticket', connection: 'connection', ticket }) })
    await until(() => peer.channel.sent.length > 0 || errors.length > 0)
    if (stage === 'answer') {
      assert.equal(errors.length, 0)
      const proof = await sign('mew-instance', 'connection', 'instance', bound, host.privateKey, skew)
      signal.onmessage?.({ data: JSON.stringify({ type: 'answer', connection: 'connection', sdp, proof }) })
      await until(() => peer.remoteDescription !== undefined || errors.length > 0)
    }
    if (skew > REMOTE_TOKEN_CLOCK_TOLERANCE || skew === -63) {
      assert.equal(states.at(-1), 'error')
      assert.match(errors[0]!, skew === -63 ? /exp/ : /날짜와 시간을 자동으로 동기화/)
      assert.equal(peer.remoteDescription, undefined)
    } else {
      assert.equal(errors.length, 0)
      assert.equal(peer.channel.readyState, 'open')
      if (stage === 'answer') assert.equal(peer.remoteDescription?.sdp, sdp)
    }
  })
}

test('closing a connection cancels pending key preparation without surfacing a late error', async t => {
  let cancelled = false
  const pending = (signal: AbortSignal) => new Promise<Response>((_resolve, reject) => {
    signal.addEventListener('abort', () => { cancelled = true; reject(new DOMException('Cancelled', 'AbortError')) }, { once: true })
  })
  const { close, keySignal, errors } = fixture(t, false, {}, pending)
  assert.equal(keySignal()?.aborted, false)
  close()
  assert.equal(keySignal()?.aborted, true)
  await until(() => cancelled)
  assert.deepEqual(errors, [])
})

const bootstrapInstance = 'bootstrap-fixture-instance'
const bootstrapNonce = 'bootstrap-fixture-nonce'
async function bootstrapContext(): Promise<RemoteBootstrapContext> {
  return {
    instance: bootstrapInstance, account: 'bootstrap-fixture-account', authMode: 'local', identity: false,
    centralOrigin: 'https://app.example.test', appOrigin: 'https://installed.example.test',
    ticketIssuers: ['https://app.example.test'], publicKey: (await remoteKeyPair()).publicKey,
  }
}
function challenge(signal: FakeSignal, context: unknown) {
  signal.onmessage?.({ data: JSON.stringify({ type: 'challenge', protocol: 1, nonce: bootstrapNonce, context }) })
}

test('WebSocket bootstrap prepares ICE immediately and authenticates with its bound context without HTTP launch or key requests', async t => {
  let offers = 0
  t.mock.method(FakePeer.prototype, 'createOffer', async () => { offers++; return { type: 'offer', sdp } })
  const central = await remoteKeyPair(), host = await remoteKeyPair(), pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify'])
  const context = { ...await bootstrapContext(), publicKey: central.publicKey }
  const admission = 'fixture.signed.admission'
  const { pending, signal, peer, observe, errors, keyRequests } = fixture(t, false, {}, {}, { target: { owner: 'user', name: 'home', hint: bootstrapInstance }, identity: false, admission })
  const ready = pending!.context
  assert.equal(offers, 1)
  assert.equal(keyRequests(), 0)
  const url = new URL(signal.url)
  assert.equal(url.searchParams.get('owner'), 'user')
  assert.equal(url.searchParams.get('hint'), bootstrapInstance)
  assert.equal(url.searchParams.get('bootstrap'), '1')
  assert.equal(url.searchParams.get('identity'), '0')
  assert.deepEqual(signal.protocols, ['mew-admission-v1', `mew-admission.${admission}`])
  assert.equal(signal.url.includes(admission), false, 'quota admission must stay out of URLs and referrers')
  challenge(signal, context)
  assert.deepEqual(await ready, context)
  assert.deepEqual(signal.sent, [], 'the socket context cannot grant access before the browser key is ready')
  const session = 's'.repeat(43)
  pending!.start(observe, { keyPair: pair, session })
  await until(() => signal.sent.length > 0 || errors.length > 0)
  const connect = signal.sent[0] as Record<string, unknown>
  assert.equal(connect.instance, bootstrapInstance)
  assert.equal(connect.nonce, bootstrapNonce)
  assert.equal(connect.launch, undefined)
  assert.equal(JSON.stringify(signal.sent).includes(session), false)
  const bound = { connection: 'connection', challenge: 'host-challenge', generation: 'host-generation', fingerprint }
  const ticket = await new SignJWT({ ...bound, authMode: 'local', instanceKey: host.publicKey }).setProtectedHeader({ alg: 'EdDSA' }).setIssuer(context.centralOrigin).setAudience(bootstrapInstance).setSubject(context.account).setJti('bootstrap-ticket').setIssuedAt().setExpirationTime('60s').sign(await importJWK(central.privateKey, 'EdDSA'))
  signal.onmessage?.({ data: JSON.stringify({ type: 'ticket', connection: 'connection', ticket }) })
  await until(() => peer.channel.sent.length > 0 || errors.length > 0)
  assert.deepEqual(errors, [])
  assert.equal(JSON.parse(peer.channel.sent[0]).session, session)
  const proof = await new SignJWT({ ...bound, fingerprint }).setProtectedHeader({ alg: 'EdDSA' }).setIssuer('mew-instance').setAudience('connection').setSubject(bootstrapInstance).setJti('bootstrap-answer').setIssuedAt().setExpirationTime('60s').sign(await importJWK(host.privateKey, 'EdDSA'))
  signal.onmessage?.({ data: JSON.stringify({ type: 'answer', connection: 'connection', sdp, proof }) })
  await until(() => peer.remoteDescription !== undefined || errors.length > 0)
  assert.equal(peer.remoteDescription?.sdp, sdp)
  assert.equal(keyRequests(), 0, 'bootstrap keys arrive on the authenticated same-origin WebSocket')
  assert.throws(() => pending!.start(observe, { keyPair: pair }), /이미 사용/)
})

for (const invalid of ['origin', 'private-key', 'issuer', 'instance']) {
  test(`a malformed WebSocket bootstrap ${invalid} fails closed without legacy fallback`, async t => {
    const context = await bootstrapContext()
    if (invalid === 'origin') context.centralOrigin = 'https://other.example.test'
    if (invalid === 'private-key') context.publicKey.d = 'private-material'
    if (invalid === 'issuer') context.ticketIssuers = ['https://other.example.test/path']
    if (invalid === 'instance') context.instance = 'another-valid-instance'
    const { pending, signal, peer, keyRequests } = fixture(t, false, {}, {}, { target: { instance: bootstrapInstance } })
    const rejected = assert.rejects(pending!.context, error => {
      assert.equal((error as Error & { legacyFallback: boolean }).legacyFallback, false)
      return true
    })
    challenge(signal, context)
    await rejected
    assert.equal(peer.channel.readyState, 'closed')
    assert.deepEqual(signal.sent, [])
    assert.equal(keyRequests(), 0)
  })
}

test('only a bootstrap transport failure before receiving context permits legacy negotiation', async t => {
  const { pending, signal, peer } = fixture(t, false, {}, {}, { target: { instance: bootstrapInstance } })
  const rejected = assert.rejects(pending!.context, error => {
    assert.equal((error as Error & { legacyFallback: boolean }).legacyFallback, true)
    return true
  })
  signal.onerror?.()
  await rejected
  assert.equal(peer.channel.readyState, 'closed')
  assert.deepEqual(signal.sent, [])
})

test('a rejected HTML admission cannot downgrade into legacy launch negotiation', async t => {
  const { pending, signal, peer } = fixture(t, false, {}, {}, { target: { owner: 'user', name: 'home' }, admission: 'fixture.invalid.admission' })
  const rejected = assert.rejects(pending!.context, error => {
    assert.equal((error as Error & { legacyFallback: boolean }).legacyFallback, false)
    return true
  })
  signal.onerror?.()
  await rejected
  assert.equal(peer.channel.readyState, 'closed')
  assert.deepEqual(signal.sent, [])
})

test('cancelling after the bootstrap context closes the prepared peer and never sends a late connect', async t => {
  const { pending, signal, peer } = fixture(t, false, {}, {}, { target: { instance: bootstrapInstance } })
  challenge(signal, await bootstrapContext())
  await pending!.context
  pending!.close()
  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify'])
  assert.throws(() => pending!.start(() => {}, { keyPair: pair }), /종료된 연결/)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(peer.channel.readyState, 'closed')
  assert.deepEqual(signal.sent, [])
})

test('cancelling before the bootstrap context rejects its waiter and closes all negotiation resources', async t => {
  const { pending, signal, peer } = fixture(t, false, {}, {}, { target: { instance: bootstrapInstance } })
  const rejected = assert.rejects(pending!.context, /취소/)
  pending!.close()
  await rejected
  assert.equal(peer.channel.readyState, 'closed')
  assert.equal(signal.readyState, 3)
})

test('a late authenticated acknowledgment cannot reinstall a transport after cancellation', t => {
  const { peer, close, states } = fixture(t, false)
  close()
  peer.channel.message({ type: 'authenticated', protocol: 1 })
  assert.equal(activeRemoteTransport(), null)
  assert.equal(states.includes('connected'), false)
})

async function resumableFixture(t: TestContext) {
  const central = await remoteKeyPair(), host = await remoteKeyPair(), browserKeys = await remoteKeyPair()
  const pair = { publicKey: await importJWK(browserKeys.publicKey, 'EdDSA'), privateKey: await importJWK(browserKeys.privateKey, 'EdDSA') } as CryptoKeyPair
  const f = fixture(t, false, { launch: 'fixture-launch', keyPair: pair }, central.publicKey)
  f.signal.onmessage?.({ data: JSON.stringify({ type: 'challenge', protocol: 1, signalResume: true }) })
  await until(() => f.signal.sent.length > 0)
  const claims = { connection: 'connection', challenge: 'challenge', generation: 'generation', fingerprint, authMode: 'local', instanceKey: host.publicKey, signalResume: true, leaseExpires: Date.now() + 60_000, leaseRemaining: 60_000 }
  const ticket = await new SignJWT(claims).setProtectedHeader({ alg: 'EdDSA' }).setIssuer('https://app.example.test').setAudience('instance').setSubject('connection-subject').setJti('fixture').setIssuedAt().setExpirationTime('60s').sign(await importJWK(central.privateKey, 'EdDSA'))
  f.signal.onmessage?.({ data: JSON.stringify({ type: 'ticket', connection: 'connection', ticket }) })
  await until(() => f.peer.channel.sent.length > 0 || f.errors.length > 0)
  assert.deepEqual(f.errors, [])
  f.peer.state('connected'); f.peer.channel.message({ type: 'authenticated', protocol: 1 })
  return f
}

test('abnormal signaling loss reattaches the authenticated peer without replacing its transport or resending work', async t => {
  const f = await resumableFixture(t), transport = activeRemoteTransport(), dataCount = f.peer.channel.sent.length
  f.signal.close(1006)
  assert.equal(activeRemoteTransport(), transport)
  t.mock.timers.tick(0)
  const recovery = FakeSignal.latest
  assert.notEqual(recovery, f.signal)
  f.peer.candidate(1)
  assert.deepEqual(recovery.sent, [], 'a pending recovery socket cannot receive candidates before its verified reattachment')
  const nonce = 'n'.repeat(32)
  recovery.onmessage?.({ data: JSON.stringify({ type: 'challenge', protocol: 1, nonce, signalResume: true }) })
  await until(() => recovery.sent.some(value => value.type === 'resume') || f.errors.length > 0)
  f.peer.candidate(2)
  assert.deepEqual(f.errors, [])
  assert.equal(recovery.sent.some(value => value.type === 'connect'), false)
  assert.equal(recovery.sent.some(value => value.type === 'candidate'), false)
  recovery.onmessage?.({ data: JSON.stringify({ type: 'resumed', connection: 'connection', nonce, remaining: 58_000, expires: Date.now() + 58_000 }) })
  await until(() => recovery.sent.some(value => value.type === 'renew') || f.errors.length > 0)
  assert.equal(recovery.sent.filter(value => value.type === 'candidate').length, 2)
  assert.equal(activeRemoteTransport(), transport)
  assert.equal(f.peer.channel.sent.length, dataCount, 'authentication and application writes are never replayed')
})

test('a new online or visible event bypasses signaling retry backoff without replacing the authenticated transport', async t => {
  const f = await resumableFixture(t), transport = activeRemoteTransport()
  f.signal.close(1006)
  t.mock.timers.tick(0)
  const first = FakeSignal.latest
  assert.notEqual(first, f.signal, 'the first attempt has no fixed delay')
  first.onerror?.()
  t.mock.timers.tick(249)
  assert.equal(FakeSignal.latest, first, 'repeated failures still back off')
  f.browser.dispatchEvent(new Event('online'))
  const second = FakeSignal.latest
  assert.notEqual(second, first)
  f.browser.dispatchEvent(new Event('online'))
  f.browser.dispatchEvent(new Event('pageshow'))
  f.document.dispatchEvent(new Event('visibilitychange'))
  assert.equal(FakeSignal.latest, second, 'an event burst preserves the recovery handshake already in flight')
  second.onerror?.()
  f.document.visibilityState = 'hidden'
  f.document.dispatchEvent(new Event('visibilitychange'))
  assert.equal(FakeSignal.latest, second)
  f.document.visibilityState = 'visible'
  f.document.dispatchEvent(new Event('visibilitychange'))
  assert.notEqual(FakeSignal.latest, second)
  assert.equal(activeRemoteTransport(), transport)
  assert.equal(f.peer.channel.readyState, 'open')
  assert.deepEqual(f.errors, [])
})

test('signaling retries cannot extend the browser authorization deadline', async t => {
  const f = await resumableFixture(t)
  f.signal.close(1006)
  t.mock.timers.tick(59_001)
  assert.equal(f.peer.channel.readyState, 'closed')
  assert.equal(activeRemoteTransport(), null)
  assert.equal(f.errors.length, 1)
})

test('RTC recovery cannot extend an authorization lease that expires before the five second grace', async t => {
  const f = await resumableFixture(t)
  t.mock.timers.tick(56_000)
  f.peer.state('disconnected')
  t.mock.timers.tick(1000)
  assert.equal(f.peer.channel.readyState, 'open')
  assert.equal(f.states.at(-1), 'reconnecting')
  t.mock.timers.tick(2001)
  assert.equal(f.peer.channel.readyState, 'closed')
  assert.equal(activeRemoteTransport(), null)
  assert.match(f.errors[0]!, /인증 연결/)
})

for (const delay of [500, 1500]) for (const outcome of ['normal-close', 'access-revoked', 'session-expired']) test(`${outcome} ends a resumable connection immediately during ${delay}ms of RTC recovery`, async t => {
  const f = await resumableFixture(t)
  f.peer.state('disconnected')
  t.mock.timers.tick(delay)
  const notices = f.states.filter(state => state === 'reconnecting').length
  if (outcome === 'normal-close') f.signal.close(1000)
  else f.signal.onmessage?.({ data: JSON.stringify({ type: 'error', code: outcome }) })
  await until(() => f.peer.channel.readyState === 'closed')
  assert.equal(activeRemoteTransport(), null)
  t.mock.timers.tick(5000)
  assert.equal(f.states.filter(state => state === 'reconnecting').length, notices, 'revocation cancels any pending recovery notice')
  assert.equal(FakeSignal.latest, f.signal)
})

test('unknown renewal acknowledgments cannot extend a resumable connection', async t => {
  const f = await resumableFixture(t)
  f.signal.onmessage?.({ data: JSON.stringify({ type: 'lease', connection: 'connection', request: 'unknown', remaining: 60_000 }) })
  await until(() => f.peer.channel.readyState === 'closed')
  assert.equal(f.errors.length, 1)
})

test('queued renewal acknowledgments from the interrupted socket cannot terminate or renew its preserved peer', async t => {
  const f = await resumableFixture(t), transport = activeRemoteTransport()
  const request = f.signal.sent.findLast(value => value.type === 'renew') as { type: string; request: string }
  f.signal.onerror?.()
  f.signal.onmessage?.({ data: JSON.stringify({ type: 'lease', connection: 'connection', request: request.request, remaining: 60_000 }) })
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(f.errors, [])
  assert.equal(activeRemoteTransport(), transport)
})
