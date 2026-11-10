import type { AppTransport } from '../runtime/app-runtime.ts'
import { base64ToBytes, bytesToBase64, getNativeBridge, nativeDeadline, nativeDigest } from '../runtime/native-bridge.ts'
import { remoteUiCachePath } from '../../shared/remote-ui-revalidation.ts'

const MAX_BYTES = 16 * 1024 * 1024
const MAX_BASE64 = Math.ceil(MAX_BYTES / 3) * 4
let pendingWrites = 0
const rawEtag = (etag: string) => /^"sha256-[A-Za-z0-9_-]{43}(?:-gzip)?"$/.test(etag) ? etag.replace(/-gzip"$/, '"') : undefined

async function readBody(response: Response, signal?: AbortSignal | null) {
  let stream = response.body
  const encoding = response.headers.get('content-encoding')
  if (encoding === 'gzip' && typeof DecompressionStream === 'function') stream = stream?.pipeThrough(new DecompressionStream('gzip')) ?? null
  else if (encoding) return undefined
  const reader = stream?.getReader()
  if (!reader) return undefined
  let stopped = false
  const stop = () => { stopped = true; void reader.cancel().catch(() => {}) }
  const timer = setTimeout(stop, 30_000)
  signal?.addEventListener('abort', stop, { once: true })
  if (signal?.aborted) stop()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (stopped) return undefined
      if (done) break
      size += value.byteLength
      if (size > MAX_BYTES) { void reader.cancel().catch(() => {}); return undefined }
      chunks.push(value)
    }
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', stop); reader.releaseLock() }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return bytes
}

/** This path changes storage only; live host authorization and ETag verification remain mandatory. */
export async function fetchNativeUiResource(transport: AppTransport, path: string, init: RequestInit, instance?: string): Promise<Response> {
  const bridge = getNativeBridge()
  const url = new URL(path, location.origin)
  const asset = url.searchParams.get('path')
  if (!bridge || !instance || init.method !== 'GET' || url.pathname !== '/api/remote-ui/file' || !remoteUiCachePath(asset) || new Headers(init.headers).has('range') || !crypto.subtle) return transport.fetch(path, init)
  const key = { scope: instance, path: asset }
  let cached: Awaited<ReturnType<typeof bridge.cache.get>> = null
  let bytes: Uint8Array | undefined
  try {
    cached = await nativeDeadline(bridge.cache.get(key))
    if (cached && typeof cached.bodyBase64 === 'string' && cached.bodyBase64.length <= MAX_BASE64 && typeof cached.etag === 'string' && rawEtag(cached.etag) && typeof cached.mimeType === 'string' && cached.mimeType.length <= 200) {
      const candidate = base64ToBytes(cached.bodyBase64)
      const hash = await nativeDigest(candidate)
      if (candidate.byteLength <= MAX_BYTES && hash.hex === cached.sha256 && hash.etag === rawEtag(cached.etag)) bytes = candidate
    }
    if (cached && !bytes) void bridge.cache.remove(key).catch(() => {})
  } catch { cached = null }
  init.signal?.throwIfAborted()
  const headers = new Headers(init.headers)
  headers.delete('if-none-match')
  if (bytes && cached) headers.set('if-none-match', cached.etag)
  let response = await transport.fetch(path, { ...init, headers })
  if (response.status === 304) {
    if (bytes && cached && response.headers.get('etag') === cached.etag) {
      // Use current security headers, never a stored response's authorization policy.
      const clean = new Headers(response.headers)
      clean.set('content-type', cached.mimeType)
      clean.delete('content-encoding'); clean.delete('content-length')
      return new Response(bytes as Uint8Array<ArrayBuffer>, { status: 200, headers: clean })
    }
    headers.delete('if-none-match')
    response = await transport.fetch(path, { ...init, headers })
  }
  const etag = response.headers.get('etag')
  if (response.status === 200 && etag && rawEtag(etag) && pendingWrites < 2) {
    const snapshot = response.clone()
    pendingWrites++
    void (async () => {
      const fresh = await readBody(snapshot, init.signal)
      if (!fresh) return
      const hash = await nativeDigest(fresh)
      if (hash.etag !== rawEtag(etag)) return
      await nativeDeadline(bridge.cache.put({ ...key, bodyBase64: bytesToBase64(fresh), mimeType: snapshot.headers.get('content-type') ?? 'application/octet-stream', sha256: hash.hex, etag, storedAt: Date.now() }))
    })().catch(() => {}).finally(() => { pendingWrites-- })
  }
  return response
}
