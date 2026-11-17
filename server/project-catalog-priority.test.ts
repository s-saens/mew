import './test-isolated-data.ts'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import express from 'express'
import { createApiApp } from './api.ts'
import { projectRegistry } from './project-registry.ts'
import { WORKSPACE_ROOT, setWorkspaceRoot } from './paths.ts'
import { resetTreeWatchers } from './watcher.ts'

test('saved catalog and project selection respond while discovery is stalled', async t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mew-priority-')))
  fs.mkdirSync(path.join(root, 'child', '.mew'), { recursive: true })
  const previous = WORKSPACE_ROOT
  const account = 'priority@example.test'
  projectRegistry.link(account, root)
  setWorkspaceRoot(root)
  const original = fs.promises.readdir.bind(fs.promises)
  let release!: () => void, started!: () => void
  const held = new Promise<void>(resolve => { release = resolve })
  const entered = new Promise<void>(resolve => { started = resolve })
  t.mock.method(fs.promises, 'readdir', async (directory: fs.PathLike, options: { withFileTypes: true }) => {
    if (directory === root) { started(); await held }
    return original(directory, options)
  })
  const app = express()
  app.use((req, _res, next) => { req.auth = { role: 'owner', email: account, mustChangePassword: false }; next() })
  app.use('/api', createApiApp())
  const server = http.createServer(app)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`
  const controller = new AbortController()
  try {
    const scan = fetch(`${base}/project-registry`, { signal: controller.signal }).catch(() => null)
    await entered
    const snapshot = await fetch(`${base}/project-registry?snapshot=1`, { signal: AbortSignal.timeout(2000) })
    assert.equal(snapshot.status, 200)
    assert.ok(((await snapshot.json()) as { projects: { path: string }[] }).projects.some(project => project.path === root))
    const selected = await fetch(`${base}/workspace`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: root }), signal: AbortSignal.timeout(2000) })
    assert.equal(selected.status, 200)
    controller.abort()
    await scan
  } finally {
    release()
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
    resetTreeWatchers()
    setWorkspaceRoot(previous)
    fs.rmSync(root, { recursive: true, force: true })
  }
})
