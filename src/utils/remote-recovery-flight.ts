import { sdpFingerprint } from '../../shared/remote-access.ts'
import { REMOTE_RECOVERY_FLIGHT_MAX_PROTOCOL, REMOTE_RECOVERY_FLIGHT_MAX_TOKEN, REMOTE_RECOVERY_FLIGHT_PREFIX, REMOTE_RECOVERY_FLIGHT_PROTOCOL, REMOTE_RECOVERY_FLIGHT_TTL, type RemoteRecoveryFlightClock } from '../../shared/remote-recovery-flight.ts'

const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
const json = (value: unknown) => encode(new TextEncoder().encode(JSON.stringify(value)))
const digest = async (value: string) => encode(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))))

function estimatedServerTime(clock?: RemoteRecoveryFlightClock): number | undefined {
  if (!clock || !Number.isSafeInteger(clock.serverTime) || clock.serverTime <= 0 || !Number.isFinite(clock.receivedAt) || !Number.isSafeInteger(clock.wallTime)) return
  const elapsed = performance.now() - clock.receivedAt
  if (elapsed < 0 || !Number.isFinite(elapsed) || Math.abs(Date.now() - clock.wallTime - elapsed) > 2000) return
  const now = clock.serverTime + elapsed
  return Number.isSafeInteger(Math.floor(now)) ? now : undefined
}

/** A replacement RTC offer is dated from the last central challenge; it carries no login credentials. */
export async function remoteRecoveryFlightProtocols(origin: string, instance: string, sdp: string, pair: CryptoKeyPair, clock?: RemoteRecoveryFlightClock): Promise<string[] | undefined> {
  const now = estimatedServerTime(clock)
  if (now === undefined || !/^[A-Za-z0-9_-]{20,64}$/.test(instance) || sdp.length > 4096 || !sdp.startsWith('v=0') || /^a=(?:candidate:|end-of-candidates)/m.test(sdp)) return
  const exported = await crypto.subtle.exportKey('jwk', pair.publicKey)
  if (exported.kty !== 'OKP' || exported.crv !== 'Ed25519' || typeof exported.x !== 'string' || exported.d !== undefined || pair.privateKey.type !== 'private' || pair.privateKey.algorithm.name !== 'Ed25519') throw new Error('브라우저 연결 키를 확인하지 못했습니다.')
  const publicKey = { kty: 'OKP', crv: 'Ed25519', x: exported.x }
  const thumbprint = await digest(JSON.stringify({ crv: publicKey.crv, kty: publicKey.kty, x: publicKey.x }))
  const iat = Math.floor(now / 1000), exp = iat + REMOTE_RECOVERY_FLIGHT_TTL / 1000
  const header = json({ alg: 'EdDSA', typ: 'JWT' })
  const payload = json({ kind: 'rtc-recovery-connect-v1', instance, sdp, fingerprint: sdpFingerprint(sdp), publicKey, serverRenewal: true, signalResume: true,
    iss: 'mew-browser', aud: `${origin}/recovery-connect`, sub: thumbprint, jti: encode(crypto.getRandomValues(new Uint8Array(24))), iat, exp })
  const unsigned = `${header}.${payload}`
  const signature = await crypto.subtle.sign('Ed25519', pair.privateKey, new TextEncoder().encode(unsigned))
  const token = `${unsigned}.${encode(new Uint8Array(signature))}`
  const protocols = [REMOTE_RECOVERY_FLIGHT_PROTOCOL, `${REMOTE_RECOVERY_FLIGHT_PREFIX}${token}`]
  const after = estimatedServerTime(clock)
  if (after === undefined || exp * 1000 <= after + 2000 || token.length > REMOTE_RECOVERY_FLIGHT_MAX_TOKEN || protocols.join(', ').length > REMOTE_RECOVERY_FLIGHT_MAX_PROTOCOL) return
  return protocols
}
