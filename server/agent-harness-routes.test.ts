import './test-isolated-data.ts'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import express from 'express'
import { createSession, removeUser, upsertUser } from './auth.ts'
import { setFeature } from './access-policy.ts'
import { agentSettingsAccount } from './agent-account-settings.ts'
import { AgentHarnessStore } from './agent-harness.ts'
import { createAgentHarnessRouter } from './agent-harness-routes.ts'
import { attachAuthContext } from './reqAuth.ts'
import type { HarnessDetail, HarnessInventory, HarnessKind, HarnessMutation } from '../shared/agent-harness.ts'

test('shared MCP definitions require an owner while account-scoped native MCP management stays available', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-harness-routes-'))
  const home = path.join(directory, 'home'), cwd = path.join(directory, 'project'), mcp = path.join(directory, 'common')
  fs.mkdirSync(home)
  fs.mkdirSync(cwd)
  fs.mkdirSync(mcp)
  const commonPath = path.join(mcp, 'servers.json')
  const nativePath = path.join(cwd, '.mcp.json')
  const commonText = JSON.stringify({ mcpServers: { shared: { url: 'https://example.test/mcp', headers: { Authorization: 'private-common-credential' } } } })
  fs.writeFileSync(commonPath, commonText)
  fs.writeFileSync(nativePath, JSON.stringify({ mcpServers: { native: { type: 'http', url: 'https://example.test/native' } } }))
  const accounts = ['harness-owner@example.test', 'harness-member@example.test', 'harness-manager@example.test']
  const sessions = new Map<string, string>()
  for (const [index, email] of accounts.entries()) {
    upsertUser(email, { role: (['owner', 'member', 'manager'] as const)[index], hash: '', createdAt: Date.now(), passwordChangedAt: 0, mustChangePassword: false })
    setFeature(email, 'agent', true)
    sessions.set(email, createSession(email))
  }
  const contexts: { operation: string; account: string | null }[] = []
  class ScopedStore extends AgentHarnessStore {
    override async list(cwd: string, kind: HarnessKind) { contexts.push({ operation: 'list', account: agentSettingsAccount() }); return super.list(cwd, kind) }
    override async detail(cwd: string, kind: HarnessKind, id: string) { contexts.push({ operation: 'detail', account: agentSettingsAccount() }); return super.detail(cwd, kind, id) }
    override async mutate(input: HarnessMutation) { contexts.push({ operation: 'mutate', account: agentSettingsAccount() }); return super.mutate(input) }
  }
  const app = express()
  app.use(express.json(), attachAuthContext)
  app.use('/harness', createAgentHarnessRouter(new ScopedStore({ home, env: {}, mewMcpDir: mcp })))
  const server = http.createServer(app)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => {
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
    for (const email of accounts) removeUser(email)
    fs.rmSync(directory, { recursive: true, force: true })
  })
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const base = `http://127.0.0.1:${address.port}/harness`
  const query = new URLSearchParams({ cwd, kind: 'mcp' })
  const request = (email: string | null, route = '', body?: object) => fetch(`${base}${route}`, {
    method: body ? 'POST' : 'GET',
    headers: { ...(email ? { Cookie: `mew_session=${sessions.get(email)}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify({ cwd, kind: 'mcp', ...body }) } : {}),
  })
  assert.equal((await request(null, `?${query}`)).status, 403)
  const inventoryResponse = await request(accounts[0], `?${query}`)
  assert.equal(inventoryResponse.headers.get('cache-control'), 'no-store')
  const inventory = await inventoryResponse.json() as HarnessInventory & { canManageSharedMcp: boolean }
  assert.equal(inventory.canManageSharedMcp, true)
  const common = inventory.items.find(item => item.name === 'shared')!
  const native = inventory.items.find(item => item.name === 'native')!
  const nativeLocation = inventory.locations.find(location => location.id === native.location)!
  const commonDetail = await (await request(accounts[0], `/detail?${query}&id=${common.id}`)).json() as HarnessDetail
  assert.match(commonDetail.content, /private-common-credential/)
  for (const email of accounts.slice(1)) {
    const listed = await request(email, `?${query}`)
    assert.equal(listed.status, 200)
    const text = await listed.text()
    assert.doesNotMatch(text, /private-common-credential/)
    const summary = JSON.parse(text) as HarnessInventory & { canManageSharedMcp: boolean }
    assert.equal(summary.canManageSharedMcp, false)
    assert.equal(summary.items.find(item => item.id === common.id)?.writable, false)
    assert.equal(summary.locations.find(location => location.id === common.location)?.writable, false)
    assert.equal((await request(email, `/detail?${query}&id=${common.id}`)).status, 403)
    const nativeResponse = await request(email, `/detail?${query}&id=${native.id}`)
    assert.equal(nativeResponse.status, 200)
    const nativeDetail = await nativeResponse.json() as HarnessDetail
    for (const mutation of [
      { action: 'create', target: common.location, name: 'denied', content: '{"command":"denied"}' },
      { action: 'save', id: common.id, revision: commonDetail.revision, content: '{"command":"denied"}' },
      { action: 'delete', id: common.id, revision: commonDetail.revision },
      { action: 'move', id: common.id, target: nativeLocation.id, revision: commonDetail.revision },
      { action: 'move', id: native.id, target: common.location, revision: nativeDetail.revision },
      { action: 'import', id: native.id, target: common.location, revision: nativeDetail.revision },
    ]) assert.equal((await request(email, '', mutation)).status, 403)
    assert.equal(fs.readFileSync(commonPath, 'utf8'), commonText)
    const nativeSaved = await request(email, '', { action: 'save', id: native.id, revision: nativeDetail.revision, content: JSON.stringify({ type: 'http', url: `https://example.test/${email}` }) })
    assert.equal(nativeSaved.status, 200)
    assert.deepEqual(contexts.at(-1), { operation: 'mutate', account: email })
  }
  const importedDetail = await (await request(accounts[0], `/detail?${query}&id=${native.id}`)).json() as HarnessDetail
  assert.equal((await request(accounts[0], '', { action: 'import', id: native.id, target: common.location, revision: importedDetail.revision })).status, 200)
  assert.ok(JSON.parse(fs.readFileSync(commonPath, 'utf8')).mcpServers.native)
  const saved = await request(accounts[0], '', { action: 'create', target: common.location, name: 'created', content: '{"command":"fixture-tool"}' })
  assert.equal(saved.status, 200)
  const latest = await (await request(accounts[0], `/detail?${query}&id=${common.id}`)).json() as HarnessDetail
  assert.equal((await request(accounts[0], '', { action: 'save', id: common.id, revision: latest.revision, content: '{"command":"fixture-tool"}' })).status, 200)
  const updated = await (await request(accounts[0], `/detail?${query}&id=${common.id}`)).json() as HarnessDetail
  assert.equal((await request(accounts[0], '', { action: 'delete', id: common.id, revision: updated.revision })).status, 200)
  for (const email of accounts) {
    setFeature(email, 'agent', false)
    assert.equal((await request(email, `?${query}`)).status, 403)
  }
})

test('MCP authorization rejects items and targets absent from its inventory before a second store lookup', async t => {
  const email = 'harness-stale@example.test'
  setFeature(email, 'agent', true)
  let detailCalls = 0, mutationCalls = 0
  class ChangingStore extends AgentHarnessStore {
    override async list(): Promise<HarnessInventory> {
      return {
        scopes: [], agents: [], warnings: [],
        locations: [{ id: 'native-location', kind: 'mcp', scope: 'global', agent: 'claude', label: 'Claude', path: '/fixture/native', writable: true }],
        items: [{ id: 'native', location: 'native-location', name: 'native', description: 'HTTP', path: '/fixture/native', writable: true }],
      }
    }
    override async detail(): Promise<HarnessDetail> {
      detailCalls++
      return { item: { id: 'appeared-common', location: 'appeared-location', name: 'common', description: 'HTTP', path: '/fixture/common', writable: true }, content: 'private-credential', revision: 'new', files: [] }
    }
    override async mutate() { mutationCalls++ }
  }
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => { req.auth = { email, role: 'member', mustChangePassword: false }; next() })
  app.use('/harness', createAgentHarnessRouter(new ChangingStore()))
  const server = http.createServer(app)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) })
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const base = `http://127.0.0.1:${address.port}/harness`
  const detail = await fetch(`${base}/detail?cwd=/fixture&kind=mcp&id=appeared-common`)
  assert.equal(detail.status, 404)
  assert.doesNotMatch(await detail.text(), /private-credential/)
  for (const action of ['save', 'delete', 'move', 'import']) {
    const response = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cwd: '/fixture', kind: 'mcp', action, id: 'appeared-common', target: 'native-location' }) })
    assert.equal(response.status, 404)
  }
  for (const action of ['create', 'move', 'import']) {
    const response = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cwd: '/fixture', kind: 'mcp', action, id: 'native', target: 'appeared-location' }) })
    assert.equal(response.status, 400)
  }
  assert.equal(detailCalls, 0)
  assert.equal(mutationCalls, 0)
})
