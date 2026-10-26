import test from 'node:test'
import assert from 'node:assert/strict'
import { createRemotePreparePool } from './remote-access-prepare-pool.ts'

test('host preparation contributions are bounded, distinct, epoch scoped, and single use', () => {
  let serial = 0, now = 1000
  const pool = createRemotePreparePool({ random: () => String(++serial), now: () => now })
  assert.deepEqual(pool.refill(), { epoch: '', entries: [] })
  const initial = pool.reset()
  assert.equal(initial.entries.length, 8)
  assert.equal(new Set(initial.entries.flatMap(entry => [entry.id, entry.challenge, entry.generation])).size, 24)
  assert.equal(initial.entries.every(entry => entry.expires === 61_000), true)
  assert.equal(pool.refill().entries.length, 0)
  const first = { ...initial.entries[0], epoch: initial.epoch }
  assert.equal(pool.consume({ ...first, epoch: 'other-process' }), null)
  assert.equal(pool.consume({ ...first, challenge: 'other-challenge' }), null)
  assert.equal(pool.consume({ ...first, generation: 'other-generation' }), null)
  assert.deepEqual(pool.consume(first), initial.entries[0])
  assert.equal(pool.consume(first), null)
  const next = pool.refill()
  assert.equal(next.epoch, initial.epoch)
  assert.equal(next.entries.length, 1)
  assert.equal(next.entries[0].id === first.id, false)
  assert.equal(pool.refill().entries.length, 0, 'refill publishes only newly generated entries')
  now = 61_000
  assert.equal(pool.consume({ ...initial.entries[1], epoch: initial.epoch }), null)
  assert.equal(pool.refill().entries.length, 8)
})

test('reconnect, replacement registration and shutdown discard previous unused contributions', () => {
  const pool = createRemotePreparePool()
  const first = pool.reset(), old = { ...first.entries[0], epoch: first.epoch }
  const second = pool.reset()
  assert.notEqual(first.epoch, second.epoch)
  assert.equal(pool.consume(old), null)
  pool.clear()
  assert.equal(pool.consume({ ...second.entries[0], epoch: second.epoch }), null)
  assert.deepEqual(pool.refill(), { epoch: '', entries: [] })
  for (const value of [null, undefined, false, [], 'entry', {}, { epoch: second.epoch }]) assert.equal(pool.consume(value), null)
})
