import './test-isolated-data.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import express from 'express'
import { createApiApp } from './api.ts'
import { createSession, upsertUser } from './auth.ts'
import { attachAuthContext } from './reqAuth.ts'
import { WORKSPACE_ROOT, setWorkspaceRoot } from './paths.ts'
import { writeActiveWorkspace, writeWorkspaceUi } from './userUiState.ts'
import { resetTreeWatchers } from './watcher.ts'

type WorkspaceResponse = { path: string; projectPath?: string; hasProject: boolean; workspaceUi?: { workspacePath: string; state: Record<string, unknown> | null } }

function account(email: string) {
  upsertUser(email, { hash: '', role: 'owner', mustChangePassword: false, createdAt: Date.now(), passwordChangedAt: 0 })
  return `mew_session=${createSession(email)}`
}

async function apiFixture() {
  const app = express()
  app.use('/api', attachAuthContext, createApiApp())
  const server = http.createServer(app)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`
  return {
    request: (route: string, cookie?: string, body?: object) => fetch(base + route, {
      method: body ? 'POST' : 'GET', headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    }),
    close: async () => {
      server.closeAllConnections()
      await new Promise<void>(resolve => server.close(() => resolve()))
    },
  }
}

async function workspace(response: Response): Promise<WorkspaceResponse> {
  assert.equal(response.status, 200, await response.clone().text())
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  return response.json() as Promise<WorkspaceResponse>
}

test('workspace UI snapshots are opt-in, bounded and tied to the authenticated account and selected root', { timeout: 15_000 }, async () => {
  const originalRoot = WORKSPACE_ROOT
  const temporary = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mew-workspace-ui-snapshot-')))
  const primary = path.join(temporary, 'primary'), other = path.join(temporary, 'other')
  for (const root of [primary, other]) fs.mkdirSync(path.join(root, 'docs'), { recursive: true })
  setWorkspaceRoot(primary)
  const alice = 'snapshot-alice@example.test', bob = 'snapshot-bob@example.test', empty = 'snapshot-empty@example.test', projectless = 'snapshot-projectless@example.test'
  const aliceCookie = account(alice), bobCookie = account(bob), emptyCookie = account(empty), projectlessCookie = account(projectless)
  writeActiveWorkspace(alice, primary)
  writeActiveWorkspace(bob, primary)
  writeActiveWorkspace(empty, primary)
  writeWorkspaceUi(alice, primary, { marker: 'Alice primary', sidebarOpen: false })
  writeWorkspaceUi(bob, primary, { marker: 'Bob primary', sidebarOpen: true })
  writeWorkspaceUi(alice, other, { marker: 'Alice other' })
  const api = await apiFixture()
  try {
    const plain = await workspace(await api.request('/workspace', aliceCookie))
    assert.equal(Object.hasOwn(plain, 'workspaceUi'), false, 'ordinary workspace metadata keeps its response contract')
    for (const include of ['unknown', 'workspace-ui,tree', 'workspace-ui&include=workspace-ui']) {
      const result = await workspace(await api.request('/workspace?include=' + include, aliceCookie))
      assert.equal(Object.hasOwn(result, 'workspaceUi'), false, 'only the exact single opt-in selects the snapshot')
    }
    const snapshots = await Promise.all([aliceCookie, bobCookie, aliceCookie, bobCookie].map(cookie => api.request('/workspace?include=workspace-ui', cookie).then(workspace)))
    assert.deepEqual(snapshots.map(result => result.workspaceUi), [
      { workspacePath: primary, state: { marker: 'Alice primary', sidebarOpen: false } },
      { workspacePath: primary, state: { marker: 'Bob primary', sidebarOpen: true } },
      { workspacePath: primary, state: { marker: 'Alice primary', sidebarOpen: false } },
      { workspacePath: primary, state: { marker: 'Bob primary', sidebarOpen: true } },
    ], 'concurrent requests cannot borrow another account\'s layout')
    const forged = await workspace(await api.request('/workspace?include=workspace-ui&email=' + encodeURIComponent(bob) + '&workspace=' + encodeURIComponent(other), aliceCookie))
    assert.deepEqual(forged.workspaceUi, snapshots[0].workspaceUi, 'request account and root query parameters do not select someone else\'s ledger')
    assert.equal((await api.request('/workspace?include=workspace-ui')).status, 403, 'guests cannot request account workspace state')

    const knownEmpty = await workspace(await api.request('/workspace?include=workspace-ui', emptyCookie))
    assert.deepEqual(knownEmpty.workspaceUi, { workspacePath: primary, state: null }, 'known-empty state is explicit so clients can skip a redundant query')
    const noProject = await workspace(await api.request('/workspace?include=workspace-ui', projectlessCookie))
    assert.equal(noProject.hasProject, false)
    assert.equal(Object.hasOwn(noProject, 'workspaceUi'), false, 'projectless accounts do not receive a snapshot for the default server root')

    const switched = await workspace(await api.request('/workspace', aliceCookie, { path: other }))
    assert.equal(switched.path, other)
    assert.equal(Object.hasOwn(switched, 'workspaceUi'), false, 'ordinary POST responses are unchanged')
    const selected = await workspace(await api.request('/workspace?include=workspace-ui', aliceCookie))
    assert.deepEqual(selected.workspaceUi, { workspacePath: other, state: { marker: 'Alice other' } })
    assert.equal((await workspace(await api.request('/workspace?include=workspace-ui', bobCookie))).path, primary)

    const large = { layout: '한'.repeat(24_000) }
    assert.ok(JSON.stringify(large).length < 65_536 && Buffer.byteLength(JSON.stringify(large)) > 65_536, 'exercise UTF-8 bytes rather than string code units')
    writeWorkspaceUi(alice, other, large)
    const omitted = await workspace(await api.request('/workspace?include=workspace-ui', aliceCookie))
    assert.equal(omitted.path, other, 'oversize optional state never breaks workspace metadata')
    assert.equal(Object.hasOwn(omitted, 'workspaceUi'), false)
    const fallback = await api.request('/user-ui/workspace?workspace=' + encodeURIComponent(other), aliceCookie)
    assert.equal(fallback.status, 200)
    assert.deepEqual(await fallback.json(), { state: large }, 'the existing route remains available when the startup envelope is omitted')
  } finally {
    await api.close()
    resetTreeWatchers()
    setWorkspaceRoot(originalRoot)
    fs.rmSync(temporary, { recursive: true, force: true })
  }
})

test('worktree workspace snapshots use the logical project key while metadata retains the selected file root', { timeout: 15_000 }, async () => {
  const originalRoot = WORKSPACE_ROOT
  const temporary = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mew-worktree-ui-snapshot-')))
  const primary = path.join(temporary, 'project'), linked = path.join(primary, '.worktrees', 'feature')
  fs.mkdirSync(path.join(primary, 'docs'), { recursive: true })
  const git = (...args: string[]) => execFileSync('git', ['-C', primary, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  git('init', '-b', 'main')
  git('config', 'user.name', 'Mew Test')
  git('config', 'user.email', 'mew@example.test')
  fs.writeFileSync(path.join(primary, '.gitignore'), '/.worktrees/\n')
  fs.writeFileSync(path.join(primary, 'docs', 'note.md'), '# Fixture')
  git('add', '.')
  git('commit', '-m', 'Initial fixture')
  git('worktree', 'add', '-b', 'feat/snapshot', linked)
  setWorkspaceRoot(primary)
  const email = 'snapshot-worktree@example.test', cookie = account(email)
  writeActiveWorkspace(email, primary)
  writeWorkspaceUi(email, primary, { marker: 'Logical project layout' })
  writeWorkspaceUi(email, linked, { marker: 'Different worktree-only layout' })
  const api = await apiFixture()
  try {
    const switched = await workspace(await api.request('/workspace', cookie, { path: linked, worktree: true, workspace: primary }))
    assert.equal(switched.path, linked)
    assert.equal(switched.projectPath, primary)
    const selected = await workspace(await api.request('/workspace?include=workspace-ui', cookie))
    assert.equal(selected.path, linked)
    assert.equal(selected.projectPath, primary)
    assert.deepEqual(selected.workspaceUi, { workspacePath: primary, state: { marker: 'Logical project layout' } }, 'a worktree must not replace project-scoped layouts with its physical path ledger')
  } finally {
    await api.close()
    resetTreeWatchers()
    setWorkspaceRoot(originalRoot)
    fs.rmSync(temporary, { recursive: true, force: true })
  }
})
