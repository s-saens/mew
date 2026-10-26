import './test-isolated-data.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { once } from 'node:events'
import express from 'express'
import { WebSocket } from 'ws'
import { createApiApp } from './api.ts'
import { createSession, upsertUser } from './auth.ts'
import { attachAuthContext, resolveAuth } from './reqAuth.ts'
import { attachPresenceWebSocket, broadcast } from './presence.ts'
import { WORKSPACE_ROOT, pathsForWorkspace, setWorkspaceRoot, workspaceContext } from './paths.ts'
import { readActiveProjectPath, readActiveWorkspace, writeActiveWorkspace, writeWorkspaceUi } from './userUiState.ts'
import { currentWorkspace, type WorkspaceInfo } from './workspace.ts'
import { resetTreeWatchers } from './watcher.ts'

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

function initialize(cwd: string): void {
  fs.mkdirSync(path.join(cwd, 'docs'), { recursive: true })
  git(cwd, 'init', '-b', 'main')
  git(cwd, 'config', 'user.name', 'Mew Test')
  git(cwd, 'config', 'user.email', 'mew@example.test')
  fs.writeFileSync(path.join(cwd, '.gitignore'), '/.worktrees/\n')
  fs.writeFileSync(path.join(cwd, 'same.txt'), 'main content')
  fs.writeFileSync(path.join(cwd, 'docs', 'note.md'), 'main document')
  git(cwd, 'add', '.')
  git(cwd, 'commit', '-m', 'Initial content')
}

