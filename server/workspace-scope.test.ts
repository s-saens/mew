import './test-isolated-data.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { once } from 'node:events'
import { execFileSync } from 'node:child_process'
import express from 'express'
import { WebSocket } from 'ws'
import { createApiApp, tmuxManager } from './api.ts'
import { attachAuthContext, resolveAuth, authorizeCollab, authorizeFeature, authorizeDatabase } from './reqAuth.ts'
import { createSession, upsertUser } from './auth.ts'
import { attachPresenceWebSocket, broadcast, broadcastAccount, broadcastTree } from './presence.ts'
import { attachCollabWebSocket, closeAllRooms } from './collab.ts'
import { WORKSPACE_ROOT, setWorkspaceRoot, workspaceContext, pathsForWorkspace, workspacePaths } from './paths.ts'
import { readActiveWorkspace, writeActiveWorkspace, writeWorkspaceUi } from './userUiState.ts'
import { resetTreeWatchers } from './watcher.ts'
import { createLiveSource } from './live-sources.ts'
import { resolveWorkspaceScope, runRequestWorkspace, WorkspaceScopeError } from './workspace-scope.ts'
import { projectRegistry } from './project-registry.ts'
import { setFeature } from './access-policy.ts'
import { publishDbEvent, subscribeDb } from './db/hub.ts'
import { DbNotConfiguredError, getPool, isDbConfigured } from './db/pool.ts'
import { attachDbWebSocket } from './db/socket.ts'
import { readWorkspaceScope, workspaceScopeUrl, WORKSPACE_SCOPE_VERSION, type WorkspaceScope } from '../shared/workspace-scope.ts'

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const owner = { role: 'owner' as const, email: 'scoped-owner@example.test', mustChangePassword: false }
const git = (root: string, ...args: string[]) => execFileSync('git', ['-C', root, ...args], { stdio: 'pipe', encoding: 'utf8' }).trim()

test('scope URLs preserve resources and reject ambiguous scope encodings', () => {
  const scope = { workspacePath: '/root A', projectPath: '/root A' }
  const resource = workspaceScopeUrl('/api/raw?project=.workspace&path=a%20b.png#page', scope)
  const url = new URL(resource, 'https://example.test')
  assert.equal(url.searchParams.get('path'), 'a b.png')
  assert.equal(url.hash, '#page')
  assert.deepEqual(readWorkspaceScope(url.searchParams), scope)
  assert.ok(workspaceScopeUrl('wss://example.test/api/collab?room=docs%3Aa.md', scope).startsWith('wss://example.test/'))
  assert.throws(() => readWorkspaceScope(new URLSearchParams('mewProjectPath=/root')))
  assert.throws(() => readWorkspaceScope(new URLSearchParams('mewWorkspacePath=/a&mewWorkspacePath=/b')))
  assert.throws(() => workspaceScopeUrl(resource, { workspacePath: '/other', projectPath: '/other' }))
})

