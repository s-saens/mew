import './test-isolated-data.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import express from 'express'
import { createApiApp } from './api.ts'
import { WORKSPACE_ROOT, setWorkspaceRoot } from './paths.ts'
import { writeActiveWorkspace } from './userUiState.ts'

test('file saves reject the previous workspace before writing or starting a commit', async t => {
  const originalRoot = WORKSPACE_ROOT
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-file-workspace-'))
  const roots = ['main', 'feature'].map(name => path.join(temporary, name))
  for (const [index, root] of roots.entries()) {
    fs.mkdirSync(path.join(root, 'docs'), { recursive: true })
    fs.writeFileSync(path.join(root, 'same.txt'), `root ${index}`)
  }
  const email = 'file-workspace@example.test'
  setWorkspaceRoot(roots[0])
  writeActiveWorkspace(email, roots[0])
  const app = express()
  app.use((req, _res, next) => {
    req.auth = { role: 'owner', email, mustChangePassword: false }
    next()
  })
  app.use('/api', createApiApp())
  const server = http.createServer(app)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/file`
  t.after(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()))
    setWorkspaceRoot(originalRoot)
    fs.rmSync(temporary, { recursive: true, force: true })
  })
  const save = (workspace: string | undefined, commit = false, relative = 'same.txt') => fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project: '.workspace', path: relative, content: 'draft', workspace, commit }),
  })

  writeActiveWorkspace(email, roots[1])
  for (const commit of [false, true]) {
    const response = await save(roots[0], commit)
    assert.equal(response.status, 409, 'a stale request is rejected before file or Git work')
    assert.match((await response.json() as { error: string }).error, /프로젝트가 변경/)
    assert.equal(fs.readFileSync(path.join(roots[0], 'same.txt'), 'utf8'), 'root 0')
    assert.equal(fs.readFileSync(path.join(roots[1], 'same.txt'), 'utf8'), 'root 1')
  }
  assert.equal((await save(roots[0], false, 'new.txt')).status, 409)
  assert.equal(fs.existsSync(path.join(roots[1], 'new.txt')), false, 'a stale save cannot create a file in the new root')

  assert.equal((await save(roots[1])).status, 200, 'the confirmed active workspace may save')
  assert.equal(fs.readFileSync(path.join(roots[1], 'same.txt'), 'utf8'), 'draft')
  assert.equal((await save(undefined, false, 'legacy.txt')).status, 200, 'older callers without a workspace remain compatible')
  assert.equal(fs.readFileSync(path.join(roots[1], 'legacy.txt'), 'utf8'), 'draft')
})
