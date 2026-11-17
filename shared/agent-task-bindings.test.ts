import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeTaskBindings } from './agent-task-bindings.ts'

test('task bindings retain valid sets, clear empty choices, and reject unknown tasks or sets', () => {
  assert.deepEqual(normalizeTaskBindings({ assistant: 'one', gitCommit: '', schedule: 'two' }, ['one', 'two']), { assistant: 'one', schedule: 'two' })
  assert.throws(() => normalizeTaskBindings({ schedule: 'deleted' }, ['one']))
  assert.throws(() => normalizeTaskBindings({ arbitrary: 'one' }, ['one']))
  assert.throws(() => normalizeTaskBindings([], ['one']))
})
