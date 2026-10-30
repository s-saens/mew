import assert from 'node:assert/strict'
import test from 'node:test'
import { ApiResponseError, json } from './response.ts'

test('JSON response errors preserve the server message and HTTP status for recovery decisions', async () => {
  for (const status of [400, 403, 408, 429, 500, 503]) {
    await assert.rejects(json(Response.json({ error: 'Request unavailable' }, { status })), error => {
      assert.ok(error instanceof ApiResponseError)
      assert.ok(error instanceof Error)
      assert.equal(error.message, 'Request unavailable')
      assert.equal(error.status, status)
      return true
    })
  }
  await assert.rejects(json(new Response('Unavailable', { status: 502, statusText: 'Bad gateway' })), error => {
    assert.ok(error instanceof ApiResponseError)
    assert.equal(error.message, 'Bad gateway')
    assert.equal(error.status, 502)
    return true
  })
  assert.deepEqual(await json(Response.json({ ok: true })), { ok: true })
})

test('expired authentication still dispatches the existing auth event before reporting the error', async t => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const browser = new EventTarget()
  Object.defineProperty(globalThis, 'window', { value: browser, configurable: true })
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'window', previous)
    else Reflect.deleteProperty(globalThis, 'window')
  })
  let expired = 0
  browser.addEventListener('mew:auth-expired', () => expired++)
  await assert.rejects(json(Response.json({ error: 'Session expired' }, { status: 401 })), error => {
    assert.ok(error instanceof ApiResponseError)
    assert.equal(error.status, 401)
    assert.equal(error.message, 'Session expired')
    return true
  })
  assert.equal(expired, 1)
})
