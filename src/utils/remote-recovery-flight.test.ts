import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateJwkThumbprint, importJWK, jwtVerify } from 'jose'
import { REMOTE_RECOVERY_FLIGHT_PREFIX, REMOTE_RECOVERY_FLIGHT_PROTOCOL, parseRemoteRecoveryFlight } from '../../shared/remote-recovery-flight.ts'
import { remoteRecoveryFlightProtocols } from './remote-recovery-flight.ts'

const origin = 'https://central.example.test', instance = 'recovery-flight-fixture-instance'
const sdp = `v=0\r\na=fingerprint:sha-256 ${Array(32).fill('AB').join(':')}\r\n`
const clock = () => ({ serverTime: Date.now(), receivedAt: performance.now(), wallTime: Date.now() })
const keyPair = () => crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify'])

test('a fresh recovery Upgrade signs only the offer, instance, origin and existing non-extractable key', async () => {
  const pair = await keyPair(), timing = clock()
  const protocols = await remoteRecoveryFlightProtocols(origin, instance, sdp, pair, timing)
  assert.ok(protocols)
  assert.equal(protocols[0], REMOTE_RECOVERY_FLIGHT_PROTOCOL)
  assert.equal(protocols.length, 2)
  const token = protocols[1].slice(REMOTE_RECOVERY_FLIGHT_PREFIX.length), flight = parseRemoteRecoveryFlight(token)
  const { payload } = await jwtVerify(token, await importJWK(flight.publicKey, 'EdDSA'), { issuer: 'mew-browser', audience: `${origin}/recovery-connect`, algorithms: ['EdDSA'] })
  assert.equal(payload.kind, 'rtc-recovery-connect-v1')
  assert.equal(payload.sub, await calculateJwkThumbprint(flight.publicKey))
  assert.match(payload.jti!, /^[A-Za-z0-9_-]{32}$/)
  assert.equal(Number(payload.exp) - Number(payload.iat), 10)
  assert.equal(flight.sdp, sdp)
  assert.equal(flight.instance, instance)
  assert.equal(pair.privateKey.extractable, false)
  assert.equal(flight.publicKey.d, undefined)
  for (const field of ['admission', 'nonce', 'session', 'account', 'identity', 'generation', 'challenge']) assert.equal(Object.hasOwn(payload, field), false)
  assert.equal(protocols.join(', ').length < 12 * 1024, true)
})

test('each replacement is independently single-use and another key or origin cannot verify it', async () => {
  const pair = await keyPair(), timing = clock()
  const first = await remoteRecoveryFlightProtocols(origin, instance, sdp, pair, timing)
  const second = await remoteRecoveryFlightProtocols(origin, instance, sdp, pair, timing)
  assert.notDeepEqual(first, second)
  const token = first![1].slice(REMOTE_RECOVERY_FLIGHT_PREFIX.length), other = await keyPair()
  await assert.rejects(jwtVerify(token, other.publicKey, { issuer: 'mew-browser', audience: `${origin}/recovery-connect` }))
  await assert.rejects(jwtVerify(token, pair.publicKey, { issuer: 'mew-browser', audience: 'https://other.example.test/recovery-connect' }))
  await assert.rejects(jwtVerify(token, pair.publicKey, { issuer: 'mew-browser', audience: `${origin}/signal-resume` }))
})

test('a fixed browser wall-clock offset does not alter the server-derived proof timestamps', async t => {
  const serverTime = Date.now(), pair = await keyPair()
  t.mock.method(Date, 'now', () => serverTime + 86_400_000)
  const timing = { serverTime, receivedAt: performance.now(), wallTime: Date.now() }
  const protocols = await remoteRecoveryFlightProtocols(origin, instance, sdp, pair, timing)
  const token = protocols![1].slice(REMOTE_RECOVERY_FLIGHT_PREFIX.length)
  const { payload } = await jwtVerify(token, pair.publicKey, { issuer: 'mew-browser', audience: `${origin}/recovery-connect`, currentDate: new Date(serverTime) })
  assert.equal(payload.iat, Math.floor(serverTime / 1000))
})

test('clock steps, stopped monotonic time and absent anchors retain ordinary nonce negotiation', async () => {
  const pair = await keyPair(), timing = clock()
  for (const value of [undefined, { ...timing, receivedAt: performance.now() + 5000 }, { ...timing, wallTime: timing.wallTime - 60_000 }, { ...timing, serverTime: NaN }, { ...timing, serverTime: -1 }]) {
    assert.equal(await remoteRecoveryFlightProtocols(origin, instance, sdp, pair, value), undefined)
  }
})

test('expiry during asynchronous signing cannot create a stale replacement Upgrade', async t => {
  const pair = await keyPair(), wall = Date.now(), sign = crypto.subtle.sign.bind(crypto.subtle)
  let elapsed = 0
  t.mock.method(Date, 'now', () => wall + elapsed)
  t.mock.method(performance, 'now', () => elapsed)
  t.mock.method(crypto.subtle, 'sign', async (...args: Parameters<typeof sign>) => {
    const result = await Reflect.apply(sign, crypto.subtle, args)
    elapsed = 11_000
    return result
  })
  assert.equal(await remoteRecoveryFlightProtocols(origin, instance, sdp, pair, { serverTime: wall, wallTime: wall, receivedAt: 0 }), undefined)
})

for (const [name, offer, target] of [
  ['candidate', `${sdp}a=candidate:1 1 udp 1 192.0.2.1 9000 typ host\r\n`, instance],
  ['end-of-candidates', `${sdp}a=end-of-candidates\r\n`, instance],
  ['oversized', `${sdp}${'a'.repeat(4096)}`, instance],
  ['bad target', sdp, 'short'],
] as const) test(`an unusable ${name} offer does not advertise a recovery flight`, async () => {
  assert.equal(await remoteRecoveryFlightProtocols(origin, target, offer, await keyPair(), clock()), undefined)
})
