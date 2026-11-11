import './test-isolated-data.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import express from 'express'
import { createProjectActionsRouter } from './project-actions-routes.ts'
import { ProjectActionsService } from './project-actions.ts'
import { runRequestWorkspace } from './workspace-scope.ts'
import { authOf, type Role } from './reqAuth.ts'
import { WORKSPACE_PROJECT } from './paths.ts'
import { readActiveWorkspace, writeActiveWorkspace } from './userUiState.ts'
import { setFeature } from './access-policy.ts'
import type { ProjectActionRun, ProjectActionsState } from '../shared/project-actions.ts'

const stateJson = (response: Response) => response.json() as Promise<ProjectActionsState>

const action = { id: 'build', name: 'Build', kind: 'build', command: 'saved command', artifacts: ['dist/*.apk'] }

test('project action HTTP routes isolate roots, persist edits, use stored commands and protect artifact downloads', async t => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-action-routes-'))
  const [a, b] = ['a', 'b'].map(name => path.join(temporary, name))
  for (const root of [a, b]) fs.mkdirSync(path.join(root, 'dist'), { recursive: true })
  fs.writeFileSync(path.join(b, 'dist/app.apk'), 'test APK')
  const email = 'project-action-routes@example.test'
  let role: Role = 'owner'
  writeActiveWorkspace(email, a)
  const started: Array<{ root: string; command: string }> = []
  let finish!: (value: { exitCode: number | null }) => void
  const service = new ProjectActionsService({ runner: input => {
    started.push({ root: input.root, command: input.command })
    return new Promise(resolve => { finish = resolve })
  } })
  service.save(a, [{ ...action, command: 'root a' }]); service.save(b, [action])
  const app = express()
  app.use((req, _res, next) => { req.auth = { role, email, mustChangePassword: false }; runRequestWorkspace(req, authOf(req), next) })
  app.use(express.json())
  app.use('/api/project-actions', createProjectActionsRouter({ service }))
  const server = http.createServer(app)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => {
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
    fs.rmSync(temporary, { recursive: true, force: true })
  })
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/project-actions`
  const request = (root: string | undefined, method = 'GET', extra: Record<string, unknown> = {}, endpoint = '') => {
    const scope = { project: WORKSPACE_PROJECT, ...(root !== undefined ? { workspacePath: root } : {}) }
    if (method === 'GET') return fetch(`${base}${endpoint}?${new URLSearchParams({ ...scope, ...extra } as Record<string, string>)}`)
    return fetch(base + endpoint, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...scope, ...extra }) })
  }
  assert.equal((await stateJson(await request(b))).projectRoot, b)
  assert.equal((await stateJson(await request(undefined))).actions[0].command, 'root a')
  role = 'manager'
  assert.equal((await request(b, 'PUT', { actions: [{ ...action, command: 'updated command' }] })).status, 200)
  const response = await request(b, 'POST', { id: 'build', command: 'client command must never run' }, '/run')
  assert.equal(response.status, 200)
  const { run } = await response.json() as { run: ProjectActionRun }
  assert.deepEqual(started, [{ root: b, command: 'updated command' }])
  assert.equal((await request(b, 'POST', { id: 'build' }, '/run')).status, 409)
  assert.equal((await request(b, 'GET', { runId: run.id, artifactPath: 'dist/app.apk' }, '/artifacts')).status, 404)
  finish({ exitCode: 0 })
  await new Promise(resolve => setImmediate(resolve))
  const download = await request(b, 'GET', { runId: run.id, artifactPath: 'dist/app.apk' }, '/artifacts')
  assert.equal(download.status, 200); assert.equal(await download.text(), 'test APK')
  assert.match(download.headers.get('content-disposition')!, /attachment/)
  assert.equal((await request(a, 'GET', { runId: run.id, artifactPath: 'dist/app.apk' }, '/artifacts')).status, 404)
  assert.equal((await request(b, 'GET', { runId: run.id, artifactPath: '../a/dist/app.apk' }, '/artifacts')).status, 404)
  assert.equal(readActiveWorkspace(email), a)
  assert.equal((await stateJson(await request(a))).runs.length, 0)

  fs.mkdirSync(path.join(b, 'mobile'), { recursive: true })
  const nested = await request(b, 'PUT', { path: 'mobile', actions: [{ ...action, name: 'Mobile' }] })
  assert.equal(nested.status, 200)
  assert.equal((await stateJson(nested)).projectRoot, path.join(b, 'mobile'))
  assert.equal((await stateJson(await request(b))).actions[0].name, 'Build')
  fs.mkdirSync(path.join(b, 'mobile/dist'), { recursive: true }); fs.writeFileSync(path.join(b, 'mobile/dist/mobile.apk'), 'mobile APK')
  const nestedStarted = await request(b, 'POST', { path: 'mobile', id: 'build' }, '/run')
  const nestedRun = (await nestedStarted.json() as { run: ProjectActionRun }).run
  finish({ exitCode: 0 }); await new Promise(resolve => setImmediate(resolve))
  const nestedDownload = await request(b, 'GET', { path: 'mobile', runId: nestedRun.id, artifactPath: 'dist/mobile.apk' }, '/artifacts')
  assert.equal(nestedDownload.status, 200); assert.equal(await nestedDownload.text(), 'mobile APK')
  const mismatch = new URL(`${base}?project=${WORKSPACE_PROJECT}`)
  mismatch.searchParams.set('mewWorkspacePath', a); mismatch.searchParams.set('mewProjectPath', a); mismatch.searchParams.set('workspacePath', b)
  assert.equal((await fetch(mismatch)).status, 409)
  assert.equal((await fetch(`${base}?workspacePath=${encodeURIComponent(a)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspacePath: b, actions: [] }) })).status, 409)
  for (const invalid of ['', 'relative', path.join(temporary, 'missing')]) assert.equal((await request(invalid)).status, 400)
  assert.equal((await fetch(`${base}?workspacePath=${encodeURIComponent(a)}&workspacePath=${encodeURIComponent(b)}`)).status, 400)
  assert.equal((await request(b, 'POST', { id: 'missing' }, '/run')).status, 404)
  assert.equal((await request(b, 'PUT', { actions: [{ ...action, name: '' }] })).status, 400)

  setFeature(email, 'terminal', false)
  for (const [method, endpoint] of [['GET', ''], ['PUT', ''], ['POST', '/run'], ['POST', '/discover'], ['GET', '/artifacts']]) assert.equal((await request(b, method, { id: 'build' }, endpoint)).status, 403)
  setFeature(email, 'terminal', true)
  for (const denied of ['member', 'guest'] as const) {
    role = denied
    assert.equal((await request(b)).status, 403)
    assert.equal((await request(undefined)).status, 403)
  }
})

test('missing and malformed setup remains a recoverable HTTP state; explicit discovery persists only known actions', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-action-discover-route-'))
  const app = express()
  app.use((req, _res, next) => { req.auth = { role: 'owner', email: 'action-discovery@example.test', mustChangePassword: false }; next() })
  app.use(express.json()); app.use('/actions', createProjectActionsRouter())
  const server = http.createServer(app)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); fs.rmSync(root, { recursive: true, force: true }) })
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/actions`
  const scope = { workspacePath: root, project: WORKSPACE_PROJECT }
  let response = await fetch(`${base}?${new URLSearchParams(scope)}`)
  assert.equal(response.status, 200); assert.equal((await stateJson(response)).needsAgent, true)
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { build: 'compile' } }))
  response = await fetch(`${base}/discover`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(scope) })
  assert.equal(response.status, 200); assert.equal((await stateJson(response)).actions[0].command, 'npm run build')
  fs.writeFileSync(path.join(root, '.mew/project-actions.json'), '{broken')
  response = await fetch(`${base}?${new URLSearchParams(scope)}`)
  assert.equal(response.status, 200)
  const state = await stateJson(response); assert.equal(state.needsAgent, true); assert.ok(state.warnings.length)
})
