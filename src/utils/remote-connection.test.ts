import test, { type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { importJWK, jwtVerify, SignJWT, type JWK } from 'jose'
import { remoteKeyPair } from '../../shared/remote-access-crypto.ts'
import { REMOTE_TOKEN_CLOCK_TOLERANCE } from '../../shared/remote-access.ts'
import { bootstrapRemoteConnection, connectRemote } from './remote-connection.ts'
import { remoteBootstrapUrl, type RemoteBootstrapContext, type RemoteConnectionTarget } from '../../shared/remote-bootstrap.ts'
import { activeRemoteTransport } from './remote-transport.ts'
import { primeRemotePeer, takePrimedRemotePeer } from './remote-peer-prime.ts'
import { primeRemoteSignal, takePrimedRemoteSignal } from './remote-signal-prime.ts'
import { remoteConnectFlightProtocols } from './remote-connect-flight.ts'
import type { RemoteRecoveryFlightClock } from '../../shared/remote-recovery-flight.ts'

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
class FakePeer extends EventTarget {
  static latest: FakePeer
  connectionState = 'new'
  remoteDescription?: { type: string; sdp: string }
  async setRemoteDescription(value: { type: string; sdp: string }) { this.remoteDescription = value }
  channel = new FakeChannel()
  onconnectionstatechange?: () => void
  onicecandidate?: (event: { candidate: { candidate: string; toJSON(): RTCIceCandidateInit } }) => void
  constructor() { super(); FakePeer.latest = this }
  createDataChannel() { return this.channel }
  async createOffer() { return { type: 'offer', sdp } }
  async setLocalDescription() {}
  async getStats(): Promise<Map<string, Record<string, unknown>>> { return new Map() }
  state(value: string) { this.connectionState = value; this.dispatchEvent(new Event('connectionstatechange')); this.onconnectionstatechange?.() }
  close() { this.state('closed') }
  candidate(index: number) { const candidate = { candidate: `candidate:fixture-${index} 1 udp 1 192.0.2.1 5000 typ host`, sdpMid: '0' }, event = { candidate: { ...candidate, toJSON: () => candidate } }; this.dispatchEvent(Object.assign(new Event('icecandidate'),event)); this.onicecandidate?.(event) }
}
class FakeSignal extends EventTarget {
  static OPEN = 1
  static CLOSING = 2
  static latest: FakeSignal
  readyState = 1
  sent: { type: string }[] = []
  onmessage?: (event: { data: string }) => void
  onerror?: () => void
  onclose?: (event?: { code: number }) => void
  url: string
  protocols?: string | string[]
  constructor(url: string, protocols?: string | string[]) { super(); this.url = url; this.protocols = protocols; FakeSignal.latest = this }
  send(value: string) { this.sent.push(JSON.parse(value)) }
  close(code = 1006) { if (this.readyState === 3) return; this.readyState = 3; this.onclose?.({ code }) }
}
function fixture(t: TestContext, authenticated = true, options: Parameters<typeof connectRemote>[2] = {}, centralKey: JWK | ((signal: AbortSignal) => Promise<Response>) = {}, bootstrap?: { target: RemoteConnectionTarget; identity?: boolean; admission?: string; initialCredentials?: Promise<{ keyPair: CryptoKeyPair; session?: string }>; recoveryFlight?: RemoteRecoveryFlightClock }, beforeConnect?: () => void) {
  const browser = new EventTarget(), document = Object.assign(new EventTarget(), { visibilityState: 'visible' })
  const values = { RTCPeerConnection: FakePeer, RTCDataChannel: FakeChannel, WebSocket: FakeSignal, location: { origin: 'https://app.example.test' }, window: browser, document }
  const previous = new Map<string, PropertyDescriptor | undefined>()
  for (const [key, value] of Object.entries(values)) { previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, value }) }
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1_900_000_000_000 })
  const states: string[] = [], errors: (string | undefined)[] = [], codes: (string | undefined)[] = []
  let keyRequests = 0
  let keySignal: AbortSignal | null = null
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
    keyRequests++
    keySignal = init?.signal ?? null
    return typeof centralKey === 'function' ? centralKey(keySignal!) : Response.json(centralKey)
  })
  const observe = (state: string, error?: string, code?: string) => { states.push(state); codes.push(code); if (state === 'error') errors.push(error) }
  beforeConnect?.()
  const pending = bootstrap && bootstrapRemoteConnection(bootstrap.target, { identity: bootstrap.identity, admission: bootstrap.admission, initialCredentials: bootstrap.initialCredentials, recoveryFlight: bootstrap.recoveryFlight })
  const close = pending?.close ?? connectRemote('instance', observe, options)
  t.after(() => { close(); for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key) } })
  const peer = FakePeer.latest, signal = FakeSignal.latest
  if (authenticated) { peer.state('connected'); peer.channel.message({ type: 'authenticated', protocol: 1 }); assert.equal(states.at(-1), 'connected') }
  return { peer, signal, states, errors, codes, browser, document, close, pending, observe, keyRequests: () => keyRequests, keySignal: () => keySignal }
}

for (const code of ['offline', 'rate-limited', 'rtc-unavailable', 'access-revoked', 'session-expired']) test(`signaling ${code} errors preserve their code and existing state`, async t => {
  const { signal, peer, states, codes } = fixture(t, false)
  signal.onmessage?.({ data: JSON.stringify({ type: 'error', code }) })
  await until(() => peer.channel.readyState === 'closed')
  assert.equal(codes.at(-1), code)
  assert.equal(states.at(-1), code === 'access-revoked' ? 'revoked' : code === 'session-expired' ? 'denied' : 'error')
})

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

function fixtureAdmission() {
  return `${Buffer.from('{"alg":"EdDSA"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: bootstrapInstance, instance: bootstrapInstance, jti: 'bootstrap-fixture-admission', iat: 1_900_000_000, expires: 1_900_000_010_000 })).toString('base64url')}.signature`
}

