import test, { type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { beginVoiceCapture, MAX_VOICE_BYTES, VoiceCaptureError, voiceFile } from './voiceCapture.ts'

function mockCapture(t: TestContext, options: { supported?: string[]; defaultType?: string; pendingPermission?: boolean } = {}) {
  const trackStops = [0, 0]
  const tracks = trackStops.map((_count, index) => ({ stop: () => { trackStops[index]++ } }))
  const stream = { getTracks: () => tracks }
  let grant: (value: typeof stream) => void = () => {}
  const permission = options.pendingPermission
    ? new Promise<typeof stream>(resolve => { grant = resolve })
    : Promise.resolve(stream)
  const instances: FakeRecorder[] = []
  const requested: unknown[] = []
  class FakeRecorder {
    state = 'inactive'
    mimeType: string
    timeslice: number | undefined
    stopCalls = 0
    ondataavailable?: (event: { data: Blob }) => void
    onstop?: () => void
    onerror?: () => void
    static isTypeSupported(type: string) { return (options.supported ?? ['audio/webm;codecs=opus']).includes(type) }
    constructor(_stream: unknown, recorderOptions?: { mimeType: string }) {
      this.mimeType = recorderOptions?.mimeType ?? options.defaultType ?? 'audio/webm'
      instances.push(this)
    }
    start(timeslice?: number) { this.timeslice = timeslice; this.state = 'recording' }
    stop() { this.stopCalls++; this.state = 'inactive' }
    data(value: string | Blob, type = this.mimeType) {
      this.ondataavailable?.({ data: typeof value === 'string' ? new Blob([value], { type }) : value })
    }
    finish(finalChunk?: string) { if (finalChunk !== undefined) this.data(finalChunk); this.onstop?.() }
    error() { this.onerror?.() }
  }
  for (const [key, value] of Object.entries({
    MediaRecorder: FakeRecorder,
    navigator: { mediaDevices: { getUserMedia: (constraints: unknown) => { requested.push(constraints); return permission } } },
  })) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key)
    Object.defineProperty(globalThis, key, { configurable: true, value })
    t.after(() => {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    })
  }
  return { instances, requested, released: () => trackStops.reduce((total, count) => total + count, 0), trackStops, grant: () => grant(stream) }
}

const reason = (expected: string) => (error: unknown) => error instanceof VoiceCaptureError && error.reason === expected
const aborted = (error: unknown) => error instanceof DOMException && error.name === 'AbortError'

test('stopping waits for the final chunk and releases the microphone', async t => {
  const fixture = mockCapture(t)
  const errors: unknown[] = []
  const capture = await beginVoiceCapture(new AbortController().signal, error => errors.push(error))
  const recorder = fixture.instances[0]
  assert.deepEqual(fixture.requested, [{ audio: true }])
  assert.equal(recorder.timeslice, 1000)
  recorder.data('first ')
  const stopped = capture.stop()
  let settled = false
  void stopped.then(() => { settled = true })
  await Promise.resolve()
  assert.equal(settled, false, 'stop must wait for asynchronous dataavailable and stop events')
  recorder.finish('last')
  const blob = await stopped
  assert.equal(await blob.text(), 'first last')
  assert.equal(blob.type, 'audio/webm;codecs=opus')
  assert.match(voiceFile(blob).name, /^voice-\d+\.webm$/)
  assert.ok(fixture.trackStops.every(count => count > 0))
  assert.deepEqual(errors, [])
})

for (const [mime, extension] of [['audio/mp4', 'm4a'], ['audio/ogg;codecs=opus', 'ogg']]) {
  test(`records supported ${mime} with a matching .${extension} filename`, async t => {
    const fixture = mockCapture(t, { supported: [mime] })
    const capture = await beginVoiceCapture(new AbortController().signal, assert.fail)
    const recorder = fixture.instances[0]
    assert.equal(recorder.mimeType, mime)
    const stopped = capture.stop()
    recorder.finish('recording')
    const file = voiceFile(await stopped)
    assert.match(file.name, new RegExp(`^voice-\\d+\\.${extension}$`))
    assert.equal(file.type, mime)
    assert.equal(await file.text(), 'recording')
  })
}

test('uses the browser default MIME when no preferred type is supported', async t => {
  const fixture = mockCapture(t, { supported: [], defaultType: 'audio/mp4' })
  const capture = await beginVoiceCapture(new AbortController().signal, assert.fail)
  const stopped = capture.stop()
  fixture.instances[0].finish('default codec')
  assert.equal((await stopped).type, 'audio/mp4')
})

test('empty recordings reject and release the microphone', async t => {
  const fixture = mockCapture(t)
  const capture = await beginVoiceCapture(new AbortController().signal, assert.fail)
  const rejected = assert.rejects(capture.stop(), reason('empty'))
  fixture.instances[0].finish('')
  await rejected
  assert.ok(fixture.released() > 0)
})

