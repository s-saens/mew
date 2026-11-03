import './test-isolated-data.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import express from 'express'
import { createApiApp } from './api.ts'
import { projectGit } from './project-git.ts'
import { projectRegistry } from './project-registry.ts'
import type { Role } from './reqAuth.ts'

test('managed clone and connected repository APIs support members, scope the account and reject guests', async () => {
  let role: Role = 'member'
  const owner = 'managed-clone-member@example.test'
  const originalClone = projectGit.clone, originalRepositories = projectGit.repositories
  const expected = { path: '/fixture/cloned', name: 'cloned', managed: true, mine: true, icon: null }
  projectGit.clone = async (account, input) => {
    assert.equal(account, owner)
    assert.equal(input, 'https://github.com/example/cloned.git')
    return expected
  }
  projectGit.repositories = async account => {
    assert.equal(account, owner)
    return { connected: true, repositories: [{ name: 'cloned', fullName: 'example/cloned', url: 'https://github.com/example/cloned.git', private: true }] }
  }
  const app = express()
  app.use((req, _res, next) => { req.auth = { role, email: role === 'guest' ? null : owner, mustChangePassword: false }; next() })
  app.use('/api', createApiApp())
  const server = http.createServer(app)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/project-registry`
  const clone = () => fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'clone', url: 'https://github.com/example/cloned.git' }) })
  try {
    const response = await clone()
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { project: expected, state: projectRegistry.readMine(owner) })
    const listed = await fetch(base + '/repositories')
    assert.equal(listed.status, 200)
    assert.equal(listed.headers.get('cache-control'), 'no-store')
    const body = await listed.json() as { repositories: { private: boolean }[] }
    assert.equal(body.repositories[0].private, true)
    role = 'guest'
    assert.equal((await clone()).status, 403)
    assert.equal((await fetch(base + '/repositories')).status, 403)
  } finally {
    projectGit.clone = originalClone; projectGit.repositories = originalRepositories
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
})
