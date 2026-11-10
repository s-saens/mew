export interface NativeAsset {
  bodyBase64: string
  mimeType: string
  sha256: string
  etag: string
  storedAt: number
}

export interface NativeDirectBridge {
  reload(): Promise<unknown>
  fetch(request: { id: string; path: string; method: string; headers: [string, string][]; bodyBase64?: string }): Promise<{ status: number; headers: [string, string][]; bodyBase64: string }>
  cancel(request: { id: string }): Promise<unknown>
  openSocket(request: { id: string; path: string; protocols: string[] }): Promise<unknown>
  sendSocket(request: { id: string; bodyBase64: string; binary: boolean }): Promise<unknown>
  closeSocket(request: { id: string; code?: number; reason?: string }): Promise<unknown>
}

export interface MewNativeBridge {
  readonly version: 1
  readonly connection: { kind: 'direct' | 'mewlink'; scope: string; endpoint: string }
  readonly direct?: NativeDirectBridge
  readonly cache: {
    get(key: { scope: string; path: string }): Promise<NativeAsset | null>
    put(value: NativeAsset & { scope: string; path: string }): Promise<unknown>
    remove(key: { scope: string; path: string }): Promise<unknown>
  }
  readonly notifications: {
    permission(): Promise<string>
    request(): Promise<string>
    show(value: { id: string; title: string; body?: string }): Promise<boolean>
    close(value: { id: string }): Promise<unknown>
  }
}

/** Presence is a capability hint. The native host independently checks every frame and operation. */
export function getNativeBridge(): MewNativeBridge | undefined {
  const bridge = (globalThis as typeof globalThis & { mewNative?: MewNativeBridge }).mewNative
  return bridge?.version === 1 && bridge.cache && bridge.notifications ? bridge : undefined
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 16_384) binary += String.fromCharCode(...bytes.subarray(offset, offset + 16_384))
  return btoa(binary)
}

export function base64ToBytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value), character => character.charCodeAt(0))
}

export async function nativeDigest(bytes: Uint8Array) {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>))
  return {
    hex: Array.from(hash, value => value.toString(16).padStart(2, '0')).join(''),
    etag: `"sha256-${bytesToBase64(hash).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}"`,
  }
}

/** A stopped WebView must not hold ordinary network reads behind an unresolved bridge promise. */
export function nativeDeadline<T>(promise: Promise<T>, milliseconds = 1500): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  return Promise.race([promise, new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Native bridge timed out')), milliseconds)
  })]).finally(() => clearTimeout(timer))
}
