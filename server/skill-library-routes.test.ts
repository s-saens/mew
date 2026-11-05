import './test-isolated-data.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import express from 'express'
import { setFeature } from './access-policy.ts'
import { SkillLibraryStore } from './skill-library.ts'
import { createSkillLibraryRouter } from './skill-library-routes.ts'
import { createAgentHarnessRouter } from './agent-harness-routes.ts'
import type { SkillLibraryInventory } from '../shared/skill-library.ts'

test('skill library routes require agent access, reject stale writes, and return no-store responses', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-library-routes-'))
  const cwd = path.join(directory, 'project'), home = path.join(directory, 'home')
  fs.mkdirSync(cwd); fs.mkdirSync(home)
  const email = 'skill-library-owner@example.test'
  setFeature(email, 'agent', true)
  const store = new SkillLibraryStore({ home, env: {}, runtimeEnvs: {}, libraryDir: path.join(directory, 'library') })
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    req.auth = { email: req.headers['x-agent-access'] === 'yes' ? email : 'skill-library-denied@example.test', role: req.headers['x-agent-access'] === 'yes' ? 'owner' : 'guest', mustChangePassword: false }
    next()
  })
  app.use('/skills', createSkillLibraryRouter(store))
  app.use('/native', createAgentHarnessRouter())
  const server = http.createServer(app)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => {
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
    setFeature(email, 'agent', false)
    fs.rmSync(directory, { recursive: true, force: true })
  })
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const base = `http://127.0.0.1:${address.port}/skills`
  const request = (suffix = '', body?: object, authorized = true) => fetch(`${base}${suffix}`, {
    method: body ? 'POST' : 'GET',
    headers: { ...(authorized ? { 'x-agent-access': 'yes' } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify({ cwd, ...body }) } : {}),
  })
  assert.equal((await request(`?cwd=${cwd}`, undefined, false)).status, 403)
  const response = await request(`?cwd=${cwd}`)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  const inventory = await response.json() as SkillLibraryInventory
  const commit = inventory.items.find(item => item.name === 'commit')!
  const detail = await request(`/detail?cwd=${cwd}&id=${commit.id}`)
  assert.equal(detail.status, 200)
  assert.equal(detail.headers.get('cache-control'), 'no-store')
  assert.equal((await request('', { action: 'toggle', id: commit.id, revision: 'stale', enabled: false, scope: 'project' })).status, 409)
  assert.equal((await request('', { action: 'toggle', id: commit.id, revision: commit.revision, enabled: false, scope: 'project' })).status, 200)
  assert.equal(store.resolve(cwd).some(item => item.name === 'commit'), false)
  assert.equal((await request(`/detail?cwd=${cwd}&id=missing`)).status, 404)
  assert.equal((await request('', { action: 'create', scope: 'common', name: '../escape', content: 'unsafe' })).status, 400)
  assert.equal((await request('')).status, 400)
  const legacy = `http://127.0.0.1:${address.port}/native`
  const headers = { 'x-agent-access': 'yes', 'Content-Type': 'application/json' }
  assert.equal((await fetch(`${legacy}?cwd=${cwd}&kind=skills`, { headers })).status, 410)
  assert.equal((await fetch(legacy, { method: 'POST', headers, body: JSON.stringify({ cwd, kind: 'skills', action: 'delete', id: commit.id }) })).status, 410)
})
