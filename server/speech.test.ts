import './test-isolated-data.ts'
import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_SPEECH_CONFIG, readSpeechConfig, validateSpeechConfig, writeSpeechConfig, speechConfigRevision, requireSpeechRevision } from './speech-settings.ts'
import { MAX_SPEECH_AUDIO_BYTES, testSpeechConnection, transcribeSpeech, validateSpeechAudio } from './speech-engine.ts'

const external = { provider: 'openai', baseUrl: 'https://example.test/v1', model: 'whisper-1', language: 'ko', allowModelDownload: false }

function wav(): Buffer {
  const audio = Buffer.alloc(48)
  audio.write('RIFF', 0); audio.writeUInt32LE(40, 4); audio.write('WAVEfmt ', 8)
  audio.writeUInt32LE(16, 16); audio.writeUInt16LE(1, 20); audio.writeUInt16LE(1, 22)
  audio.writeUInt32LE(16_000, 24); audio.writeUInt32LE(32_000, 28); audio.writeUInt16LE(2, 32)
  audio.writeUInt16LE(16, 34); audio.write('data', 36); audio.writeUInt32LE(4, 40)
  return audio
}

test('speech settings isolate accounts, hide keys and prevent credentials following an endpoint change', () => {
  const saved = writeSpeechConfig('speech-a@example.test', { ...external, apiKey: 'private-key' })
  assert.equal(saved.hasApiKey, true)
  assert.equal(JSON.stringify(saved).includes('private-key'), false)
  assert.equal(readSpeechConfig('speech-b@example.test').provider, 'faster-whisper')
  writeSpeechConfig('speech-a@example.test', external)
  assert.equal(readSpeechConfig('speech-a@example.test').apiKey, 'private-key')
  writeSpeechConfig('speech-a@example.test', { ...external, baseUrl: 'https://other.test/v1' })
  assert.equal(readSpeechConfig('speech-a@example.test').apiKey, '')
  assert.throws(() => validateSpeechConfig({ ...external, baseUrl: 'https://user:password@example.test/v1' }))
  assert.throws(() => validateSpeechConfig({ ...external, baseUrl: 'https://example.test/v1?key=secret' }))
  assert.throws(() => validateSpeechConfig({ ...DEFAULT_SPEECH_CONFIG, model: '../../malicious' }))
})

test('OpenAI-compatible adapter forwards WAV, language and model without redirects', async () => {
  const config = validateSpeechConfig({ ...external, apiKey: 'secret' })
  let called = false
  const fetcher: typeof fetch = async (url, init) => {
    called = true
    assert.equal(url, 'https://example.test/v1/audio/transcriptions')
    assert.equal(init?.redirect, 'error')
    assert.deepEqual(init?.headers, { Authorization: 'Bearer secret' })
    const body = init?.body as FormData
    assert.equal(body.get('model'), 'whisper-1')
    assert.equal(body.get('language'), 'ko')
    assert.equal((body.get('file') as File).name, 'audio.wav')
    return Response.json({ text: 'hello' })
  }
  assert.equal(await transcribeSpeech(config, wav(), undefined, fetcher), 'hello')
  assert.equal(called, true)
})

test('whisper.cpp endpoint and sanitized failures do not expose upstream bodies or tokens', async () => {
  const config = validateSpeechConfig({ ...external, provider: 'whisper-cpp', baseUrl: 'http://localhost:8080', apiKey: 'secret', language: '' })
  const fetcher: typeof fetch = async (url, init) => {
    assert.equal(url, 'http://localhost:8080/inference')
    assert.ok(init?.body instanceof FormData)
    assert.equal(init.body.get('model'), null)
    assert.equal(init.body.get('language'), 'auto')
    return new Response('secret audio and credentials', { status: 500 })
  }
  await assert.rejects(transcribeSpeech(config, wav(), undefined, fetcher), error => error instanceof Error && !/secret|credentials|audio and/.test(error.message))
  await assert.rejects(transcribeSpeech(config, Buffer.alloc(MAX_SPEECH_AUDIO_BYTES + 1), undefined, fetcher))
  await assert.rejects(transcribeSpeech(DEFAULT_SPEECH_CONFIG, wav()), /consent/)
  const probe = await testSpeechConnection(config, async () => new Response('credentials', { status: 401 }))
  assert.equal(probe.ok, false)
  assert.doesNotMatch(probe.message, /credentials/)
})

