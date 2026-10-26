import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'

const helper = new URL('./remote-access-rtc.mjs', import.meta.url).href
const connectivity = new URL('../native/remote-desktop/native-connectivity.mjs', import.meta.url).href
const offer = [
  'v=0', 'o=- 0 0 IN IP4 127.0.0.1', 's=-', 't=0 0', 'a=group:BUNDLE 0',
  'm=application 9 UDP/DTLS/SCTP webrtc-datachannel', 'c=IN IP4 0.0.0.0',
  'a=ice-ufrag:mew-lifetime-fixture', 'a=ice-pwd:mew-lifetime-fixture-password-1234',
  `a=fingerprint:sha-256 ${Array(32).fill('AA').join(':')}`,
  'a=setup:actpass', 'a=mid:0', 'a=sctp-port:5000', 'a=max-message-size:32768', '',
].join('\r\n')

test('pregathered native helper survives collection of its closed warmup channel before cleanup', { timeout: 20_000 }, async t => {
  const child = spawn(process.execPath, ['--expose-gc', '--experimental-test-module-mocks', '--input-type=module', '-e', `
    import { mock } from 'node:test';
    import { setImmediate as nextTurn } from 'node:timers/promises';
    mock.module(${JSON.stringify(connectivity)}, {
      namedExports: { nativeConnectivity: () => ({ candidate() {}, connected() {}, close() {} }) },
    });
    process.on('message', async value => {
      if (value?.type !== 'fixture-gc') return;
      for (let index = 0; index < 4; index++) { global.gc(); await nextTurn(); }
      process.send?.({ type: 'fixture-collected' });
    });
    await import(${JSON.stringify(helper)});
    process.send?.({ type: 'fixture-ready' });
  `], { env: { PATH: process.env.PATH }, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] })
  const seen = new Set<string>()
  const waiting = new Map<string, { resolve(): void; reject(error: Error): void }>()
  let ended = false, failure: Error | undefined
  const exit = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(resolve => {
    child.once('error', () => {
      ended = true
      failure = new Error('native helper could not start')
      for (const waiter of waiting.values()) waiter.reject(failure)
      waiting.clear(); resolve({ code: -1, signal: null })
    })
    child.once('exit', (code, signal) => {
      ended = true
      failure ??= new Error(`native helper exited: code=${code}, signal=${signal}, stages=${[...seen].join(',')}`)
      for (const waiter of waiting.values()) waiter.reject(failure)
      waiting.clear(); resolve({ code, signal })
    })
  })
  child.on('message', value => {
    if (!value || typeof value !== 'object' || !('type' in value) || typeof value.type !== 'string') return
    const type = value.type
    if (!['fixture-ready', 'preloaded', 'answer', 'fixture-collected', 'error'].includes(type)) return
    seen.add(type)
    if (type === 'error') {
      failure = new Error('native helper rejected the synthetic offer')
      for (const waiter of waiting.values()) waiter.reject(failure)
      waiting.clear(); return
    }
    waiting.get(type)?.resolve(); waiting.delete(type)
  })
  const timer = setTimeout(() => child.kill('SIGKILL'), 15_000)
  t.after(async () => {
    clearTimeout(timer)
    if (!ended) { child.kill('SIGKILL'); await exit }
  })
  const wait = (type: string) => {
    if (failure) return Promise.reject(failure)
    if (seen.has(type)) return Promise.resolve()
    return new Promise<void>((resolve, reject) => waiting.set(type, { resolve, reject }))
  }
  const send = (value: object) => new Promise<void>((resolve, reject) => {
    child.send(value, error => { if (error) reject(new Error('native helper IPC closed')); else resolve() })
  })
  await wait('fixture-ready')
  await send({ type: 'prewarm', stun: [] }); await wait('preloaded')
  await send({ type: 'start', stun: [], sdp: offer }); await wait('answer')
  await send({ type: 'fixture-gc' }); await wait('fixture-collected')
  await send({ type: 'close' })
  const result = await exit
  assert.deepEqual(result, { code: 0, signal: null })
  assert.equal(seen.has('error'), false)
})
