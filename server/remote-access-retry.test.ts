import test from 'node:test'
import assert from 'node:assert/strict'
import { remoteHostRetryDelay } from './remote-access-retry.ts'

test('host reconnect starts at 75–125ms and retains exponential backoff with a strict thirty second cap', () => {
  assert.equal(remoteHostRetryDelay(0, 0), 75)
  assert.equal(remoteHostRetryDelay(0, 1), 125)
  assert.deepEqual(Array.from({ length: 10 }, (_, attempt) => remoteHostRetryDelay(attempt, 0.5)), [100, 200, 400, 800, 1600, 3200, 6400, 12800, 25600, 30000])
  assert.equal(remoteHostRetryDelay(100, 1), 30_000)
})
