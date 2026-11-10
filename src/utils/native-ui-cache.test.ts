import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
import { fetchRemoteUiResource } from './remote-ui-cache.ts'
import type { AppTransport } from '../runtime/app-runtime.ts'
import type { MewNativeBridge, NativeAsset } from '../runtime/native-bridge.ts'

function entry(body: string): NativeAsset {
  return { bodyBase64: Buffer.from(body).toString('base64'), mimeType: 'application/javascript',
    sha256: createHash('sha256').update(body).digest('hex'),
    etag: `"sha256-${createHash('sha256').update(body).digest('base64url')}"`, storedAt: Date.now() }
}

function fixture(t: test.TestContext, cached: NativeAsset | null) {
  let removed = 0
  const stored: NativeAsset[] = []
  const originals = ['mewNative', 'location', 'caches'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const)
  t.after(() => { for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor)
    else Reflect.deleteProperty(globalThis, key)
  } })
  const bridge = { version: 1, connection: { kind: 'mewlink' }, notifications: {}, cache: {
    async get(key: { scope: string; path: string }) { assert.equal(key.scope, 'host-a'); assert.ok(key.path.startsWith('/assets/')); return cached },
    async put(value: NativeAsset) { stored.push(value) }, async remove() { removed++ },
  } } as unknown as MewNativeBridge
  Object.defineProperty(globalThis, 'mewNative', { configurable: true, value: bridge })
  Object.defineProperty(globalThis, 'location', { configurable: true, value: { origin: 'https://app.mew.run' } })
  Object.defineProperty(globalThis, 'caches', { configurable: true, get() { throw new Error('Native storage must not open browser CacheStorage') } })
  return { stored, removed: () => removed, bridge }
}

const path = '/api/remote-ui/file?path=/assets/app-a.js'

test('native cached bytes require a fresh matching host 304 and current security headers', async t => {
  const cached = entry('export const value=42;')
  fixture(t, cached)
  let calls = 0
  const transport = { async fetch(_path: string, init: RequestInit) {
    calls++
    assert.equal(new Headers(init.headers).get('if-none-match'), cached.etag)
    return new Response(null, { status: 304, headers: { etag: cached.etag, 'content-security-policy': "default-src 'none'" } })
  } } as unknown as AppTransport
  const response = await fetchRemoteUiResource(transport, path, { method: 'GET' }, 'host-a')
  assert.equal(await response.text(), 'export const value=42;')
  assert.equal(response.headers.get('content-security-policy'), "default-src 'none'")
  assert.equal(calls, 1)
})

test('native cache corruption is removed and never sent as a conditional request', async t => {
  const cached = entry('original')
  cached.bodyBase64 = Buffer.from('tampered').toString('base64')
  const f = fixture(t, cached)
  const transport = { async fetch(_path: string, init: RequestInit) {
    assert.equal(new Headers(init.headers).has('if-none-match'), false)
    return new Response('live')
  } } as unknown as AppTransport
  assert.equal(await (await fetchRemoteUiResource(transport, path, { method: 'GET' }, 'host-a')).text(), 'live')
  assert.equal(f.removed(), 1)
})

test('offline and denied hosts cannot execute a native cached body', async t => {
  fixture(t, entry('cached'))
  const disconnected = { fetch: async () => { throw new Error('offline') } } as unknown as AppTransport
  await assert.rejects(fetchRemoteUiResource(disconnected, path, { method: 'GET' }, 'host-a'), /offline/)
  const denied = { fetch: async () => new Response('denied', { status: 403 }) } as unknown as AppTransport
  const response = await fetchRemoteUiResource(denied, path, { method: 'GET' }, 'host-a')
  assert.equal(response.status, 403)
  assert.equal(await response.text(), 'denied')
})

test('mismatching 304 retries without the cached ETag', async t => {
  fixture(t, entry('cached'))
  let calls = 0
  const transport = { async fetch(_path: string, init: RequestInit) {
    calls++
    if (calls === 1) return new Response(null, { status: 304, headers: { etag: '"different"' } })
    assert.equal(new Headers(init.headers).has('if-none-match'), false)
    return new Response('new code')
  } } as unknown as AppTransport
  assert.equal(await (await fetchRemoteUiResource(transport, path, { method: 'GET' }, 'host-a')).text(), 'new code')
  assert.equal(calls, 2)
})

test('verified downloads populate native storage beyond the browser cache entry budget', async t => {
  const f = fixture(t, null)
  const body = 'x'.repeat(9 * 1024 * 1024)
  const fresh = entry(body)
  const transport = { fetch: async () => new Response(body, { headers: { etag: fresh.etag, 'content-type': fresh.mimeType } }) } as unknown as AppTransport
  const response = await fetchRemoteUiResource(transport, path, { method: 'GET' }, 'host-a')
  assert.equal((await response.text()).length, body.length)
  for (let attempts = 0; attempts < 100 && !f.stored.length; attempts++) await new Promise(resolve => setTimeout(resolve, 10))
  assert.equal(f.stored.length, 1)
  assert.equal(f.stored[0].sha256, fresh.sha256)
})

test('HTML, API, range requests and missing instance never access native disk', async t => {
  const f = fixture(t, null)
  f.bridge.cache.get = () => { throw new Error('Ineligible native cache read') }
  const transport = { fetch: async () => new Response('network') } as unknown as AppTransport
  for (const [request, init, instance] of [
    ['/api/remote-ui/file?path=/index.html', { method: 'GET' }, 'host-a'],
    ['/api/auth/me', { method: 'GET' }, 'host-a'],
    [path, { method: 'GET', headers: { range: 'bytes=0-10' } }, 'host-a'],
    [path, { method: 'POST' }, 'host-a'],
    [path, { method: 'GET' }, undefined],
  ] as const) assert.equal(await (await fetchRemoteUiResource(transport, request, init, instance)).text(), 'network')
})

test('stalled background copies release both write slots so later downloads can persist', async t => {
  const f = fixture(t, null)
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const fresh = entry('complete')
  let stalled = true
  const transport = { fetch: async () => new Response(stalled ? new ReadableStream() : 'complete', { headers: { etag: fresh.etag, 'content-type': fresh.mimeType } }) } as unknown as AppTransport
  const first = await fetchRemoteUiResource(transport, path, { method: 'GET' }, 'host-a')
  const second = await fetchRemoteUiResource(transport, path, { method: 'GET' }, 'host-a')
  await new Promise(resolve => setImmediate(resolve))
  t.mock.timers.tick(30_001)
  await new Promise(resolve => setImmediate(resolve))
  stalled = false
  const third = await fetchRemoteUiResource(transport, path, { method: 'GET' }, 'host-a')
  assert.equal(await third.text(), 'complete')
  for (let attempt = 0; attempt < 20 && !f.stored.length; attempt++) await new Promise(resolve => setImmediate(resolve))
  assert.equal(f.stored.length, 1)
  await first.body?.cancel()
  await second.body?.cancel()
})
