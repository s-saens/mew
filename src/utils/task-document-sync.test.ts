import test from 'node:test'
import assert from 'node:assert/strict'
import { registerTaskDocumentSync, syncTaskDocuments, withTaskDocumentSync, type TaskDocumentChange } from './task-document-sync.ts'

test('confirmed task updates compare stable IDs and stay within the registered workspace', async () => {
  const updates: TaskDocumentChange[][] = []
  const unregister = registerTaskDocumentSync({ workspace: '/one', prepare: async () => () => {}, apply: async changes => { updates.push(changes) } })
  try {
    const old = { id: 'one', text: 'Old', done: false, path: 'docs/tasks/Old.md' }
    const next = { ...old, text: 'New', path: 'docs/tasks/New.md' }
    await syncTaskDocuments('/two', [old], [next])
    await syncTaskDocuments('/one', [old], [{ ...old }])
    assert.equal(updates.length, 0)
    await syncTaskDocuments('/one', [old], [next])
    assert.deepEqual(updates, [[{ before: old, after: next }]])
  } finally { unregister() }
})

test('task requests wait for prior updates and always release the editor after a failure', async () => {
  const events: string[] = []
  let finish!: () => void
  const blocked = new Promise<void>(resolve => { finish = resolve })
  const unregister = registerTaskDocumentSync({ workspace: '/one', prepare: async () => {
    events.push('prepare')
    return () => { events.push('release') }
  }, apply: async () => {} })
  try {
    const first = withTaskDocumentSync('/one', async () => { events.push('first'); await blocked; throw new Error('failed') })
    const failure = assert.rejects(first, /failed/)
    const second = withTaskDocumentSync('/one', async () => { events.push('second') })
    await new Promise(resolve => setImmediate(resolve))
    assert.deepEqual(events, ['prepare', 'first'])
    finish()
    await failure
    await second
    assert.deepEqual(events, ['prepare', 'first', 'release', 'prepare', 'second', 'release'])
  } finally { finish(); unregister() }
})

test('queued requests from a replaced workspace do not execute', async () => {
  let finish!: () => void
  const blocked = new Promise<void>(resolve => { finish = resolve })
  const unregister = registerTaskDocumentSync({ workspace: '/one', prepare: async () => () => {}, apply: async () => {} })
  let ran = false
  const first = withTaskDocumentSync('/one', () => blocked)
  await new Promise(resolve => setImmediate(resolve))
  const queued = withTaskDocumentSync('/one', async () => { ran = true })
  const failure = assert.rejects(queued, /프로젝트가 변경/)
  const unregisterNext = registerTaskDocumentSync({ workspace: '/two', prepare: async () => () => {}, apply: async () => {} })
  try {
    unregister()
    finish()
    await first
    await failure
    assert.equal(ran, false)
  } finally { finish(); unregisterNext() }
})
