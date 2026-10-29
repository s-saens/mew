import './test-isolated-data.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { once } from 'node:events'
import express from 'express'
import { createTaskListRouter } from './task-list-routes.ts'
import { pathsForWorkspace, workspaceContext } from './paths.ts'

test('task events follow new .mew task folders, Done files and legacy folders created after subscription', { timeout: 10_000 }, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-task-events-'))
  const app = express(), email = 'events@example.test'
  app.use((req, _res, next) => {
    req.auth = { role: 'owner', email, mustChangePassword: false }
    workspaceContext.run(pathsForWorkspace(root, email), next)
  })
  app.use('/tasks', createTaskListRouter())
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const controller = new AbortController()
  t.after(async () => { controller.abort(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); fs.rmSync(root, { recursive: true, force: true }) })
  const address = server.address(); assert.ok(address && typeof address !== 'string')
  const response = await fetch(`http://127.0.0.1:${address.port}/tasks/events?workspace=${encodeURIComponent(root)}`, {
    headers: { 'X-Mew-Task-Owner': encodeURIComponent(email) }, signal: controller.signal,
  })
  assert.equal(response.status, 200)
  const reader = response.body!.getReader(), decoder = new TextDecoder()
  const nextEvent = async () => assert.match(decoder.decode((await reader.read()).value), /data: changed/)
  await nextEvent()
  for (const directory of ['.mew/tasks', '.mew/tasks/Done', 'docs/tasks', 'docs/tasks/Done', 'tasks']) {
    const absolute = path.join(root, directory)
    fs.mkdirSync(absolute, { recursive: true })
    await nextEvent()
    fs.writeFileSync(path.join(absolute, 'Task.md'), '---\ntitle: Task\ndone: false\n---\n')
    await nextEvent()
    fs.appendFileSync(path.join(absolute, 'Task.md'), 'Updated body\n')
    await nextEvent()
    fs.unlinkSync(path.join(absolute, 'Task.md'))
    await nextEvent()
  }
})
