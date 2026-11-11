import './test-isolated-data.ts'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { runSpeechProcess } from './speech-process.ts'
import { transcribeLocalSpeech } from './speech-engine.ts'
import { DEFAULT_SPEECH_CONFIG } from './speech-settings.ts'
import type { spawnHostProcess, stopProcessGroup } from './platform/process.ts'

class FakeChild extends EventEmitter {
  pid = 12345
  stdout = new PassThrough()
  stderr = new PassThrough()
}
function fixture() {
  const child = new FakeChild(), signals: NodeJS.Signals[] = []
  const spawn = (() => child) as unknown as typeof spawnHostProcess
  const stop: typeof stopProcessGroup = (_pid, signal = 'SIGTERM') => { signals.push(signal) }
  return { child, signals, dependencies: { spawn, stop } }
}
function wav(): Buffer {
  const audio = Buffer.alloc(46)
  audio.write('RIFF', 0); audio.writeUInt32LE(38, 4); audio.write('WAVEfmt ', 8)
  audio.writeUInt32LE(16, 16); audio.writeUInt16LE(1, 20); audio.writeUInt16LE(1, 22)
  audio.writeUInt32LE(16_000, 24); audio.writeUInt32LE(32_000, 28); audio.writeUInt16LE(2, 32)
  audio.writeUInt16LE(16, 34); audio.write('data', 36); audio.writeUInt32LE(2, 40)
  return audio
}

test('abort waits for actual close, escalates after the grace period, and releases the WAV only then', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const f = fixture(), controller = new AbortController()
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-speech-process-'))
  let file = '', settled = false
  try {
    const pending = transcribeLocalSpeech({ ...DEFAULT_SPEECH_CONFIG, allowModelDownload: true }, wav(), controller.signal, {
      root, installed: true, python: 'fixture', execute: (cmd, args, options) => {
        file = args[3]
        return runSpeechProcess(cmd, args, options, f.dependencies)
      },
    }).catch(() => { settled = true })
    assert.equal(fs.existsSync(file), true)
    controller.abort()
    await Promise.resolve()
    assert.deepEqual(f.signals, ['SIGTERM'])
    assert.equal(settled, false)
    assert.equal(fs.existsSync(file), true)
    t.mock.timers.tick(2_000)
    assert.deepEqual(f.signals, ['SIGTERM', 'SIGKILL'])
    assert.equal(settled, false)
    f.child.emit('close', null)
    await pending
    assert.equal(settled, true)
    assert.equal(fs.existsSync(file), false)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})

test('timeout and output overflow stop the child, wait for close, and clear timers', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  for (const cause of ['timeout', 'overflow'] as const) {
    const f = fixture(), controller = new AbortController()
    let settled = false
    const pending = runSpeechProcess('fixture', [], { signal: controller.signal, maxBuffer: 4, timeout: 100 }, f.dependencies).catch(() => { settled = true })
    if (cause === 'timeout') t.mock.timers.tick(100)
    else f.child.stderr.write(Buffer.from('12345'))
    assert.deepEqual(f.signals, ['SIGTERM'])
    await Promise.resolve()
    assert.equal(settled, false)
    f.child.emit('close', 1)
    await pending
    assert.equal(settled, true)
    const count = f.signals.length
    t.mock.timers.tick(10_000)
    controller.abort()
    assert.equal(f.signals.length, count)
  }
})

test('successful output settles once after close and a failed spawn never exposes details', async () => {
  const f = fixture(), controller = new AbortController()
  const pending = runSpeechProcess('fixture', [], { signal: controller.signal, maxBuffer: 100, timeout: 5000 }, f.dependencies)
  f.child.stdout.write(Buffer.from('{"text":"ok"}'))
  f.child.emit('close', 0)
  assert.deepEqual(await pending, { stdout: '{"text":"ok"}' })
  controller.abort()
  assert.deepEqual(f.signals, [])
  const dependencies = { ...f.dependencies, spawn: (() => { throw new Error('private argument') }) as typeof spawnHostProcess }
  await assert.rejects(runSpeechProcess('fixture', [], { signal: new AbortController().signal, maxBuffer: 100, timeout: 100 }, dependencies), error => error instanceof Error && !error.message.includes('private'))
})

test('route retains its concurrency lease while cancelled child is still alive', async () => {
  const { createSpeechRouter } = await import('./speech-routes.ts')
  const { writeSpeechConfig, readSpeechConfig, speechConfigRevision } = await import('./speech-settings.ts')
  const f = fixture(), root = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-speech-lease-'))
  const account = 'speech-process-lease@example.test'
  type Handler = (req: object, res: object, next: (error?: unknown) => void) => Promise<void>
  type Layer = { route?: { path: string; stack: { handle: Handler }[] } }
  let released = false, file = ''
  try {
    writeSpeechConfig(account, { ...DEFAULT_SPEECH_CONFIG, allowModelDownload: true })
    const transcribe: typeof import('./speech-engine.ts').transcribeSpeech = async (config, audio, signal) => transcribeLocalSpeech(config, audio, signal, {
      root, installed: true, python: 'fixture', execute: (command, args, options) => {
        file = args[3]
        return runSpeechProcess(command, args, options, f.dependencies)
      },
    })
    const router = createSpeechRouter(transcribe) as unknown as { stack: Layer[] }
    const handlers = router.stack.find(layer => layer.route?.path === '/transcribe')!.route!.stack
    const req = { auth: { email: account, role: 'owner' }, file: { buffer: wav() }, body: { revision: speechConfigRevision(readSpeechConfig(account)) } }
    const res = Object.assign(new EventEmitter(), { locals: { speechLease: { start() {}, release() { released = true } } }, writableEnded: false, destroyed: false })
    const pending = handlers.at(-1)!.handle(req, res, () => {})
    assert.equal(fs.existsSync(file), true)
    res.destroyed = true
    res.emit('close')
    await Promise.resolve()
    assert.equal(released, false)
    assert.equal(fs.existsSync(file), true)
    f.child.emit('close', null)
    await pending
    assert.equal(released, true)
    assert.equal(fs.existsSync(file), false)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})
