import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { once } from 'node:events'
import express from 'express'
import test from 'node:test'
import type { RequestAuth } from './reqAuth.ts'

test('owner password reset preserves accounts and revokes prior browser sessions', { timeout: 30_000 }, async t => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-admin-password-reset-'))
  process.env.MEW_DATA_DIR = path.join(temporary, 'data')
  process.env.MEW_WORKSPACE = path.join(temporary, 'workspace')
  fs.mkdirSync(path.join(process.env.MEW_WORKSPACE, 'docs'), { recursive: true })
  const auth = await import('./auth.ts')
  const policy = await import('./access-policy.ts')
  const identities = await import('./mewlink-identities.ts')
  const { gitConnections } = await import('./git-connections.ts')
  const { createRemoteAuthentication } = await import('./remote-authentication.ts')
  const { createAuthRouter } = await import('./authRoutes.ts')
  const { attachAuthContext, requireAuthenticated } = await import('./reqAuth.ts')
  const { createApiApp } = await import('./api.ts')
  const { resetTreeWatchers } = await import('./watcher.ts')
  const owner = 'owner@example.test', member = 'member@example.test', otherOwner = 'second-owner@example.test'
  const password = 'initial-secure-password-2026', newPassword = 'replacement-secure-password-2026'
  const record = { hash: auth.hashPassword(password), role: 'member' as const, mustChangePassword: false, createdAt: 123, passwordChangedAt: 0 }
  auth.upsertUser(owner, { ...record, role: 'owner' })
  auth.upsertUser(member, { ...record, displayName: 'Existing Member', avatarDataUrl: 'data:image/png;base64,aGVsbG8=', contactEmail: 'contact@example.test' })
  auth.upsertUser(otherOwner, { ...record, role: 'owner' })
  let requester: RequestAuth = { email: owner, role: 'owner', mustChangePassword: false }
  const app = express()
  app.use('/api/auth', createAuthRouter())
  app.get('/protected', attachAuthContext, requireAuthenticated, (_req, res) => { res.json({ ok: true }) })
  app.use((req, _res, next) => { req.auth = requester; next() })
  app.use('/api', createApiApp())
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(async () => {
    resetTreeWatchers()
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
    fs.rmSync(temporary, { recursive: true, force: true })
  })
  const address = server.address(); assert.ok(address && typeof address !== 'string')
  const base = `http://127.0.0.1:${address.port}`
  const reset = (id: string) => fetch(`${base}/api/admin/users/${encodeURIComponent(id)}/reset-password`, { method: 'POST' })
  const post = (route: string, body: unknown, cookie = '') => fetch(`${base}/api/auth/${route}`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(body),
  })
  const cookieOf = (response: Response) => response.headers.get('set-cookie')!.split(';')[0]

  await t.test('only another password account can be reset by an owner', async () => {
    const before = auth.getUser(member)
    for (const role of ['guest', 'member', 'manager'] as const) {
      requester = { email: role === 'guest' ? null : member, role, mustChangePassword: false }
      assert.equal((await reset(member)).status, 403)
      assert.deepEqual(auth.getUser(member), before)
    }
    requester = { email: owner, role: 'owner', mustChangePassword: false }
    for (const id of ['missing@example.test', 'constructor']) assert.equal((await reset(id)).status, 404)
    const self = await reset(owner.toUpperCase())
    assert.equal(self.status, 400)
    assert.match((await self.json() as { error: string }).error, /설정/)
    const request = identities.requestMewlinkAccess({ issuer: 'https://mew.example.test', subject: 'passwordless_reset_denied', displayName: 'External Member', username: 'external', provider: 'email' })
    const link = identities.approveMewlinkRequest(request.id, { role: 'member' })
    const directory = auth.readAccountDirectory()
    assert.equal((await reset(link.accountId)).status, 400)
    assert.deepEqual(auth.readAccountDirectory(), directory, 'reset cannot create credentials for a Mewlink-only account')
  })

  await t.test('reset at the exact session creation time invalidates old tokens and requires a new password', async t => {
    t.mock.method(Date, 'now', () => 1_800_000_000_000)
    const browserKey = 'a'.repeat(43), passwordToken = auth.createSession(member), ownerToken = auth.createSession(owner)
    const trustedPassword = auth.createTrustedDeviceSession({ email: member, user: auth.getUser(member)! }, browserKey, 'Password browser')
    const identity = { issuer: 'https://mew.example.test', subject: 'password_reset_existing_identity', displayName: 'Linked Member', username: 'member', provider: 'email' as const }
    identities.linkMewlinkToAccount(identity, member, null)
    const remote = createRemoteAuthentication(identity)
    const trustedIdentity = auth.createTrustedDeviceSession(identities.resolveMewlinkSession(identity)!, browserKey, 'External browser')
    const git = gitConnections.set(member, { provider: 'github', host: 'github.com', login: 'member', identity: { name: 'Member', email: member }, accessToken: 'isolated-test-token' })
    policy.setFeature(member, 'terminal', true)
    policy.setFileRule(member, 'docs', '', 'deny')
    const before = auth.getUser(member)!, directory = auth.readAccountDirectory()
    const accessBefore = fs.readFileSync(path.join(process.env.MEW_DATA_DIR!, 'access-policy.json'), 'utf8')
    let changes = 0
    const changed = () => { changes++ }
    policy.accessChanges.on('change', changed)
    let response: Response
    try { response = await reset(member.toUpperCase()) }
    finally { policy.accessChanges.off('change', changed) }
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    const result = await response.json() as { ok: boolean; email: string; tempPassword: string }
    assert.equal(result.ok, true)
    assert.equal(result.email, member)
    assert.equal(changes, 1)
    const after = auth.getUser(member)!
    assert.equal(auth.verifyPassword(password, after.hash), false)
    assert.equal(auth.verifyPassword(result.tempPassword, after.hash), true)
    assert.equal(after.mustChangePassword, true)
    assert.equal(after.passwordChangedAt, Date.now())
    for (const field of ['id', 'createdAt', 'role', 'displayName', 'avatarDataUrl', 'contactEmail', 'hasPassword'] as const) assert.deepEqual(after[field], before[field])
    assert.deepEqual(auth.readAccountDirectory().mewlinkIdentities, directory.mewlinkIdentities)
    assert.deepEqual(auth.readAccountDirectory().mewlinkRequests, directory.mewlinkRequests)
    assert.equal(fs.readFileSync(path.join(process.env.MEW_DATA_DIR!, 'access-policy.json'), 'utf8'), accessBefore)
    assert.deepEqual(gitConnections.get(member), git)
    for (const token of [passwordToken, trustedPassword, trustedIdentity]) assert.equal(auth.getSession(token, browserKey), null)
    assert.equal(auth.getSession(ownerToken)?.email, owner)
    const sessions = JSON.parse(fs.readFileSync(path.join(process.env.MEW_DATA_DIR!, 'sessions.json'), 'utf8')) as Record<string, { email: string }>
    assert.ok(Object.values(sessions).every(session => session.email !== member))
    assert.equal(remote.current()?.email, member, 'approved external identity connections remain independent of password resets')
    assert.equal(remote.current()?.user.mustChangePassword, false)
    assert.equal((await post('login', { email: member, password })).status, 401)
    const login = await post('login', { email: member, password: result.tempPassword })
    assert.equal(login.status, 200)
    assert.equal((await login.json() as { mustChangePassword: boolean }).mustChangePassword, true)
    const temporaryCookie = cookieOf(login)
    const blocked = await fetch(`${base}/protected`, { headers: { cookie: temporaryCookie } })
    assert.equal(blocked.status, 403)
    assert.equal((await blocked.json() as { code: string }).code, 'must-change-password')
    const changedPassword = await post('change-password', { currentPassword: result.tempPassword, newPassword }, temporaryCookie)
    assert.equal(changedPassword.status, 200)
    assert.equal(auth.getUser(member)?.mustChangePassword, false)
    assert.equal((await fetch(`${base}/protected`, { headers: { cookie: cookieOf(changedPassword) } })).status, 200)
    assert.equal((await post('login', { email: member, password: result.tempPassword })).status, 401)
    assert.equal((await post('login', { email: member, password: newPassword })).status, 200)
    for (const token of [passwordToken, trustedPassword, trustedIdentity]) assert.equal(auth.getSession(token, browserKey), null, 'changing the temporary password cannot revive revoked sessions')
  })

  await t.test('another owner can be reset and repeated reset revokes its just-created sessions', async t => {
    t.mock.method(Date, 'now', () => 1_800_000_000_001)
    const first = await reset(otherOwner)
    assert.equal(first.status, 200)
    const firstPassword = (await first.json() as { tempPassword: string }).tempPassword
    const login = await post('login', { email: otherOwner, password: firstPassword })
    assert.equal(login.status, 200)
    const token = cookieOf(login).slice('mew_session='.length)
    assert.ok(auth.getSession(token))
    const second = await reset(otherOwner)
    assert.equal(second.status, 200)
    const secondPassword = (await second.json() as { tempPassword: string }).tempPassword
    assert.notEqual(secondPassword, firstPassword)
    assert.equal(auth.getSession(token), null)
    assert.equal(auth.getUser(otherOwner)?.role, 'owner')
    assert.equal((await post('login', { email: otherOwner, password: firstPassword })).status, 401)
    assert.equal((await post('login', { email: otherOwner, password: secondPassword })).status, 200)
  })
})
