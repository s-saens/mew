import test from 'node:test'
import assert from 'node:assert/strict'
import { resourceSampleCache } from './resource-sample-cache.ts'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail })
  return { promise, resolve, reject }
}

test('sample cache shares pending work even after its future cache lifetime elapses', async () => {
  let now = 0, calls = 0
  const work = deferred<string>()
  const sample = resourceSampleCache(() => { calls++; return work.promise }, 5000, () => now)
  const first = sample()
  now = 20_000
  assert.equal(sample(), first)
  assert.equal(calls, 1)
  work.resolve('finished')
  assert.equal(await first, 'finished')
})

test('sample cache starts the TTL when collection fulfills and refreshes at expiry', async () => {
  let now = 0, calls = 0
  const firstWork = deferred<{ sample: number }>()
  const sample = resourceSampleCache(() => {
    calls++
    return calls === 1 ? firstWork.promise : Promise.resolve({ sample: calls })
  }, 5000, () => now)
  const pending = sample()
  now = 20_000
  firstWork.resolve({ sample: 1 })
  const first = await pending
  now = 24_999
  assert.equal(await sample(), first)
  assert.equal(calls, 1)
  now = 25_000
  assert.deepEqual(await sample(), { sample: 2 })
  assert.equal(calls, 2)
})

test('sample cache shares rejection and retries failed work without caching the error', async () => {
  let calls = 0
  const failed = deferred<string>()
  const sample = resourceSampleCache(() => ++calls === 1 ? failed.promise : Promise.resolve('recovered'), 5000, () => 0)
  const first = sample(), second = sample()
  assert.equal(first, second)
  const rejection = assert.rejects(first, /fixture collection failed/)
  failed.reject(new Error('fixture collection failed'))
  await rejection
  assert.equal(await sample(), 'recovered')
  assert.equal(calls, 2)
  assert.equal(await sample(), 'recovered')
  assert.equal(calls, 2)
})

test('sample cache derives each completed value lifetime independently', async () => {
  let now = 0, calls = 0
  const sample = resourceSampleCache(async () => ++calls === 1 ? [] : ['available'], value => value.length ? 5000 : 30_000, () => now)
  assert.deepEqual(await sample(), [])
  now = 29_999
  assert.deepEqual(await sample(), [])
  assert.equal(calls, 1)
  now = 30_000
  assert.deepEqual(await sample(), ['available'])
  now = 34_999
  assert.deepEqual(await sample(), ['available'])
  assert.equal(calls, 2)
  now = 35_000
  await sample()
  assert.equal(calls, 3)
})