test('recorder errors reject a pending stop and discard partial chunks', async t => {
  const fixture = mockCapture(t)
  const errors: unknown[] = []
  const capture = await beginVoiceCapture(new AbortController().signal, error => errors.push(error))
  const recorder = fixture.instances[0]
  recorder.data('partial')
  const rejected = assert.rejects(capture.stop(), reason('recording'))
  recorder.error()
  recorder.finish('late partial')
  await rejected
  assert.ok(fixture.released() > 0)
  assert.deepEqual(errors, [], 'a pending stop receives the error without duplicate callbacks')
})

test('an error during recording reports once and releases the microphone', async t => {
  const fixture = mockCapture(t)
  const errors: unknown[] = []
  await beginVoiceCapture(new AbortController().signal, error => errors.push(error))
  const recorder = fixture.instances[0]
  recorder.error()
  recorder.finish('partial')
  assert.equal(errors.length, 1)
  assert.ok(reason('recording')(errors[0]))
  assert.ok(fixture.released() > 0)
})

test('late microphone permission after cancellation releases every returned track', async t => {
  const fixture = mockCapture(t, { pendingPermission: true })
  const controller = new AbortController()
  const rejected = assert.rejects(beginVoiceCapture(controller.signal, assert.fail), aborted)
  controller.abort()
  fixture.grant()
  await rejected
  assert.equal(fixture.instances.length, 0, 'a cancelled permission request must not create a recorder')
  assert.deepEqual(fixture.trackStops, [1, 1])
})

test('aborting an active recording releases the microphone and ignores stop events', async t => {
  const fixture = mockCapture(t)
  const controller = new AbortController()
  const errors: unknown[] = []
  const capture = await beginVoiceCapture(controller.signal, error => errors.push(error))
  controller.abort()
  fixture.instances[0].finish('discarded')
  await assert.rejects(capture.stop(), reason('recording'))
  assert.ok(fixture.released() > 0)
  assert.deepEqual(errors, [])
})

test('cancelling while stopping rejects the result and ignores late recording errors', async t => {
  const fixture = mockCapture(t)
  const errors: unknown[] = []
  const capture = await beginVoiceCapture(new AbortController().signal, error => errors.push(error))
  const rejected = assert.rejects(capture.stop(), aborted)
  capture.cancel()
  fixture.instances[0].finish('discarded')
  fixture.instances[0].error()
  await rejected
  assert.ok(fixture.released() > 0)
  assert.deepEqual(errors, [], 'a cancelled session cannot report late asynchronous errors')
})

test('missing recording APIs fail without requesting microphone access', async t => {
  const fixture = mockCapture(t)
  Object.defineProperty(globalThis, 'MediaRecorder', { configurable: true, value: undefined })
  await assert.rejects(beginVoiceCapture(new AbortController().signal, assert.fail), reason('unsupported'))
  assert.deepEqual(fixture.requested, [])
})

test('a pre-aborted session never requests microphone permission', async t => {
  const fixture = mockCapture(t)
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(beginVoiceCapture(controller.signal, assert.fail), aborted)
  assert.deepEqual(fixture.requested, [])
})

test('repeated cancel and abort cleanup stop every microphone track only once', async t => {
  const fixture = mockCapture(t)
  const controller = new AbortController()
  const capture = await beginVoiceCapture(controller.signal, assert.fail)
  controller.abort()
  capture.cancel()
  capture.cancel()
  fixture.instances[0].finish('discarded')
  assert.deepEqual(fixture.trackStops, [1, 1])
  assert.equal(fixture.instances[0].stopCalls, 1)
})

test('recordings at the upload byte limit remain valid', async t => {
  const fixture = mockCapture(t)
  const capture = await beginVoiceCapture(new AbortController().signal, assert.fail)
  const recorder = fixture.instances[0]
  recorder.data(new Blob([new ArrayBuffer(MAX_VOICE_BYTES)]))
  const stopped = capture.stop()
  recorder.finish()
  assert.equal((await stopped).size, MAX_VOICE_BYTES)
})

test('a final chunk exceeding the byte limit rejects the pending stop', async t => {
  const fixture = mockCapture(t)
  const errors: unknown[] = []
  const capture = await beginVoiceCapture(new AbortController().signal, error => errors.push(error))
  const recorder = fixture.instances[0]
  recorder.data(new Blob([new ArrayBuffer(MAX_VOICE_BYTES)]))
  const rejected = assert.rejects(capture.stop(), reason('size'))
  recorder.finish('x')
  await rejected
  assert.ok(fixture.released() > 0)
  assert.deepEqual(errors, [])
})

test('exceeding the byte limit during recording reports once and stops the microphone', async t => {
  const fixture = mockCapture(t)
  const errors: unknown[] = []
  await beginVoiceCapture(new AbortController().signal, error => errors.push(error))
  const recorder = fixture.instances[0]
  recorder.data(new Blob([new ArrayBuffer(MAX_VOICE_BYTES + 1)]))
  recorder.finish('discarded')
  assert.equal(errors.length, 1)
  assert.ok(reason('size')(errors[0]))
  assert.equal(recorder.stopCalls, 1)
  assert.ok(fixture.released() > 0)
})
