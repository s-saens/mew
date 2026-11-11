import './test-isolated-data.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import express from 'express'
import { createReleaseProvidersRouter } from './release-providers-routes.ts'
import { ReleaseProvidersService } from './release-providers.ts'
import { runRequestWorkspace } from './workspace-scope.ts'
import { authOf, type Role } from './reqAuth.ts'
import { WORKSPACE_PROJECT } from './paths.ts'
import { writeActiveWorkspace, readActiveWorkspace } from './userUiState.ts'
import { setFeature } from './access-policy.ts'
import type { ReleaseProviderRun, ReleaseProvidersState } from '../shared/release-providers.ts'

const config = { provider: 'github-actions', label: 'Public website', owner: 'owner', repo: 'website', workflow: 'release.yml', ref: 'main' }

test('release provider HTTP routes scope settings and runs by the requesting account and workspace', async t => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-release-routes-'))
  const a = path.join(temporary, 'a'), b = path.join(temporary, 'b')
  fs.mkdirSync(a); fs.mkdirSync(b); fs.mkdirSync(path.join(b, 'nested'))
  let email = 'release-routes-alice@example.test', role: Role = 'owner', dispatches = 0
  const initialAccount = email
  writeActiveWorkspace(email, a)
  const service = new ReleaseProvidersService({ storage: path.join(temporary, 'private'), request: async (url, options) => {
    if (options?.method === 'POST') { dispatches++; return Response.json({ workflow_run_id: 123 }) }
    if (String(url).includes('/jobs')) return Response.json({ jobs: [] })
    return Response.json({ id: 123, status: 'completed', conclusion: 'success' })
  } })
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => { req.auth = { role, email, mustChangePassword: false }; runRequestWorkspace(req, authOf(req), next) })
  app.use('/providers', createReleaseProvidersRouter({ service }))
  const server = http.createServer(app)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); fs.rmSync(temporary, { recursive: true, force: true }) })
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/providers`
  const request = (root: string, endpoint = '', method = 'GET', extra: Record<string, unknown> = {}) => {
    const scope = { project: WORKSPACE_PROJECT, workspacePath: root }
    if (method === 'GET') return fetch(`${base}${endpoint}?${new URLSearchParams({ ...scope, ...extra } as Record<string, string>)}`)
    return fetch(base + endpoint, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...scope, ...extra }) })
  }
  const saved = await request(b, '/connection', 'PUT', { config, token: 'private-alice-token' })
  assert.equal(saved.status, 200)
  assert.equal(saved.headers.get('cache-control'), 'private, no-store')
  const state = await saved.json() as ReleaseProvidersState
  const connection = state.connections[0]
  assert.equal(connection.connected, true)
  assert.equal(JSON.stringify(state).includes('private-alice-token'), false)
  assert.deepEqual((await (await request(a)).json() as ReleaseProvidersState).connections, [])
  assert.equal(readActiveWorkspace(initialAccount), a, 'explicit scope must not change the selected workspace')

  const response = await request(b, '/run', 'POST', { connectionId: connection.id, requestId: 'http-request-1' })
  assert.equal(response.status, 200)
  const run = await response.json() as ReleaseProviderRun
  assert.equal(run.providerRunId, '123')
  assert.equal((await request(a, '/refresh', 'POST', { runId: run.id })).status, 404)
  assert.equal((await request(b, '/refresh', 'POST', { runId: run.id })).status, 200)
  assert.equal((await request(b, '/run', 'POST', { connectionId: connection.id, requestId: 'http-request-1' })).status, 200)
  assert.equal(dispatches, 1)

  email = 'release-routes-bob@example.test'
  assert.deepEqual((await (await request(b)).json() as ReleaseProvidersState).connections, [])
  assert.equal((await request(b, '/refresh', 'POST', { runId: run.id })).status, 404)
  assert.equal((await request(b, `/connection/${connection.id}`, 'DELETE')).status, 404)
  email = initialAccount
  role = 'manager'
  const nested = await request(b, '/connection', 'PUT', { path: 'nested', config: { ...config, label: 'Nested' } })
  assert.equal(nested.status, 200)
  assert.equal((await nested.json() as ReleaseProvidersState).connections[0].connected, false)
  assert.equal((await request(b, `/connection/${connection.id}`, 'DELETE')).status, 200)
  assert.equal((await request(b, '/run', 'POST', { connectionId: connection.id, requestId: 'deleted-connection' })).status, 404)
})

test('provider HTTP routes reject permissions, malformed settings and mismatched scopes without external requests', async t => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-release-forbidden-'))
  const root = path.join(temporary, 'project'); fs.mkdirSync(root)
  const email = 'release-forbidden@example.test'
  let role: Role = 'owner', requests = 0
  const service = new ReleaseProvidersService({ storage: path.join(temporary, 'private'), request: async () => { requests++; throw new Error('No request allowed') } })
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => { req.auth = { role, email, mustChangePassword: false }; runRequestWorkspace(req, authOf(req), next) })
  app.use('/providers', createReleaseProvidersRouter({ service }))
  const server = http.createServer(app)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); fs.rmSync(temporary, { recursive: true, force: true }) })
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/providers`
  const post = (endpoint: string, body: Record<string, unknown>, method = 'POST') => fetch(base + endpoint, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project: WORKSPACE_PROJECT, workspacePath: root, ...body }) })
  assert.equal((await post('/connection', { config: { ...config, owner: '../private' }, token: 'token' }, 'PUT')).status, 400)
  assert.equal((await post('/run', { connectionId: 'unknown', requestId: '' })).status, 400)
  assert.equal((await post('/run', { connectionId: 'unknown', requestId: 'request-1' })).status, 404)
  const mismatch = `${base}?${new URLSearchParams({ project: WORKSPACE_PROJECT, workspacePath: root, mewWorkspacePath: temporary, mewProjectPath: temporary })}`
  assert.equal((await fetch(mismatch)).status, 409)
  const mismatchBody = `${base}/connection?${new URLSearchParams({ workspacePath: temporary })}`
  assert.equal((await fetch(mismatchBody, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspacePath: root, project: WORKSPACE_PROJECT, config }) })).status, 409)
  setFeature(email, 'terminal', false)
  assert.equal((await post('/connection', { config }, 'PUT')).status, 403)
  setFeature(email, 'terminal', true)
  for (const denied of ['guest', 'member'] as const) {
    role = denied
    assert.equal((await fetch(`${base}?${new URLSearchParams({ project: WORKSPACE_PROJECT, workspacePath: root })}`)).status, 403)
    assert.equal((await post('/connection', { config }, 'PUT')).status, 403)
  }
  assert.equal(requests, 0)
})
