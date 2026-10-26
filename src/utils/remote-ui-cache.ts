import type { AppTransport } from './remote-transport.ts'
import { REMOTE_UI_REVALIDATION_HEADER, REMOTE_UI_REVALIDATION_LIMIT, REMOTE_UI_REVALIDATION_QUERY_LIMIT, REMOTE_UI_REVALIDATION_AGE, remoteUiCachePath } from '../../shared/remote-ui-revalidation.ts'

const CACHE = 'mew-remote-ui-v1'
const MAX_AGE = 7 * 24 * 60 * 60 * 1000
const MAX_BYTES = 32 * 1024 * 1024
const MAX_ASSET = 8 * 1024 * 1024
const MAX_ENTRIES = 64
const REFRESH_AFTER = 24 * 60 * 60 * 1000
const DISCOVERY_BUDGET = 25
const STORED_AT = 'x-mew-ui-cache-time'
const STORED_BYTES = 'x-mew-ui-cache-bytes'
let writes = Promise.resolve()
const confirmed = new WeakMap<AppTransport, { instance: string; generation: number; expires: number; digests: Map<string, string> }>()
const indexVersions = new WeakMap<AppTransport, number>()
const contentDigest = (etag: string) => /^"sha256-[A-Za-z0-9_-]{43}(?:-gzip)?"$/.test(etag) ? etag.replace(/-gzip"$/, '"') : null
const cachePrefix = (instance: string) => `${location.origin}/__mew_ui_cache/${encodeURIComponent(instance)}/`

async function fetchIndex(transport: AppTransport, path: string, init: RequestInit, instance: string): Promise<Response> {
  const generation = transport.resourceGeneration
  const version = (indexVersions.get(transport) ?? 0) + 1
  indexVersions.set(transport, version)
  confirmed.delete(transport)
  if (generation === undefined || !globalThis.caches || !crypto.subtle) return transport.fetch(path, init)
  const url = new URL(path, location.origin)
  const discover = async () => {
    const paths: string[] = []
    const cache = await caches.open(CACHE), prefix = cachePrefix(instance)
    for (const key of [...await cache.keys()].reverse()) {
      if (!key.url.startsWith(prefix)) continue
      const asset = decodeURIComponent(key.url.slice(prefix.length))
      if (!remoteUiCachePath(asset) || paths.includes(asset)) continue
      if (paths.length === REMOTE_UI_REVALIDATION_LIMIT) break
      if (encodeURIComponent(JSON.stringify([...paths, asset])).length > REMOTE_UI_REVALIDATION_QUERY_LIMIT) continue
      paths.push(asset)
    }
    return paths
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  const paths = await Promise.race([discover().catch(() => []), new Promise<string[]>(resolve => { timer = setTimeout(() => resolve([]), DISCOVERY_BUDGET) })])
  clearTimeout(timer)
  if (!paths.length) return transport.fetch(path, init)
  url.searchParams.set('revalidate', JSON.stringify(paths))
  const response = await transport.fetch(url.pathname + url.search, init)
  if (response.status === 200 && generation === transport.resourceGeneration && version === indexVersions.get(transport) && !init.signal?.aborted) {
    try {
      const values: unknown = JSON.parse(response.headers.get(REMOTE_UI_REVALIDATION_HEADER) ?? 'null')
      if (Array.isArray(values) && values.length === paths.length && values.every(value => value === null || typeof value === 'string' && contentDigest(value) === value)) {
        const digests = new Map<string, string>()
        for (let i = 0; i < paths.length; i++) if (typeof values[i] === 'string') digests.set(paths[i], values[i])
        confirmed.set(transport, { instance, generation, expires: performance.now() + REMOTE_UI_REVALIDATION_AGE, digests })
      }
    } catch { /* Old hosts keep per-file revalidation. */ }
  }
  return response
}

async function digest(bytes: Uint8Array) {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>))
  return `"sha256-${btoa(String.fromCharCode(...hash)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}"`
}

