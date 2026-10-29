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
  assert.equal(tasks[0].path, '.mew/tasks/Done/Task.md')
  assert.equal(tasks[0].id, 'one')
  assert.deepEqual(tasks[0].tags, ['work'])
  assert.ok(fs.readFileSync(path.join(root, tasks[0].path!), 'utf8').endsWith('[Guide](../../guide.md)\n'))
  assert.equal(fs.existsSync(path.join(root, '.mew/tasks/Task.md')), false)
  tasks = changeTaskList(root, taskChanges(tasks, [...tasks, { id: 'two', text: 'Task', done: false }]))
  assert.deepEqual(tasks.map(task => task.path), ['.mew/tasks/Done/Task.md', '.mew/tasks/Task.md'])
  const metadata = taskListFile(root), previous = readTaskList(root)
  fs.mkdirSync(`${metadata}.tmp-${process.pid}`)
  assert.throws(() => changeTaskList(root, taskChanges(tasks, tasks.map(task => ({ ...task, done: false })))))
  assert.deepEqual(readTaskList(root), previous)
  fs.rmdirSync(`${metadata}.tmp-${process.pid}`)
  tasks = changeTaskList(root, taskChanges(tasks, tasks.map(task => ({ ...task, done: false }))))
  assert.equal(tasks.find(task => task.id === 'one')?.path, '.mew/tasks/Task (2).md')
  assert.ok(fs.readFileSync(path.join(root, '.mew/tasks/Task (2).md'), 'utf8').endsWith('[Guide](../guide.md)\n'))
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
  assert.equal(migrated[0].path, '.mew/tasks/Done/Old.md')
  assert.equal(fs.readFileSync(path.join(root, migrated[0].path!), 'utf8'), raw)
  assert.equal(taskDocumentsNeedMigration(migrated, root), false)
  const unsafe = path.join(root, 'unsafe'), outside = path.join(root, 'outside')
  fs.mkdirSync(path.join(unsafe, 'docs/tasks'), { recursive: true }); fs.mkdirSync(outside)
  fs.symlinkSync(outside, path.join(unsafe, 'docs/tasks/Done'))
  fs.writeFileSync(path.join(unsafe, 'docs/tasks/Old.md'), raw)
  assert.throws(() => changeTaskList(unsafe, []), /Invalid task directory/)
  assert.deepEqual(fs.readdirSync(outside), [])
  assert.equal(fs.readFileSync(path.join(unsafe, 'docs/tasks/Old.md'), 'utf8'), raw)
  fs.rmSync(path.join(unsafe, 'docs/tasks/Done'))
  fs.mkdirSync(path.join(unsafe, '.mew/tasks'), { recursive: true })
  fs.symlinkSync(outside, path.join(unsafe, '.mew/tasks/Done'))
  assert.throws(() => changeTaskList(unsafe, []), /Invalid task directory/)
  assert.equal(fs.readFileSync(path.join(unsafe, 'docs/tasks/Old.md'), 'utf8'), raw)
})

test('version 5 docs tasks migrate with identities, order, colors, properties and document links intact', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-task-docs-migration-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.mkdirSync(path.join(root, 'docs/tasks/Done'), { recursive: true })
  const guide = '---\ntitle: Tasks\ndescription: Task guide\n---\nGuide\n'
  fs.writeFileSync(path.join(root, 'docs/tasks/_tasks.md'), guide)
  const documents = [
    { id: 'active', path: 'docs/tasks/Active.md', done: false, link: '../guide.md' },
    { id: 'completed', path: 'docs/tasks/Done/Completed.md', done: true, link: '../../guide.md' },
  ].map(item => {
    fs.writeFileSync(path.join(root, item.path), `---\ntitle: ${item.done ? 'Completed' : 'Active'}\ndescription: Detailed task context\ndone: ${item.done}\ntags: [work]\nassignees: [alice@example.test]\nstartDate: 2026-10-01\ndate: 2026-10-02\ncustom: preserved\n---\n[Guide](${item.link})\n`)
    const stat = fs.statSync(path.join(root, item.path))
    return { id: item.id, path: item.path, device: stat.dev, inode: stat.ino }
  })
  const metadata = { version: 5, order: ['completed', 'active'], tags: ['work', 'unused'], tagColors: { work: 225 }, documents }
  fs.writeFileSync(taskListFile(root), JSON.stringify(metadata))
  const before = readTaskList(root)
  assert.deepEqual(before.map(task => task.path), ['docs/tasks/Done/Completed.md', 'docs/tasks/Active.md'])
  assert.equal(fs.existsSync(path.join(root, '.mew/tasks')), false, 'reading old tasks does not migrate them')
  const migrated = changeTaskList(root, [])
  assert.deepEqual(migrated.map(task => task.path), ['.mew/tasks/Done/Completed.md', '.mew/tasks/Active.md'])
  assert.deepEqual(migrated.map(({ path: _path, ...task }) => task), before.map(({ path: _path, ...task }) => task))
  for (const task of migrated) {
    const raw = fs.readFileSync(path.join(root, task.path!), 'utf8')
    assert.match(raw, /description: Detailed task context/)
    assert.match(raw, /custom: preserved/)
    assert.match(raw, task.done ? /\[Guide\]\(\.\.\/\.\.\/\.\.\/docs\/guide\.md\)/ : /\[Guide\]\(\.\.\/\.\.\/docs\/guide\.md\)/)
  }
  for (const document of documents) assert.equal(fs.existsSync(path.join(root, document.path)), false)
  assert.equal(fs.readFileSync(path.join(root, 'docs/tasks/_tasks.md'), 'utf8'), guide)
  const saved = JSON.parse(fs.readFileSync(taskListFile(root), 'utf8'))
  assert.deepEqual(saved.order, metadata.order)
  assert.deepEqual(saved.tags.sort(), metadata.tags.toSorted())
  assert.deepEqual(saved.tagColors, metadata.tagColors)
  assert.equal(taskDocumentsNeedMigration(migrated, root), false)
  assert.deepEqual(changeTaskList(root, []), migrated)
})