test('the admitted controller consumes its primed peer once and retains early ICE order, cached offer fingerprint and browser proof key', async t => {
  let offers = 0, localDescriptions = 0
  const originalFingerprint = Array(32).fill('CD').join(':'), originalSdp = `v=0\r\na=fingerprint:sha-256 ${originalFingerprint}\r\n`
  t.mock.method(FakePeer.prototype,'createOffer',async () => { offers++; return {type:'offer',sdp:originalSdp} })
  t.mock.method(FakePeer.prototype,'setLocalDescription',async () => { localDescriptions++ })
  const pair = await crypto.subtle.generateKey({name:'Ed25519'},false,['sign','verify']), exportedKey = await crypto.subtle.exportKey('jwk',pair.publicKey)
  const publicKey = {kty:exportedKey.kty,crv:exportedKey.crv,x:exportedKey.x}
  const central = await remoteKeyPair(), host = await remoteKeyPair(), context = {...await bootstrapContext(),publicKey:central.publicKey}
  const target = {owner:'user',name:'home',hint:bootstrapInstance}, admission = fixtureAdmission(), signalUrl = remoteBootstrapUrl(context.centralOrigin,target,false)
  let earlyPeer!: FakePeer
  const previous = FakeSignal.latest
  const f = fixture(t,false,{},{},{target,identity:false,admission,initialCredentials:Promise.resolve({keyPair:pair})},() => {
    primeRemotePeer(signalUrl,admission); primeRemotePeer(signalUrl,admission)
    earlyPeer = FakePeer.latest; earlyPeer.candidate(1); earlyPeer.candidate(2)
  })
  assert.equal(f.peer,earlyPeer)
  assert.equal(takePrimedRemotePeer(signalUrl,admission),undefined,'the actual controller owns the one-use endpoint')
  await until(() => FakeSignal.latest !== previous)
  const signal = FakeSignal.latest, protocol = (signal.protocols as string[]).find(value=>value.startsWith('mew-connect.'))!
  const flight = await jwtVerify(protocol.slice('mew-connect.'.length),pair.publicKey,{issuer:'mew-browser',audience:`${context.centralOrigin}/connect-flight`,algorithms:['EdDSA']})
  assert.equal(flight.payload.sdp,originalSdp)
  assert.equal(flight.payload.fingerprint,originalFingerprint)
  assert.deepEqual(flight.payload.publicKey,publicKey)
  assert.equal(offers,1)
  assert.equal(localDescriptions,1)
  f.peer.candidate(3)
  signal.onmessage?.({data:JSON.stringify({type:'challenge',protocol:1,nonce:bootstrapNonce,context,earlyConnect:true})})
  await f.pending!.context
  const session = 's'.repeat(43)
  f.pending!.start(f.observe,{keyPair:pair,session})
  await until(() => signal.sent.length >= 3 || f.errors.length > 0)
  assert.deepEqual(signal.sent.map(value=>value.type),['candidate','candidate','candidate'])
  assert.deepEqual(signal.sent.map(value=>(value as unknown as {candidate:RTCIceCandidateInit}).candidate.candidate),[1,2,3].map(index=>`candidate:fixture-${index} 1 udp 1 192.0.2.1 5000 typ host`))
  f.browser.dispatchEvent(new Event('pagehide')); t.mock.timers.tick(10_000)
  assert.equal(f.peer.channel.readyState,'open','the retired prime cannot close its adopted endpoint')
  assert.equal(activeRemoteTransport(),null)
  const bound = {connection:'primed-connection',challenge:'host-challenge',generation:'host-generation',fingerprint:originalFingerprint}
  const ticket = await new SignJWT({...bound,authMode:'local',instanceKey:host.publicKey,browserKey:publicKey}).setProtectedHeader({alg:'EdDSA'}).setIssuer(context.centralOrigin).setAudience(bootstrapInstance).setSubject(context.account).setJti('primed-ticket').setIssuedAt().setExpirationTime('60s').sign(await importJWK(central.privateKey,'EdDSA'))
  signal.onmessage?.({data:JSON.stringify({type:'ticket',connection:bound.connection,ticket})})
  await until(() => f.peer.channel.sent.length > 0 || f.errors.length > 0)
  const authentication = JSON.parse(f.peer.channel.sent[0]), proof = await jwtVerify(authentication.proof,pair.publicKey,{issuer:'mew-browser',audience:bootstrapInstance,algorithms:['EdDSA']})
  assert.equal(authentication.session,session)
  assert.equal(proof.payload.fingerprint,originalFingerprint)
  assert.equal(proof.payload.sub,context.account)
  assert.equal(proof.payload.connection,bound.connection)
  assert.equal(JSON.stringify(signal.sent).includes(session),false)
  const answerProof = await new SignJWT({...bound,fingerprint}).setProtectedHeader({alg:'EdDSA'}).setIssuer('mew-instance').setAudience(bound.connection).setSubject(bootstrapInstance).setJti('primed-answer').setIssuedAt().setExpirationTime('60s').sign(await importJWK(host.privateKey,'EdDSA'))
  signal.onmessage?.({data:JSON.stringify({type:'answer',connection:bound.connection,sdp,proof:answerProof})})
  await until(() => f.peer.remoteDescription !== undefined || f.errors.length > 0)
  assert.equal(f.peer.remoteDescription?.sdp,sdp)
  assert.equal(activeRemoteTransport(),null,'neither priming nor valid peer proofs bypass the host authentication ACK')
  f.peer.channel.message({type:'authenticated',protocol:1})
  assert.equal(f.states.at(-1),'connected')
  assert.deepEqual(f.errors,[])
  f.close()
  assert.equal(f.peer.connectionState,'closed')
  assert.equal(f.peer.channel.readyState,'closed')
  assert.equal(signal.readyState,3)
  assert.equal(activeRemoteTransport(),null)
})

test('an admitted first Upgrade carries the offer and never sends a duplicate connect after its context', async t => {
  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify'])
  const context = await bootstrapContext(), previous = FakeSignal.latest
  const f = fixture(t, false, {}, {}, { target: { owner: 'user', name: 'home', hint: bootstrapInstance }, admission: fixtureAdmission(), initialCredentials: Promise.resolve({ keyPair: pair }) })
  await until(() => FakeSignal.latest !== previous)
  const signal = FakeSignal.latest
  assert.equal((signal.protocols as string[]).length, 3)
  assert.equal((signal.protocols as string[])[2].startsWith('mew-connect.'), true)
  assert.equal(signal.url.includes('mew-connect'), false)
  signal.onmessage?.({ data: JSON.stringify({ type: 'challenge', protocol: 1, nonce: bootstrapNonce, context, earlyConnect: true }) })
  assert.deepEqual(await f.pending!.context, context)
  f.pending!.start(f.observe, { keyPair: pair })
  await new Promise(resolve => setImmediate(resolve))
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(signal.sent, [])
  f.peer.candidate(1)
  await until(() => signal.sent.some(value => value.type === 'candidate'))
  assert.equal(signal.sent.some(value => value.type === 'connect'), false)
  assert.deepEqual(f.errors, [])
})

