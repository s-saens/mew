import assert from 'node:assert/strict'
import test from 'node:test'
import { createAgentTabPreviews, type AgentTabPreview, type AgentTabPreviewTarget } from './agent-tab-previews.ts'

const target = (id: string): AgentTabPreviewTarget => ({ id, runtime: 'codex', cwd: '/workspace', sessionId: `session-${id}` })
const preview = (value: AgentTabPreviewTarget): AgentTabPreview => ({ sessionId: value.sessionId, start: 0, events: [] })
async function flush() { for (let i = 0; i < 12; i++) await Promise.resolve() }

function fixture() {
  const calls: Array<{ target: AgentTabPreviewTarget; signal: AbortSignal; resolve: (value: AgentTabPreview | null) => void; reject: (error: Error) => void }> = []
  let changes = 0
  const scheduler = createAgentTabPreviews((value, signal) => new Promise((resolve, reject) => {
    calls.push({ target: value, signal, resolve, reject })
  }), () => { changes++ })
  return {
    scheduler, calls, get changes() { return changes },
    async cleanup() {
      scheduler.dispose()
      for (const call of calls) call.resolve(null)
      await flush()
    },
  }
}

test('preview reads run at most two at a time and prioritize the current selected queued tab', async t => {
  const f = fixture()
  t.after(() => f.cleanup())
  const targets = ['one', 'two', 'three', 'four', 'five'].map(target)
  f.scheduler.update(targets, 'four')
  await flush()
  assert.deepEqual(f.calls.map(call => call.target.id), ['four', 'one'])
  f.scheduler.update(targets.map(value => ({ ...value })), 'five')
  await flush()
  assert.equal(f.calls.length, 2, 'changing focus does not exceed the concurrency limit')
  f.calls[0].resolve(preview(targets[3]))
  await flush()
  assert.deepEqual(f.calls.map(call => call.target.id), ['four', 'one', 'five'])
  assert.equal(f.scheduler.get(targets[3])?.sessionId, targets[3].sessionId)
  f.calls[1].resolve(preview(targets[0]))
  await flush()
  assert.deepEqual(f.calls.map(call => call.target.id), ['four', 'one', 'five', 'two'])
  f.calls[2].resolve(preview(targets[4]))
  await flush()
  assert.deepEqual(f.calls.map(call => call.target.id), ['four', 'one', 'five', 'two', 'three'])
})

test('unchanged targets are deduplicated during and after loading', async t => {
  const f = fixture()
  t.after(() => f.cleanup())
  const value = target('same')
  f.scheduler.update([value], value.id)
  await flush()
  f.scheduler.update([{ ...value }], null)
  await flush()
  assert.equal(f.calls.length, 1)
  const saved = preview(value)
  f.calls[0].resolve(saved)
  await flush()
  f.scheduler.update([{ ...value }], value.id)
  await flush()
  assert.equal(f.calls.length, 1)
  assert.equal(f.scheduler.get({ ...value }), saved)
  assert.equal(f.changes, 1)
})

test('runtime, cwd and session changes reject late results from readers that ignore abort', async t => {
  for (const replacement of [{ runtime: 'claude' }, { cwd: '/other-workspace' }, { sessionId: 'new-session' }]) {
    const f = fixture()
    t.after(() => f.cleanup())
    const original = target('changed')
    const current = { ...original, ...replacement }
    f.scheduler.update([original], original.id)
    await flush()
    f.scheduler.update([current], current.id)
    await flush()
    assert.equal(f.calls[0].signal.aborted, true)
    assert.equal(f.calls.length, 2)
    f.calls[0].resolve(preview(original))
    await flush()
    assert.equal(f.scheduler.get(original), null)
    assert.equal(f.scheduler.get(current), null)
    assert.equal(f.changes, 0, 'the obsolete read cannot publish a change')
    f.calls[1].resolve(preview(current))
    await flush()
    assert.deepEqual(f.scheduler.get(current), preview(current))
    assert.equal(f.changes, 1)
  }
})

