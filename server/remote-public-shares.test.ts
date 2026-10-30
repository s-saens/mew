import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import express from 'express'
import { publicShareRequest, remotePath, type RemoteFrame } from '../shared/remote-access.ts'

const token = 'a'.repeat(43), base = `/api/public-shares/f/${token}`

test('anonymous P2P admits only the scoped public-share operations', async t => {
  const { remoteDispatcher } = await import('./remote-access-dispatch.ts')
  const app = express(), server = http.createServer(app), frames: RemoteFrame[] = []
  app.use(express.json())
  app.use((req, res) => {
    if (req.path.endsWith('/raw')) res.set({ 'Content-Security-Policy': "sandbox; default-src 'none'", 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'SAMEORIGIN' })
    res.json({ method: req.method, path: req.path, body: req.body ?? null })
  })
  let dispatcher: ReturnType<typeof remoteDispatcher>
  dispatcher = remoteDispatcher(server, { send: async raw => {
    const frame = JSON.parse(raw) as RemoteFrame
    frames.push(frame)
    if (frame.type === 'response' || frame.type === 'chunk') setImmediate(() => { void dispatcher.receive(JSON.stringify({ type: 'credit', id: frame.id })) })
  }, close() {} }, () => null, 'https://mew.run', { alive: () => true })
  t.after(() => dispatcher.close())
  let sequence = 0
  async function request(url: string, method = 'GET') {
    const id = String(++sequence)
    await dispatcher.receive(JSON.stringify({ type: 'request', id, method, path: url, headers: { 'content-type': 'application/json' } }))
    if (!['GET', 'HEAD'].includes(method)) await dispatcher.receive(JSON.stringify({ type: 'end', id }))
    const deadline = performance.now() + 2000
    while (!frames.some(frame => frame.type === 'end' && frame.id === id)) {
      if (performance.now() > deadline) throw new Error('Public share response timed out')
      await new Promise(resolve => setTimeout(resolve, 5))
    }
    const response = frames.find((frame): frame is Extract<RemoteFrame, { type: 'response' }> => frame.type === 'response' && frame.id === id)!
    if (url.includes('/raw') && response.status === 200) {
      assert.equal(response.headers['content-security-policy'], "sandbox; default-src 'none'")
      assert.equal(response.headers['referrer-policy'], 'no-referrer')
      assert.equal(response.headers['x-content-type-options'], 'nosniff')
      assert.equal(response.headers['x-frame-options'], 'SAMEORIGIN')
    }
    return response.status
  }
  for (const type of ['f', 'd']) for (const suffix of ['', '/tree', '/file', '/raw']) {
    const url = `/api/public-shares/${type}/${token}${suffix}?path=child.md`
    assert.equal(remotePath(url), true)
    assert.equal(await request(url), 200)
    assert.equal(await request(url, 'HEAD'), 200)
  }
  assert.equal(await request(base + '/file', 'PUT'), 200)
  for (const [url, method] of [[base, 'DELETE'], [base + '/file', 'POST'], [base + '/tree', 'PUT'], [base + '/raw', 'PUT'], [base + '/admin', 'GET'], [base + '/file/extra', 'GET'], ['/api/public-shares/f/' + 'a'.repeat(42), 'GET'], ['/api/public-shares', 'GET'], ['/api/file', 'GET'], ['/api/tree', 'GET']] as const) assert.equal(await request(url, method), 401, method + ' ' + url)
  assert.equal(remotePath(base, true), false)
  await dispatcher.receive(JSON.stringify({ type: 'socket', id: 'private-socket', path: '/api/presence' }))
  assert.ok(frames.some(frame => frame.type === 'error' && frame.id === 'private-socket' && frame.code === 'login-required'))
})

test('public share transport matching rejects malformed and unrelated paths', () => {
  for (const value of ['/api/public-shares/f/' + token + '/file/extra', '/api/public-shares/f/' + token + '/file/', '/api/public-shares/x/' + token, '/api/public-shares/f/' + token + '/%2e%2e/file', '/api/public-shares/f/' + token + '\\file']) assert.equal(publicShareRequest('GET', value), false, value)
  assert.equal(publicShareRequest('PATCH', base + '/file'), false)
  assert.equal(publicShareRequest('GET', base + '/file?path=child.md'), true)
})

test('validated public access outlives the local-login timeout without granting a session and closes after revocation', async t => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-public-share-auth-'))
  process.env.MEW_DATA_DIR = temporary
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }))
  const { createRemoteAuthentication, REMOTE_LOGIN_TIMEOUT } = await import('./remote-authentication.ts')
  const authentication = createRemoteAuthentication(null), ordinary = createRemoteAuthentication(null)
  let valid = true
  authentication.allowPublicShare(() => valid)
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() + REMOTE_LOGIN_TIMEOUT + 1 })
  assert.equal(ordinary.ready(), false)
  assert.equal(authentication.ready(), true)
  assert.equal(authentication.current(), null)
  assert.equal(authentication.sessionToken(), null)
  valid = false
  assert.equal(authentication.ready(), false)
})
