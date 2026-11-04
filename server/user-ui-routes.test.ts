import './test-isolated-data.ts'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import { once } from 'node:events'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import express from 'express'
import { WebSocket } from 'ws'
import { createApiApp } from './api.ts'
import { createSession, upsertUser } from './auth.ts'
import { attachAuthContext, resolveAuth } from './reqAuth.ts'
import { attachPresenceWebSocket } from './presence.ts'
import { setFeature } from './access-policy.ts'
import { WORKSPACE_ROOT, setWorkspaceRoot } from './paths.ts'
import { readRootProjects, writeActiveWorkspace, type StoredEditorTabsSnapshot } from './userUiState.ts'
import { THEME_PRESETS } from '../shared/theme.ts'

test('account UI routes preserve request identity, per-route permissions and API responses', { timeout: 15_000 }, async t => {
  const previousRoot = WORKSPACE_ROOT
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-user-ui-routes-'))
  const otherRoot = path.join(root, 'other')
  fs.mkdirSync(otherRoot)
  setWorkspaceRoot(root)
  const alice = 'user-ui-alice@example.test', bob = 'user-ui-bob@example.test'
  const cookies = [alice, bob].map(email => {
    upsertUser(email, { hash: '', role: 'member', mustChangePassword: false, createdAt: Date.now(), passwordChangedAt: 0 })
    setFeature(email, 'agent', true)
    writeActiveWorkspace(email, root)
    return `mew_session=${createSession(email)}`
  })
  const app = express()
  app.use('/api', attachAuthContext, createApiApp())
  const server = http.createServer(app)
  attachPresenceWebSocket(server, { getAuth: resolveAuth })
  const clients: WebSocket[] = []
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  t.after(async () => {
    for (const client of clients) client.terminate()
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
    setWorkspaceRoot(previousRoot)
    fs.rmSync(root, { recursive: true, force: true })
  })
  const theme = { palette: THEME_PRESETS[0].palette, custom: [] }
  const themeBody = { state: theme }
  const projectsBody = { paths: [root], icons: {} }
  const tabsBody = { workspacePath: root, tabs: [], activeId: null }
  const editorTabsBody = { workspacePath: root, project: 'docs', state: { panes: [] } }
  const workspaceBody = { workspacePath: root, state: { marker: 'workspace' } }
  const workspaceQuery = `?workspace=${encodeURIComponent(root)}`
  async function request(route: string, cookie?: string, body?: unknown) {
    const response = await fetch(`${origin}/api/user-ui${route}`, {
      method: body === undefined ? 'GET' : 'PUT',
      headers: { ...(cookie ? { Cookie: cookie } : {}), 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    assert.equal(response.headers.get('cache-control'), 'private, no-store', 'router stays after the API cache middleware')
    return response
  }
  async function json(route: string, cookie: string, body?: unknown) {
    const response = await request(route, cookie, body)
    assert.equal(response.status, 200, await response.clone().text())
    return response.json()
  }

  await t.test('all account UI endpoints reject guests before reading or writing account data', async () => {
    for (const [route, body] of [
      ['/theme', themeBody], ['/root-projects', projectsBody],
      ['/agent-tabs' + workspaceQuery, tabsBody], ['/workspace' + workspaceQuery, workspaceBody],
      ['/editor-tabs' + workspaceQuery, editorTabsBody],
    ] as const) {
      assert.equal((await request(route)).status, 403, `guest GET ${route}`)
      assert.equal((await request(route, undefined, body)).status, 403, `guest PUT ${route}`)
    }
    assert.deepEqual(await json('/theme', cookies[0]), { state: null })
    assert.deepEqual(await json('/workspace' + workspaceQuery, cookies[0]), { state: null })
    assert.deepEqual(await json('/editor-tabs' + workspaceQuery, cookies[0]), { state: null, revision: 0 })
  })

  await t.test('only agent tabs require agent or terminal capability', async () => {
    setFeature(alice, 'agent', false)
    setFeature(alice, 'terminal', false)
    try {
      assert.equal((await request('/agent-tabs' + workspaceQuery, cookies[0])).status, 403)
      assert.equal((await request('/agent-tabs', cookies[0], tabsBody)).status, 403)
      for (const [route, body] of [
        ['/theme', themeBody], ['/root-projects', projectsBody], ['/workspace' + workspaceQuery, workspaceBody], ['/editor-tabs' + workspaceQuery, editorTabsBody],
      ] as const) {
        assert.equal((await request(route, cookies[0])).status, 200)
        assert.equal((await request(route, cookies[0], body)).status, 200)
      }
      setFeature(alice, 'terminal', true)
      assert.equal((await request('/agent-tabs' + workspaceQuery, cookies[0])).status, 200)
      assert.equal((await request('/agent-tabs', cookies[0], tabsBody)).status, 200)
    } finally {
      setFeature(alice, 'agent', true)
      setFeature(alice, 'terminal', null)
    }
  })

  await t.test('body and query identities cannot change the owning account or root key', async () => {
    await json('/theme', cookies[0], { ...themeBody, email: bob })
    assert.deepEqual(await json('/theme?email=' + bob, cookies[0]), { state: theme })
    assert.deepEqual(await json('/theme', cookies[1]), { state: null })

    await json('/root-projects', cookies[0], { ...projectsBody, icons: { [root]: 'i:stale' }, email: bob })
    await json('/root-projects', cookies[1], { paths: [otherRoot], icons: {} })
    assert.deepEqual(readRootProjects(alice)?.paths, [root])
    assert.deepEqual(readRootProjects(alice)?.icons, {}, 'account writes cannot replace shared project icons')
    assert.deepEqual(readRootProjects(bob)?.paths, [otherRoot])

    await json('/workspace', cookies[0], { workspacePath: root, state: { marker: 'Alice first' }, email: bob })
    await json('/workspace', cookies[0], { workspacePath: otherRoot, state: { marker: 'Alice other' } })
    await json('/workspace', cookies[1], { workspacePath: root, state: { marker: 'Bob' } })
    assert.deepEqual(await json('/workspace' + workspaceQuery + '&email=' + bob, cookies[0]), { state: { marker: 'Alice first' } })
    assert.deepEqual(await json('/workspace?workspace=' + encodeURIComponent(otherRoot), cookies[0]), { state: { marker: 'Alice other' } })
    assert.deepEqual(await json('/workspace' + workspaceQuery, cookies[1]), { state: { marker: 'Bob' } })

    const tab = (id: string) => ({ id, label: id, sessionIds: { legacy: 'session-' + id } })
    for (const [cookie, workspacePath, id] of [
      [cookies[0], root, 'alice-first'], [cookies[0], otherRoot, 'alice-other'], [cookies[1], root, 'bob'],
    ]) await json('/agent-tabs', cookie, { workspacePath, tabs: [tab(id)], activeId: id, email: bob })
    assert.deepEqual(await json('/agent-tabs' + workspaceQuery + '&email=' + bob, cookies[0]), {
      state: { tabs: [tab('alice-first')], activeId: 'alice-first' },
      claims: [
        { workspacePath: root, tabId: 'alice-first', sessionId: 'session-alice-first' },
        { workspacePath: otherRoot, tabId: 'alice-other', sessionId: 'session-alice-other' },
      ],
    }, 'session claims include other roots of this account without borrowing another account')
  })

  await t.test('the shared error policy preserves invalid-theme 400 and generic non-secret 500 responses', async () => {
    const logged = t.mock.method(console, 'error', () => {})
    const invalidTheme = await request('/theme', cookies[0], { state: [] })
    assert.equal(invalidTheme.status, 400)
    assert.deepEqual(await invalidTheme.json(), { error: 'Invalid theme settings' })
    const invalidWorkspace = await request('/workspace', cookies[0], { workspacePath: root, state: [] })
    assert.equal(invalidWorkspace.status, 500)
    assert.deepEqual(await invalidWorkspace.json(), { error: 'Internal error' })
    assert.equal(logged.mock.callCount(), 1)
    assert.deepEqual(await json('/workspace' + workspaceQuery, cookies[0]), { state: { marker: 'Alice first' } }, 'failed writes preserve prior data')
  })

  await t.test('editor tabs merge projects across devices and isolate account and workspace keys', async () => {
    const docs = { panes: [{ id: 'main', tabs: [{ path: 'README.md' }], activePath: 'README.md' }] }
    const files = { panes: [{ id: 'main', tabs: [{ path: 'index.ts' }], activePath: 'index.ts' }] }
    const first = await json('/editor-tabs', cookies[0], { workspacePath: root, project: 'docs', state: docs, email: bob }) as StoredEditorTabsSnapshot
    assert.deepEqual(first.state, { docs })
    const merged = await json('/editor-tabs', cookies[0], { workspacePath: root, project: '.workspace', state: files })
    assert.deepEqual(merged, { state: { docs, '.workspace': files }, revision: first.revision + 1 })
    assert.deepEqual(await json('/editor-tabs', cookies[0], { workspacePath: root, project: 'docs', state: files, initialize: true }), merged, 'a second device cannot initialize over saved account tabs')
    await json('/workspace', cookies[0], { workspacePath: root, state: { tabs: { docs: files } } })
    assert.deepEqual(await json('/editor-tabs' + workspaceQuery + '&email=' + bob, cookies[0]), merged)
    assert.deepEqual(await json('/editor-tabs' + workspaceQuery, cookies[1]), { state: null, revision: 0 })
    assert.deepEqual(await json('/editor-tabs?workspace=' + encodeURIComponent(otherRoot), cookies[0]), { state: null, revision: 0 })
  })

  await t.test('editor and agent tab signals reach only the owning account and failed writes emit no signal', async () => {
    async function connect(cookie?: string) {
      const ws = new WebSocket(origin.replace('http:', 'ws:') + '/api/presence', { headers: cookie ? { Cookie: cookie } : {} })
      clients.push(ws)
      const signals: unknown[] = []
      ws.on('message', raw => {
        const message = JSON.parse(raw.toString())
        if (message.type === 'editor-tabs' || message.type === 'agent-tabs') signals.push(message)
      })
      await once(ws, 'open')
      return signals
    }
    const aliceOne = await connect(cookies[0]), aliceTwo = await connect(cookies[0])
    const bobSignals = await connect(cookies[1]), guestSignals = await connect()
    async function flushSignals() {
      await Promise.all(clients.map(async ws => {
        const pong = once(ws, 'pong')
        ws.ping()
        await pong
      }))
    }
    await json('/editor-tabs', cookies[0], editorTabsBody)
    await flushSignals()
    const expected = [{ type: 'editor-tabs', workspacePath: root }]
    assert.deepEqual(aliceOne, expected)
    assert.deepEqual(aliceTwo, expected)
    assert.deepEqual(bobSignals, [])
    assert.deepEqual(guestSignals, [])

    const logged = t.mock.method(console, 'error', () => {})
    const failed = await request('/editor-tabs', cookies[0], { ...editorTabsBody, state: [] })
    assert.equal(failed.status, 500)
    assert.deepEqual(await failed.json(), { error: 'Internal error' })
    assert.equal(logged.mock.callCount(), 1)
    await flushSignals()
    assert.deepEqual(aliceOne, expected)
    assert.deepEqual(aliceTwo, expected)
    assert.deepEqual(bobSignals, [])
    assert.deepEqual(guestSignals, [])

    await json('/agent-tabs', cookies[0], tabsBody)
    await flushSignals()
    expected.push({ type: 'agent-tabs', workspacePath: root })
    assert.deepEqual(aliceOne, expected)
    assert.deepEqual(aliceTwo, expected)
    assert.deepEqual(bobSignals, [])
    assert.deepEqual(guestSignals, [])

    const failedAgent = await request('/agent-tabs', cookies[0], { ...tabsBody, tabs: null })
    assert.equal(failedAgent.status, 500)
    assert.deepEqual(await failedAgent.json(), { error: 'Internal error' })
    assert.equal(logged.mock.callCount(), 2)
    await flushSignals()
    assert.deepEqual(aliceOne, expected)
    assert.deepEqual(aliceTwo, expected)
    assert.deepEqual(bobSignals, [])
    assert.deepEqual(guestSignals, [])
  })
})