test('closed tabs reject late results even when the same target is reopened', async t => {
  const f = fixture()
  t.after(() => f.cleanup())
  const value = target('reopened')
  f.scheduler.update([value], value.id)
  await flush()
  f.scheduler.update([], null)
  assert.equal(f.calls[0].signal.aborted, true)
  f.scheduler.update([{ ...value }], value.id)
  await flush()
  f.calls[0].resolve(preview(value))
  await flush()
  assert.equal(f.scheduler.get(value), null)
  assert.equal(f.changes, 0)
  f.calls[1].resolve(preview(value))
  await flush()
  assert.deepEqual(f.scheduler.get(value), preview(value))
})

test('disposing an account scope isolates late results from a new scope with identical targets', async t => {
  const previous = fixture(), current = fixture()
  t.after(async () => { await previous.cleanup(); await current.cleanup() })
  const value = target('shared-id')
  previous.scheduler.update([value], value.id)
  await flush()
  previous.scheduler.dispose()
  current.scheduler.update([{ ...value }], value.id)
  await flush()
  assert.equal(previous.calls[0].signal.aborted, true)
  previous.calls[0].resolve(preview(value))
  await flush()
  assert.equal(previous.changes, 0)
  assert.equal(previous.scheduler.get(value), null)
  assert.equal(current.scheduler.get(value), null)
  current.calls[0].resolve(preview(value))
  await flush()
  assert.deepEqual(current.scheduler.get(value), preview(value))
  assert.equal(current.changes, 1)
})

test('wrong sessions, malformed or absent previews and read failures do not publish history', async t => {
  const malformed: unknown[] = [null, {}, { sessionId: 'other', start: 0, events: [] },
    { sessionId: 'session-invalid', start: -1, events: [] },
    { sessionId: 'session-invalid', start: 0.5, events: [] },
    { sessionId: 'session-invalid', start: 0, events: {} }]
  for (const result of malformed) {
    const f = fixture()
    t.after(() => f.cleanup())
    const value = target('invalid')
    f.scheduler.update([value], value.id)
    await flush()
    f.calls[0].resolve(result as AgentTabPreview | null)
    await flush()
    assert.equal(f.scheduler.get(value), null)
    assert.equal(f.changes, 0)
  }
  const f = fixture()
  t.after(() => f.cleanup())
  const targets = ['failed', 'pending', 'next'].map(target)
  f.scheduler.update(targets, 'failed')
  await flush()
  f.calls[0].reject(new Error('Read unavailable'))
  await flush()
  assert.equal(f.scheduler.get(targets[0]), null)
  assert.equal(f.changes, 0)
  assert.deepEqual(f.calls.map(call => call.target.id), ['failed', 'pending', 'next'], 'a failed read releases its slot')
})

test('the five-second read deadline aborts stalled requests and releases waiting slots', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const f = fixture()
  t.after(() => f.cleanup())
  const targets = ['stalled-one', 'stalled-two', 'queued'].map(target)
  f.scheduler.update(targets, 'stalled-one')
  await flush()
  t.mock.timers.tick(4999)
  await flush()
  assert.equal(f.calls.length, 2)
  assert.equal(f.calls[0].signal.aborted, false)
  t.mock.timers.tick(1)
  await flush()
  assert.equal(f.calls[0].signal.aborted, true)
  assert.equal(f.calls[1].signal.aborted, true)
  assert.deepEqual(f.calls.map(call => call.target.id), ['stalled-one', 'stalled-two', 'queued'])
  f.calls[0].resolve(preview(targets[0]))
  await flush()
  assert.equal(f.scheduler.get(targets[0]), null, 'a deadline remains final even if the reader later succeeds')
  assert.equal(f.changes, 0)
  f.calls[2].resolve(preview(targets[2]))
  await flush()
  assert.deepEqual(f.scheduler.get(targets[2]), preview(targets[2]))
})