test('an admitted Upgrade retains normal challenge negotiation when the server does not accept its early offer', async t => {
  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify'])
  const context = await bootstrapContext(), previous = FakeSignal.latest
  const f = fixture(t, false, {}, {}, { target: { owner: 'user', name: 'home', hint: bootstrapInstance }, admission: fixtureAdmission(), initialCredentials: Promise.resolve({ keyPair: pair }) })
  await until(() => FakeSignal.latest !== previous)
  const signal = FakeSignal.latest
  challenge(signal, context)
  await f.pending!.context
  f.pending!.start(f.observe, { keyPair: pair })
  await until(() => signal.sent.length > 0)
  assert.equal(signal.sent.filter(value => value.type === 'connect').length, 1)
  assert.deepEqual(f.errors, [])
})

test('the initial offer cannot switch browser keys after context admission', async t => {
  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify'])
  const replacement = await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify'])
  const context = await bootstrapContext(), previous = FakeSignal.latest
  const f = fixture(t, false, {}, {}, { target: { owner: 'user', name: 'home', hint: bootstrapInstance }, admission: fixtureAdmission(), initialCredentials: Promise.resolve({ keyPair: pair }) })
  await until(() => FakeSignal.latest !== previous)
  const signal = FakeSignal.latest
  signal.onmessage?.({ data: JSON.stringify({ type: 'challenge', protocol: 1, nonce: bootstrapNonce, context, earlyConnect: true }) })
  await f.pending!.context
  f.pending!.start(f.observe, { keyPair: replacement })
  await until(() => f.peer.channel.readyState === 'closed')
  assert.match(f.errors[0]!, /연결 키가 변경/)
  assert.deepEqual(signal.sent, [])
})

test('cancellation during initial credential preparation closes the peer without creating a late signaling socket', async t => {
  let resolve!: (value: { keyPair: CryptoKeyPair }) => void
  const credentials = new Promise<{ keyPair: CryptoKeyPair }>(ready => { resolve = ready })
  const previous = FakeSignal.latest
  const f = fixture(t, false, {}, {}, { target: { owner: 'user', name: 'home', hint: bootstrapInstance }, admission: fixtureAdmission(), initialCredentials: credentials })
  const rejection = assert.rejects(f.pending!.context, /취소/)
  f.close()
  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify'])
  resolve({ keyPair: pair })
  await rejection
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(FakeSignal.latest, previous)
  assert.equal(f.peer.channel.readyState, 'closed')
})

const recoveryClock = (): RemoteRecoveryFlightClock => ({ serverTime: 1_900_000_000_000, receivedAt: performance.now(), wallTime: 1_900_000_000_000 })

test('a replacement RTC Upgrade signs its fresh offer with the existing key and never sends a duplicate connect', async t => {
  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify'])
  const context = await bootstrapContext(), previous = FakeSignal.latest
  const f = fixture(t, false, {}, {}, { target: { instance: bootstrapInstance }, identity: false, recoveryFlight: recoveryClock(), initialCredentials: Promise.resolve({ keyPair: pair }) })
  await until(() => FakeSignal.latest !== previous)
  const signal = FakeSignal.latest, protocols = signal.protocols as string[]
  assert.equal(protocols[0], 'mew-recovery-v1')
  assert.equal(protocols.length, 2)
  const { payload } = await jwtVerify(protocols[1].slice('mew-recovery.'.length), pair.publicKey, { issuer: 'mew-browser', audience: `${context.centralOrigin}/recovery-connect` })
  assert.equal(payload.sdp, sdp)
  assert.equal(payload.fingerprint, fingerprint)
  assert.equal(payload.instance, bootstrapInstance)
  assert.equal(payload.kind, 'rtc-recovery-connect-v1')
  assert.equal(signal.url.includes('mew-recovery'), false)
  signal.onmessage?.({ data: JSON.stringify({ type: 'challenge', protocol: 1, nonce: bootstrapNonce, context, earlyConnect: true, recoveryConnect: true }) })
  assert.deepEqual(await f.pending!.context, context)
  f.pending!.start(f.observe, { keyPair: pair })
  f.peer.candidate(1)
  await until(() => signal.sent.some(value => value.type === 'candidate'))
  assert.equal(signal.sent.some(value => value.type === 'connect'), false)
  assert.deepEqual(f.errors, [])
  f.close()
  assert.equal(f.peer.channel.readyState, 'closed')
  assert.equal(signal.readyState, 3)
})

for (const ack of [{}, { earlyConnect: true }, { recoveryConnect: true }]) test(`a recovery flight missing its exact acknowledgment closes before any ordinary connect: ${JSON.stringify(ack)}`, async t => {
  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify'])
  const context = await bootstrapContext(), previous = FakeSignal.latest
  const f = fixture(t, false, {}, {}, { target: { instance: bootstrapInstance }, recoveryFlight: recoveryClock(), initialCredentials: Promise.resolve({ keyPair: pair }) })
  const rejection = assert.rejects(f.pending!.context, error => {
    assert.equal((error as { code: string }).code, 'recovery-flight-unsupported')
    assert.equal((error as { recoveryFallback: boolean }).recoveryFallback, true)
    assert.equal((error as { legacyFallback: boolean }).legacyFallback, false)
    return true
  })
  await until(() => FakeSignal.latest !== previous)
  const signal = FakeSignal.latest
  signal.onmessage?.({ data: JSON.stringify({ type: 'challenge', protocol: 1, nonce: bootstrapNonce, context, ...ack }) })
  await rejection
  assert.deepEqual(signal.sent, [], 'a compatibility retry needs a fresh socket and server nonce')
  assert.equal(f.peer.channel.readyState, 'closed')
  assert.equal(signal.readyState, 3)
})

test('a failed recovery Upgrade requests one fresh nonce attempt without legacy launch or proof reuse', async t => {
  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify']), previous = FakeSignal.latest
  const f = fixture(t, false, {}, {}, { target: { instance: bootstrapInstance }, recoveryFlight: recoveryClock(), initialCredentials: Promise.resolve({ keyPair: pair }) })
  const rejection = assert.rejects(f.pending!.context, error => {
    assert.equal((error as { recoveryFallback: boolean }).recoveryFallback, true)
    assert.equal((error as { legacyFallback: boolean }).legacyFallback, false)
    return true
  })
  await until(() => FakeSignal.latest !== previous)
  FakeSignal.latest.onerror?.()
  await rejection
  assert.equal(f.peer.channel.readyState, 'closed')
  assert.deepEqual(FakeSignal.latest.sent, [])
})

