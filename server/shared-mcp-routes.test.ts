import './test-isolated-data.ts'
import assert from 'node:assert/strict'
import test from 'node:test'
import http from 'node:http'
import express from 'express'
import { createSession, destroySession, removeUser, upsertUser } from './auth.ts'
import { setFeature } from './access-policy.ts'
import { attachAuthContext } from './reqAuth.ts'
import { SharedMcpConnectionError, type SharedMcpConnections } from './shared-mcp-connections.ts'
import { createSharedMcpRouter } from './shared-mcp-routes.ts'

test('MCP routes enforce account and agent access, ignore caller paths and recheck live authority', async t => {
  const owner = 'mcp-routes@example.test'
  upsertUser(owner, { role: 'member', hash: '', createdAt: Date.now(), passwordChangedAt: 0, mustChangePassword: false })
  let token = createSession(owner)
  let authorize: (() => boolean) | undefined
  let error: Error | undefined
  const calls: unknown[][] = []
  const result = { name: 'cloudflare', status: 'disconnected' as const }
  const store = {
    status: async (...args: unknown[]) => { calls.push(['status', ...args]); if (error) throw error; return result },
    start: (account: string, name: unknown, check: () => boolean) => { calls.push(['start', account, name]); authorize = check; return { ...result, status: 'connecting' } },
    cancel: async (...args: unknown[]) => { calls.push(['cancel', ...args]); return result },
    disconnect: async (...args: unknown[]) => { calls.push(['disconnect', ...args]); return result },
  } as unknown as SharedMcpConnections
  const app = express()
  app.use(express.json(), attachAuthContext)
  app.use('/api/agent/mcp', createSharedMcpRouter(store))
  const server = http.createServer(app)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); removeUser(owner) })
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const base = `http://127.0.0.1:${address.port}/api/agent/mcp`
  const request = (route: string, body?: object, cookie = true) => fetch(`${base}${route}`, { method: body ? 'POST' : 'GET', headers: { ...(cookie ? { Cookie: `mew_session=${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })

  const guest = await request('/status?name=cloudflare', undefined, false)
  assert.equal(guest.status, 403)
  assert.equal(guest.headers.get('cache-control'), 'no-store')
  assert.equal(calls.length, 0)
  setFeature(owner, 'agent', false)
  assert.equal((await request('/connect', { name: 'cloudflare' })).status, 403)
  assert.equal(calls.length, 0)
  setFeature(owner, 'agent', true)

  const connected = await request('/connect', { name: 'cloudflare', owner: 'another-account', directory: '/private/path' })
  assert.equal(connected.status, 202)
  assert.equal(connected.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await connected.json(), { name: 'cloudflare', status: 'connecting' })
  assert.deepEqual(calls.at(-1), ['start', owner, 'cloudflare'])
  assert.equal(authorize!(), true)
  setFeature(owner, 'agent', false)
  assert.equal(authorize!(), false)
  setFeature(owner, 'agent', true)
  assert.equal(authorize!(), true)
  destroySession(token)
  assert.equal(authorize!(), false)
  token = createSession(owner)

  await request('/status?name=cloudflare&directory=/private/path&owner=another-account')
  assert.deepEqual(calls.at(-1), ['status', owner, 'cloudflare'])
  await request('/cancel', { name: 'cloudflare', owner: 'another-account' })
  assert.deepEqual(calls.at(-1), ['cancel', owner, 'cloudflare'])
  await request('/disconnect', { name: 'cloudflare', directory: '/private/path' })
  assert.deepEqual(calls.at(-1), ['disconnect', owner, 'cloudflare'])

  error = new Error('private-token private-path')
  const failed = await request('/status?name=cloudflare')
  assert.equal(failed.status, 500)
  assert.equal((await failed.text()).includes('private'), false)
  error = new SharedMcpConnectionError('MCP 이름을 확인하세요.', 400)
  const invalid = await request('/status')
  assert.equal(invalid.status, 400)
  assert.deepEqual(await invalid.json(), { error: 'MCP 이름을 확인하세요.' })
})
