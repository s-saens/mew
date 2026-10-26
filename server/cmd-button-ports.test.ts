import './test-isolated-data.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { once } from 'node:events'
import express from 'express'
import { createApiApp, tmuxManager } from './api.ts'
import { setFeature } from './access-policy.ts'
import { commandSessionName, writeCmdButtons } from './cmdButtons.ts'
import { WORKSPACE_PROJECT, WORKSPACE_ROOT, setWorkspaceRoot } from './paths.ts'
import { resetTreeWatchers } from './watcher.ts'

test('command GET and PUT attach live ports to the owning active button and preserve permission and failure boundaries', { timeout: 30_000 }, async t => {
  const original = WORKSPACE_ROOT
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-command-ports-api-'))
  setWorkspaceRoot(root)
  t.after(() => { resetTreeWatchers(); setWorkspaceRoot(original); fs.rmSync(root, { recursive: true, force: true }) })
  const project = WORKSPACE_PROJECT, directory = 'nested', email = 'command-ports@example.test'
  fs.mkdirSync(path.join(root, directory))
  const commands = [{ name: 'Dev', command: 'npm run dev' }, { name: 'Stopped', command: 'echo http://localhost:4444' }, { name: 'Other', command: 'npm run other' }]
  writeCmdButtons(project, commands, directory)
  const dev = commandSessionName(project, 'Dev', directory), other = commandSessionName(project, 'Other', directory)
  const app = express()
  let role: 'owner' | 'manager' | 'guest' = 'owner'
  app.use((req, _res, next) => { req.auth = { role, email, mustChangePassword: false }; next() })
  app.use('/api', createApiApp())
  const server = http.createServer(app)
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  t.after(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()) }))
  const port = (server.address() as net.AddressInfo).port
  const socket = net.createServer()
  socket.listen(0, '127.0.0.1'); await once(socket, 'listening')
  t.after(() => new Promise<void>(resolve => socket.close(() => resolve())))
  const targetPort = (socket.address() as net.AddressInfo).port
  const list = t.mock.method(tmuxManager, 'list', async () => [dev, other].map(name => ({ name, windows: 1, attached: false, createdAt: 0 })))
  const panes = t.mock.method(tmuxManager, 'listPanePids', async () => [
    { session: dev, pid: process.pid }, { session: 'unrelated-session', pid: process.pid }, { session: other, pid: 2147483647 },
  ])
  const url = `http://127.0.0.1:${port}/api/cmd-buttons?project=${project}&path=${directory}`
  const read = async (method = 'GET') => {
    const response = await fetch(url, method === 'PUT' ? { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ buttons: commands }) } : undefined)
    assert.equal(response.status, 200, await response.clone().text())
    return (await response.json() as { buttons: Array<{ name: string; running: boolean; ports: number[] }> }).buttons
  }
  for (const method of ['GET', 'PUT']) {
    const buttons = await read(method)
    assert.equal(buttons[0].running, true)
    assert.ok(buttons[0].ports.includes(targetPort), `${method}: actual listener is detected`)
    assert.ok(!buttons[0].ports.includes(port), 'Mew API listener is not a preview')
    assert.deepEqual(buttons.slice(1).map(button => button.ports), [[], []], 'stopped and unrelated sessions have no ports')
  }
  role = 'manager'
  setFeature(email, 'portPreview', false)
  const before = panes.mock.callCount()
  assert.deepEqual((await read()).map(button => button.ports), [[], [], []])
  assert.equal(panes.mock.callCount(), before, 'denied preview capability never scans processes')
  setFeature(email, 'portPreview', null)
  panes.mock.mockImplementation(async () => { throw new Error('multiplexer unavailable') })
  const unavailable = await read()
  assert.equal(unavailable[0].running, true)
  assert.deepEqual(unavailable[0].ports, [], 'discovery failure preserves the command menu')
  list.mock.mockImplementation(async () => [])
  const afterFailure = panes.mock.callCount()
  assert.ok((await read()).every(button => !button.running && button.ports.length === 0))
  assert.equal(panes.mock.callCount(), afterFailure, 'idle commands do not scan processes')
  role = 'guest'
  assert.equal((await fetch(url)).status, 403)
})
