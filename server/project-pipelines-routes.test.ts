import './test-isolated-data.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import express from 'express'
import { createProjectPipelinesRouter } from './project-pipelines-routes.ts'
import { ProjectPipelinesService } from './project-pipelines.ts'
import { ProjectActionsService } from './project-actions.ts'
import { runRequestWorkspace } from './workspace-scope.ts'
import { authOf, type Role } from './reqAuth.ts'
import { WORKSPACE_PROJECT } from './paths.ts'
import { writeActiveWorkspace, readActiveWorkspace } from './userUiState.ts'
import { setFeature } from './access-policy.ts'
import type { ProjectPipelinesState, ProjectPipelineRun } from '../shared/project-pipelines.ts'

test('pipeline routes preserve account/root scope and require a matching publish confirmation', async t => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-pipeline-routes-'))
  const a = path.join(temporary, 'a'), b = path.join(temporary, 'b')
  fs.mkdirSync(a); fs.mkdirSync(b); fs.mkdirSync(path.join(b, 'mobile'))
  const email = 'pipeline-route@example.test'
  let role: Role = 'owner', account = email, executions = 0
  writeActiveWorkspace(email, a)
  const actions = new ProjectActionsService({ runner: async () => { executions++; return { exitCode: 0 } } })
  const action = { id: 'publish', name: 'Publish site', kind: 'deploy', command: 'saved publication' }
  actions.save(b, [action]); actions.save(path.join(b, 'mobile'), [{ ...action, name: 'Publish mobile' }])
  const providers = { state: () => ({ connections: [], runs: [] }), start: async () => { assert.fail('Unexpected external call') }, refresh: async () => { assert.fail('Unexpected external call') } }
  const service = new ProjectPipelinesService({ actions, providers, dataDir: path.join(temporary, 'private'), authorize: () => true })
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => { req.auth = { role, email: account, mustChangePassword: false }; runRequestWorkspace(req, authOf(req), next) })
  app.use('/pipelines', createProjectPipelinesRouter({ service }))
  const server = http.createServer(app)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); fs.rmSync(temporary, { recursive: true, force: true }) })
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/pipelines`
  const request = (root: string, method = 'GET', endpoint = '', extra: Record<string, unknown> = {}) => {
    const scope = { project: WORKSPACE_PROJECT, workspacePath: root, ...extra }
    if (method === 'GET') return fetch(`${base}${endpoint}?${new URLSearchParams(scope as Record<string, string>)}`)
    return fetch(base + endpoint, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(scope) })
  }
  const response = await request(b)
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'private, no-store')
  const state = await response.json() as ProjectPipelinesState, choice = state.pipelines[0]
  assert.equal(state.projectRoot, b)
  assert.equal((await request(b, 'POST', '/run', { id: choice.id })).status, 409)
  assert.equal(executions, 0)
  const launched = await request(b, 'POST', '/run', { id: choice.id, expectedRevision: state.readiness[choice.id].revision, command: 'untrusted caller command' })
  assert.equal(launched.status, 200)
  const run = (await launched.json() as { run: ProjectPipelineRun }).run
  await service.wait(b, account, run.id)
  assert.equal(executions, 1)
  assert.equal(readActiveWorkspace(email), a)
  assert.equal((await (await request(a)).json() as ProjectPipelinesState).runs.length, 0)
  account = 'other-pipeline-route@example.test'
  assert.equal((await (await request(b)).json() as ProjectPipelinesState).runs.length, 0)
  account = email; role = 'manager'
  const nested = await (await request(b, 'GET', '', { path: 'mobile' })).json() as ProjectPipelinesState
  assert.equal(nested.projectRoot, path.join(b, 'mobile'))
  assert.equal(nested.pipelines[0].name, 'Publish mobile')
  assert.equal((await request(b, 'PUT', '', { pipelines: [] })).status, 200)
  assert.deepEqual((await (await request(b)).json() as ProjectPipelinesState).pipelines, [])
  assert.equal((await request(b, 'POST', '/discover')).status, 200)
  const mismatch = `${base}?${new URLSearchParams({ project: WORKSPACE_PROJECT, workspacePath: b, mewWorkspacePath: a, mewProjectPath: a })}`
  assert.equal((await fetch(mismatch)).status, 409)
  assert.equal((await request(b, 'GET', '', { path: '../outside' })).status, 400)
  const bad = `${base}?${new URLSearchParams({ workspacePath: a })}`
  assert.equal((await fetch(bad, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspacePath: b, pipelines: [] }) })).status, 409)
  setFeature(email, 'terminal', false)
  for (const [method, endpoint] of [['GET', ''], ['PUT', ''], ['POST', '/run'], ['POST', '/discover']]) assert.equal((await request(b, method, endpoint)).status, 403)
  setFeature(email, 'terminal', true)
  for (const denied of ['guest', 'member'] as const) { role = denied; assert.equal((await request(b)).status, 403) }
})
