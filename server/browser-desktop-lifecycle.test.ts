import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import { WebSocket } from 'ws'
import type { LoginDesktopInput } from '../shared/login-desktop.ts'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-browser-desktop-lifecycle-'))
process.env.MEW_DATA_DIR = root
const { BrowserDesktopSession } = await import('./browser-desktop.ts')
test.after(() => fs.rm(root, { recursive: true, force: true }))

test('a native transport failure disconnects its viewer and retains Chrome through reconnect grace', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 100000 })
  class InputFixture extends BrowserDesktopSession {
    commands: Array<LoginDesktopInput | { type: 'shutdown' }> = []
    protected override command(value: LoginDesktopInput | { type: 'shutdown' }) { this.commands.push(value) }
  }
  const events = new EventEmitter(), messages: Array<Record<string, unknown>> = [], closeCodes: number[] = []
  const viewer = Object.assign(events, {
    readyState: WebSocket.OPEN as number,
    send(raw: string) { messages.push(JSON.parse(raw)) },
    close(code: number) { closeCodes.push(code); this.readyState = WebSocket.CLOSING },
  })
  const session = new InputFixture('transport-grace@test', 'about:blank')
  try {
    session.attachViewer(viewer as unknown as WebSocket, () => true)
    const video = Reflect.get(session, 'video')
    const options = Reflect.get(video, 'options') as { onError(error: Error): void }
    options.onError(new Error('The previous viewer closed its native data channel'))
    assert.equal(session.isClosed, false, 'a healthy Chrome session must outlive its failed media transport')
    assert.equal(messages.at(-1)?.type, 'error')
    assert.equal(typeof messages.at(-1)?.message, 'string')
    assert.equal(closeCodes.length, 1)
    assert.equal(viewer.readyState, WebSocket.CLOSING)
    viewer.readyState = WebSocket.CLOSED; events.emit('close')
    assert.equal(session.isClosed, false)
    assert.deepEqual(session.commands, [{ type: 'release' }, { type: 'release' }], 'closing the viewer releases held native input')
    assert.equal(Reflect.get(session, 'viewer'), undefined)
    assert.equal(Reflect.get(session, 'video'), undefined)
    assert.ok(Reflect.get(session, 'reconnect'))
    t.mock.timers.tick(59999)
    assert.equal(session.isClosed, false, 'the ordinary browser remains available during reconnect grace')
    t.mock.timers.tick(1)
    await session.close()
    assert.equal(session.isClosed, true, 'abandoned sessions still expire at the bounded grace deadline')
  } finally { await session.close() }
})

// The real resize loop receives its normal X11 acknowledgement. The test owns
// the input process double and holds that acknowledgement at the race boundary.
class ResizeFixture extends BrowserDesktopSession {
  captures: Array<{ width: number; height: number }> = []
  protected override async startCapture() {
    this.captures.push({ width: this.width, height: this.height })
    this.ready = true
  }
  size() { return { width: this.width, height: this.height } }
}

for (const stage of ['scheduled', 'queued'] as const) test(`a ${stage} recovery IDR cannot overwrite a newer native resize`, async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 100000 })
  const commands: Array<Record<string, unknown>> = [], output = new EventEmitter()
  const input = Object.assign(new EventEmitter(), {
    exitCode: 0, signalCode: null,
    stdout: Object.assign(output, { destroy() {} }),
    stdin: { destroyed: false, writableLength: 0, write(raw: string) { commands.push(JSON.parse(raw)); return true }, destroy() {} },
  })
  const capture = { exitCode: 0, signalCode: null, stdin: { destroy() {} }, stdout: { destroy() {} } }
  let staleEncoderStarted = 0
  const environment = Object.defineProperty({}, 'DISPLAY', { get() { staleEncoderStarted++; throw new Error('An obsolete recovery reached the encoder') } })
  const viewer = { readyState: WebSocket.OPEN, send() {}, close() {} }
  const video = { async close() {} }
  const session = new ResizeFixture('resize-race@test', 'about:blank')
  for (const [key, value] of Object.entries({ width: 640, height: 480, ready: true, starting: Promise.resolve(), input, capture, environment, viewer, video,
    allowed: () => true, lastEncoderAt: Date.now(), negotiated: { width: 640, height: 480, fps: 60, bitrate: 350000, profile: 'baseline', payload: 103, level: 31, priority: 'speed', resolution: '1080p', quality: 'balanced' } })) Reflect.set(session, key, value)
  let releaseEncoding!: () => void
  const encoding = new Promise<void>(resolve => { releaseEncoding = resolve })
  Reflect.set(session, 'encoding', encoding)
  const flush = async () => { for (let index = 0; index < 12; index++) await Promise.resolve() }
  try {
    Reflect.get(session, 'requestKeyframe').call(session)
    if (stage === 'queued') t.mock.timers.tick(700)
    const resizing = session.resizeDesktop(1000, 700)
    await flush()
    assert.deepEqual(commands.filter(command => command.type === 'resize'), [{ type: 'resize', width: 1000, height: 700 }], 'native resize is waiting for its X11 acknowledgement')
    if (stage === 'scheduled') t.mock.timers.tick(700)
    releaseEncoding(); await flush()
    await (Reflect.get(session, 'encoding') as Promise<void>)
    assert.equal(staleEncoderStarted, 0, 'the old recovery must not enter FFmpeg startup')
    assert.deepEqual(session.size(), { width: 1000, height: 700 }, 'a delayed recovery must not restore the previous viewport')
    output.emit('data', Buffer.from('{"resized":true}\n'))
    await resizing
    assert.deepEqual(session.captures, [{ width: 1000, height: 700 }])
    session.receiveInput({ type: 'pointer', x: 999, y: 699 })
    assert.deepEqual(commands.at(-1), { type: 'pointer', x: 999, y: 699 }, 'input after resize uses the retained viewport')
  } finally {
    releaseEncoding(); output.emit('data', Buffer.from('{"resized":true}\n'))
    await session.close()
  }
})
