import type { JWK } from 'jose'

export const REMOTE_RECOVERY_FLIGHT_PROTOCOL = 'mew-recovery-v1'
export const REMOTE_RECOVERY_FLIGHT_PREFIX = 'mew-recovery.'
export const REMOTE_RECOVERY_FLIGHT_META = 'mewlink-recovery-flight'
export const REMOTE_RECOVERY_FLIGHT_MAX_PROTOCOL = 12 * 1024
export const REMOTE_RECOVERY_FLIGHT_MAX_TOKEN = 8192
export const REMOTE_RECOVERY_FLIGHT_TTL = 10_000

/** A received server-time hint is used only to date the next offer, never to extend a lease. */
export type RemoteRecoveryFlightClock = { serverTime: number; receivedAt: number; wallTime: number }

export type RemoteRecoveryFlight = {
  kind: 'rtc-recovery-connect-v1'
  instance: string
  sdp: string
  fingerprint: string
  publicKey: JWK
  serverRenewal: boolean
  signalResume: boolean
}

/** Select a public verification key only. Authority comes from verification by the central service. */
export function parseRemoteRecoveryFlight(token: string): RemoteRecoveryFlight {
  if (typeof token !== 'string' || token.length > REMOTE_RECOVERY_FLIGHT_MAX_TOKEN || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) throw new Error('invalid-recovery-flight')
  const encoded = token.split('.')[1]
  const bytes = Uint8Array.from(atob(encoded.replaceAll('-', '+').replaceAll('_', '/')), value => value.charCodeAt(0))
  const value = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes)) as Partial<RemoteRecoveryFlight> | null
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.kind !== 'rtc-recovery-connect-v1' ||
    typeof value.instance !== 'string' || !/^[A-Za-z0-9_-]{20,64}$/.test(value.instance) ||
    typeof value.sdp !== 'string' || value.sdp.length > 4096 || !value.sdp.startsWith('v=0') || /^a=(?:candidate:|end-of-candidates)/m.test(value.sdp) ||
    typeof value.fingerprint !== 'string' || value.fingerprint.length > 128 ||
    !value.publicKey || value.publicKey.kty !== 'OKP' || value.publicKey.crv !== 'Ed25519' || typeof value.publicKey.x !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value.publicKey.x) ||
    Object.keys(value.publicKey).some(key => !['kty', 'crv', 'x'].includes(key)) ||
    typeof value.serverRenewal !== 'boolean' || typeof value.signalResume !== 'boolean') throw new Error('invalid-recovery-flight')
  return { kind: value.kind, instance: value.instance, sdp: value.sdp, fingerprint: value.fingerprint, publicKey: value.publicKey, serverRenewal: value.serverRenewal, signalResume: value.signalResume }
}
