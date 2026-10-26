import './test-isolated-data.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { changeTaskList, readTaskList, taskListFile } from './task-list.ts'
import { taskChanges } from '../shared/task-list.ts'
import { taskDocumentsNeedMigration } from './task-markdown.ts'

test('completion moves task documents into Done and reopening restores active paths without losing identity or content', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-task-done-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  let tasks = changeTaskList(root, taskChanges([], [{ id: 'one', text: 'Task', done: false, tags: ['work'] }]))
  fs.appendFileSync(path.join(root, tasks[0].path!), '\n[Guide](../guide.md)\n')
  tasks = readTaskList(root)
  tasks = changeTaskList(root, taskChanges(tasks, tasks.map(task => ({ ...task, done: true }))))
  assert.equal(tasks[0].path, 'docs/tasks/Done/Task.md')
  assert.equal(tasks[0].id, 'one')
  assert.deepEqual(tasks[0].tags, ['work'])
  assert.ok(fs.readFileSync(path.join(root, tasks[0].path!), 'utf8').endsWith('[Guide](../../guide.md)\n'))
  assert.equal(fs.existsSync(path.join(root, 'docs/tasks/Task.md')), false)
  tasks = changeTaskList(root, taskChanges(tasks, [...tasks, { id: 'two', text: 'Task', done: false }]))
  assert.deepEqual(tasks.map(task => task.path), ['docs/tasks/Done/Task.md', 'docs/tasks/Task.md'])
  const metadata = taskListFile(root), previous = readTaskList(root)
  fs.mkdirSync(`${metadata}.tmp-${process.pid}`)
  assert.throws(() => changeTaskList(root, taskChanges(tasks, tasks.map(task => ({ ...task, done: false })))))
  assert.deepEqual(readTaskList(root), previous)
  fs.rmdirSync(`${metadata}.tmp-${process.pid}`)
  tasks = changeTaskList(root, taskChanges(tasks, tasks.map(task => ({ ...task, done: false }))))
  assert.equal(tasks.find(task => task.id === 'one')?.path, 'docs/tasks/Task (2).md')
  assert.ok(fs.readFileSync(path.join(root, 'docs/tasks/Task (2).md'), 'utf8').endsWith('[Guide](../guide.md)\n'))
})

test('existing completed documents migrate on writable synchronization and Done cannot be a symlink', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-task-done-existing-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.mkdirSync(path.join(root, 'docs/tasks'), { recursive: true })
  const raw = '---\ntitle: Old\ndone: "true"\ncustom: unchanged\n---\nBody\n'
  fs.writeFileSync(path.join(root, 'docs/tasks/Old.md'), raw)
  const before = readTaskList(root)
  assert.equal(taskDocumentsNeedMigration(before, root), true)
  const migrated = changeTaskList(root, [])
  assert.equal(migrated[0].id, before[0].id)
  assert.equal(migrated[0].path, 'docs/tasks/Done/Old.md')
  assert.equal(fs.readFileSync(path.join(root, migrated[0].path!), 'utf8'), raw)
  assert.equal(taskDocumentsNeedMigration(migrated, root), false)
  const unsafe = path.join(root, 'unsafe'), outside = path.join(root, 'outside')
  fs.mkdirSync(path.join(unsafe, 'docs/tasks'), { recursive: true }); fs.mkdirSync(outside)
  fs.symlinkSync(outside, path.join(unsafe, 'docs/tasks/Done'))
  fs.writeFileSync(path.join(unsafe, 'docs/tasks/Old.md'), raw)
  assert.throws(() => changeTaskList(unsafe, []), /Invalid task directory/)
  assert.deepEqual(fs.readdirSync(outside), [])
  assert.equal(fs.readFileSync(path.join(unsafe, 'docs/tasks/Old.md'), 'utf8'), raw)
})
