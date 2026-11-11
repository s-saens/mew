import test from 'node:test'
import assert from 'node:assert/strict'
import { DataChannelTransport } from './remote-transport.ts'
import { requestResponseTimeout } from './request-response-timeout.ts'
import type { RemoteFrame } from '../../shared/remote-access.ts'

class Wire extends EventTarget {
  readyState = 'open'
  bufferedAmount = 0
  frames: RemoteFrame[] = []
  send(data: string) { this.frames.push(JSON.parse(data)) }
  close() { this.readyState = 'closed' }
}

const settle = async (predicate: () => boolean) => {
  for (let i = 0; i < 40 && !predicate(); i++) await new Promise(resolve => setImmediate(resolve))
  assert.equal(predicate(), true)
}

test('remote speech waits beyond the normal deadline and still supports explicit cancellation', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'location')
  Object.defineProperty(globalThis, 'location', { configurable: true, value: new URL('https://mew.example/') })
  const wire = new Wire(), transport = new DataChannelTransport(wire as never)
  t.after(() => { transport.close(); if (previous) Object.defineProperty(globalThis, 'location', previous); else Reflect.deleteProperty(globalThis, 'location') })
  const controller = new AbortController()
  let speechFinished = false
  const speech = transport.fetch('/api/speech/transcribe', { method: 'POST', body: 'audio', signal: controller.signal }).catch(() => { speechFinished = true })
  let ordinaryFinished = false
  const ordinary = transport.fetch('/api/other', { method: 'POST', body: 'x' }).catch(() => { ordinaryFinished = true })
  await settle(() => wire.frames.filter(frame => frame.type === 'end').length === 2)
  t.mock.timers.tick(30_001)
  await settle(() => ordinaryFinished)
  assert.equal(speechFinished, false)
  controller.abort()
  await Promise.all([speech, ordinary])
  await settle(() => wire.frames.filter(frame => frame.type === 'cancel').length === 2)
})

test('remote speech itself has a bounded response deadline', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'location')
  Object.defineProperty(globalThis, 'location', { configurable: true, value: new URL('https://mew.example/') })
  const wire = new Wire(), transport = new DataChannelTransport(wire as never)
  t.after(() => { transport.close(); if (previous) Object.defineProperty(globalThis, 'location', previous); else Reflect.deleteProperty(globalThis, 'location') })
  let finished = false
  const speech = transport.fetch('/api/speech/transcribe', { method: 'POST', body: 'audio' }).catch(() => { finished = true })
  await settle(() => wire.frames.some(frame => frame.type === 'end'))
  t.mock.timers.tick(309_999)
  assert.equal(finished, false)
  t.mock.timers.tick(1)
  await speech
  assert.equal(finished, true)
  await settle(() => wire.frames.some(frame => frame.type === 'cancel'))
})

test('extended timeout applies only to transcription POST', () => {
  assert.equal(requestResponseTimeout('POST', '/api/speech/transcribe?project=one'), 310_000)
  assert.equal(requestResponseTimeout('GET', '/api/speech/transcribe'), 30_000)
  assert.equal(requestResponseTimeout('POST', '/api/speech/transcribe-other'), 30_000)
})
