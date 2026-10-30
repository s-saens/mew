import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { once } from 'node:events'
import express from 'express'
import test from 'node:test'
import { defaultCapabilities, FEATURES, GUEST_FEATURES, type AccessSettings } from '../shared/access-policy.ts'
import type { RequestAuth } from './reqAuth.ts'

test('an owner atomically restores one account feature defaults without changing identity or file rules', async t => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-feature-reset-'))
  process.env.MEW_DATA_DIR = path.join(temporary, 'data')
  process.env.MEW_WORKSPACE = path.join(temporary, 'workspace')
  fs.mkdirSync(path.join(process.env.MEW_WORKSPACE, 'docs'), { recursive: true })
  const auth = await import('./auth.ts')
  const policy = await import('./access-policy.ts')
  const paths = await import('./paths.ts')
  const { createAccessRouter } = await import('./access-routes.ts')
  const owner = 'owner@example.test', member = 'member@example.test'
  for (const [email, role] of [[owner, 'owner'], [member, 'member']] as const) {
    auth.upsertUser(email, { role, hash: 'unchanged-test-hash', displayName: `${role} name`, avatarDataUrl: 'data:image/png;base64,aGVsbG8=', mustChangePassword: false, createdAt: 123, passwordChangedAt: 10 })
  }
  let requester: RequestAuth = { email: owner, role: 'owner', mustChangePassword: false }
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => { req.auth = requester; next() })
  app.use('/api/admin/access', createAccessRouter())
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(async () => {
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
    fs.rmSync(temporary, { recursive: true, force: true })
  })
  const address = server.address(); assert.ok(address && typeof address !== 'string')
  const reset = (body: unknown) => fetch(`http://127.0.0.1:${address.port}/api/admin/access/features/reset`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  const policyFile = path.join(process.env.MEW_DATA_DIR, 'access-policy.json')
  for (const subject of [owner, member, 'guest']) policy.setFileRule(subject, 'docs', '', subject === member ? 'deny' : 'view')
  const workspace = paths.WORKSPACE_ROOT, otherWorkspace = path.join(temporary, 'other-workspace')
  fs.mkdirSync(path.join(otherWorkspace, 'docs'), { recursive: true })
  paths.setWorkspaceRoot(otherWorkspace)
  for (const subject of [owner, member, 'guest']) policy.setFileRule(subject, 'docs', '', 'edit')
  paths.setWorkspaceRoot(workspace)
  const accounts = auth.readAccountDirectory()

  await t.test('owner, member and guest restore their defaults in one complete notification', async () => {
    for (const [subject, role] of [[member, 'member'], [owner, 'owner'], ['guest', 'guest']] as const) {
      const defaults = defaultCapabilities(role)
      for (const feature of role === 'guest' ? GUEST_FEATURES : FEATURES) policy.setFeature(subject, feature, !defaults[feature])
      const otherSubject = subject === member ? owner : member
      policy.setFeature(otherSubject, 'terminal', false)
      const before = JSON.parse(fs.readFileSync(policyFile, 'utf8'))
      let notifications = 0
      const changed = () => {
        notifications++
        assert.deepEqual(policy.featureOverrides(subject), {}, 'observers see every override removed together')
        assert.deepEqual(policy.capabilitiesFor({ email: role === 'guest' ? null : subject, role, mustChangePassword: false }), defaults)
      }
      policy.accessChanges.on('change', changed)
      let response: Response
      try { response = await reset({ subject }) }
      finally { policy.accessChanges.off('change', changed) }
      assert.equal(response.status, 200)
      assert.equal(response.headers.get('cache-control'), 'no-store')
      const settings = await response.json() as AccessSettings
      assert.equal(notifications, 1)
      const row = settings.rows.find(row => row.subject === subject)!
      assert.deepEqual(row.overrides, {})
      assert.deepEqual(row.capabilities, defaults)
      assert.equal(row.role, role)
      const after = JSON.parse(fs.readFileSync(policyFile, 'utf8'))
      assert.equal(Object.hasOwn(after.features, subject), false)
      assert.deepEqual(after.features, Object.fromEntries(Object.entries(before.features).filter(([key]) => key !== subject)))
      assert.deepEqual(after.workspaces, before.workspaces, 'all workspaces and subjects retain their file rules')
      assert.deepEqual(auth.readAccountDirectory(), accounts, 'roles, profiles and credentials are unchanged')
      assert.equal((await reset({ subject })).status, 200, 'resetting defaults again is safe')
    }
  })

  await t.test('nonowners and invalid or noncanonical subjects cannot reset any overrides', async () => {
    policy.setFeature(member, 'terminal', true)
    const before = fs.readFileSync(policyFile, 'utf8')
    for (const role of ['guest', 'member', 'manager'] as const) {
      requester = { email: role === 'guest' ? null : member, role, mustChangePassword: false }
      assert.equal((await reset({ subject: member })).status, 403)
    }
    requester = { email: owner, role: 'owner', mustChangePassword: false }
    for (const body of [{}, { subject: null }, { subject: 1 }, { subject: '' }, { subject: 'missing@example.test' }, { subject: 'constructor' }, { subject: member.toUpperCase() }, { subject: ` ${member} ` }]) {
      assert.equal((await reset(body)).status, 400)
    }
    assert.equal(fs.readFileSync(policyFile, 'utf8'), before)
    assert.equal(policy.canUse({ email: member, role: 'member', mustChangePassword: false }, 'terminal'), true)
  })
})
