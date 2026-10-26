import test from 'node:test'
import assert from 'node:assert/strict'
import { isModelCapacityError, terminalCapacityMessage, waitForCapacityRetry } from './agent-capacity.ts'

const capacity = 'Selected model is at capacity. Please try a different model.'

test('only explicit provider capacity failures are eligible for retry', () => {
  for (const error of [capacity, new Error(capacity), { code: -32603, message: 'Internal error', data: { message: capacity } }, { message: 'Provider failed', data: { type: 'overloaded_error' } }, 'The server is overloaded. Please try again later.']) {
    assert.equal(isModelCapacityError(error), true)
  }
  for (const message of ['429 Too many requests', 'Rate limit reached', 'Authentication required', 'Invalid API key: model is overloaded', 'usage_limit_reached', 'insufficient_quota', `${capacity} Usage limit reached`, `${capacity} Insufficient credits`, 'Connection closed']) {
    assert.equal(isModelCapacityError(new Error(message)), false, message)
  }
})

test('terminal streamed failures support prior progress without retrying ordinary explanations', () => {
  assert.equal(terminalCapacityMessage(`Work completed.\n\n${capacity}\n\n`), capacity)
  assert.equal(terminalCapacityMessage(`Work completed.${capacity}\n\n`, ['Work completed.', capacity.slice(0, 24), capacity.slice(24) + '\n\n']), capacity)
  for (const text of [`The error was: ${capacity}`, `"${capacity}"`, `Selected model is at capacity when all provider slots are full.`, `${capacity}\nThe task is complete.`, `The model is overloaded because this example intentionally simulates high demand.`]) {
    assert.equal(terminalCapacityMessage(text), null, text)
  }
})

test('retry waits honor the configured delay and can be cancelled immediately', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const controller = new AbortController()
  let completed = false
  const waiting = waitForCapacityRetry(30_000, controller.signal).then(ready => { completed = true; return ready })
  t.mock.timers.tick(29_999)
  await Promise.resolve()
  assert.equal(completed, false)
  t.mock.timers.tick(1)
  assert.equal(await waiting, true)
  const cancelled = waitForCapacityRetry(30_000, controller.signal)
  controller.abort()
  assert.equal(await cancelled, false)
  assert.equal(await waitForCapacityRetry(30_000, controller.signal), false)
})