test('audio header and duration are validated before sending', () => {
  validateSpeechAudio(wav())
  const stereo = wav(); stereo.writeUInt16LE(2, 22)
  assert.throws(() => validateSpeechAudio(stereo))
  const wrongLength = wav(); wrongLength.writeUInt32LE(500, 40)
  assert.throws(() => validateSpeechAudio(wrongLength))
  assert.throws(() => validateSpeechAudio(Buffer.from('not audio')))
  const tooLong = Buffer.alloc(44 + 62 * 32_000 + 2)
  wav().copy(tooLong, 0, 0, 44)
  tooLong.writeUInt32LE(tooLong.length - 8, 4); tooLong.writeUInt32LE(tooLong.length - 44, 40)
  assert.throws(() => validateSpeechAudio(tooLong))
})

test('changed destination or model invalidates the recording revision', () => {
  const original = validateSpeechConfig({ ...external, apiKey: 'secret' })
  const revision = speechConfigRevision(original)
  requireSpeechRevision(original, revision)
  const changed = validateSpeechConfig({ ...external, baseUrl: 'https://other.test/v1' }, original)
  assert.throws(() => requireSpeechRevision(changed, revision), /changed/)
  assert.throws(() => requireSpeechRevision({ ...original, apiKey: 'rotated-key' }, revision), /changed/)
  assert.throws(() => requireSpeechRevision(original, undefined), /changed/)
  assert.equal(revision.includes('secret'), false)
})

test('provider request receives cancellation and timeout signals', async () => {
  const config = validateSpeechConfig(external)
  const controller = new AbortController()
  const fetcher: typeof fetch = async (_url, init) => {
    assert.ok(init?.signal)
    controller.abort()
    assert.equal(init.signal.aborted, true)
    throw new Error('secret details')
  }
  await assert.rejects(transcribeSpeech(config, wav(), controller.signal, fetcher), error => error instanceof Error && !error.message.includes('secret'))
})

test('speech routes enforce role and terminal access and reserve installation for owner', async () => {
  const { createSpeechRouter } = await import('./speech-routes.ts')
  const { setFeature } = await import('./access-policy.ts')
  const router = createSpeechRouter()
  type Handler = (req: object, res: object, next: () => void) => void
  type Layer = { handle: Handler; route?: { path: string; stack: { handle: Handler }[] } }
  const layers = (router as unknown as { stack: Layer[] }).stack
  const gate = layers[0].handle
  const install = layers.find(layer => layer.route?.path === '/install')!.route!.stack[0].handle
  function response() {
    return { statusCode: 200, body: null as unknown, setHeader() {}, status(code: number) { this.statusCode = code; return this }, json(body: unknown) { this.body = body; return this } }
  }
  for (const role of ['owner', 'manager', 'member', 'guest'] as const) {
    const email = `${role}-speech-permission@example.test`
    setFeature(email, 'terminal', true)
    const req = { auth: { role, email, mustChangePassword: false } }
    const res = response()
    let passed = false
    gate(req, res, () => { passed = true })
    assert.equal(passed, role === 'owner' || role === 'manager')
    if (role === 'manager') {
      const denied = response()
      install(req, denied, () => { throw new Error('unexpected installer') })
      assert.equal(denied.statusCode, 403)
    }
    setFeature(email, 'terminal', false)
    const blocked = response()
    passed = false
    gate(req, blocked, () => { passed = true })
    assert.equal(passed, false)
    setFeature(email, 'terminal', null)
  }
})