for (const code of ['access-revoked', 'session-expired']) test(`a recovery ${code} rejection never enables a compatibility retry`, async t => {
  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify']), previous = FakeSignal.latest
  const f = fixture(t, false, {}, {}, { target: { instance: bootstrapInstance }, recoveryFlight: recoveryClock(), initialCredentials: Promise.resolve({ keyPair: pair }) })
  const rejection = assert.rejects(f.pending!.context, error => {
    assert.equal((error as { code: string }).code, code)
    assert.equal((error as { recoveryFallback: boolean }).recoveryFallback, false)
    return true
  })
  await until(() => FakeSignal.latest !== previous)
  FakeSignal.latest.onmessage?.({ data: JSON.stringify({ type: 'error', code }) })
  await rejection
})

test('a changed target cannot enable the compatibility retry of a signed recovery offer', async t => {
  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify']), previous = FakeSignal.latest
  const context = { ...await bootstrapContext(), instance: 'different-fixture-instance' }
  const f = fixture(t, false, {}, {}, { target: { instance: bootstrapInstance }, recoveryFlight: recoveryClock(), initialCredentials: Promise.resolve({ keyPair: pair }) })
  const rejection = assert.rejects(f.pending!.context, error => {
    assert.match((error as Error).message, /기기가 일치/)
    assert.equal((error as { recoveryFallback: boolean }).recoveryFallback, false)
    return true
  })
  await until(() => FakeSignal.latest !== previous)
  FakeSignal.latest.onmessage?.({ data: JSON.stringify({ type: 'challenge', protocol: 1, nonce: bootstrapNonce, context, earlyConnect: true, recoveryConnect: true }) })
  await rejection
})

test('an unusable server clock retains the ordinary server-nonce handshake', async t => {
  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify']), previous = FakeSignal.latest
  const f = fixture(t, false, {}, {}, { target: { instance: bootstrapInstance }, recoveryFlight: { ...recoveryClock(), wallTime: 0 }, initialCredentials: Promise.resolve({ keyPair: pair }) })
  await until(() => FakeSignal.latest !== previous)
  const signal = FakeSignal.latest
  assert.equal(signal.protocols, undefined)
  challenge(signal, await bootstrapContext())
  await f.pending!.context
  f.pending!.start(f.observe, { keyPair: pair })
  await until(() => signal.sent.some(value => value.type === 'connect'))
  assert.equal(signal.sent.filter(value => value.type === 'connect').length, 1)
  assert.equal(signal.sent.find(value => value.type === 'connect')!.nonce, bootstrapNonce)
})

for (const serverNow of [null, NaN, 0, -1, 1.5]) test(`an invalid optional server-time hint cannot enter the bootstrap context: ${serverNow}`, async t => {
  const context = { ...await bootstrapContext(), serverNow }
  const f = fixture(t, false, {}, {}, { target: { instance: bootstrapInstance } })
  const rejection = assert.rejects(f.pending!.context, /중앙 연결 정보/)
  challenge(f.signal, context as unknown as RemoteBootstrapContext)
  await rejection
  assert.equal(f.peer.channel.readyState, 'closed')
  assert.deepEqual(f.signal.sent, [])
})

test('cancellation during recovery credential preparation cannot create a late Upgrade', async t => {
  let resolve!: (value: { keyPair: CryptoKeyPair }) => void
  const credentials = new Promise<{ keyPair: CryptoKeyPair }>(ready => { resolve = ready }), previous = FakeSignal.latest
  const f = fixture(t, false, {}, {}, { target: { instance: bootstrapInstance }, recoveryFlight: recoveryClock(), initialCredentials: credentials })
  const rejection = assert.rejects(f.pending!.context, /취소/)
  f.close()
  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify'])
  resolve({ keyPair: pair })
  await rejection
  await new Promise(ready => setImmediate(ready))
  assert.equal(FakeSignal.latest, previous)
  assert.equal(f.peer.channel.readyState, 'closed')
})

test('cancellation during recovery signing cannot open a late socket or retain the peer', async t => {
  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify'])
  const sign = crypto.subtle.sign.bind(crypto.subtle), previous = FakeSignal.latest
  let signed = false, release!: () => void
  const pending = new Promise<void>(ready => { release = ready })
  t.mock.method(crypto.subtle, 'sign', async (...args: Parameters<typeof sign>) => {
    const value = await Reflect.apply(sign, crypto.subtle, args)
    signed = true
    await pending
    return value
  })
  const f = fixture(t, false, {}, {}, { target: { instance: bootstrapInstance }, recoveryFlight: recoveryClock(), initialCredentials: Promise.resolve({ keyPair: pair }) })
  const rejection = assert.rejects(f.pending!.context, /취소/)
  await until(() => signed)
  f.close()
  release()
  await rejection
  await new Promise(ready => setImmediate(ready))
  assert.equal(FakeSignal.latest, previous)
  assert.equal(f.peer.channel.readyState, 'closed')
})

test('late controller download adopts the exact admitted flight instead of replacing it after the freshness margin', async t => {
  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify'])
  const target = { owner: 'user', name: 'home', hint: bootstrapInstance }, admission = fixtureAdmission(), context = await bootstrapContext()
  const url = remoteBootstrapUrl(context.centralOrigin, target), protocols = await remoteConnectFlightProtocols(context.centralOrigin, bootstrapInstance, admission, sdp, pair)
  let early!: FakeSignal
  const f = fixture(t, false, {}, {}, { target, admission, initialCredentials: Promise.resolve({ keyPair: pair }) }, () => {
    primeRemoteSignal(url, protocols); early = FakeSignal.latest
    t.mock.timers.tick(8500)
  })
  await until(() => early.onmessage !== undefined || f.errors.length > 0)
  assert.equal(FakeSignal.latest, early)
  early.onmessage?.({ data: JSON.stringify({ type: 'challenge', protocol: 1, nonce: bootstrapNonce, context, earlyConnect: true }) })
  await f.pending!.context
  f.pending!.start(f.observe, { keyPair: pair })
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(f.errors, [])
  assert.equal(early.sent.some(value => value.type === 'connect'), false)
  assert.equal(takePrimedRemoteSignal(url, protocols), undefined)
})