async function readAsset(response: Response) {
  let body = response.body
  if (response.headers.get('content-encoding') === 'gzip') {
    if (typeof DecompressionStream !== 'function') return null
    body = body?.pipeThrough(new DecompressionStream('gzip')) ?? null
  } else if (response.headers.has('content-encoding')) return null
  const reader = body?.getReader()
  if (!reader) return null
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const result = await reader.read()
      if (result.done) break
      size += result.value.byteLength
      if (size > MAX_ASSET) { void reader.cancel().catch(() => {}); return null }
      chunks.push(result.value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return bytes
}

async function store(cache: Cache, key: string, response: Response, bytes: Uint8Array) {
  const headers = new Headers(response.headers)
  headers.delete('content-encoding'); headers.delete('content-length')
  headers.set(STORED_AT, String(Date.now())); headers.set(STORED_BYTES, String(bytes.byteLength))
  await cache.put(key, new Response(bytes as Uint8Array<ArrayBuffer>, { status: 200, headers }))
  const keys = await cache.keys()
  const entries = await Promise.all(keys.map(async request => {
    const value = await cache.match(request)
    return { request, time: Number(value?.headers.get(STORED_AT)), size: Number(value?.headers.get(STORED_BYTES)) }
  }))
  entries.sort((a, b) => b.time - a.time)
  let total = 0, count = 0
  for (const entry of entries) {
    if (entry.time > Date.now() - MAX_AGE && entry.time <= Date.now() && Number.isFinite(entry.size) && entry.size >= 0 && ++count <= MAX_ENTRIES && (total += entry.size) <= MAX_BYTES) continue
    await cache.delete(entry.request)
  }
}

/** Cached code is usable only after this host confirms its digest over the live P2P link. */
export async function fetchRemoteUiResource(transport: AppTransport, path: string, init: RequestInit, instance?: string): Promise<Response> {
  const url = new URL(path, location.origin), asset = url.searchParams.get('path') ?? ''
  if (instance && init.method === 'GET' && url.pathname === '/api/remote-ui/file' && asset === '/index.html' && !new Headers(init.headers).has('range')) return fetchIndex(transport, path, init, instance)
  if (!instance || init.method !== 'GET' || url.pathname !== '/api/remote-ui/file' || !remoteUiCachePath(asset) || new Headers(init.headers).has('range') || !globalThis.caches || !crypto.subtle) return transport.fetch(path, init)
  const key = cachePrefix(instance) + encodeURIComponent(asset)
  let cache: Cache, cached: Response | undefined, bytes: Uint8Array | null = null
  try {
    cache = await caches.open(CACHE)
    cached = await cache.match(key)
    const stored = Number(cached?.headers.get(STORED_AT)), etag = cached?.headers.get('etag')
    if (cached && stored > Date.now() - MAX_AGE && stored <= Date.now() && etag && contentDigest(etag)) {
      bytes = await readAsset(cached.clone())
      if (!bytes || await digest(bytes) !== contentDigest(etag)) bytes = null
    }
  } catch { return transport.fetch(path, init) }
  const batch = confirmed.get(transport)
  if (bytes && cached && batch?.instance === instance && batch.generation === transport.resourceGeneration && performance.now() < batch.expires && batch.digests.get(asset) === contentDigest(cached.headers.get('etag')!) && !init.signal?.aborted) {
    batch.digests.delete(asset)
    const clean = new Headers(cached.headers)
    clean.delete(STORED_AT); clean.delete(STORED_BYTES)
    clean.delete('content-encoding'); clean.delete('content-length')
    const response = new Response(bytes as Uint8Array<ArrayBuffer>, { status: 200, headers: clean })
    if (Number(cached.headers.get(STORED_AT)) < Date.now() - REFRESH_AFTER) writes = writes.then(() => store(cache, key, response, bytes!)).catch(() => {})
    return response
  }
  const headers = new Headers(init.headers)
  if (bytes && cached) headers.set('if-none-match', cached.headers.get('etag')!)
  let response = await transport.fetch(path, { ...init, headers })
  if (response.status === 304) {
    if (bytes && cached && response.headers.get('etag') === cached.headers.get('etag')) {
      const clean = new Headers(cached.headers)
      clean.delete(STORED_AT); clean.delete(STORED_BYTES)
      clean.delete('content-encoding'); clean.delete('content-length')
      const result = new Response(bytes as Uint8Array<ArrayBuffer>, { status: 200, headers: clean })
      if (Number(cached.headers.get(STORED_AT)) < Date.now() - REFRESH_AFTER) writes = writes.then(() => store(cache, key, result, bytes!)).catch(() => {})
      return result
    }
    headers.delete('if-none-match')
    response = await transport.fetch(path, { ...init, headers })
  }
  const etag = response.headers.get('etag')
  if (response.status === 200 && etag && contentDigest(etag)) {
    const snapshot = response.clone()
    // Read alongside the consumer; cache writes never hold up the first streamed response.
    void (async () => {
      const fresh = await readAsset(snapshot)
      if (!fresh || await digest(fresh) !== contentDigest(etag)) return
      writes = writes.then(() => store(cache, key, snapshot, fresh)).catch(() => {})
    })().catch(() => {})
  }
  return response
}
