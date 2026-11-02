import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateJwkThumbprint, importJWK, jwtVerify } from 'jose'
import { hashSecret, remoteKeyPair, signRemoteToken } from '../../shared/remote-access-crypto.ts'
import { parseRemoteConnectFlight, REMOTE_CONNECT_FLIGHT_PREFIX } from '../../shared/remote-connect-flight.ts'
import { remoteConnectFlightProtocols } from './remote-connect-flight.ts'

const origin = 'https://central.example.test', instance = 'connect-flight-fixture-instance'
const sdp = `v=0\r\na=fingerprint:sha-256 ${Array(32).fill('AB').join(':')}\r\n`
async function fixture() {
  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify'])
  const central = await remoteKeyPair()
  const nonce = 'connect-flight-fixture-admission'
  const admission = await signRemoteToken(central.privateKey, origin, 'mew-bootstrap-admission', instance, { instance, expires: Date.now() + 10000, jti: nonce }, 10000)
  return { pair, admission }
}

test('the first Upgrade carries an independently verifiable offer bound to the exact admission and non-extractable browser key', async () => {
  const { pair, admission } = await fixture()
  const protocols = await remoteConnectFlightProtocols(origin, instance, admission, sdp, pair)
  assert.ok(protocols)
  assert.equal(protocols[0], 'mew-admission-v1')
  assert.equal(protocols[1], `mew-admission.${admission}`)
  const token = protocols[2].slice(REMOTE_CONNECT_FLIGHT_PREFIX.length)
  const flight = parseRemoteConnectFlight(token)
  const { payload } = await jwtVerify(token, await importJWK(flight.publicKey, 'EdDSA'), { algorithms: ['EdDSA'], issuer: 'mew-browser', audience: `${origin}/connect-flight` })
  assert.equal(payload.sub, await calculateJwkThumbprint(flight.publicKey))
  assert.equal(payload.admission, hashSecret(admission))
  const grant = JSON.parse(Buffer.from(admission.split('.')[1], 'base64url').toString())
  assert.equal(payload.nonce, grant.jti)
  assert.equal(flight.sdp, sdp)
  assert.equal(flight.instance, instance)
  assert.equal(flight.signalResume, true)
  assert.equal(flight.serverRenewal, true)
  assert.equal(flight.publicKey.d, undefined)
  assert.equal(pair.privateKey.extractable, false)
  assert.equal(Number(payload.exp) - Number(payload.iat) <= 10, true)
  assert.equal(protocols.join(', ').length < 12288, true)
  assert.equal(JSON.stringify(payload).includes('session'), false)
})

test('offer substitution or another browser key cannot verify a prepared Upgrade', async () => {
  const { pair, admission } = await fixture()
  const protocols = await remoteConnectFlightProtocols(origin, instance, admission, sdp, pair)
  const token = protocols![2].slice(REMOTE_CONNECT_FLIGHT_PREFIX.length)
  const flight = parseRemoteConnectFlight(token), parts = token.split('.')
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
  parts[1] = Buffer.from(JSON.stringify({ ...payload, sdp: sdp.replace('AB', 'CD') })).toString('base64url')
  await assert.rejects(jwtVerify(parts.join('.'), await importJWK(flight.publicKey, 'EdDSA')))
  const other = await remoteKeyPair()
  await assert.rejects(jwtVerify(token, await importJWK(other.publicKey, 'EdDSA')))
})

test('the primer and controller independently prepare identical one-use Upgrade protocols', async () => {
  const { pair, admission } = await fixture()
  const [first, second] = await Promise.all([
    remoteConnectFlightProtocols(origin, instance, admission, sdp, pair),
    remoteConnectFlightProtocols(origin, instance, admission, sdp, pair),
  ])
  assert.deepEqual(first, second, 'the same admission, original offer and key must adopt the primed socket exactly once')
})

test('admission expiry during asynchronous signing cannot create a new signed Upgrade', async t => {
  const { pair, admission } = await fixture(), sign = crypto.subtle.sign.bind(crypto.subtle)
  const grant = JSON.parse(Buffer.from(admission.split('.')[1], 'base64url').toString())
  const signedAt = Date.now()
  let now = signedAt
  t.mock.method(Date, 'now', () => now)
  t.mock.method(crypto.subtle, 'sign', async (...args: Parameters<typeof sign>) => {
    const signature = await Reflect.apply(sign, crypto.subtle, args)
    now = grant.expires + 1
    return signature
  })
  assert.equal(await remoteConnectFlightProtocols(origin, instance, admission, sdp, pair), undefined)
  now = signedAt
  const adopted = await remoteConnectFlightProtocols(origin, instance, admission, sdp, pair, { allowElapsedAdmission: true })
  assert.ok(adopted, 'only reconstruction for an existing primed socket may retain the elapsed exact signature')
})

test('an already admitted socket can reconstruct the identical protocol after freshness elapses without enabling a fresh Upgrade', async t => {
  const { pair, admission } = await fixture()
  const first = await remoteConnectFlightProtocols(origin, instance, admission, sdp, pair)
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() + 9000 })
  assert.equal(await remoteConnectFlightProtocols(origin, instance, admission, sdp, pair), undefined)
  assert.deepEqual(await remoteConnectFlightProtocols(origin, instance, admission, sdp, pair, { allowElapsedAdmission: true }), first)
})

for (const reason of ['invalid-admission', 'wrong-instance', 'nearly-expired', 'oversized-offer', 'candidate', 'end-of-candidates']) test(`an unusable ${reason} retains the ordinary challenge path`, async () => {
  const f = await fixture()
  let admission = f.admission, offer = sdp, target = instance
  if (reason === 'invalid-admission') admission = 'not-a-signed-admission'
  if (reason === 'wrong-instance') target = 'different-connect-flight-instance'
  if (reason === 'nearly-expired') {
    const parts = admission.split('.'), grant = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
    parts[1] = Buffer.from(JSON.stringify({ ...grant, expires: Date.now() + 1000 })).toString('base64url'); admission = parts.join('.')
  }
  if (reason === 'oversized-offer') offer += 'a'.repeat(4096)
  if (reason === 'candidate') offer += 'a=candidate:1 1 udp 1 192.0.2.1 5000 typ host\r\n'
  if (reason === 'end-of-candidates') offer += 'a=end-of-candidates\r\n'
  assert.equal(await remoteConnectFlightProtocols(origin, target, admission, offer, f.pair), undefined)
})
