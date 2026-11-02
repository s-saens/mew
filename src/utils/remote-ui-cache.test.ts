import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
import { fetchRemoteUiResource } from './remote-ui-cache.ts'
import type { AppTransport } from './remote-transport.ts'

test('a verified empty initial cache never holds cold assets behind per-file storage reads', { timeout: 2000 }, async t => {
  const originalCaches = Object.getOwnPropertyDescriptor(globalThis, 'caches')
  const originalLocation = Object.getOwnPropertyDescriptor(globalThis, 'location')
  t.after(() => {
    if (originalCaches) Object.defineProperty(globalThis, 'caches', originalCaches); else Reflect.deleteProperty(globalThis, 'caches')
    if (originalLocation) Object.defineProperty(globalThis, 'location', originalLocation); else Reflect.deleteProperty(globalThis, 'location')
  })
  let matches = 0, writes = 0, offline = false
  let stored!: () => void
  const didStore = new Promise<void>(resolve => { stored = resolve })
  const body = 'export const live = true;'
  const etag = '"sha256-' + createHash('sha256').update(body).digest('base64url') + '"'
  const cache = {
    keys: async () => [],
    match: () => { matches++; return new Promise(() => {}) },
    put: async () => { writes++; stored() },
  }
  Object.defineProperty(globalThis, 'caches', { configurable: true, value: { open: async () => cache } })
  Object.defineProperty(globalThis, 'location', { configurable: true, value: { origin: 'https://cache.test' } })
  const requests: string[] = []
  const transport = { resourceGeneration: 1, async fetch(path: string) {
    requests.push(path)
    if (offline) throw new Error('disconnected')
    return path.includes('index.html') ? new Response('<html/>') : new Response(body, { headers: { etag } })
  } } as unknown as AppTransport
  await fetchRemoteUiResource(transport, '/api/remote-ui/file?path=/index.html', { method: 'GET' }, 'host-one')
  const response = await fetchRemoteUiResource(transport, '/api/remote-ui/file?path=/assets/fresh.js', { method: 'GET' }, 'host-one')
  assert.equal(await response.text(), body)
  assert.equal(matches, 0, 'an empty cache inventory avoids a redundant per-file storage query')
  await didStore
  assert.equal(writes, 1, 'verified live bodies still populate the cache in the background')
  offline = true
  await assert.rejects(fetchRemoteUiResource(transport, '/api/remote-ui/file?path=/assets/fresh.js', { method: 'GET' }, 'host-one'), /disconnected/)
  assert.equal(requests.length, 3, 'absence metadata never authorizes an offline response')
})

test('an empty cache forces a fresh asset body instead of forwarding a caller conditional header', async t => {
  const originalCaches = Object.getOwnPropertyDescriptor(globalThis, 'caches')
  const originalLocation = Object.getOwnPropertyDescriptor(globalThis, 'location')
  t.after(() => {
    if (originalCaches) Object.defineProperty(globalThis, 'caches', originalCaches); else Reflect.deleteProperty(globalThis, 'caches')
    if (originalLocation) Object.defineProperty(globalThis, 'location', originalLocation); else Reflect.deleteProperty(globalThis, 'location')
  })
  Object.defineProperty(globalThis, 'caches', { configurable: true, value: { open: async () => ({ keys: async () => [], match() { throw new Error('Empty cache needs no lookup') } }) } })
  Object.defineProperty(globalThis, 'location', { configurable: true, value: { origin: 'https://cache.test' } })
  const headers = new Headers({ 'if-none-match': '"caller-version"', accept: 'application/javascript' })
  const signal = new AbortController().signal
  let assets = 0
  const transport = { resourceGeneration: 1, async fetch(path: string, init: RequestInit) {
    if (path.includes('index.html')) return new Response('<html/>')
    assets++
    assert.equal(init.signal, signal)
    assert.equal(new Headers(init.headers).get('accept'), 'application/javascript')
    return new Headers(init.headers).has('if-none-match') ? new Response(null, { status: 304 }) : new Response('export const fresh = true;')
  } } as unknown as AppTransport
  await fetchRemoteUiResource(transport, '/api/remote-ui/file?path=/index.html', { method: 'GET' }, 'host-two')
  const response = await fetchRemoteUiResource(transport, '/api/remote-ui/file?path=/assets/fresh.js', { method: 'GET', headers, signal }, 'host-two')
  assert.equal(response.status, 200)
  assert.equal(await response.text(), 'export const fresh = true;')
  assert.equal(assets, 1, 'the cold request needs no avoidable 304 retry')
  assert.equal(headers.get('if-none-match'), '"caller-version"', 'the caller headers remain unchanged')
})