test('installer keeps status reads passive, blocks duplicate work, verifies import and allows retry', async () => {
  const { SpeechInstaller } = await import('./speech-install.ts')
  const fs = await import('node:fs')
  const os = await import('node:os')
  const path = await import('node:path')
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-speech-install-test-'))
  const calls: string[][] = []
  let releaseImport: (() => void) | undefined
  let failPip = true
  const execute: typeof import('./platform/process.ts').execHostFile = async (_command, args) => {
    calls.push(args)
    if (args[0] === '-m' && args[1] === 'venv') {
      const python = path.join(root, 'venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
      fs.mkdirSync(path.dirname(python), { recursive: true })
      fs.writeFileSync(python, '')
    }
    if (args[1] === 'pip' && failPip) { failPip = false; throw new Error('private pip error') }
    if (args[0] === '-c') await new Promise<void>(resolve => { releaseImport = resolve })
    return { stdout: '', stderr: '' }
  }
  const settle = async (predicate: () => boolean) => {
    for (let i = 0; i < 30 && !predicate(); i++) await new Promise(resolve => setImmediate(resolve))
    assert.equal(predicate(), true)
  }
  try {
    const installer = new SpeechInstaller(root, execute)
    assert.equal(installer.status().state, 'idle')
    assert.equal(calls.length, 0)
    assert.equal(installer.install().state, 'running')
    assert.throws(() => installer.install(), /already running/)
    await settle(() => installer.status().state === 'failed')
    assert.equal(installer.status().installed, false)
    assert.doesNotMatch(installer.status().output, /private pip error/)
    installer.install()
    await settle(() => !!releaseImport)
    assert.equal(installer.status().installed, false)
    releaseImport!()
    await settle(() => installer.status().state === 'succeeded')
    assert.equal(installer.status().installed, true)
    const count = calls.length
    installer.install()
    assert.equal(calls.length, count)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})

test('local runner uses a private temporary WAV and cleans it after success and cancellation', async () => {
  const { transcribeLocalSpeech } = await import('./speech-engine.ts')
  const fs = await import('node:fs')
  const os = await import('node:os')
  const path = await import('node:path')
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-speech-local-test-'))
  const config = { ...DEFAULT_SPEECH_CONFIG, allowModelDownload: true }
  const controller = new AbortController()
  let file = ''
  try {
    const result = await transcribeLocalSpeech(config, wav(), undefined, { root, python: 'fixture-python', installed: true, execute: async (python, args) => {
      assert.equal(python, 'fixture-python')
      file = args[3]
      assert.deepEqual(fs.readFileSync(file), wav())
      assert.equal(args[2], config.model)
      return { stdout: '{"text":"hello"}' }
    } })
    assert.equal(result, 'hello')
    assert.equal(fs.existsSync(file), false)
    await assert.rejects(transcribeLocalSpeech(config, wav(), controller.signal, { root, installed: true, execute: async (_python, args, options) => {
      file = args[3]
      assert.equal(fs.existsSync(file), true)
      controller.abort()
      assert.equal(options.signal.aborted, true)
      throw new Error('private local output')
    } }), error => error instanceof Error && !error.message.includes('private'))
    assert.equal(fs.existsSync(file), false)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})

test('transcription route rejects stale settings before calling a provider', async () => {
  const { createSpeechRouter } = await import('./speech-routes.ts')
  type Handler = (req: object, res: object, next: (error?: unknown) => void) => Promise<void>
  type Layer = { route?: { path: string; stack: { handle: Handler }[] } }
  const account = 'speech-route-revision@example.test'
  writeSpeechConfig(account, external)
  const router = createSpeechRouter() as unknown as { stack: Layer[] }
  const handlers = router.stack.find(layer => layer.route?.path === '/transcribe')!.route!.stack
  const handler = handlers[handlers.length - 1].handle
  let released = false, captured: unknown
  const req = { auth: { role: 'owner', email: account }, file: { buffer: wav() }, body: { revision: 'old-destination' } }
  const res = { locals: { speechLease: { start() {}, release() { released = true } } }, once() {}, off() {}, writableEnded: false, destroyed: false }
  await handler(req, res, error => { captured = error })
  assert.ok(captured instanceof Error)
  assert.equal((captured as Error & { status: number }).status, 409)
  assert.equal(released, true)
})
