import assert from 'node:assert/strict'
import test from 'node:test'
import { configureAppRuntime } from '../runtime/app-runtime.ts'
import { fetchPublicShare, listPublicShares, setPublicShare } from './public-shares.ts'

const share = { id: 'a'.repeat(43), type: 'f', path: 'notes/space #+.md', mode: 'view', url: `/share/f/${'a'.repeat(43)}` }

test('public share management uses the app transport with encoded paths and explicit revocation', async () => {
  const requests: { url: string; init?: RequestInit }[] = []
  configureAppRuntime({ transport: {
    async fetch(url, init) {
      requests.push({ url: String(url), init })
      if (String(url).includes('/list?')) return Response.json({ shares: [share] })
      if (init?.method === 'PUT' && JSON.parse(String(init.body)).mode === 'off') return Response.json({ share: null })
      return Response.json({ share })
    }, socket() { throw new Error('unused') }, close() {},
  } })
  try {
    assert.deepEqual(await fetchPublicShare('space dir', share.path), share)
    assert.deepEqual(await listPublicShares('space dir'), [share])
    assert.deepEqual(await setPublicShare('space dir', share.path, 'edit'), share)
    assert.equal(await setPublicShare('space dir', share.path, 'off'), null)
    assert.equal(requests[0].url, '/api/public-shares?project=space%20dir&path=notes%2Fspace%20%23%2B.md')
    assert.equal(requests[1].url, '/api/public-shares/list?project=space%20dir')
    assert.equal(requests[2].init?.method, 'PUT')
    assert.equal(new Headers(requests[2].init?.headers).get('Content-Type'), 'application/json')
    assert.deepEqual(JSON.parse(String(requests[2].init?.body)), { project: 'space dir', path: share.path, mode: 'edit' })
    assert.deepEqual(JSON.parse(String(requests[3].init?.body)), { project: 'space dir', path: share.path, mode: 'off' })
    assert.ok(requests.every(request => request.init?.signal instanceof AbortSignal))
  } finally { configureAppRuntime({}) }
})

test('public share management preserves errors and caller cancellation', async () => {
  const controller = new AbortController()
  let initialRequest = true
  configureAppRuntime({ transport: {
    async fetch(_url, init) {
      if (initialRequest) {
        initialRequest = false
        controller.abort()
        assert.ok(init?.signal?.aborted)
      }
      return Response.json({ error: 'Access denied' }, { status: 403 })
    }, socket() { throw new Error('unused') }, close() {},
  } })
  try {
    await assert.rejects(() => listPublicShares('docs', controller.signal), /Access denied/)
    await assert.rejects(() => fetchPublicShare('docs', 'file.md'), /Access denied/)
    await assert.rejects(() => setPublicShare('docs', 'file.md', 'view'), /Access denied/)
  } finally { configureAppRuntime({}) }
})
