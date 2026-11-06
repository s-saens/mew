import './test-isolated-data.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { once } from 'node:events'
import express from 'express'
import { WebSocket } from 'ws'
import { createApiApp } from './api.ts'
import { attachAuthContext, resolveAuth } from './reqAuth.ts'
import { createSession, upsertUser } from './auth.ts'
import { attachPresenceWebSocket } from './presence.ts'
import { projectRegistry } from './project-registry.ts'
import { readActiveWorkspace, readActiveProjectPath, readWorkspaceUi, writeActiveWorkspace, writeWorkspaceUi } from './userUiState.ts'
import { DATA_DIR } from './dataDir.ts'
import { WORKSPACE_ROOT, setWorkspaceRoot } from './paths.ts'
import { resetTreeWatchers } from './watcher.ts'

test('owner permanently deletes registered trees, reconciles affected accounts and prevents stale saves from restoring them', { timeout: 15_000 }, async () => {
  const previous = WORKSPACE_ROOT
  const fixture = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mew-registry-delete-api-')))
  const target = path.join(fixture, 'deleted'), child = path.join(target, 'nested'), keep = path.join(fixture, 'retained'), worktree = path.join(fixture, 'external-worktree')
  for (const directory of [target, child, keep, worktree]) fs.mkdirSync(path.join(directory, '.mew'), { recursive: true })
  fs.writeFileSync(path.join(target, 'draft.md'), 'Delete this project')
  fs.writeFileSync(path.join(keep, 'keep.md'), 'Keep this project')
  const owner = 'deleting-owner@example.test', shortcutOnly = 'shortcut-member@example.test', nestedActive = 'nested-member@example.test', worktreeActive = 'worktree-manager@example.test', unaffected = 'unrelated-owner@example.test'
  const accounts = [owner, shortcutOnly, nestedActive, worktreeActive, unaffected]
  const cookies = new Map<string, string>()
  for (const email of accounts) {
    upsertUser(email, { hash: '', role: email === shortcutOnly || email === nestedActive ? 'member' : email === worktreeActive ? 'manager' : 'owner', mustChangePassword: false, createdAt: Date.now(), passwordChangedAt: 0 })
    cookies.set(email, `mew_session=${createSession(email)}`)
  }
  projectRegistry.link(owner, target)
  projectRegistry.link(owner, keep)
  projectRegistry.link(shortcutOnly, child)
  projectRegistry.link(shortcutOnly, keep)
  projectRegistry.link(unaffected, keep)
  writeActiveWorkspace(owner, target)
  writeActiveWorkspace(shortcutOnly, keep)
  writeActiveWorkspace(nestedActive, child)
  writeActiveWorkspace(worktreeActive, worktree, target)
  writeActiveWorkspace(unaffected, keep)
  writeWorkspaceUi(owner, target, { preserved: true })
  setWorkspaceRoot(keep)
  const app = express()
  app.use('/api', attachAuthContext, createApiApp())
  const server = http.createServer(app)
  attachPresenceWebSocket(server, { getAuth: resolveAuth })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  const sockets: WebSocket[] = [], messages = new Map<string, Array<{ type: string }>>()
  const request = (email: string | null, route: string, method = 'GET', body?: unknown) => fetch(origin + '/api' + route, {
    method, headers: { ...(email ? { Cookie: cookies.get(email)! } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  try {
    for (const email of accounts) {
      const ws = new WebSocket(origin.replace('http:', 'ws:') + '/api/presence', { headers: { Cookie: cookies.get(email)! } })
      const received: Array<{ type: string }> = []
      messages.set(email, received)
      ws.on('message', data => received.push(JSON.parse(data.toString())))
      sockets.push(ws)
      await once(ws, 'open')
    }
    for (const email of [null, shortcutOnly, worktreeActive]) {
      assert.equal((await request(email, '/project-registry', 'DELETE', { path: target })).status, 403)
      assert.equal(fs.existsSync(target), true, 'guest, member and manager cannot delete project files')
    }
    assert.equal((await request(owner, '/project-registry', 'DELETE', { path: keep + '/unregistered' })).status, 404)
    assert.equal((await request(owner, '/project-registry', 'DELETE', { path: '../relative' })).status, 400)
    const response = await request(owner, '/project-registry', 'DELETE', { path: target })
    assert.equal(response.status, 200, await response.clone().text())
    assert.deepEqual(await response.json(), { ok: true, removedPaths: [target, child], state: { paths: [keep], icons: {} } })
    assert.equal(fs.existsSync(target), false)
    assert.equal(fs.readFileSync(path.join(keep, 'keep.md'), 'utf8'), 'Keep this project')
    assert.equal(fs.existsSync(worktree), true, 'external worktree folders are preserved')
    assert.deepEqual(projectRegistry.readMine(shortcutOnly)?.paths, [keep])
    for (const email of [owner, nestedActive, worktreeActive]) assert.equal(readActiveWorkspace(email), null)
    assert.equal(readActiveProjectPath(worktreeActive, worktree), worktree)
    assert.equal(readActiveWorkspace(unaffected), keep)
    assert.deepEqual(readWorkspaceUi(owner, target), { preserved: true }, 'unrelated account UI and saved work remain intact')
    const deadline = Date.now() + 1500
    while (accounts.slice(0, 4).some(email => !messages.get(email)!.some(message => message.type === 'projects-deleted')) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10))
    for (const email of [owner, shortcutOnly, nestedActive, worktreeActive]) {
      assert.deepEqual(messages.get(email)!.filter(message => message.type === 'projects-deleted'), [{ type: 'projects-deleted' }], 'affected accounts receive one content-free reconciliation signal')
    }
    assert.equal(messages.get(unaffected)!.some(message => message.type === 'projects-deleted' || message.type === 'workspace'), false)
    assert.equal(messages.get(shortcutOnly)!.some(message => message.type === 'workspace'), false, 'shortcut-only accounts keep their current workspace')
    const ownerWorkspace = await (await request(owner, '/workspace')).json() as { hasProject: boolean; path: string }
    assert.equal(ownerWorkspace.path, keep, 'the next request restores a surviving personal shortcut')
    assert.equal(ownerWorkspace.hasProject, true)
    for (const email of [nestedActive, worktreeActive]) {
      const workspace = await (await request(email, '/workspace')).json() as { hasProject: boolean }
      assert.equal(workspace.hasProject, false, 'an affected account without surviving shortcuts returns to setup')
    }
    const lateSave = await request(shortcutOnly, '/user-ui/root-projects', 'PUT', { paths: [child, keep], icons: {} })
    assert.equal(lateSave.status, 200)
    assert.deepEqual(await lateSave.json(), { state: { paths: [keep], icons: {} } })
    assert.equal(projectRegistry.has(child), false)
    assert.equal((await request(owner, '/project-registry', 'DELETE', { path: target })).status, 404)
    const noShortcuts = path.join(fixture, 'delete-without-shortcuts')
    fs.mkdirSync(noShortcuts)
    projectRegistry.link(owner, noShortcuts)
    projectRegistry.setMine(owner, noShortcuts, false)
    const allOnly = await request(unaffected, '/project-registry', 'DELETE', { path: noShortcuts })
    assert.equal(allOnly.status, 200)
    assert.deepEqual(projectRegistry.readMine(unaffected)?.paths, [keep])
  } finally {
    for (const ws of sockets) ws.terminate()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    resetTreeWatchers()
    setWorkspaceRoot(previous)
    fs.rmSync(fixture, { recursive: true, force: true })
  }
})

test('a corrupt account ledger stops permanent deletion before project files are touched', async () => {
  const fixture = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mew-registry-delete-corrupt-')))
  const account = 'corrupt-delete-owner@example.test'
  projectRegistry.link(account, fixture)
  const file = path.join(DATA_DIR, 'user-ui-state.json'), previous = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null
  const { prepareDeletedProjectWorkspaces } = await import('./userUiState.ts')
  fs.writeFileSync(file, '{broken')
  try {
    assert.throws(() => prepareDeletedProjectWorkspaces(fixture), /상태 파일/)
    assert.equal(fs.existsSync(fixture), true)
    assert.equal(projectRegistry.has(fixture), true)
  } finally {
    if (previous === null) fs.rmSync(file)
    else fs.writeFileSync(file, previous)
    fs.rmSync(fixture, { recursive: true, force: true })
  }
})