test('same-account scoped HTTP, resources, snapshots, navigation, and subscriptions stay independent', { timeout: 20_000 }, async t => {
  const original = WORKSPACE_ROOT, temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-workspace-scope-'))
  const roots = ['a', 'b', 'legacy'].map(name => path.join(temporary, name))
  for (const [index, root] of roots.entries()) {
    fs.mkdirSync(path.join(root, 'docs'), { recursive: true })
    fs.writeFileSync(path.join(root, 'same.txt'), `root ${index}`)
    git(root, 'init', '-b', 'main')
  }
  setWorkspaceRoot(roots[2])
  upsertUser(owner.email, { hash: '', role: owner.role, mustChangePassword: false, createdAt: Date.now(), passwordChangedAt: 0 })
  const cookie = `mew_session=${createSession(owner.email)}`
  writeActiveWorkspace(owner.email, roots[2])
  writeWorkspaceUi(owner.email, roots[0], { editor: 'a' })
  const app = express()
  app.use('/api', attachAuthContext, createApiApp())
  const server = http.createServer(app)
  attachPresenceWebSocket(server, { getAuth: resolveAuth })
  attachCollabWebSocket(server, { authorize: authorizeCollab })
  attachDbWebSocket(server, { authorize: authorizeFeature('database'), authorizeProject: authorizeDatabase })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`, sockets: WebSocket[] = []
  t.after(async () => {
    for (const ws of sockets) ws.terminate()
    closeAllRooms()
    await new Promise<void>(resolve => server.close(() => resolve()))
    resetTreeWatchers(); setWorkspaceRoot(original)
    fs.rmSync(temporary, { recursive: true, force: true })
  })
  const scopes = roots.map(root => ({ workspacePath: root, projectPath: root }))
  const terminals: string[] = [], killed: string[] = []
  t.mock.method(tmuxManager, 'list', async () => terminals.map(name => ({ name, windows: 1, attached: false, createdAt: 0 })))
  t.mock.method(tmuxManager, 'startCommand', async (name: string) => { terminals.push(name) })
  t.mock.method(tmuxManager, 'kill', async (name: string) => { killed.push(name); terminals.splice(terminals.indexOf(name), 1) })
  const request = (route: string, scope?: WorkspaceScope, body?: object, method = body ? 'POST' : 'GET', headers: Record<string, string> = {}) => fetch(origin + (scope ? workspaceScopeUrl('/api' + route, scope) : '/api' + route), {
    method, headers: { Cookie: cookie, ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined,
  })
  async function connect(route: string, scope?: WorkspaceScope) {
    const ws = new WebSocket(origin.replace('http:', 'ws:') + (scope ? workspaceScopeUrl(route, scope) : route), { headers: { Cookie: cookie } })
    sockets.push(ws)
    const messages: Array<Record<string, unknown>> = []
    ws.on('message', raw => { try { messages.push(JSON.parse(raw.toString())) } catch { /* Collab binary frames */ } })
    await once(ws, 'open')
    return { ws, messages }
  }
  async function until(check: () => boolean) {
    for (let i = 0; i < 200; i++) { if (check()) return; await pause(10) }
    assert.fail('Expected socket message did not arrive')
  }
  async function rejectedSocket(route: string): Promise<number | undefined> {
    const ws = new WebSocket(origin.replace('http:', 'ws:') + route, { headers: { Cookie: cookie } })
    sockets.push(ws)
    ws.on('error', () => {})
    return new Promise(resolve => ws.once('unexpected-response', (_req, response) => { response.resume(); resolve(response.statusCode); ws.terminate() }))
  }

  const terminalA = await (await request('/agent-runtimes/tmux/terminal/same-tab', scopes[0], { cwd: roots[0] })).json() as { session: string }
  const terminalB = await (await request('/agent-runtimes/tmux/terminal/same-tab', scopes[1], { cwd: roots[1] })).json() as { session: string }
  const terminalLegacy = await (await request('/agent-runtimes/tmux/terminal/same-tab', undefined, { cwd: roots[2] })).json() as { session: string }
  assert.equal(new Set([terminalA.session, terminalB.session, terminalLegacy.session]).size, 3)
  const acquiredExplicit = await (await request('/agent-runtimes/tmux/terminal/same-tab', scopes[2], { cwd: roots[2] })).json() as { session: string }
  assert.equal(acquiredExplicit.session, terminalLegacy.session, 'a newly created single-mode shell is the same execution in explicit mode')
  writeActiveWorkspace(owner.email, roots[0])
  const acquiredSingle = await (await request('/agent-runtimes/tmux/terminal/same-tab', undefined, { cwd: roots[0] })).json() as { session: string }
  assert.equal(acquiredSingle.session, terminalA.session, 'returning to single mode retains an existing qualified shell')
  writeActiveWorkspace(owner.email, roots[2])
  assert.equal((await request('/agent-runtimes/tmux/terminal/same-tab', scopes[0], undefined, 'DELETE')).status, 200)
  assert.deepEqual(killed, [terminalA.session])
  assert.deepEqual(terminals, [terminalB.session, terminalLegacy.session])

  const panel = await connect('/api/presence', scopes[0])
  const browser = await connect('/api/presence')
  panel.messages.length = browser.messages.length = 0
  const prepared = await request('/workspace?include=workspace-ui', scopes[0])
  assert.equal(prepared.status, 200)
  assert.deepEqual(await prepared.json(), { workspaceScopeVersion: WORKSPACE_SCOPE_VERSION, hasProject: true, path: roots[0], projectPath: roots[0], projects: [], docs: 'docs', docsPath: path.join(roots[0], 'docs'), workspaceUi: { workspacePath: roots[0], state: { editor: 'a' } }, editorTabs: { workspacePath: roots[0], state: null, revision: 0 } })
  assert.equal((await (await request('/workspace')).json() as { workspaceScopeVersion: number }).workspaceScopeVersion, WORKSPACE_SCOPE_VERSION, 'legacy snapshots advertise support before the client may create explicit views')
  assert.equal(readActiveWorkspace(owner.email), roots[2])
  const localSwitch = await request('/workspace', scopes[0], { path: roots[1] })
  assert.equal(localSwitch.status, 200)
  const switched = await localSwitch.json() as { path: string; workspaceScopeVersion: number }
  assert.equal(switched.path, roots[1])
  assert.equal(switched.workspaceScopeVersion, WORKSPACE_SCOPE_VERSION, 'navigation responses advertise the same scope contract')
  assert.equal(readActiveWorkspace(owner.email), roots[2])
  broadcast({ type: 'marker' })
  await until(() => browser.messages.some(message => message.type === 'marker'))
  assert.equal(browser.messages.some(message => message.type === 'workspace'), false)

  for (let i = 0; i < 3; i++) {
    const results = await Promise.all(scopes.slice(0, 2).map(async scope => (await request('/file?project=.workspace&path=same.txt', scope)).json() as Promise<{ content: string }>))
    assert.deepEqual(results.map(result => result.content), ['root 0', 'root 1'])
  }
  const saves = await Promise.all(scopes.slice(0, 2).map((scope, index) => request('/file', scope, { project: '.workspace', path: 'same.txt', content: `saved ${index}`, workspace: scope.workspacePath }, 'PUT')))
  assert.deepEqual(saves.map(response => response.status), [200, 200])
  assert.deepEqual(roots.map(root => fs.readFileSync(path.join(root, 'same.txt'), 'utf8')), ['saved 0', 'saved 1', 'root 2'])
  assert.equal(await (await request('/raw?project=.workspace&path=same.txt', scopes[1])).text(), 'saved 1')
  assert.equal((await request('/file', scopes[0], { project: '.workspace', path: 'same.txt', content: 'wrong', workspace: roots[1] }, 'PUT')).status, 409)
  assert.equal((await request('/cmd-buttons?project=.workspace&workspacePath=' + encodeURIComponent(roots[1]), scopes[0])).status, 409)
  assert.equal((await request('/git/info?project=.workspace', scopes[0], undefined, 'GET', { 'x-mew-git-workspace': encodeURIComponent(roots[1]) })).status, 409)
  assert.equal((await request('/user-ui/editor-tabs?workspace=' + encodeURIComponent(roots[1]), scopes[0])).status, 409)
  assert.equal((await request('/db?project=docs', scopes[0])).status, 503, 'scoped database operations fail before accessing any Postgres pool')
  assert.equal((await request('/file', scopes[0], { project: '.workspace', path: 'ordinary.md', content: '# Ordinary document', workspace: roots[0] }, 'PUT')).status, 200, 'ordinary Markdown remains independent of optional database integration')
  await t.test('scoped linked-page saves preserve current metadata and isolate the edited file', async () => {
    const boundPage = '---\n_mew_database: 11111111-1111-4111-8111-111111111111\n_mew_row: 22222222-2222-4222-8222-222222222222\nscore: 1\n---\nBound page'
    const files = roots.map(root => path.join(root, 'bound.md'))
    const save = (content: string, expectedContent?: string) => request('/file', scopes[0], {
      project: '.workspace', path: 'bound.md', content, expectedContent, workspace: roots[0],
    }, 'PUT')
    assert.equal((await save(boundPage)).status, 503, 'a scoped save cannot create a bound page')
    assert.equal(fs.existsSync(files[0]), false)

    for (const file of files) fs.writeFileSync(file, boundPage)
    const bodyEdit = boundPage.replace('Bound page', 'First body edit')
    assert.equal((await save(bodyEdit)).status, 200, 'an existing linked page accepts a body edit without a baseline')
    assert.equal(fs.readFileSync(files[0], 'utf8'), bodyEdit)

    const newerMetadata = bodyEdit.replace('score: 1', 'score: 2 # changed by the table')
    fs.writeFileSync(files[0], newerMetadata)
    const submitted = bodyEdit.replace('First body edit', 'Second body edit')
    const merged = newerMetadata.replace('First body edit', 'Second body edit')
    const response = await save(submitted, bodyEdit)
    assert.equal(response.status, 200)
    assert.equal((await response.json() as { content: string }).content, merged)
    assert.deepEqual(files.map(file => fs.readFileSync(file, 'utf8')), [merged, boundPage, boundPage])

    assert.equal((await save(bodyEdit.replace('First body edit', 'Conflicting body edit'), bodyEdit)).status, 409)
    assert.equal((await save(merged.replace('score: 2', 'score: 3'), merged)).status, 503)
    assert.equal((await save('Second body edit', merged)).status, 503)
    assert.equal(fs.readFileSync(files[0], 'utf8'), merged)

    const rebound = merged.replace('22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333')
    fs.writeFileSync(files[0], rebound)
    assert.equal((await save(merged.replace('Second body edit', 'Stale draft'), merged)).status, 409)
    assert.equal(fs.readFileSync(files[0], 'utf8'), rebound)
    fs.unlinkSync(files[0])
    assert.equal((await save(merged.replace('Second body edit', 'Stale draft'), merged)).status, 409)
    assert.equal(fs.existsSync(files[0]), false)

    fs.writeFileSync(files[0], merged)
    const drafts = ['Concurrent edit A', 'Concurrent edit B'].map(body => merged.replace('Second body edit', body))
    const responses = await Promise.all(drafts.map(draft => save(draft, merged)))
    assert.deepEqual(responses.map(result => result.status).sort(), [200, 409])
    assert.equal(fs.readFileSync(files[0], 'utf8'), drafts[responses.findIndex(result => result.ok)])
  })
  const malformed = await fetch(origin + '/api/workspace?mewWorkspacePath=' + encodeURIComponent(roots[0]) + '&mewWorkspacePath=' + encodeURIComponent(roots[1]), { headers: { Cookie: cookie } })
  assert.equal(malformed.status, 400)
  const guest = await fetch(origin + workspaceScopeUrl('/api/raw?project=.workspace&path=same.txt', scopes[0]))
  assert.equal(guest.status, 403)
  assert.equal(await rejectedSocket('/api/collab?room=docs%3Anote.md&mewWorkspacePath='), 400, 'invalid WebSocket scope is rejected during upgrade')
  assert.equal(await rejectedSocket(workspaceScopeUrl('/api/db/ws', scopes[0])), 401, 'scoped database subscriptions are blocked before upgrade without opening Postgres')
  assert.throws(() => request('/file?project=.workspace&path=same.txt&mewWorkspacePath=' + encodeURIComponent(roots[1]), scopes[0]), /범위/, 'URL helper rejects contradictory scopes before sending')

  const source = createLiveSource({ url: workspaceScopeUrl('/api/live/ws', scopes[0]), headers: {}, socket: { remoteAddress: '127.0.0.1' } } as http.IncomingMessage, { kind: 'git', project: '.workspace', path: '' }, () => owner)
  assert.equal(source.allowed(), true)
  assert.equal((await request('/workspace', undefined, { path: roots[1] })).status, 200)
  assert.equal(source.allowed(), true, 'a legacy account switch cannot revoke or move an explicit live source')
  assert.equal((await source.read()).info !== undefined, true)
  assert.equal((await request('/workspace', scopes[0]).then(response => response.json()) as { path: string }).path, roots[0])
  broadcast({ type: 'marker-2' })
  await until(() => browser.messages.some(message => message.type === 'marker-2'))
  assert.equal(panel.messages.some(message => message.type === 'workspace'), false)
  assert.equal(browser.messages.some(message => message.type === 'workspace'), true)

  git(roots[0], 'add', '.')
  git(roots[0], '-c', 'user.email=test@example.test', '-c', 'user.name=Test', 'commit', '-m', 'initial')
  const linked = path.join(temporary, 'linked')
  git(roots[0], 'worktree', 'add', '-b', 'linked', linked)
  const linkedScope = { workspacePath: linked, projectPath: roots[0] }
  const worktreeSwitch = await request('/workspace', scopes[0], { path: linked, worktree: true, workspace: roots[0] })
  assert.equal(worktreeSwitch.status, 200)
  assert.deepEqual(await worktreeSwitch.json(), await (await request('/workspace', linkedScope)).json())
  assert.equal(readActiveWorkspace(owner.email), roots[1], 'local worktree selection leaves legacy selection unchanged')
  const linkedInfo = await (await request('/workspace?include=workspace-ui', linkedScope)).json() as { projectPath: string; workspaceUi: { workspacePath: string } }
  assert.equal(linkedInfo.projectPath, roots[0])
  assert.equal(linkedInfo.workspaceUi.workspacePath, roots[0])

  browser.ws.send(JSON.stringify({ type: 'workspace-subscriptions', scopes: scopes.slice(0, 2) }))
  await until(() => browser.messages.some(message => message.workspaceParticipants && typeof message.workspaceParticipants === 'object' && roots[0] in message.workspaceParticipants))
  const roster = browser.messages.find(message => message.workspaceParticipants)?.activeSessions as { sessions: unknown[] }
  assert.equal(roster.sessions.length, 2, 'subscribing roots does not create extra browser sessions')
  const participants = (message: Record<string, unknown>, root: string) => (message.workspaceParticipants as Record<string, Record<string, string[]>> | undefined)?.[root]?.['.workspace:same.txt'] ?? []
  panel.ws.send(JSON.stringify({ type: 'focus', path: '.workspace:same.txt', color: '#123456' }))
  await until(() => browser.messages.some(message => participants(message, roots[0]).includes('#123456') && !participants(message, roots[1]).includes('#123456')))
  browser.ws.send(JSON.stringify({ type: 'focus', path: '.workspace:same.txt', color: '#abcdef', workspaceScope: scopes[1] }))
  await until(() => browser.messages.some(message => participants(message, roots[1]).includes('#abcdef') && !participants(message, roots[0]).includes('#abcdef')))
  browser.ws.send(JSON.stringify({ type: 'focus', path: null, workspaceScope: null }))
  browser.messages.length = panel.messages.length = 0
  for (const [index, scope] of scopes.entries()) runRequestWorkspace({ url: workspaceScopeUrl('/api/tree', scope) }, owner, () => broadcastTree({ type: 'tree', project: '.workspace', version: index + 10, parents: ['private'] }))
  await until(() => browser.messages.filter(message => message.type === 'tree').length === 2)
  assert.deepEqual(browser.messages.filter(message => message.type === 'tree').map(message => message.workspacePath).sort(), roots.slice(0, 2).sort())
  assert.equal(panel.messages.filter(message => message.type === 'tree').length, 1)
  const nested = path.join(roots[0], 'nested')
  fs.mkdirSync(path.join(nested, 'docs'), { recursive: true })
  fs.writeFileSync(path.join(nested, 'initial.txt'), 'nested')
  const nestedScope = { workspacePath: nested, projectPath: nested }
  browser.ws.send(JSON.stringify({ type: 'workspace-subscriptions', scopes: [...scopes.slice(0, 2), nestedScope] }))
  await until(() => browser.messages.some(message => message.workspaceParticipants && typeof message.workspaceParticipants === 'object' && nested in message.workspaceParticipants))
  await Promise.all([
    request('/tree?project=nested', scopes[0]),
    request('/tree?project=.workspace', nestedScope),
    request('/tree?project=.workspace', scopes[1]),
  ])
  await pause(75)
  browser.messages.length = 0
  fs.writeFileSync(path.join(nested, 'added.txt'), 'new nested file')
  await until(() => browser.messages.some(message => message.type === 'tree' && message.workspacePath === nested && message.project === '.workspace')
    && browser.messages.some(message => message.type === 'tree' && message.workspacePath === roots[0] && message.project === 'nested'))
  resetTreeWatchers(roots[0])
  browser.messages.length = 0
  fs.writeFileSync(path.join(roots[1], 'after-reset.txt'), 'other root remains watched')
  await until(() => browser.messages.some(message => message.type === 'tree' && message.workspacePath === roots[1]))
  broadcastAccount(owner.email, { type: 'theme' })
  await until(() => panel.messages.some(message => message.type === 'theme'))

  const collab = await connect('/api/collab?room=.workspace%3Asame.txt', scopes[0])
  assert.equal(collab.ws.readyState, WebSocket.OPEN)
  const events = await fetch(origin + workspaceScopeUrl('/api/task-list/events?workspace=' + encodeURIComponent(roots[0]), scopes[0]), { headers: { Cookie: cookie, 'x-mew-task-owner': encodeURIComponent(owner.email) } })
  assert.equal(events.status, 200)
  const stream = events.body!.getReader()
  assert.match(new TextDecoder().decode((await stream.read()).value), /data: changed/)
  assert.equal((await request('/workspace', undefined, { path: roots[2] })).status, 200)
  assert.equal(collab.ws.readyState, WebSocket.OPEN)
  setFeature(owner.email, 'filesRead', false)
  try {
    assert.equal(source.allowed(), false, 'pinned sources revalidate current permissions')
    const closed = await Promise.race([stream.read(), pause(1000).then(() => null)])
    assert.equal(closed?.done, true, 'task SSE closes on permission revocation within its captured root')
  } finally { setFeature(owner.email, 'filesRead', null); await stream.cancel() }
  const otherRoom = await connect('/api/collab?room=docs%3Anote.md', scopes[1])
  const nextDocs = path.join(roots[0], 'notes')
  fs.mkdirSync(nextDocs)
  browser.messages.length = 0
  assert.equal((await request('/docs/root', scopes[0], { path: nextDocs })).status, 200)
  await until(() => browser.messages.some(message => message.type === 'workspace' && message.workspacePath === roots[0]))
  assert.equal(otherRoom.ws.readyState, WebSocket.OPEN, 'changing Documents does not close another project collaboration room')
  fs.rmSync(roots[0], { recursive: true, force: true })
  assert.equal(source.allowed(), false)
  assert.equal((await request('/workspace', scopes[0])).status, 404)
})

test('explicit worktrees retain logical identity and member validation fails closed', async t => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-worktree-scope-')), root = path.join(temporary, 'root'), linked = path.join(temporary, 'linked'), other = path.join(temporary, 'other')
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }))
  for (const directory of [root, other]) { fs.mkdirSync(directory); git(directory, 'init', '-b', 'main') }
  fs.writeFileSync(path.join(root, 'note.txt'), 'initial')
  git(root, '-c', 'user.email=test@example.test', '-c', 'user.name=Test', 'add', '.')
  git(root, '-c', 'user.email=test@example.test', '-c', 'user.name=Test', 'commit', '-m', 'initial')
  git(root, 'worktree', 'add', '-b', 'other', linked)
  const scope = { workspacePath: linked, projectPath: root }
  const resolved = resolveWorkspaceScope(owner, scope)
  assert.equal(resolved.root, linked)
  assert.equal(resolved.projectPath, root)
  const marker = path.join(linked, '.git')
  fs.writeFileSync(marker, fs.readFileSync(marker, 'utf8').replace(/\r?\n$/, '\r\n'))
  assert.equal(resolveWorkspaceScope(owner, scope).root, linked, 'Git metadata also accepts CRLF line endings')
  assert.throws(() => resolveWorkspaceScope(owner, { workspacePath: other, projectPath: root }), /worktree/)
  const member = { ...owner, role: 'member' as const }
  assert.throws(() => resolveWorkspaceScope(member, { workspacePath: root, projectPath: root }), /등록/)
  for (const directory of [other, path.join(temporary, 'missing')]) {
    assert.throws(() => resolveWorkspaceScope(member, { workspacePath: directory, projectPath: directory }),
      (error: unknown) => error instanceof WorkspaceScopeError && error.status === 403 && error.message === '등록된 프로젝트만 열 수 있습니다.',
      'unregistered roots are rejected before their existence can affect the response')
  }
  projectRegistry.link(owner.email, root)
  assert.equal(resolveWorkspaceScope(member, { workspacePath: root, projectPath: root }).root, root)
  assert.throws(() => resolveWorkspaceScope(member, scope), /등록/)
  assert.throws(() => resolveWorkspaceScope({ ...owner, email: null, role: 'guest' }, scope), /로그인/)
  assert.throws(() => runRequestWorkspace({ url: '/api/workspace?mewWorkspacePath=' }, owner, () => null))
  assert.throws(() => runRequestWorkspace({ url: '/api/workspace?mewProjectPath=/only' }, owner, () => null))
})

test('database event keys include the captured actual root', () => {
  const roots = ['/scope/a', '/scope/b'], received: string[][] = [[], []], remove: Array<() => void> = []
  try {
    roots.forEach((root, index) => workspaceContext.run(pathsForWorkspace(root, owner.email), () => remove.push(subscribeDb('.workspace', 'same-id', event => received[index].push(event.type)))))
    roots.forEach(root => workspaceContext.run(pathsForWorkspace(root, owner.email), () => publishDbEvent('.workspace', 'same-id', { type: 'title', title: root })))
    assert.deepEqual(received, [['title'], ['title']])
    assert.equal(workspacePaths.root, WORKSPACE_ROOT)
  } finally { remove.forEach(dispose => dispose()) }
})

test('explicit database isolation guard prevents opening a pool without touching database configuration', () => {
  workspaceContext.run({ ...pathsForWorkspace('/scope/a', owner.email), explicit: true, projectPath: '/scope/a' }, () => {
    assert.equal(isDbConfigured(), false)
    assert.throws(getPool, DbNotConfiguredError)
  })
})