test('controller cancellation closes its unadopted early socket while initial credentials remain pending', async t => {
  const target = { owner: 'user', name: 'home', hint: bootstrapInstance }, admission = fixtureAdmission()
  const context = await bootstrapContext(), url = remoteBootstrapUrl(context.centralOrigin, target)
  let early!: FakeSignal
  const f = fixture(t, false, {}, {}, { target, admission, initialCredentials: new Promise(() => {}) }, () => {
    primeRemoteSignal(url, ['mew-admission-v1', `mew-admission.${admission}`, 'mew-connect.signed.offer.proof']); early = FakeSignal.latest
  })
  const rejected = assert.rejects(f.pending!.context, /취소/)
  f.close()
  await rejected
  assert.equal(early.readyState, 3)
  assert.equal(takePrimedRemoteSignal(url), undefined)
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

for (const code of ['offline', 'rate-limited', 'access-revoked', 'session-expired']) test(`bootstrap ${code} rejection before context preserves its code and fallback contract`, async t => {
  const { pending, signal, peer } = fixture(t, false, {}, {}, { target: { instance: bootstrapInstance } })
  const state = code === 'access-revoked' ? 'revoked' : code === 'session-expired' ? 'denied' : 'error'
  const rejected = assert.rejects(pending!.context, error => {
    const failure = error as Error & { state: string; code: string; legacyFallback: boolean }
    assert.equal(failure.code, code)
    assert.equal(failure.state, state)
    assert.equal(failure.legacyFallback, state === 'error')
    return true
  })
  signal.onmessage?.({ data: JSON.stringify({ type: 'error', code }) })
  await rejected
  assert.equal(peer.channel.readyState, 'closed')
})

test('a started bootstrap forwards offline codes while allowing observers with two arguments', async t => {
  const { pending, signal, peer, codes, observe } = fixture(t, false, {}, {}, { target: { instance: bootstrapInstance } })
  challenge(signal, await bootstrapContext())
  await pending!.context
  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify'])
  let legacyError: string | undefined
  const legacyObserver = (state: string, message?: string) => { if (state === 'error') legacyError = message }
  const compatible: Parameters<typeof connectRemote>[1] = legacyObserver
  pending!.start((state, message, code) => { compatible(state, message, code); observe(state, message, code) }, { keyPair: pair })
  signal.onmessage?.({ data: JSON.stringify({ type: 'error', code: 'offline' }) })
  await until(() => peer.channel.readyState === 'closed')
  assert.equal(codes.at(-1), 'offline')
  assert.equal(legacyError, '기기가 오프라인입니다.')
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

function foregroundFrames(peer: FakePeer) {
  return peer.channel.sent.map(value => JSON.parse(value) as { type: string; id: string; method?: string; path?: string })
}
async function foregroundProbe(peer: FakePeer) {
  await until(() => foregroundFrames(peer).some(frame => frame.type === 'request' && frame.id.startsWith('remote-check-')))
  return foregroundFrames(peer).find(frame => frame.type === 'request' && frame.id.startsWith('remote-check-'))!
}

test('foreground events share one safe probe and an HTTP error response preserves the same live peer', async t => {
  const f = fixture(t), transport = activeRemoteTransport()
  f.browser.dispatchEvent(new Event('online'))
  f.browser.dispatchEvent(new Event('pageshow'))
  f.document.dispatchEvent(new Event('visibilitychange'))
  const probe = await foregroundProbe(f.peer)
  assert.equal(probe.method, 'HEAD')
  assert.equal(probe.path, '/api/remote-ui/file?path=/favicon.ico')
  assert.equal(foregroundFrames(f.peer).filter(frame => frame.type === 'request').length, 1)
  f.peer.channel.message({ type: 'response', id: probe.id, status: 404, headers: {} })
  t.mock.timers.tick(500)
  assert.equal(activeRemoteTransport(), transport)
  assert.deepEqual(f.states, ['connected'])
})

test('an unrelated incoming frame cannot mask a stalled foreground probe or cancel another operation', async t => {
  const f = fixture(t), transport = activeRemoteTransport()!
  await transport.forward({ type: 'socket', id: 'existing-subscription', path: '/api/presence' })
  f.browser.dispatchEvent(new Event('online'))
  await foregroundProbe(f.peer)
  t.mock.timers.tick(100)
  f.peer.channel.message({ type: 'open', id: 'existing-subscription' })
  t.mock.timers.tick(150)
  assert.equal(f.peer.channel.readyState, 'closed')
  assert.equal(f.codes.at(-1), 'connection-unresponsive')
  assert.equal(foregroundFrames(f.peer).some(frame => frame.type === 'close' && frame.id === 'existing-subscription'), false)
})

test('a wall-clock rollback cannot suppress later foreground checks', async t => {
  const f = fixture(t)
  let now = 0
  t.mock.method(performance, 'now', () => now)
  f.browser.dispatchEvent(new Event('online'))
  await new Promise(resolve => setImmediate(resolve))
  const first = foregroundFrames(f.peer).find(frame => frame.id?.startsWith('remote-check-'))!
  f.peer.channel.message({ type: 'response', id: first.id, status: 200, headers: {} })
  now += 300
  t.mock.timers.setTime(Date.now() - 60 * 60 * 1000)
  f.browser.dispatchEvent(new Event('pageshow'))
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(foregroundFrames(f.peer).filter(frame => frame.type === 'request' && frame.id.startsWith('remote-check-')).length, 2)
})

test('a new outgoing app request at 95ms cannot cancel a stalled foreground determination', async t => {
  const f = fixture(t), transport = activeRemoteTransport()!
  f.browser.dispatchEvent(new Event('online'))
  await foregroundProbe(f.peer)
  await new Promise(resolve => setImmediate(resolve))
  t.mock.timers.tick(95)
  await transport.forward({ type: 'request', id: 'new-app-read', method: 'GET', path: '/api/files', headers: {} })
  t.mock.timers.tick(154)
  assert.equal(f.peer.channel.readyState, 'open')
  t.mock.timers.tick(1)
  assert.equal(f.peer.channel.readyState, 'closed')
  assert.equal(f.codes.at(-1), 'connection-unresponsive')
  assert.equal(foregroundFrames(f.peer).filter(frame => frame.id === 'new-app-read' && frame.type === 'request').length, 1)
})

test('an old response queued before sleep cannot satisfy the fresh foreground probe', async t => {
  const f = fixture(t), transport = activeRemoteTransport()!
  await transport.forward({ type: 'request', id: 'pre-sleep-read', method: 'GET', path: '/api/files', headers: {} })
  f.browser.dispatchEvent(new Event('online'))
  await foregroundProbe(f.peer)
  await new Promise(resolve => setImmediate(resolve))
  t.mock.timers.tick(200)
  f.peer.channel.message({ type: 'response', id: 'pre-sleep-read', status: 200, headers: {} })
  t.mock.timers.tick(50)
  assert.equal(f.peer.channel.readyState, 'closed')
  assert.equal(f.codes.at(-1), 'connection-unresponsive')
})

function candidateStats(rtt: number) {
  return new Map<string, Record<string, unknown>>([
    ['transport', { type: 'transport', selectedCandidatePairId: 'selected-pair' }],
    ['selected-pair', { type: 'candidate-pair', currentRoundTripTime: rtt }],
  ])
}

test('known 400ms path RTT gives a healthy foreground response at 500ms time to arrive', async t => {
  const f = fixture(t), transport = activeRemoteTransport()
  let now = 0
  t.mock.method(performance, 'now', () => now)
  t.mock.method(f.peer, 'getStats', async () => candidateStats(0.4))
  f.browser.dispatchEvent(new Event('online'))
  const probe = await foregroundProbe(f.peer)
  now += 500; t.mock.timers.tick(500)
  assert.equal(activeRemoteTransport(), transport)
  f.peer.channel.message({ type: 'response', id: probe.id, status: 200, headers: {} })
  now += 1000; t.mock.timers.tick(1000)
  assert.equal(activeRemoteTransport(), transport)
  assert.deepEqual(f.errors, [])
})

test('adaptive RTT allowance stays anchored to probe transmission rather than late stats receipt', async t => {
  const f = fixture(t)
  let now = 0, release!: (value: ReturnType<typeof candidateStats>) => void
  t.mock.method(performance, 'now', () => now)
  t.mock.method(f.peer, 'getStats', () => new Promise(resolve => { release = resolve }))
  f.browser.dispatchEvent(new Event('online'))
  await foregroundProbe(f.peer)
  now += 150; t.mock.timers.tick(150)
  release(candidateStats(0.2))
  await new Promise(resolve => setImmediate(resolve))
  now += 499; t.mock.timers.tick(499)
  assert.equal(f.peer.channel.readyState, 'open')
  now += 1; t.mock.timers.tick(1)
  assert.equal(f.peer.channel.readyState, 'closed', '3 × 200ms RTT + 50ms expires 650ms after transmission')
})

test('reported RTT cannot extend a foreground determination beyond one second', async t => {
  const f = fixture(t)
  let now = 0
  t.mock.method(performance, 'now', () => now)
  t.mock.method(f.peer, 'getStats', async () => candidateStats(3))
  f.browser.dispatchEvent(new Event('online'))
  await foregroundProbe(f.peer)
  now += 999; t.mock.timers.tick(999)
  assert.equal(f.peer.channel.readyState, 'open')
  now += 1; t.mock.timers.tick(1)
  assert.equal(f.peer.channel.readyState, 'closed')
})

test('slow stats cannot delay the default deadline or revive a completed foreground check', async t => {
  const f = fixture(t)
  let now = 0, release!: (value: ReturnType<typeof candidateStats>) => void
  t.mock.method(performance, 'now', () => now)
  t.mock.method(f.peer, 'getStats', () => new Promise(resolve => { release = resolve }))
  f.browser.dispatchEvent(new Event('online'))
  await foregroundProbe(f.peer)
  now += 250; t.mock.timers.tick(250)
  assert.equal(f.peer.channel.readyState, 'closed')
  release(candidateStats(0.4))
  await new Promise(resolve => setImmediate(resolve))
  now += 2000; t.mock.timers.tick(2000)
  assert.equal(f.errors.length, 1)
  assert.equal(f.states.filter(state => state === 'connected').length, 1)
})

for (const stats of ['missing', 'throwing', 'rejected']) test(`${stats} RTC stats preserve the default fast foreground deadline`, async t => {
  const f = fixture(t)
  if (stats === 'missing') Object.defineProperty(f.peer, 'getStats', { value: undefined })
  else t.mock.method(f.peer, 'getStats', stats === 'throwing'
    ? () => { throw new Error('stats unavailable') }
    : () => Promise.reject(new Error('stats unavailable')))
  f.browser.dispatchEvent(new Event('online'))
  await foregroundProbe(f.peer)
  await new Promise(resolve => setImmediate(resolve))
  t.mock.timers.tick(250)
  assert.equal(f.peer.channel.readyState, 'closed')
  assert.equal(f.codes.at(-1), 'connection-unresponsive')
})

test('a central lease acknowledgment does not prove that the RTC data path can receive', async t => {
  const f = await resumableFixture(t)
  f.browser.dispatchEvent(new Event('online'))
  await foregroundProbe(f.peer)
  const renewal = f.signal.sent.findLast(value => value.type === 'renew') as { type: string; request: string }
  f.signal.onmessage?.({ data: JSON.stringify({ type: 'lease', connection: 'connection', request: renewal.request, remaining: 60_000 }) })
  await new Promise(resolve => setImmediate(resolve))
  t.mock.timers.tick(250)
  assert.equal(f.peer.channel.readyState, 'closed')
  assert.equal(f.codes.at(-1), 'connection-unresponsive')
})

test('receiving RTC data cannot extend an authorization lease without its central acknowledgment', async t => {
  const f = await resumableFixture(t), transport = activeRemoteTransport()
  f.browser.dispatchEvent(new Event('online'))
  const probe = await foregroundProbe(f.peer)
  f.peer.channel.message({ type: 'response', id: probe.id, status: 200, headers: {} })
  t.mock.timers.tick(250)
  assert.equal(activeRemoteTransport(), transport)
  t.mock.timers.tick(58_751)
  assert.equal(f.peer.channel.readyState, 'closed')
  assert.match(f.errors.at(-1)!, /인증 연결/)
})

test('an expired authorization fails immediately on foreground even before frozen timers resume', async t => {
  const f = await resumableFixture(t), before = f.signal.sent.filter(value => value.type === 'renew').length
  f.document.visibilityState = 'hidden'; f.document.dispatchEvent(new Event('visibilitychange'))
  t.mock.timers.setTime(Date.now() + 60 * 60 * 1000)
  f.document.visibilityState = 'visible'; f.document.dispatchEvent(new Event('visibilitychange'))
  assert.equal(f.peer.channel.readyState, 'closed')
  assert.equal(f.signal.sent.filter(value => value.type === 'renew').length, before, 'return events cannot renew expired authorization')
  assert.equal(foregroundFrames(f.peer).some(frame => frame.id?.startsWith('remote-check-')), false)
})

test('a queued renewal acknowledgment cannot revive authorization after sleep when the monotonic clock barely advances', async t => {
  const f = await resumableFixture(t)
  const renewal = f.signal.sent.findLast(value => value.type === 'renew') as { type: string; request: string }
  f.document.visibilityState = 'hidden'; f.document.dispatchEvent(new Event('visibilitychange'))
  t.mock.timers.setTime(Date.now() + 10 * 60 * 1000)
  f.signal.onmessage?.({ data: JSON.stringify({ type: 'lease', connection: 'connection', request: renewal.request, remaining: 60_000 }) })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(f.peer.channel.readyState, 'closed', 'lease time is counted from request transmission on both clocks')
  f.document.visibilityState = 'visible'; f.document.dispatchEvent(new Event('visibilitychange'))
  assert.equal(f.states.filter(state => state === 'connected').length, 1)
})

test('a queued signaling resume acknowledgment cannot revive a lease after wall-clock sleep', async t => {
  const f = await resumableFixture(t)
  f.signal.close(1006); t.mock.timers.tick(0)
  const signal = FakeSignal.latest, nonce = 'n'.repeat(32)
  signal.onmessage?.({ data: JSON.stringify({ type: 'challenge', protocol: 1, nonce, signalResume: true }) })
  await until(() => signal.sent.some(value => value.type === 'resume'))
  t.mock.timers.setTime(Date.now() + 10 * 60 * 1000)
  signal.onmessage?.({ data: JSON.stringify({ type: 'resumed', connection: 'connection', nonce, remaining: 58_000 }) })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(f.peer.channel.readyState, 'closed')
  assert.equal(f.states.filter(state => state === 'connected').length, 1)
})

test('stream quota waiting cancels only its queued foreground probe instead of declaring a live peer dead', async t => {
  const f = fixture(t), transport = activeRemoteTransport()!
  await Promise.all(Array.from({ length: 16 }, (_, index) => transport.forward({ type: 'request', id: `busy-${index}`, method: 'GET', path: '/api/files', headers: {} })))
  f.browser.dispatchEvent(new Event('online'))
  await new Promise(resolve => setImmediate(resolve))
  t.mock.timers.tick(250)
  assert.equal(activeRemoteTransport(), transport)
  assert.equal(f.peer.channel.readyState, 'open')
  f.peer.channel.message({ type: 'end', id: 'busy-0' })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(foregroundFrames(f.peer).some(frame => frame.id.startsWith('remote-check-')), false, 'canceled admission cannot send a late probe')
  await transport.forward({ type: 'request', id: 'next-app-read', method: 'GET', path: '/api/files', headers: {} })
  assert.deepEqual(f.errors, [])
})

test('local DataChannel backpressure does not start a foreground failure deadline', async t => {
  const f = fixture(t), transport = activeRemoteTransport()
  f.peer.channel.bufferedAmount = 1024 * 1024
  f.browser.dispatchEvent(new Event('online'))
  t.mock.timers.tick(500)
  assert.equal(activeRemoteTransport(), transport)
  assert.equal(foregroundFrames(f.peer).some(frame => frame.id?.startsWith('remote-check-')), false)
  assert.deepEqual(f.errors, [])
})

for (const action of ['hide', 'dispose', 'access-revoked', 'session-expired']) test(`${action} cancels a foreground probe without a late failure or transport resurrection`, async t => {
  const f = fixture(t)
  f.browser.dispatchEvent(new Event('online'))
  const probe = await foregroundProbe(f.peer)
  if (action === 'hide') { f.document.visibilityState = 'hidden'; f.document.dispatchEvent(new Event('visibilitychange')) }
  else if (action === 'dispose') f.close()
  else {
    f.signal.onmessage?.({ data: JSON.stringify({ type: 'error', code: action }) })
    await until(() => f.peer.channel.readyState === 'closed')
  }
  f.peer.channel.message({ type: 'response', id: probe.id, status: 200, headers: {} })
  t.mock.timers.tick(500)
  assert.equal(f.errors.length, 0)
  assert.equal(f.peer.channel.readyState, action === 'hide' ? 'open' : 'closed')
  assert.equal(f.states.filter(state => state === 'connected').length, 1)
})

test('foreground probing bypasses the ordinary five-second RTC disconnected grace only when its data path stalls', async t => {
  const f = fixture(t)
  f.peer.state('disconnected')
  f.browser.dispatchEvent(new Event('online'))
  await foregroundProbe(f.peer)
  await new Promise(resolve => setImmediate(resolve))
  t.mock.timers.tick(250)
  assert.equal(f.peer.channel.readyState, 'closed')
  assert.equal(f.codes.at(-1), 'connection-unresponsive')
  assert.equal(f.states.includes('reconnecting'), false)
})

test('a visible RTC disconnection checks its data path immediately and replaces a stalled peer after 250ms', async t => {
  const f = fixture(t)
  let now = 0
  t.mock.method(performance, 'now', () => now)
  f.peer.state('disconnected')
  const probe = await foregroundProbe(f.peer)
  assert.equal(probe.method, 'HEAD')
  assert.equal(probe.path, '/api/remote-ui/file?path=/favicon.ico')
  now = 249; t.mock.timers.tick(249)
  assert.equal(f.peer.channel.readyState, 'open')
  now = 250; t.mock.timers.tick(1)
  assert.equal(f.peer.channel.readyState, 'closed')
  assert.equal(f.codes.at(-1), 'connection-unresponsive')
  assert.deepEqual(f.states, ['connected', 'error'])
  t.mock.timers.tick(5000)
  assert.equal(f.errors.length, 1, 'replacement cancels the superseded grace and delayed notice')
})

test('a healthy visible RTC interruption keeps the same peer and pending write without replay', async t => {
  const f = fixture(t), transport = activeRemoteTransport()!
  let now = 0
  t.mock.method(performance, 'now', () => now)
  const pending = transport.fetch('/api/files', { method: 'POST', body: 'preserve this draft' })
  await until(() => foregroundFrames(f.peer).some(frame => frame.type === 'end'))
  const write = foregroundFrames(f.peer).find(frame => frame.type === 'request' && frame.path === '/api/files')!
  f.peer.state('disconnected')
  const probe = await foregroundProbe(f.peer)
  now = 200; t.mock.timers.tick(200)
  f.peer.channel.message({ type: 'response', id: probe.id, status: 200, headers: {} })
  f.peer.state('connected')
  f.peer.channel.message({ type: 'response', id: write.id, status: 204, headers: {} })
  f.peer.channel.message({ type: 'end', id: write.id })
  assert.equal((await pending).status, 204)
  now += 5000; t.mock.timers.tick(5000)
  assert.equal(activeRemoteTransport(), transport)
  assert.equal(foregroundFrames(f.peer).filter(frame => frame.type === 'request' && frame.path === '/api/files').length, 1)
  assert.deepEqual(f.states, ['connected'])
})

test('a new RTC disconnection probes even immediately after a healthy foreground check', async t => {
  const f = fixture(t)
  let now = 0
  t.mock.method(performance, 'now', () => now)
  f.browser.dispatchEvent(new Event('online'))
  const previous = await foregroundProbe(f.peer)
  f.peer.channel.message({ type: 'response', id: previous.id, status: 200, headers: {} })
  now = 50; t.mock.timers.tick(50)
  f.peer.state('disconnected')
  await until(() => foregroundFrames(f.peer).filter(frame => frame.type === 'request').length === 2)
  const probes = foregroundFrames(f.peer).filter(frame => frame.type === 'request')
  assert.notEqual(probes[0].id, probes[1].id)
  f.peer.channel.message({ type: 'response', id: previous.id, status: 200, headers: {} })
  now = 300; t.mock.timers.tick(250)
  assert.equal(f.codes.at(-1), 'connection-unresponsive', 'the prior live response cannot satisfy the new interruption')
})

test('RTC disconnection and foreground event bursts share one probe and one failure deadline', async t => {
  const f = fixture(t)
  let now = 0
  t.mock.method(performance, 'now', () => now)
  f.peer.state('disconnected')
  await foregroundProbe(f.peer)
  now = 100; t.mock.timers.tick(100)
  f.peer.state('disconnected')
  f.browser.dispatchEvent(new Event('online'))
  f.browser.dispatchEvent(new Event('pageshow'))
  f.document.dispatchEvent(new Event('visibilitychange'))
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(foregroundFrames(f.peer).filter(frame => frame.type === 'request').length, 1)
  now = 250; t.mock.timers.tick(150)
  assert.equal(f.codes.at(-1), 'connection-unresponsive')
  assert.equal(f.errors.length, 1)
})

test('a hidden RTC interruption retains its five-second grace without probing', async t => {
  const f = fixture(t)
  f.document.visibilityState = 'hidden'
  f.peer.state('disconnected')
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(foregroundFrames(f.peer).some(frame => frame.type === 'request'), false)
  t.mock.timers.tick(4999)
  assert.equal(f.peer.channel.readyState, 'open')
  t.mock.timers.tick(1)
  assert.equal(f.peer.channel.readyState, 'closed')
  assert.equal(f.errors.length, 1)
  assert.notEqual(f.codes.at(-1), 'connection-unresponsive')
})

test('returning during a hidden RTC interruption starts its fast data-path check immediately', async t => {
  const f = fixture(t)
  let now = 0
  t.mock.method(performance, 'now', () => now)
  f.document.visibilityState = 'hidden'
  f.peer.state('disconnected')
  now = 500; t.mock.timers.tick(500)
  f.document.visibilityState = 'visible'; f.document.dispatchEvent(new Event('visibilitychange'))
  await foregroundProbe(f.peer)
  now = 750; t.mock.timers.tick(250)
  assert.equal(f.codes.at(-1), 'connection-unresponsive')
})

test('an immediate RTC interruption check retains the existing RTT allowance', async t => {
  const f = fixture(t)
  let now = 0
  t.mock.method(performance, 'now', () => now)
  t.mock.method(f.peer, 'getStats', async () => candidateStats(0.2))
  f.peer.state('disconnected')
  await foregroundProbe(f.peer)
  now = 649; t.mock.timers.tick(649)
  assert.equal(f.peer.channel.readyState, 'open')
  now = 650; t.mock.timers.tick(1)
  assert.equal(f.codes.at(-1), 'connection-unresponsive')
})

test('a visible RTC interruption cannot probe or extend an authorization that expired while timers were frozen', async t => {
  const f = await resumableFixture(t)
  const before = f.signal.sent.filter(value => value.type === 'renew').length
  t.mock.timers.setTime(Date.now() + 60 * 60 * 1000)
  f.peer.state('disconnected')
  assert.equal(f.peer.channel.readyState, 'closed')
  assert.equal(f.signal.sent.filter(value => value.type === 'renew').length, before)
  assert.equal(foregroundFrames(f.peer).some(frame => frame.id?.startsWith('remote-check-')), false)
  assert.match(f.errors.at(-1)!, /인증 연결/)
})

for (const congestion of ['slots', 'backpressure']) test(`a visible RTC interruption with local ${congestion} retains its grace without a false fast failure`, async t => {
  const f = fixture(t), transport = activeRemoteTransport()!
  if (congestion === 'slots') await Promise.all(Array.from({ length: 16 }, (_, index) => transport.forward({ type: 'request', id: `busy-${index}`, method: 'GET', path: '/api/files', headers: {} })))
  else f.peer.channel.bufferedAmount = 1024 * 1024
  f.peer.state('disconnected')
  await new Promise(resolve => setImmediate(resolve))
  t.mock.timers.tick(250)
  assert.equal(f.peer.channel.readyState, 'open')
  assert.equal(activeRemoteTransport(), transport)
  if (congestion === 'slots') f.peer.channel.message({ type: 'end', id: 'busy-0' })
  else f.peer.channel.bufferedAmount = 0
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(foregroundFrames(f.peer).some(frame => frame.id.startsWith('remote-check-')), false)
  f.peer.state('connected')
  t.mock.timers.tick(5000)
  assert.equal(activeRemoteTransport(), transport)
  assert.deepEqual(f.errors, [])
})

for (const action of ['hide', 'dispose', 'access-revoked', 'session-expired']) test(`${action} cancels a fast RTC interruption check without a late replacement`, async t => {
  const f = fixture(t)
  f.peer.state('disconnected')
  const probe = await foregroundProbe(f.peer)
  if (action === 'hide') { f.document.visibilityState = 'hidden'; f.document.dispatchEvent(new Event('visibilitychange')) }
  else if (action === 'dispose') f.close()
  else {
    f.signal.onmessage?.({ data: JSON.stringify({ type: 'error', code: action }) })
    await until(() => f.peer.channel.readyState === 'closed')
  }
  f.peer.channel.message({ type: 'response', id: probe.id, status: 200, headers: {} })
  t.mock.timers.tick(500)
  assert.equal(f.errors.length, 0)
  assert.equal(f.peer.channel.readyState, action === 'hide' ? 'open' : 'closed')
  assert.equal(f.states.filter(state => state === 'connected').length, 1)
})
