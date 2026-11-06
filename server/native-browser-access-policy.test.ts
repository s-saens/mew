import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { once } from 'node:events'
import express from 'express'
import { WebSocket } from 'ws'
import { defaultCapabilities, normalizeFeatureOverrides, type AccessSettings } from '../shared/access-policy.ts'
import type { RequestAuth } from './reqAuth.ts'

test('native browser defaults and overrides do not inherit desktop, localhost or legacy browser grants', () => {
  for (const role of ['owner', 'manager'] as const) assert.equal(defaultCapabilities(role).nativeBrowser, true)
  for (const role of ['member', 'guest'] as const) assert.equal(defaultCapabilities(role).nativeBrowser, false)
  assert.deepEqual(normalizeFeatureOverrides({ browser: true, desktop: true }), { desktop: true, portPreview: true })
  assert.deepEqual(normalizeFeatureOverrides({ browser: true, nativeBrowser: false }), { nativeBrowser: false, portPreview: true })
  assert.deepEqual(normalizeFeatureOverrides({ browser: false, nativeBrowser: true, portPreview: true }), { nativeBrowser: true, portPreview: true })
})

test('account settings independently grant and revoke the persisted native browser capability', async t => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-native-browser-access-'))
  process.env.MEW_DATA_DIR = path.join(temporary, 'data')
  process.env.MEW_WORKSPACE = path.join(temporary, 'workspace')
  await fs.mkdir(path.join(process.env.MEW_WORKSPACE, 'docs'), { recursive: true })
  const { upsertUser } = await import('./auth.ts')
  const { capabilitiesFor, canUse } = await import('./access-policy.ts')
  const { createAccessRouter } = await import('./access-routes.ts')
  const owner = 'owner-native@test', member = 'member-native@test'
  for (const [email, role] of [[owner, 'owner'], [member, 'member']] as const) upsertUser(email, { role, hash: 'fixture-only', createdAt: 0, passwordChangedAt: 0, mustChangePassword: false })
  const memberAuth: RequestAuth = { email: member, role: 'member', mustChangePassword: false }
  let requester: RequestAuth = { email: owner, role: 'owner', mustChangePassword: false }
  const app = express()
  app.use(express.json()); app.use((req, _res, next) => { req.auth = requester; next() })
  app.use('/access', createAccessRouter())
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening')
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await fs.rm(temporary, { recursive: true, force: true }) })
  const address = server.address(); assert.ok(address && typeof address !== 'string')
  const save = (feature: string, enabled: boolean | null, subject = member) => fetch(`http://127.0.0.1:${address.port}/access/feature`, {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ subject, feature, enabled }),
  })
  assert.equal(canUse(memberAuth, 'nativeBrowser'), false)
  const granted = await save('nativeBrowser', true)
  assert.equal(granted.status, 200)
  const row = ((await granted.json()) as AccessSettings).rows.find(item => item.subject === member)!
  assert.equal(row.capabilities.nativeBrowser, true); assert.equal(row.overrides.nativeBrowser, true)
  for (const feature of ['desktop', 'portPreview', 'agent', 'git'] as const) assert.equal(row.capabilities[feature], false, feature)
  assert.equal(canUse(memberAuth, 'nativeBrowser'), true)
  assert.equal(canUse({ ...memberAuth, mustChangePassword: true }, 'nativeBrowser'), false)
  assert.equal((await save('nativeBrowser', true, 'guest')).status, 400)
  await save('desktop', true); await save('portPreview', true)
  assert.equal((await save('nativeBrowser', false)).status, 200)
  assert.equal(canUse(memberAuth, 'nativeBrowser'), false, 'desktop and localhost grants cannot restore browser access')
  assert.equal(capabilitiesFor(memberAuth).desktop, true)
  assert.equal(capabilitiesFor(memberAuth).portPreview, true)
  const persisted = JSON.parse(await fs.readFile(path.join(process.env.MEW_DATA_DIR, 'access-policy.json'), 'utf8'))
  assert.deepEqual(persisted.features[member], { nativeBrowser: false, desktop: true, portPreview: true })
  requester = memberAuth
  assert.equal((await save('nativeBrowser', true)).status, 403, 'members cannot grant themselves browser access')
  const { attachDomBrowserWebSocket } = await import('./dom-browser.ts')
  attachDomBrowserWebSocket(server, () => memberAuth)
  const origin = `http://127.0.0.1:${address.port}`
  const endpoint = origin.replace('http:', 'ws:') + '/api/dom-browser/ws'
  const denied = new WebSocket(endpoint, { origin }); denied.on('error', () => {})
  const rejection = await once(denied, 'unexpected-response')
  assert.equal(rejection[1].statusCode, 403, 'the retained DOM socket cannot bypass a denied browser permission')
  rejection[1].resume(); denied.terminate()
  requester = { email: owner, role: 'owner', mustChangePassword: false }
  await save('nativeBrowser', true)
  const allowed = new WebSocket(endpoint, { origin }); allowed.on('error', () => {})
  await once(allowed, 'open')
  const revoked = once(allowed, 'close')
  await save('nativeBrowser', false); await revoked
})
