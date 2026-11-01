import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveTaskAgentLaunch } from './task-agent-launch.ts'
import type { TaskItem } from '../../shared/task-list.ts'

const original: TaskItem = { id: 'task', text: 'Original', done: false, path: '.mew/tasks/Original.md' }

function fixture(options: { tasks?: TaskItem[]; before?: TaskItem[]; after?: TaskItem[] } = {}) {
  const calls: string[] = []
  const before = options.before ?? [original]
  const after = options.after ?? [{ ...original, text: 'Renamed', done: true, path: '.mew/tasks/Done/Renamed.md' }]
  const config = {
    path: original.path!, tasks: options.tasks ?? [original], isCurrent: () => true,
    readBefore: async () => { calls.push('readBefore'); return before },
    prepare: async () => { calls.push('save'); return () => { calls.push('release') } },
    readAfter: async () => { calls.push('readAfter'); return after },
    sync: async (previous: TaskItem[], next: TaskItem[]) => {
      calls.push('sync')
      assert.deepEqual(previous, before)
      assert.deepEqual(next, after)
    },
  }
  return { calls, config, after }
}

test('task launch follows the same task id after title and completion move its document', async () => {
  const { calls, config, after } = fixture({ after: [
    { ...original, id: 'other', text: 'Renamed', path: '.mew/tasks/Renamed.md' },
    { ...original, text: 'Renamed', done: true, path: '.mew/tasks/Done/Renamed.md' },
  ] })
  assert.deepEqual(await resolveTaskAgentLaunch(config), after[1])
  assert.deepEqual(calls, ['save', 'readAfter', 'sync', 'release'])
})

test('task launch reads its identity before saving when the task panel has not loaded it', async () => {
  const { calls, config, after } = fixture({ tasks: [] })
  assert.deepEqual(await resolveTaskAgentLaunch(config), after[0])
  assert.deepEqual(calls, ['readBefore', 'save', 'readAfter', 'sync', 'release'])
})

test('missing task identity prevents saving and launch', async () => {
  const { calls, config } = fixture({ tasks: [], before: [] })
  await assert.rejects(resolveTaskAgentLaunch(config), /TASK_DOCUMENT_UNAVAILABLE/)
  assert.deepEqual(calls, ['readBefore'])
})

test('deleted task after saving prevents launch and releases document preparation', async () => {
  const { calls, config } = fixture({ after: [] })
  await assert.rejects(resolveTaskAgentLaunch(config), /TASK_DOCUMENT_UNAVAILABLE/)
  assert.deepEqual(calls, ['save', 'readAfter', 'sync', 'release'])
})

test('save, read, and synchronization failures propagate without returning a launch target', async t => {
  for (const stage of ['prepare', 'readAfter', 'sync'] as const) await t.test(stage, async () => {
    const { calls, config } = fixture()
    const failure = new Error(`${stage} failed`)
    config[stage] = async () => { throw failure }
    await assert.rejects(resolveTaskAgentLaunch(config), error => error === failure)
    assert.equal(calls.includes('release'), stage !== 'prepare')
  })
})

test('project switching cancels launch before and after awaited operations', async t => {
  for (const stage of ['initial', 'readBefore', 'prepare', 'readAfter', 'sync'] as const) await t.test(stage, async () => {
    const { calls, config } = fixture({ tasks: stage === 'readBefore' ? [] : [original] })
    let current = stage !== 'initial'
    config.isCurrent = () => current
    if (stage !== 'initial') {
      const callback = config[stage]
      if (stage === 'sync') config.sync = async (before, after) => { await (callback as typeof config.sync)(before, after); current = false }
      else if (stage === 'prepare') config.prepare = async () => { const release = await (callback as typeof config.prepare)(); current = false; return release }
      else config[stage] = async () => { const result = await (callback as typeof config.readAfter)(); current = false; return result }
    }
    assert.equal(await resolveTaskAgentLaunch(config), null)
    assert.equal(calls.includes('release'), ['prepare', 'readAfter', 'sync'].includes(stage))
  })
})
