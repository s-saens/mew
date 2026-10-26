import assert from 'node:assert/strict'
import { test } from 'node:test'
import { demoFetch } from './transport.ts'
import { DemoWorkspaceStore } from './workspace-store.ts'
import { readDemoTaskSnapshot } from './http-tasks.ts'
import type { TaskItem } from '../../shared/task-list.ts'
import { TASK_TAG_PALETTE } from '../../shared/task-tag-colors.ts'
import { DEMO_DATABASE_ID } from './http-database.ts'

const write = (method: string, body: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
async function data(store: DemoWorkspaceStore, path: string, init?: RequestInit) {
  const response = await demoFetch(store, path, init)
  assert.ok(response.ok, `${path}: ${await response.clone().text()}`)
  return response.json()
}
const editTask = (store: DemoWorkspaceStore, before: TaskItem | null, after: TaskItem | null, extras = {}) => data(store, '/api/task-list', write('PATCH', { workspace: store.workspaceInfo().path, changes: [{ id: before?.id ?? after!.id, before, after, afterId: null }], ...extras }))

test('scheduled tasks open their real shared documents without dirtying the initial Git snapshot', async () => {
  const store = new DemoWorkspaceStore()
  const tasks = await data(store, '/api/task-list')
  assert.ok(tasks.tasks.length > 0)
  for (const task of tasks.tasks) { assert.match(store.readFile(task.path).content, /description:/) }
  assert.deepEqual(store.gitWorkingTree().files, [])
})


test('task fields, document bodies, tag colors and deletions stay in one shared state', async () => {
  const store = new DemoWorkspaceStore(), before = readDemoTaskSnapshot(store).tasks[0]
  const raw = store.readFile(before.path!).content
  store.writeFile(before.path!, raw + '\n직접 적은 메모\n')
  const after = { ...before, text: '제목을 바꾼 작업', done: true, tags: ['디자인'], assignees: ['visitor@example.test'], startDate: '2026-10-21', date: '2026-10-24' }
  const board = await editTask(store, before, after, { tagColorChanges: [{ tag: '디자인', before: null, after: TASK_TAG_PALETTE[1] }] })
  const saved = board.tasks.find((task: TaskItem) => task.id === before.id)
  assert.equal(saved.path, 'docs/tasks/제목을 바꾼 작업.md')
  assert.equal(saved.done, true)
  assert.equal(board.tagColors['디자인'], TASK_TAG_PALETTE[1])
  const content = store.readFile(saved.path).content
  assert.match(content, /직접 적은 메모/)
  assert.equal(/^description:.*$/m.exec(content)?.[0], /^description:.*$/m.exec(raw)?.[0])
  assert.throws(() => store.readFile(before.path!), /찾을 수 없습니다/)
  const withoutTag = await data(store, '/api/task-list', write('PATCH', { workspace: store.workspacePath, changes: [], deletedTags: ['디자인'] }))
  assert.ok(withoutTag.tasks.every((task: TaskItem) => !task.tags?.includes('디자인')))
  assert.equal(withoutTag.tagColors['디자인'], undefined)
  await editTask(store, withoutTag.tasks.find((task: TaskItem) => task.id === before.id), null)
  assert.throws(() => store.readFile(saved.path), /찾을 수 없습니다/)
})

test('new task names reserve guides and preserve IDs across duplicate title changes', async () => {
  const store = new DemoWorkspaceStore(), first: TaskItem = { id: 'new-task', text: 'README', done: false }
  const board = await editTask(store, null, first), saved = board.tasks.find((task: TaskItem) => task.id === first.id)
  assert.equal(saved.path, 'docs/tasks/README (2).md')
  const again = await editTask(store, saved, { ...saved, text: 'mewlink' })
  assert.equal(again.tasks.find((task: TaskItem) => task.id === first.id).path, 'docs/tasks/mewlink (2).md')
  assert.equal(again.tasks.filter((task: TaskItem) => task.text === 'mewlink').length, 2)
})

test('direct task document edits refresh the panel and stale writes fail atomically', async () => {
  const store = new DemoWorkspaceStore(), task = readDemoTaskSnapshot(store).tasks[0]
  store.writeFile(task.path!, store.readFile(task.path!).content.replace(/^title:.*$/m, 'title: "문서에서 수정한 제목"'))
  assert.equal(readDemoTaskSnapshot(store).tasks.find(item => item.id === task.id)?.text, '문서에서 수정한 제목')
  const snapshot = store.repositoryEntries()
  const response = await demoFetch(store, '/api/task-list', write('PATCH', { workspace: store.workspacePath, changes: [{ id: task.id, before: task, after: { ...task, text: '오래된 변경' }, afterId: null }], tagColorChanges: [{ tag: '디자인', before: null, after: TASK_TAG_PALETTE[2] }] }))
  assert.equal(response.status, 409)
  assert.deepEqual(store.repositoryEntries(), snapshot)
  assert.deepEqual(readDemoTaskSnapshot(store).tagColors, {})
})

test('new project task and database mutations are independent and reset removes them', async () => {
  const store = new DemoWorkspaceStore(), original = readDemoTaskSnapshot(store)
  const originalDatabase = await data(store, `/api/db/${DEMO_DATABASE_ID}?project=docs`)
  store.createDirectory('Second'); store.seedProject(`${store.workspacePath}/Second`); store.openWorkspace(`${store.workspacePath}/Second`)
  const task = readDemoTaskSnapshot(store).tasks[0]
  await editTask(store, task, { ...task, text: '두 번째 프로젝트 작업' })
  const database = await data(store, `/api/db/${DEMO_DATABASE_ID}?project=docs`)
  await data(store, `/api/db/${DEMO_DATABASE_ID}/rows/${database.rows[0].id}`, write('PATCH', { project: 'docs', columnId: 'status', value: database.rows[0].cells.status === '완료' ? '예정' : '완료' }))
  store.openWorkspace(store.workspacePath)
  assert.deepEqual(readDemoTaskSnapshot(store), original)
  assert.equal((await data(store, `/api/db/${DEMO_DATABASE_ID}?project=docs`)).rows[0].cells.status, originalDatabase.rows[0].cells.status)
  store.reset()
  assert.deepEqual(store.gitWorkingTree().files, [])
  assert.equal(readDemoTaskSnapshot(store).tasks.length, original.tasks.length)
})


test('task event streams refresh shared document edits and close when the panel request is cancelled', async () => {
  const store = new DemoWorkspaceStore(), controller = new AbortController()
  const response = await demoFetch(store, `/api/task-list/events?workspace=${encodeURIComponent(store.workspacePath)}`, { signal: controller.signal })
  assert.equal(response.status, 200)
  assert.match(response.headers.get('Content-Type')!, /text\/event-stream/)
  const reader = response.body!.getReader(), decoder = new TextDecoder()
  assert.match(decoder.decode((await reader.read()).value), /demo task events/)
  const task = readDemoTaskSnapshot(store).tasks[0]
  store.writeFile(task.path!, store.readFile(task.path!).content + '\n새 메모\n')
  assert.match(decoder.decode((await reader.read()).value), /^data:/)
  controller.abort()
  assert.equal((await reader.read()).done, true)
})

test('task document property strings from the shared editor remain readable and writable', async () => {
  const store = new DemoWorkspaceStore(), task = readDemoTaskSnapshot(store).tasks[0]
  store.writeFile(task.path!, `---\ntitle: ${JSON.stringify(task.text)}\ndone: "true"\ntags: '["시작하기", "디자인"]'\nassignees: '["visitor@example.test"]'\n---\n\n편집기 본문\n`)
  const edited = readDemoTaskSnapshot(store).tasks.find(item => item.id === task.id)!
  assert.deepEqual(edited.tags, ['시작하기', '디자인'])
  assert.deepEqual(edited.assignees, ['visitor@example.test'])
  assert.equal(edited.done, true)
  const result = await editTask(store, null, { id: 'new-after-editor', text: '문서를 연 뒤 새 작업', done: false, tags: [], assignees: [] })
  assert.ok(result.tasks.some((item: TaskItem) => item.id === 'new-after-editor'))
})
