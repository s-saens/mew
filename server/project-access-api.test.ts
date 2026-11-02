import './test-isolated-data.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import express from 'express'
import { createApiApp } from './api.ts'
import { WORKSPACE_ROOT, WORKSPACE_PROJECT, setWorkspaceRoot } from './paths.ts'
import { readActiveWorkspace, writeActiveWorkspace } from './userUiState.ts'
import { resetTreeWatchers } from './watcher.ts'
import type { Role } from './reqAuth.ts'

test('manager can restore, browse, create and switch projects without account administration access', async () => {
  const previous = WORKSPACE_ROOT
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mew-project-access-')))
  const nested = path.join(root, 'nested')
  fs.mkdirSync(path.join(nested, '.mew'), { recursive: true })
  const manager = 'projects-manager@example.test'
  const owner = 'projects-owner@example.test'
  writeActiveWorkspace(owner, root)
  setWorkspaceRoot(root)
  let role: Role = 'manager'
  const app = express()
  app.use((req, _res, next) => { req.auth = { role, email: role === 'guest' ? null : manager, mustChangePassword: false }; next() })
  app.use('/api', createApiApp())
  const server = http.createServer(app)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`
  const request = (route: string, body?: unknown, method = 'POST') => fetch(base + route, {
    method: body === undefined ? 'GET' : method,
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  })
  try {
    assert.equal((await request('/user-ui/root-projects', { paths: [root] }, 'PUT')).status, 200)
    const saved = await (await request('/user-ui/root-projects')).json() as { state: { paths: string[] } }
    assert.deepEqual(saved.state.paths, [root])
    assert.equal((await request(`/fs/dirs?path=${encodeURIComponent(root)}`)).status, 200)
    assert.equal((await request('/fs/folder', { parent: root, name: 'created' })).status, 200)
    assert.equal((await request('/fs/directory', { path: path.join(root, 'new/deep') })).status, 200)
    assert.equal((await request('/fs/git/init', { path: path.join(root, 'created') })).status, 200)
    assert.equal((await request('/workspace', { path: root })).status, 200)
    assert.equal((await request(`/subprojects/open?project=${WORKSPACE_PROJECT}`, { workspace: root, path: 'nested' })).status, 200)
    assert.equal(readActiveWorkspace(manager), nested)
    assert.equal((await request('/fs/open-project', { path: root })).status, 200)
    assert.equal(readActiveWorkspace(manager), root)
    assert.equal(readActiveWorkspace(owner), root, 'switching preserves another account workspace')
    assert.equal((await request('/admin/users')).status, 403)
    assert.equal((await request('/project', { name: 'owner-only' })).status, 403)
    for (const denied of ['guest'] as const) {
      role = denied
      for (const [route, body, method] of [
        ['/user-ui/root-projects', undefined, 'GET'],
        ['/user-ui/root-projects', { paths: [root] }, 'PUT'],
        ['/fs/dirs', undefined, 'GET'],
        ['/fs/cloud-storage', undefined, 'GET'],
        ['/workspace', { path: root }, 'POST'],
        ['/fs/open-project', { path: root }, 'POST'],
        ['/subprojects/open', { workspace: root, path: 'nested' }, 'POST'],
        ['/fs/folder', { parent: root, name: 'denied' }, 'POST'],
        ['/fs/directory', { path: path.join(root, 'denied') }, 'POST'],
        ['/fs/git/init', { path: root }, 'POST'],
        ['/fs/git/clone', { parent: root, url: 'invalid' }, 'POST'],
      ] as const) assert.equal((await request(route, body, method)).status, 403, `${denied} ${route}`)
    }
    role = 'member'
    assert.equal((await request('/project-registry')).status, 200)
    assert.equal((await request('/user-ui/root-projects')).status, 200)
    assert.equal((await request(`/fs/dirs?path=${encodeURIComponent(root)}`)).status, 200)
    const linked = await (await request('/project-registry', { path: root })).json() as { project: { path: string; mine: boolean } }
    assert.equal(linked.project.path, root)
    assert.equal(linked.project.mine, true)
    assert.equal((await request('/workspace', { path: root })).status, 200)
    assert.equal((await request('/workspace', { path: root, worktree: true, workspace: root })).status, 403)
    assert.equal((await request('/workspace', { path: path.dirname(root) })).status, 403)
    const removed = await (await request('/project-registry/mine', { path: root, added: false }, 'PUT')).json() as { state: { paths: string[] } }
    assert.equal(removed.state.paths.includes(root), false)
    const catalog = await (await request('/project-registry')).json() as { projects: { path: string; mine: boolean }[] }
    assert.equal(catalog.projects.find(project => project.path === root)?.mine, false)
    assert.equal((await request('/project-registry/mine', { path: root, added: true }, 'PUT')).status, 200)
    assert.equal((await request('/fs/open-project', { path: root })).status, 200)
    assert.equal((await request('/fs/folder', { parent: root, name: 'denied' })).status, 403)
    assert.equal((await request('/fs/git/init', { path: root })).status, 403)
    role = 'guest'
    assert.equal((await request('/project-registry')).status, 403)
    assert.equal((await request('/project-registry', { path: root })).status, 403)
    assert.equal((await request('/project-registry/mine', { path: root, added: true }, 'PUT')).status, 403)
    assert.equal(fs.existsSync(path.join(root, 'denied')), false)
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
    resetTreeWatchers()
    setWorkspaceRoot(previous)
    fs.rmSync(root, { recursive: true, force: true })
  }
})
