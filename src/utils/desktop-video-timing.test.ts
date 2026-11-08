import test from 'node:test'
import assert from 'node:assert/strict'
import { desktopVideoTiming } from './desktop-video-timing.ts'

const counters = { id: 'video', jitterBufferDelay: 20, jitterBufferEmittedCount: 100, totalDecodeTime: 1, framesDecoded: 100 }

test('receiver timing reports recent buffer and decode costs instead of lifetime averages', () => {
  const sample = desktopVideoTiming()
  assert.deepEqual(sample(counters), {})
  const value = sample({ ...counters, jitterBufferDelay: 20.6, jitterBufferEmittedCount: 110, totalDecodeTime: 1.02, framesDecoded: 110 })
  assert.ok(Math.abs(value.bufferMs! - 60) < 1e-9)
  assert.ok(Math.abs(value.decodeMs! - 2) < 1e-9)
})

test('idle, replaced, reset, and unavailable receiver counters do not claim zero latency', () => {
  const sample = desktopVideoTiming()
  sample(counters)
  assert.deepEqual(sample(counters), {})
  assert.deepEqual(sample({ ...counters, id: 'replacement' }), {})
  assert.deepEqual(sample({ ...counters, id: 'replacement', jitterBufferDelay: 0, jitterBufferEmittedCount: 0, totalDecodeTime: 0, framesDecoded: 0 }), {})
  assert.deepEqual(sample({ id: 'replacement', framesDecoded: 1 }), {})
  assert.deepEqual(sample({ id: 'replacement', framesDecoded: 2, totalDecodeTime: 1, jitterBufferDelay: NaN, jitterBufferEmittedCount: Infinity }), {})
})

test('buffer and decode counters are independent and a measured zero remains valid', () => {
  const sample = desktopVideoTiming()
  sample({ id: 'video', framesDecoded: 10, totalDecodeTime: 0 })
  assert.deepEqual(sample({ id: 'video', framesDecoded: 12, totalDecodeTime: 0 }), { decodeMs: 0 })
  sample({ id: 'video', jitterBufferDelay: 0, jitterBufferEmittedCount: 1 })
  assert.deepEqual(sample({ id: 'video', jitterBufferDelay: .1, jitterBufferEmittedCount: 2 }), { bufferMs: 100 })
})
