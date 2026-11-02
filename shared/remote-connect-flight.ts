import type { JWK } from 'jose'

export const REMOTE_CONNECT_FLIGHT_PREFIX = 'mew-connect.'
export const REMOTE_CONNECT_FLIGHT_META = 'mewlink-connect-flight'
export const REMOTE_CONNECT_FLIGHT_MAX_PROTOCOL = 12 * 1024
export const REMOTE_CONNECT_FLIGHT_MAX_TOKEN = 8192

export type RemoteConnectFlight = {
  instance: string
  admission: string
  nonce: string
  sdp: string
  fingerprint: string
  publicKey: JWK
  serverRenewal: boolean
  signalResume: boolean
}

/** Decoding selects the verification key only; the caller must verify the JWT before use. */
export function parseRemoteConnectFlight(token: string): RemoteConnectFlight {
  if (typeof token !== 'string' || token.length > REMOTE_CONNECT_FLIGHT_MAX_TOKEN || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) throw new Error('invalid-connect-flight')
  const encoded = token.split('.')[1]
  const bytes = Uint8Array.from(atob(encoded.replaceAll('-', '+').replaceAll('_', '/')), value => value.charCodeAt(0))
  const value = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes)) as Partial<RemoteConnectFlight> | null
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
    typeof value.instance !== 'string' || !/^[A-Za-z0-9_-]{20,64}$/.test(value.instance) ||
    typeof value.nonce !== 'string' || !/^[A-Za-z0-9_-]{20,64}$/.test(value.nonce) ||
    typeof value.admission !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value.admission) ||
    typeof value.sdp !== 'string' || value.sdp.length > 4096 || !value.sdp.startsWith('v=0') || /^a=(?:candidate:|end-of-candidates)/m.test(value.sdp) ||
    typeof value.fingerprint !== 'string' || value.fingerprint.length > 128 ||
    !value.publicKey || value.publicKey.kty !== 'OKP' || value.publicKey.crv !== 'Ed25519' || typeof value.publicKey.x !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value.publicKey.x) ||
    Object.keys(value.publicKey).some(key => !['kty', 'crv', 'x'].includes(key)) ||
    typeof value.serverRenewal !== 'boolean' || typeof value.signalResume !== 'boolean') throw new Error('invalid-connect-flight')
  return { instance: value.instance, admission: value.admission, nonce: value.nonce, sdp: value.sdp, fingerprint: value.fingerprint, publicKey: value.publicKey, serverRenewal: value.serverRenewal, signalResume: value.signalResume }
}
