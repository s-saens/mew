import './test-isolated-data.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import express from 'express'
import { createApiApp, tmuxManager } from './api.ts'
import { DATA_DIR } from './dataDir.ts'
import { setFeature } from './access-policy.ts'
import { WORKSPACE_PROJECT } from './paths.ts'
import { readActiveWorkspace, writeActiveWorkspace } from './userUiState.ts'

type Button = { name: string; command: string; session: string; running: boolean }

test('project command scopes read, save and run their own root without changing the active workspace', async t => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-command-workspaces-'))
  const roots = ['a', 'b'].map(name => path.join(temporary, name))
  const commands = roots.map((_, index) => [{ name: 'Run', command: `echo root-${index}` }])
  for (const [index, root] of roots.entries()) {
    fs.mkdirSync(path.join(root, '.mew'), { recursive: true })
    fs.writeFileSync(path.join(root, '.mew/cmd-button.json'), JSON.stringify({ commands: commands[index] }))
  }
  const alias = path.join(temporary, 'alias-b')
  fs.symlinkSync(roots[1], alias, 'dir')
  const email = 'command-workspace@example.test'
  let role: 'owner' | 'manager' | 'member' | 'guest' = 'owner'
  writeActiveWorkspace(email, roots[0])
  const app = express()
  app.use((req, _res, next) => { req.auth = { role, email, mustChangePassword: false }; next() })
  app.use('/api', createApiApp())
  const server = http.createServer(app)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => {
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
    fs.rmSync(temporary, { recursive: true, force: true })
  })
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/cmd-buttons`
  const request = (workspacePath: unknown, method = 'GET', extra: Record<string, unknown> = {}) => {
    if (method === 'GET') return fetch(`${base}?project=${WORKSPACE_PROJECT}${workspacePath === undefined ? '' : `&workspacePath=${encodeURIComponent(String(workspacePath))}`}`)
    return fetch(base + (method === 'POST' ? '/run' : ''), {
      method, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project: WORKSPACE_PROJECT, workspacePath, ...extra }),
    })
  }
  const read = async (workspacePath?: string) => {
    const response = await request(workspacePath)
    assert.equal(response.status, 200, await response.clone().text())
    return (await response.json() as { buttons: Button[] }).buttons
  }
  const list = t.mock.method(tmuxManager, 'list', async () => [] as Array<{ name: string; windows: number; attached: boolean; createdAt: number }>)
  const runs: Array<{ session: string; command: string; cwd: string | undefined }> = []
  t.mock.method(tmuxManager, 'runCommand', async (session: string, command: string, cwd?: string) => { runs.push({ session, command, cwd }) })
  const [active, other] = await Promise.all([read(), read(roots[1])])
  assert.equal(active[0].command, commands[0][0].command)
  assert.equal(other[0].command, commands[1][0].command)
  assert.notEqual(active[0].session, other[0].session, 'same-named root commands must not share a session')
  assert.equal((await read(alias))[0].session, other[0].session, 'a root alias identifies the same command')
  assert.equal(readActiveWorkspace(email), roots[0])

  role = 'manager'
  const updated = [{ name: 'Run', command: 'echo updated-b' }]
  assert.equal((await request(roots[1], 'PUT', { buttons: updated })).status, 200)
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(roots[0], '.mew/cmd-button.json'), 'utf8')).commands, commands[0])
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(roots[1], '.mew/cmd-button.json'), 'utf8')).commands, updated)
  const started = await request(roots[1], 'POST', { name: 'Run', command: 'untrusted request command' })
  assert.equal(started.status, 200)
  assert.deepEqual(runs, [{ session: other[0].session, command: 'echo updated-b', cwd: roots[1] }])
  assert.equal(readActiveWorkspace(email), roots[0], 'reading, saving and running never switch roots')
  list.mock.mockImplementation(async () => [{ name: other[0].session, windows: 1, attached: false, createdAt: 0 }])
  t.mock.method(tmuxManager, 'listPanePids', async () => [])
  writeActiveWorkspace(email, roots[1])
  assert.deepEqual((await read()).map(button => [button.session, button.running]), [[other[0].session, true]], 'current header and scoped row share running state')

  let entered!: () => void, release!: () => void
  const pending = new Promise<void>(resolve => { entered = resolve })
  const blocked = new Promise<void>(resolve => { release = resolve })
  list.mock.mockImplementation(async () => { entered(); await blocked; return [] })
  const inFlight = read(roots[1])
  await pending
  writeActiveWorkspace(email, roots[0])
  release()
  assert.equal((await inFlight)[0].command, 'echo updated-b', 'asynchronous work keeps the requested root after an active switch')
  list.mock.mockImplementation(async () => [])

  for (const invalid of ['', 'relative/path', path.join(temporary, 'missing'), path.join(roots[1], '.mew/cmd-button.json'), DATA_DIR]) {
    assert.equal((await request(invalid)).status, 400, `invalid root: ${invalid}`)
  }
  for (const invalid of [null, [], {}]) assert.equal((await request(invalid, 'POST', { name: 'Run' })).status, 400)
  assert.equal((await fetch(`${base}?project=${WORKSPACE_PROJECT}&workspacePath=${encodeURIComponent(roots[0])}&workspacePath=${encodeURIComponent(roots[1])}`)).status, 400)
  assert.equal((await request(roots[1], 'POST', { name: 'Missing' })).status, 404)
  assert.equal((await request(roots[1], 'PUT', { buttons: [{ name: '', command: 'echo no' }] })).status, 400)
  setFeature(email, 'terminal', false)
  for (const method of ['GET', 'PUT', 'POST']) assert.equal((await request(roots[1], method, { buttons: updated, name: 'Run' })).status, 403)
  setFeature(email, 'terminal', true)
  role = 'member'
  assert.equal((await request(roots[1])).status, 403, 'explicit root access stays limited to owner and manager')
  assert.equal((await request(undefined)).status, 200, 'unscoped requests retain existing capability behavior')
  role = 'guest'
  assert.equal((await request(roots[1])).status, 403)
})