test('worktree navigation retains the account project identity and changes only its file root', { timeout: 15_000 }, async t => {
  const originalRoot = WORKSPACE_ROOT
  const temporary = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mew-worktree-workspace-')))
  const primary = path.join(temporary, 'project')
  const linked = path.join(primary, '.worktrees', 'feature')
  const unrelated = path.join(temporary, 'unrelated')
  initialize(primary)
  initialize(unrelated)
  git(primary, 'worktree', 'add', '-b', 'feat/task', linked)
  fs.writeFileSync(path.join(primary, 'same.txt'), 'main draft')
  fs.writeFileSync(path.join(linked, 'same.txt'), 'feature draft')
  fs.writeFileSync(path.join(linked, 'docs', 'note.md'), 'feature document')
  setWorkspaceRoot(primary)

  const emails = ['worktree-owner@example.test', 'worktree-other@example.test', 'worktree-member@example.test']
  const cookies = emails.map((email, index) => {
    upsertUser(email, { hash: '', role: index === 2 ? 'member' : 'owner', mustChangePassword: false, createdAt: Date.now(), passwordChangedAt: 0 })
    writeActiveWorkspace(email, primary)
    return `mew_session=${createSession(email)}`
  })
  writeWorkspaceUi(emails[0], primary, { layout: 'preserved' })
  writeWorkspaceUi(emails[0], linked, { layout: 'separate' })
  const app = express()
  app.use('/api', attachAuthContext, createApiApp())
  const server = http.createServer(app)
  attachPresenceWebSocket(server, { getAuth: resolveAuth })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  const sockets: WebSocket[] = []
  t.after(async () => {
    for (const socket of sockets) socket.terminate()
    await new Promise<void>(resolve => server.close(() => resolve()))
    resetTreeWatchers()
    setWorkspaceRoot(originalRoot)
    fs.rmSync(temporary, { recursive: true, force: true })
  })
  const request = (route: string, body?: object, account = 0, method = body ? 'POST' : 'GET') => fetch(`http://127.0.0.1:${port}/api${route}`, {
    method,
    headers: { Cookie: cookies[account], ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  async function info(account = 0): Promise<WorkspaceInfo> {
    const response = await request('/workspace', undefined, account)
    assert.equal(response.status, 200)
    return response.json() as Promise<WorkspaceInfo>
  }
  async function connect(account: number) {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/api/presence`, { headers: { Cookie: cookies[account] } })
    const messages: Array<{ type: string }> = []
    socket.on('message', raw => messages.push(JSON.parse(raw.toString())))
    sockets.push(socket)
    await once(socket, 'open')
    return { socket, messages }
  }
  const owner = await connect(0)
  const other = await connect(1)
  const marker = (socket: WebSocket) => new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => { socket.off('message', receive); reject(new Error('Presence marker timed out')) }, 2_000)
    const receive = (raw: WebSocket.RawData) => {
      if (JSON.parse(raw.toString()).type !== 'test-marker') return
      clearTimeout(timeout)
      socket.off('message', receive)
      resolve()
    }
    socket.on('message', receive)
  })

  assert.equal((await request('/workspace', { path: linked, worktree: true, workspace: primary }, 2)).status, 403)
  assert.equal((await request('/workspace', { path: linked, worktree: true })).status, 409)
  assert.equal((await request('/workspace', { path: unrelated, worktree: true, workspace: primary })).status, 400)
  assert.equal((await request('/workspace', { path: path.join(primary, 'docs'), worktree: true, workspace: primary })).status, 400)
  assert.equal((await info()).path, primary, 'rejected navigation cannot change the active folder')

  owner.messages.length = 0
  other.messages.length = 0
  const switched = await request('/workspace', { path: linked, worktree: true, workspace: primary })
  assert.equal(switched.status, 200, await switched.clone().text())
  const selected = await switched.json() as WorkspaceInfo
  assert.equal(selected.path, linked)
  assert.equal(selected.projectPath, primary)
  assert.equal(selected.docsPath, path.join(linked, 'docs'))
  const markers = [marker(owner.socket), marker(other.socket)]
  broadcast({ type: 'test-marker' })
  await Promise.all(markers)
  assert.equal(owner.messages.filter(message => message.type === 'workspace').length, 1)
  assert.equal(other.messages.filter(message => message.type === 'workspace').length, 0)
  assert.deepEqual(await info(), selected, 'a new request or another same-account browser restores the logical project')
  assert.equal(readActiveWorkspace(emails[0]), linked)
  assert.equal(readActiveProjectPath(emails[0], linked), primary)
  assert.equal((await info(1)).path, primary)
  assert.equal(WORKSPACE_ROOT, primary, 'the server default root stays unchanged')
  assert.equal(workspaceContext.run(pathsForWorkspace(unrelated, emails[0]), () => currentWorkspace().projectPath), unrelated, 'an older request root cannot inherit an unrelated stored identity')

  const content = await (await request('/file?project=.workspace&path=same.txt')).json() as { content: string }
  assert.equal(content.content, 'feature draft')
  const document = await (await request('/file?project=docs&path=note.md')).json() as { content: string }
  assert.equal(document.content, 'feature document')
  assert.equal((await request('/file', { project: '.workspace', path: 'same.txt', workspace: primary, content: 'late draft' }, 0, 'PUT')).status, 409)
  assert.equal((await request('/workspace', { path: primary, worktree: true, workspace: primary })).status, 409)
  assert.equal(fs.readFileSync(path.join(primary, 'same.txt'), 'utf8'), 'main draft')
  assert.equal(fs.readFileSync(path.join(linked, 'same.txt'), 'utf8'), 'feature draft')
  assert.equal(git(primary, 'branch', '--show-current'), 'main')
  assert.equal(git(linked, 'branch', '--show-current'), 'feat/task')

  const ui = await (await request(`/user-ui/workspace?workspace=${encodeURIComponent(selected.projectPath!)}`)).json() as { state: { layout: string } }
  assert.equal(ui.state.layout, 'preserved')
  const back = await request('/workspace', { path: primary, worktree: true, workspace: linked })
  assert.equal(back.status, 200)
  assert.equal((await back.json() as WorkspaceInfo).projectPath, primary)
  const explicit = await request('/workspace', { path: linked })
  assert.equal(explicit.status, 200)
  assert.equal((await explicit.json() as WorkspaceInfo).projectPath, linked, 'explicit project selection establishes a new project identity')
  assert.equal((await info()).projectPath, linked)

  writeActiveWorkspace(emails[0], path.join(temporary, 'missing'), linked)
  const fallback = await info()
  assert.equal(fallback.path, primary)
  assert.equal(fallback.projectPath, primary, 'a deleted active root cannot attach its saved identity to the fallback folder')
})
