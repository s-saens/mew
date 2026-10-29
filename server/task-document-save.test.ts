import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { once } from 'node:events'
import express from 'express'
import { taskChanges } from '../shared/task-list.ts'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-task-document-save-'))
process.env.MEW_DATA_DIR = path.join(root, 'data')
process.env.MEW_WORKSPACE = path.join(root, 'workspace')
fs.mkdirSync(process.env.MEW_WORKSPACE)
const { readTaskList, changeTaskList } = await import('./task-list.ts')
const { createApiApp } = await import('./api.ts')
const { resetTreeWatchers } = await import('./watcher.ts')
test.after(() => { resetTreeWatchers(); fs.rmSync(root, { recursive: true, force: true }) })

test('open-document saves preserve panel tags and assignees, accept explicit removal and reject competing changes', async () => {
  const workspace = process.env.MEW_WORKSPACE!
  let tasks = changeTaskList(workspace, taskChanges([], [{ id: 'task', text: 'Task', done: false }]))
  const relative = tasks[0].path!, file = path.join(workspace, relative)
  const opened = fs.readFileSync(file, 'utf8')
  tasks = changeTaskList(workspace, taskChanges(tasks, tasks.map(task => ({ ...task, tags: ['기능'], assignees: ['alice@example.test'] }))))
  const app = express()
  app.use((req, _res, next) => { req.auth = { role: 'owner', email: 'alice@example.test', mustChangePassword: false }; next() })
  app.use(createApiApp())
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address(); assert.ok(address && typeof address !== 'string')
  const save = (content: string, expectedContent?: string, target = relative) => fetch(`http://127.0.0.1:${address.port}/file`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project: '.workspace', path: target, content, expectedContent }),
  })
  try {
    const response = await save(opened + '\nEdited body\n', opened)
    assert.equal(response.status, 200)
    const result = await response.json() as { content: string }
    assert.deepEqual(readTaskList(workspace)[0].tags, ['기능'])
    assert.deepEqual(readTaskList(workspace)[0].assignees, ['alice@example.test'])
    assert.equal(result.content, fs.readFileSync(file, 'utf8'))
    assert.ok(result.content.endsWith('Edited body\n'))
    assert.equal((await save(result.content + 'Second edit\n', result.content)).status, 200)
    const base = fs.readFileSync(file, 'utf8')
    const cleared = base.replace('tags:\n  - 기능\n', '')
    assert.equal((await save(cleared, base)).status, 200)
    assert.equal(readTaskList(workspace)[0].tags, undefined)
    tasks = readTaskList(workspace)
    const before = fs.readFileSync(file, 'utf8')
    tasks = changeTaskList(workspace, taskChanges(tasks, tasks.map(task => ({ ...task, tags: ['remote'] }))))
    const preserved = fs.readFileSync(file, 'utf8')
    const conflict = await save(before.replace('done: false', 'done: false\ntags: [local]'), before)
    assert.equal(conflict.status, 409)
    assert.equal(fs.readFileSync(file, 'utf8'), preserved)
    tasks = readTaskList(workspace)
    tasks = changeTaskList(workspace, taskChanges(tasks, tasks.map(task => ({ ...task, done: true }))))
    const completedPath = tasks[0].path!, completedFile = path.join(workspace, completedPath)
    assert.equal(completedPath, 'docs/tasks/Done/Task.md')
    const completedBase = fs.readFileSync(completedFile, 'utf8')
    tasks = changeTaskList(workspace, taskChanges(tasks, tasks.map(task => ({ ...task, tags: ['done-tag'] }))))
    assert.equal((await save(completedBase + '\nCompleted body edit\n', completedBase, completedPath)).status, 200)
    assert.deepEqual(readTaskList(workspace)[0].tags, ['done-tag'])
    assert.ok(fs.readFileSync(completedFile, 'utf8').endsWith('Completed body edit\n'))
    assert.equal((await save(preserved + '\nStale save after move\n', preserved)).status, 409)
    assert.equal(fs.existsSync(file), false, 'a stale save cannot recreate a task at its previous path')
    const deletedBase = fs.readFileSync(completedFile, 'utf8')
    tasks = readTaskList(workspace)
    changeTaskList(workspace, taskChanges(tasks, []))
    assert.equal((await save(deletedBase + '\nStale save after deletion\n', deletedBase, completedPath)).status, 409)
    assert.equal(fs.existsSync(completedFile), false, 'a late autosave cannot resurrect a deleted task')
    assert.deepEqual(readTaskList(workspace), [])
    assert.equal((await save(deletedBase, undefined, completedPath)).status, 200, 'explicit file creation without a stale save baseline remains allowed')
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())) }
})
