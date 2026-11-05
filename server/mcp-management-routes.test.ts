import './test-isolated-data.ts'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import test from 'node:test'
import express from 'express'
import { setFeature } from './access-policy.ts'
import { McpManagementStore } from './mcp-management.ts'
import { createMcpManagementRouter } from './mcp-management-routes.ts'
import type { McpManagementInventory } from '../shared/mcp-management.ts'
import type { SharedMcpConnectionStatus } from '../shared/shared-mcp.ts'

test('group management keeps common owner-only, allows project usage, and summarizes without secrets', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-mcp-management-routes-'))
  const cwd = path.join(root, 'project'), directory = path.join(root, 'mcp')
  fs.mkdirSync(path.join(cwd, '.git'), { recursive: true }); fs.mkdirSync(directory)
  const registry = JSON.stringify({ mcpServers: {
    bindings: { type: 'http', url: 'https://bindings.mcp.cloudflare.com/mcp?token=private-query-token', headers: { Authorization: 'private-auth-token' } },
  } })
  fs.writeFileSync(path.join(directory, 'servers.json'), registry)
  const store = new McpManagementStore(directory)
  const status = new Map<string, SharedMcpConnectionStatus['status']>([['bindings', 'connected']])
  const emails = ['mcp-management-owner@example.test', 'mcp-management-member@example.test']
  for (const email of emails) setFeature(email, 'agent', true)
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    const role = req.headers['x-role'] === 'owner' ? 'owner' : req.headers['x-role'] === 'member' ? 'member' : 'guest'
    req.auth = { email: role === 'owner' ? emails[0] : role === 'member' ? emails[1] : null, role, mustChangePassword: false }
    next()
  })
  app.use('/mcp', createMcpManagementRouter(store, name => ({ status: status.get(name) ?? 'disconnected' })))
  const server = http.createServer(app)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => {
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
    for (const email of emails) setFeature(email, 'agent', false)
    fs.rmSync(root, { recursive: true, force: true })
  })
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const base = `http://127.0.0.1:${address.port}/mcp`
  const request = (role = 'owner', body?: object) => fetch(body ? base : `${base}?cwd=${cwd}`, {
    method: body ? 'POST' : 'GET', headers: { 'x-role': role, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify({ cwd, ...body }) } : {}),
  })
  assert.equal((await request('guest')).status, 403)
  const response = await request('member')
  assert.equal(response.headers.get('cache-control'), 'no-store')
  const text = await response.text()
  assert.doesNotMatch(text, /private-query-token|private-auth-token|Authorization|streamUrl/)
  const listed = JSON.parse(text) as McpManagementInventory
  assert.equal(listed.canManage, false)
  assert.equal(listed.servers[0].connection?.status, 'connected')
  assert.equal((await request('member', { action: 'usage', scope: 'common', target: 'group', id: 'cloudflare', enabled: false, revision: listed.revision })).status, 403)
  assert.equal((await request('member', { action: 'create-group', name: 'Forbidden', revision: listed.revision })).status, 403)
  assert.equal((await request('member', { action: 'consolidate-cloudflare', scope: 'project', name: 'api', disable: [], revision: listed.revision })).status, 403)
  const disabled = await request('member', { action: 'usage', scope: 'project', target: 'group', id: 'cloudflare', enabled: false, revision: listed.revision })
  assert.equal(disabled.status, 200)
  assert.equal((await disabled.json() as McpManagementInventory).servers[0].effectiveEnabled, false)
  assert.equal(fs.readFileSync(path.join(directory, 'servers.json'), 'utf8'), registry)
  assert.equal((await request('owner', { action: 'usage', scope: 'common', target: 'server', id: 'bindings', enabled: false, revision: listed.revision })).status, 409)

  const snapshot = () => store.list(cwd).revision
  const replacing = () => ({ action: 'consolidate-cloudflare', name: 'api', disable: ['bindings'], scope: 'project', revision: snapshot() })
  assert.equal((await request('owner', replacing())).status, 409, 'replacement waits for an authenticated unified connection')
  assert.equal(store.list(cwd).cloudflare.existingUnified, null)
  assert.equal((await request('owner', { action: 'consolidate-cloudflare', name: 'api', disable: [], scope: 'project', revision: snapshot() })).status, 200)
  assert.equal((await request('owner', replacing())).status, 409, 'registration alone is not connection readiness')
  status.set('api', 'connected')
  const consolidated = await request('owner', replacing())
  assert.equal(consolidated.status, 200)
  const final = await consolidated.json() as McpManagementInventory
  assert.equal(final.canManage, true)
  assert.equal(final.servers.find(item => item.name === 'bindings')?.effectiveEnabled, false)
  assert.equal(final.servers.find(item => item.name === 'api')?.effectiveEnabled, true)
  assert.equal(store.list(root).servers.find(item => item.name === 'api')?.effectiveEnabled, false)
  setFeature(emails[1], 'agent', false)
  assert.equal((await request('member')).status, 403)
})
