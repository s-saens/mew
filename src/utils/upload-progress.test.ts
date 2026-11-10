import test from 'node:test'
import assert from 'node:assert/strict'
import { DataChannelTransport, mewUpload } from './remote-transport.ts'
import type { RemoteFrame } from '../../shared/remote-access.ts'

test('HTTP uploads report byte progress and preserve error responses', async t => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'XMLHttpRequest')
  class Xhr {
    upload: { onprogress?: (event: { lengthComputable: boolean; loaded: number; total: number }) => void } = {}
    status = 413
    statusText = 'Too Large'
    responseText = '{"error":"too large"}'
    onload?: () => void
    open(method: string, url: string) { assert.equal(method, 'POST'); assert.equal(url, '/api/upload') }
    getResponseHeader() { return 'application/json' }
    send(body: FormData) {
      assert.equal(body.get('project'), 'example')
      this.upload.onprogress?.({ lengthComputable: true, loaded: 25, total: 100 })
      this.upload.onprogress?.({ lengthComputable: true, loaded: 100, total: 100 })
      this.onload?.()
    }
  }
  Object.defineProperty(globalThis, 'XMLHttpRequest', { configurable: true, value: Xhr })
  t.after(() => { if (original) Object.defineProperty(globalThis, 'XMLHttpRequest', original); else Reflect.deleteProperty(globalThis, 'XMLHttpRequest') })
  const body = new FormData(); body.append('project', 'example')
  const values: number[] = []
  const response = await mewUpload('/api/upload', body, value => values.push(value))
  assert.deepEqual(values, [0, 25, 100])
  assert.equal(response.status, 413)
  assert.deepEqual(await response.json(), { error: 'too large' })
})

test('remote upload reports sent chunks and retains multipart data', async t => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'location')
  Object.defineProperty(globalThis, 'location', { configurable: true, value: new URL('https://mew.test') })
  class Wire extends EventTarget {
    readyState = 'open'; bufferedAmount = 0; frames: RemoteFrame[] = []
    send(data: string) { this.frames.push(JSON.parse(data)) }
    close() { this.readyState = 'closed' }
    message(frame: unknown) { this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(frame) })) }
  }
  const wire = new Wire(), transport = new DataChannelTransport(wire as never)
  t.after(() => { transport.close(); if (original) Object.defineProperty(globalThis, 'location', original); else Reflect.deleteProperty(globalThis, 'location') })
  const body = new FormData(); body.append('file', new File([new Uint8Array(160_000)], 'clip.webm', { type: 'video/webm' })); body.append('project', 'example')
  const values: number[] = []
  const pending = transport.upload('/api/upload', body, value => values.push(value))
  for (let i = 0; i < 200 && !wire.frames.some(frame => frame.type === 'end'); i++) await new Promise(resolve => setImmediate(resolve))
  const request = wire.frames.find(frame => frame.type === 'request')
  assert.ok(request && request.type === 'request')
  assert.match(request.headers['content-type'], /^multipart\/form-data; boundary=/)
  assert.ok(values.some(value => value > 0 && value < 100))
  assert.equal(values.at(-1), 100)
  const bytes = Buffer.concat(wire.frames.filter(frame => frame.type === 'chunk').map(frame => Buffer.from(frame.data, 'base64')))
  assert.match(bytes.toString('latin1'), /name="project"\r\n\r\nexample/)
  wire.message({ type: 'response', id: request.id, status: 200, headers: {} })
  wire.message({ type: 'end', id: request.id })
  assert.equal((await pending).status, 200)
})
