import assert from 'node:assert/strict'
import test from 'node:test'
import { configureAppRuntime } from '../runtime/app-runtime.ts'
import { fetchPublicShare, fetchPublicShareFile, fetchPublicShareTree, PublicShareError, savePublicShareFile } from './public-share-content.ts'

const identity = { type: 'd' as const, id: 'a'.repeat(43) }
const version = { tag: 'revision', size: 1, ctimeMs: 1, mtimeMs: 1 }

test('public content requests use only scoped transport paths without credentials or caching', async () => {
  const requests: { url: string; init?: RequestInit }[] = []
  configureAppRuntime({ transport: {
    async fetch(url, init) { requests.push({ url: String(url), init }); return Response.json({}) },
    socket() { throw new Error('unused') }, close() {},
  } })
  try {
    const cancellation = new AbortController()
    await fetchPublicShare(identity, cancellation.signal)
    await fetchPublicShareTree(identity, 'a b/#dir')
    await fetchPublicShareFile(identity, 'a b/#file.md')
    await savePublicShareFile(identity, 'a b/#file.md', 'text', version)
    assert.equal(requests[0].url, `/api/public-shares/d/${identity.id}`)
    assert.equal(requests[1].url, `/api/public-shares/d/${identity.id}/tree?path=a%20b%2F%23dir`)
    assert.equal(requests[2].url, `/api/public-shares/d/${identity.id}/file?path=a%20b%2F%23file.md`)
    assert.deepEqual(JSON.parse(String(requests[3].init?.body)), { path: 'a b/#file.md', content: 'text', baseVersion: version })
    for (const request of requests) {
      assert.equal(request.init?.credentials, 'omit')
      assert.equal(request.init?.cache, 'no-store')
      assert.ok(request.init?.signal instanceof AbortSignal)
    }
    cancellation.abort()
    assert.equal(requests[0].init?.signal?.aborted, true)
  } finally { configureAppRuntime({}) }
})

test('public content exposes status codes for conflicts and revoked links', async () => {
  let status = 409
  configureAppRuntime({ transport: {
    async fetch() { return Response.json({ error: 'Unavailable' }, { status }) },
    socket() { throw new Error('unused') }, close() {},
  } })
  try {
    await assert.rejects(savePublicShareFile(identity, '', 'draft', version), error => error instanceof PublicShareError && error.status === 409)
    status = 404
    await assert.rejects(fetchPublicShare(identity), error => error instanceof PublicShareError && error.status === 404)
  } finally { configureAppRuntime({}) }
})
