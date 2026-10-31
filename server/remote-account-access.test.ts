import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import express from 'express'
import { WebSocketServer } from 'ws'
import type { RemoteFrame } from '../shared/remote-access.ts'
import type { MewlinkIdentity } from '../shared/mewlink-identity.ts'

test('remote account access updates preserve their response and revoke previous work', { timeout: 30_000 }, async t => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-remote-account-access-'))
  process.env.MEW_DATA_DIR = path.join(temporary, 'data')
  process.env.MEW_WORKSPACE = path.join(temporary, 'workspace')
  fs.mkdirSync(path.join(process.env.MEW_WORKSPACE, 'docs'), { recursive: true })
  fs.writeFileSync(path.join(process.env.MEW_WORKSPACE, 'docs', 'note.md'), 'Permission regression fixture')
  const auth = await import('./auth.ts')
  const policy = await import('./access-policy.ts')
  const identities = await import('./mewlink-identities.ts')
  const { createRemoteAuthentication } = await import('./remote-authentication.ts')
  const { remoteDispatcher } = await import('./remote-access-dispatch.ts')
  const { createApiApp } = await import('./api.ts')
  const { attachAuthContext, requireFeature } = await import('./reqAuth.ts')
  const { checkOrigin } = await import('./authRoutes.ts')
  const { resetTreeWatchers } = await import('./watcher.ts')
  t.after(() => { resetTreeWatchers(); fs.rmSync(temporary, { recursive: true, force: true }) })
  const app = express()
  app.use(checkOrigin)
  app.use('/api', attachAuthContext)
  app.get('/api/test-pending', (_req, res) => { res.write('Pending fixture') })
  app.get('/api/test-terminal', requireFeature('terminal'), (_req, res) => { res.json({ ok: true }) })
  app.use('/api', createApiApp())
  app.use((error: Error & { type?: string }, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (error.type === 'request.aborted') { res.end(); return }
    next(error)
  })
  const until = async (predicate: () => boolean) => {
    const deadline = performance.now() + 4000
    while (!predicate()) {
      if (performance.now() > deadline) throw new Error('Remote account access fixture timed out')
      await new Promise(resolve => setTimeout(resolve, 5))
    }
  }
  const createAccount = (email: string, role: 'owner' | 'member' | 'manager') => {
    auth.upsertUser(email, { role, hash: 'unused-fixture-password-hash', mustChangePassword: false, createdAt: 1, passwordChangedAt: 0 })
  }
  const policyFile = path.join(process.env.MEW_DATA_DIR, 'access-policy.json')
  const storedPolicy = () => JSON.parse(fs.readFileSync(policyFile, 'utf8'))

  for (const mode of ['password', 'mewlink'] as const) await t.test(mode, async subtest => {
    const ownerId = `${mode}-owner@example.test`, memberId = `${mode}-member@example.test`
    createAccount(ownerId, 'owner'); createAccount(memberId, 'member')
    const identity: MewlinkIdentity = { issuer: 'https://mew.example.test', subject: `remote_access_regression_${mode}`, displayName: 'Fixture owner', username: `${mode}-owner`, provider: 'email' }
    if (mode === 'mewlink') {
      const request = identities.requestMewlinkAccess(identity)
      identities.approveMewlinkRequest(request.id, { accountId: ownerId })
    }
    function harness(accountId: string, external = false) {
      const authentication = createRemoteAuthentication(external ? identity : null)
      if (!external) authentication.resume(auth.createSession(accountId))
      let closed = false, sequence = 0
      const server = http.createServer(app), frames: RemoteFrame[] = []
      const wss = new WebSocketServer({ noServer: true })
      server.on('upgrade', (req, socket, head) => wss.handleUpgrade(req, socket, head, ws => { ws.send('Socket fixture') }))
      let dispatcher: ReturnType<typeof remoteDispatcher>
      dispatcher = remoteDispatcher(server, {
        send: async raw => {
          const frame = JSON.parse(raw) as RemoteFrame
          frames.push(frame)
          if (frame.type === 'response' || frame.type === 'chunk') setImmediate(() => { void dispatcher.receive(JSON.stringify({ type: 'credit', id: frame.id })) })
        },
        close: () => { closed = true },
      }, authentication.current, identity.issuer, { ...authentication, alive: () => !closed && authentication.ready(), clientIp: '198.51.100.11', accessRevision: policy.accessRevision })
      const changed = () => dispatcher.revalidate()
      policy.accessChanges.on('change', changed)
      subtest.after(() => {
        policy.accessChanges.off('change', changed)
        dispatcher.close(); wss.close(); server.closeAllConnections()
      })
      const operationFrames = (id: string) => frames.filter(frame => frame.id === id)
      const start = async (url: string, method = 'GET', body?: unknown) => {
        const id = String(++sequence)
        await dispatcher.receive(JSON.stringify({ type: 'request', id, method, path: url, headers: { 'content-type': 'application/json' } }))
        if (body !== undefined) await dispatcher.receive(JSON.stringify({ type: 'chunk', id, data: Buffer.from(JSON.stringify(body)).toString('base64') }))
        return id
      }
      const request = async (url: string, method = 'GET', body?: unknown) => {
        const id = await start(url, method, body)
        if (!['GET', 'HEAD'].includes(method)) await dispatcher.receive(JSON.stringify({ type: 'end', id }))
        await until(() => operationFrames(id).some(frame => frame.type === 'end' || frame.type === 'error'))
        await new Promise(resolve => setImmediate(resolve))
        const received = operationFrames(id)
        assert.deepEqual(received.filter(frame => frame.type === 'error'), [], `${method} ${url} must retain its initiating response`)
        assert.equal(received.filter(frame => frame.type === 'response').length, 1, 'one HTTP response')
        assert.equal(received.filter(frame => frame.type === 'end').length, 1, 'one response completion')
        const response = received.find((frame): frame is Extract<RemoteFrame, { type: 'response' }> => frame.type === 'response')!
        const text = Buffer.concat(received.filter((frame): frame is Extract<RemoteFrame, { type: 'chunk' }> => frame.type === 'chunk').map(frame => Buffer.from(frame.data, 'base64'))).toString()
        assert.equal(closed, false, 'the authenticated transport remains open')
        return { ...response, json: () => JSON.parse(text) }
      }
      const pending = async () => {
        const id = await start('/api/test-pending')
        await until(() => operationFrames(id).some(frame => frame.type === 'chunk'))
        return id
      }
      const socket = async () => {
        const id = String(++sequence)
        await dispatcher.receive(JSON.stringify({ type: 'socket', id, path: '/api/presence' }))
        await until(() => operationFrames(id).some(frame => frame.type === 'open'))
        return id
      }
      const assertRevoked = (id: string) => assert.ok(operationFrames(id).some(frame => frame.type === 'error' && frame.code === 'permission-revoked'), 'previous work is revoked')
      return { authentication, dispatcher, operationFrames, request, start, pending, socket, assertRevoked }
    }
    const owner = harness(ownerId, mode === 'mewlink'), member = harness(memberId)
    assert.equal(owner.authentication.current()?.authenticationMethod, mode)
    const mutate = async (url: string, method: string, body: unknown) => {
      const pending = await owner.pending(), socket = await owner.socket(), otherPending = await member.pending(), otherSocket = await member.socket()
      const response = await owner.request(url, method, body)
      assert.equal(response.status, 200)
      owner.assertRevoked(pending); owner.assertRevoked(socket)
      member.assertRevoked(otherPending); member.assertRevoked(otherSocket)
      assert.equal((await owner.request('/api/admin/access')).status, 200)
      return response
    }

    policy.setFeature(memberId, 'terminal', true)
    assert.equal((await member.request('/api/test-terminal')).status, 200)
    const feature = await mutate('/api/admin/access/feature', 'PUT', { subject: memberId, feature: 'terminal', enabled: false })
    assert.equal(feature.json().rows.find((row: { subject: string }) => row.subject === memberId).overrides.terminal, false)
    assert.equal(storedPolicy().features[memberId].terminal, false)
    assert.equal((await member.request('/api/test-terminal')).status, 403)

    policy.setFeature(memberId, 'terminal', true)
    const reset = await mutate('/api/admin/access/features/reset', 'POST', { subject: memberId })
    assert.deepEqual(reset.json().rows.find((row: { subject: string }) => row.subject === memberId).overrides, {})
    assert.equal(Object.hasOwn(storedPolicy().features, memberId), false)
    assert.equal((await member.request('/api/test-terminal')).status, 403)

    assert.equal((await member.request('/api/file?project=docs&path=note.md')).status, 200)
    await mutate('/api/admin/access/path', 'PUT', { subject: memberId, project: 'docs', path: 'note.md', access: 'deny', workspace: policy.workspaceScope() })
    assert.deepEqual(policy.fileRules(memberId), [{ path: 'docs/note.md', view: false, edit: false }])
    assert.deepEqual(storedPolicy().workspaces[policy.workspaceScope()][memberId], policy.fileRules(memberId))
    assert.equal((await member.request('/api/file?project=docs&path=note.md')).status, 403)

    const stale = await owner.start('/api/admin/access/feature', 'PUT', { subject: memberId, feature: 'terminal', enabled: true })
    policy.setFeature(memberId, 'chat', false)
    owner.assertRevoked(stale)
    const before = fs.readFileSync(policyFile, 'utf8')
    await owner.dispatcher.receive(JSON.stringify({ type: 'end', id: stale }))
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(fs.readFileSync(policyFile, 'utf8'), before, 'a stale request body cannot apply a later policy mutation')
    assert.equal(policy.featureOverrides(memberId).terminal, undefined)

    for (const [url, method, body] of [
      ['/api/admin/access/feature', 'PUT', { subject: memberId, feature: 'terminal', enabled: true }],
      ['/api/admin/access/features/reset', 'POST', { subject: memberId }],
      ['/api/admin/access/path', 'PUT', { subject: memberId, project: 'docs', path: 'note.md', access: 'edit', workspace: policy.workspaceScope() }],
    ] as const) assert.equal((await member.request(url, method, body)).status, 403)
    assert.equal(fs.readFileSync(policyFile, 'utf8'), before)

    const resetId = `${mode}-reset@example.test`
    createAccount(resetId, 'member')
    const resetAccount = harness(resetId), resetToken = resetAccount.authentication.sessionToken()!
    const resetPending = await resetAccount.pending(), resetSocket = await resetAccount.socket()
    const passwordReset = await owner.request(`/api/admin/users/${encodeURIComponent(resetId)}/reset-password`, 'POST')
    assert.equal(passwordReset.status, 200)
    assert.equal(passwordReset.headers['cache-control'], 'no-store')
    assert.equal(auth.verifyPassword(passwordReset.json().tempPassword, auth.getUser(resetId)!.hash), true)
    assert.equal(auth.getUser(resetId)?.mustChangePassword, true)
    assert.equal(auth.getSession(resetToken), null)
    resetAccount.assertRevoked(resetPending); resetAccount.assertRevoked(resetSocket)
    assert.equal(fs.readFileSync(policyFile, 'utf8'), before, 'password reset preserves the ACL')
    assert.equal((await owner.request('/api/admin/access')).status, 200)

    const deleteId = `${mode}-delete@example.test`
    createAccount(deleteId, 'member')
    policy.setFeature(deleteId, 'terminal', true)
    policy.setFileRule(deleteId, 'docs', 'note.md', 'view')
    const deleted = harness(deleteId), deletedToken = deleted.authentication.sessionToken()!
    const deletedPending = await deleted.pending(), deletedSocket = await deleted.socket()
    await mutate(`/api/admin/users/${encodeURIComponent(deleteId)}`, 'DELETE', undefined)
    assert.equal(auth.getUser(deleteId), null)
    assert.equal(auth.getSession(deletedToken), null)
    assert.equal(Object.hasOwn(storedPolicy().features, deleteId), false)
    assert.equal(Object.hasOwn(storedPolicy().workspaces[policy.workspaceScope()], deleteId), false)
    deleted.assertRevoked(deletedPending); deleted.assertRevoked(deletedSocket)

    createAccount(`${mode}-remaining-owner@example.test`, 'owner')
    const rolePending = await owner.pending(), roleSocket = await owner.socket()
    const changedRole = await owner.request(`/api/admin/users/${encodeURIComponent(ownerId)}/role`, 'PUT', { role: 'member' })
    assert.equal(changedRole.status, 200, 'self-demotion returns its successful acknowledgement')
    assert.equal(auth.getUser(ownerId)?.role, 'member')
    owner.assertRevoked(rolePending); owner.assertRevoked(roleSocket)
    assert.equal((await owner.request('/api/admin/access')).status, 403, 'new requests use the reduced role')
    assert.equal((await owner.request('/api/test-terminal')).status, 403)
  })
})
