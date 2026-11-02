import { REMOTE_ADMISSION_PREFIX, REMOTE_ADMISSION_PROTOCOL } from '../../shared/remote-bootstrap.ts'
import { REMOTE_CONNECT_FLIGHT_MAX_PROTOCOL, REMOTE_CONNECT_FLIGHT_MAX_TOKEN, REMOTE_CONNECT_FLIGHT_PREFIX, type RemoteConnectFlight } from '../../shared/remote-connect-flight.ts'
import { sdpFingerprint } from '../../shared/remote-access.ts'

const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
const json = (value: unknown) => encode(new TextEncoder().encode(JSON.stringify(value)))
const digest = async (value: string) => encode(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))))

/** Prepare only the public offer; local login and final host authentication remain on the verified channel. */
export async function remoteConnectFlightProtocols(origin: string, instance: string, admission: string, sdp: string, pair: CryptoKeyPair, options: { allowElapsedAdmission?: boolean } = {}): Promise<string[] | undefined> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(instance) || admission.length > 8192 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(admission) || sdp.length > 4096 || /^a=(?:candidate:|end-of-candidates)/m.test(sdp)) return
  let grant: { jti?: unknown; sub?: unknown; instance?: unknown; expires?: unknown; iat?: unknown }
  try {
    const bytes = Uint8Array.from(atob(admission.split('.')[1].replaceAll('-', '+').replaceAll('_', '/')), value => value.charCodeAt(0))
    grant = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch { return }
  if (!grant || typeof grant !== 'object' || typeof grant.jti !== 'string' || !/^[A-Za-z0-9_-]{20,64}$/.test(grant.jti) || grant.sub !== instance || grant.instance !== instance || typeof grant.iat !== 'number' || !Number.isSafeInteger(grant.iat) || typeof grant.expires !== 'number' || !Number.isSafeInteger(grant.expires) || !options.allowElapsedAdmission && grant.expires <= Date.now() + 2000 || grant.expires - grant.iat * 1000 > 11000) return
  const exported = await crypto.subtle.exportKey('jwk', pair.publicKey)
  if (exported.kty !== 'OKP' || exported.crv !== 'Ed25519' || typeof exported.x !== 'string' || exported.d !== undefined || pair.privateKey.type !== 'private' || pair.privateKey.algorithm.name !== 'Ed25519') throw new Error('브라우저 연결 키를 확인하지 못했습니다.')
  const publicKey = { kty: 'OKP', crv: 'Ed25519', x: exported.x }
  const [admissionHash, thumbprint] = await Promise.all([digest(admission), digest(JSON.stringify({ crv: publicKey.crv, kty: publicKey.kty, x: publicKey.x }))])
  const claims: RemoteConnectFlight = { instance, admission: admissionHash, nonce: grant.jti, sdp, fingerprint: sdpFingerprint(sdp), publicKey, serverRenewal: true, signalResume: true }
  const header = json({ alg: 'EdDSA', typ: 'JWT' })
  const payload = json({ ...claims, iss: 'mew-browser', aud: `${origin}/connect-flight`, sub: thumbprint, jti: grant.jti, iat: grant.iat, exp: Math.floor(grant.expires / 1000) })
  const unsigned = `${header}.${payload}`
  const signature = await crypto.subtle.sign('Ed25519', pair.privateKey, new TextEncoder().encode(unsigned))
  const token = `${unsigned}.${encode(new Uint8Array(signature))}`
  const protocols = [REMOTE_ADMISSION_PROTOCOL, `${REMOTE_ADMISSION_PREFIX}${admission}`, `${REMOTE_CONNECT_FLIGHT_PREFIX}${token}`]
  if (!options.allowElapsedAdmission && grant.expires <= Date.now() + 2000 || token.length > REMOTE_CONNECT_FLIGHT_MAX_TOKEN || protocols.join(', ').length > REMOTE_CONNECT_FLIGHT_MAX_PROTOCOL) return
  return protocols
}
