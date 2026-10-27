import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import vm from 'node:vm'
import { build } from 'rolldown'

const bundled = build({ input: 'virtual:remote-preview', write: false, platform: 'browser', output: { format: 'iife', name: 'Preview' }, plugins: [{
  name: 'preview-fixture',
  resolveId(id) {
    if (id === 'virtual:remote-preview' || id.endsWith('/remote-transport.ts') || id === './remote-transport.ts') return id === 'virtual:remote-preview' ? id : 'virtual:transport'
  },
  load(id) {
    if (id === 'virtual:remote-preview') return `export * from '${new URL('../src/utils/port-preview-remote.ts', import.meta.url).pathname}'`
    if (id === 'virtual:transport') return 'export const mewFetch=(...args)=>globalThis.fixtureFetch(...args);export const openMewSocket=()=>globalThis.fixtureSocket'
  },
}] }).then(result => result.output.find(value => value.type === 'chunk')!.code)

async function fixture() {
  const listeners = new Set<(event: unknown) => void>(), timers = new Set<() => void>(), requests: { path: string; method: string; signal?: AbortSignal }[] = []
  const socket = { closed: false, close() { this.closed = true } }
  const ports: { closed: boolean; close(): void; onmessage?: (event: unknown) => void }[] = []
  const posted: unknown[] = [], removed: string[] = []
  const contentWindow = { postMessage: (...args: unknown[]) => posted.push(args) }
  const frame = { contentWindow, src: '', referrerPolicy: '', removeAttribute: (name: string) => { removed.push(name); if (name === 'src') frame.src = '' } }
  const context = vm.createContext({
    crypto: { randomUUID: () => 'a'.repeat(32) },
    fixtureFetch: async (path: string, options: { method: string; signal?: AbortSignal }) => { requests.push({ path, ...options }); if (path.includes('/raw')) return new Promise(() => {}); return { ok: true, json: async () => ({ token: 'preview-session' }) } },
    fixtureSocket: socket, AbortController,
    MessageChannel: class { port1; port2; constructor() { this.port1 = { closed: false, close() { this.closed = true } }; this.port2 = { closed: false, close() { this.closed = true } }; ports.push(this.port1, this.port2) } },
    window: { addEventListener: (_type: string, listener: (event: unknown) => void) => listeners.add(listener), removeEventListener: (_type: string, listener: (event: unknown) => void) => listeners.delete(listener) },
    setTimeout: (callback: () => void) => { timers.add(callback); return callback },
    clearTimeout: (callback: () => void) => timers.delete(callback),
  })
  vm.runInContext(await bundled, context)
  const api = context.Preview as { configureRemotePortPreview(domain: string): void; mountRemotePortPreview(frame: unknown, options: { port: number }): Promise<() => void> }
  api.configureRemotePortPreview('preview.test')
  const pending = api.mountRemotePortPreview(frame, { port: 3333 })
  await new Promise(resolve => setImmediate(resolve))
  const emit = (type: string, overrides: Record<string, unknown> = {}) => { for (const listener of listeners) listener({ source: contentWindow, origin: 'https://' + 'a'.repeat(32) + '.preview.test', data: { type }, ...overrides }) }
  const cleaned = () => {
    assert.equal(listeners.size, 0); assert.equal(timers.size, 0); assert.equal(frame.src, '')
    assert.ok(ports.every(port => port.closed))
    assert.equal(requests.filter(request => request.method === 'DELETE').length, 1)
  }
  return { pending, emit, posted, timers, listeners, ports, requests, frame, socket, cleaned }
}

test('remote preview rejects missing DNS/TLS/launcher readiness and revokes its session', async () => {
  const state = await fixture()
  const rejection = assert.rejects(state.pending, /DNS·HTTPS·Worker/)
  state.emit('mew-preview-initialized')
  state.emit('mew-preview-ready', { origin: 'https://untrusted.test' })
  assert.equal(state.posted.length, 0)
  for (const expire of state.timers) expire()
  await rejection
  state.cleaned()
})

test('remote preview bounds Service Worker initialization and reports explicit launch failure', async () => {
  for (const outcome of ['timeout', 'failure']) {
    const state = await fixture()
    const rejection = assert.rejects(state.pending, outcome === 'timeout' ? /시간/ : /Service Worker/)
    state.emit('mew-preview-ready'); state.emit('mew-preview-ready')
    assert.equal(state.posted.length, 1)
    if (outcome === 'timeout') for (const expire of state.timers) expire()
    else state.emit('mew-preview-failed')
    await rejection
    state.cleaned()
  }
})

test('remote preview initialization timeout aborts in-flight requests and closes sockets', async () => {
  const state = await fixture()
  const rejection = assert.rejects(state.pending, /시간/)
  state.emit('mew-preview-ready')
  const transferred = () => ({ close() {}, postMessage() {} })
  state.ports[0]!.onmessage!({ data: { type: 'fetch', path: '/slow', method: 'GET', headers: [] }, ports: [transferred()] })
  state.ports[0]!.onmessage!({ data: { type: 'socket', path: '/hmr', protocols: [] }, ports: [transferred()] })
  assert.equal(state.requests[1]!.signal!.aborted, false)
  for (const expire of state.timers) expire()
  await rejection
  assert.equal(state.requests[1]!.signal!.aborted, true)
  assert.equal(state.socket.closed, true)
  state.cleaned()
})

test('remote preview resolves after initialization and releases resources exactly once', async () => {
  const state = await fixture()
  state.emit('mew-preview-ready'); state.emit('mew-preview-initialized')
  const cleanup = await state.pending
  assert.equal(state.timers.size, 0); assert.equal(state.listeners.size, 0)
  assert.equal(state.requests.length, 1)
  state.ports[0]!.onmessage!({ data: { type: 'closed' }, ports: [] })
  cleanup(); cleanup()
  state.cleaned()
})

const launcherCode = fs.readFile(new URL('../public/port-preview-launch.js', import.meta.url), 'utf8')
test('preview launcher reports Service Worker failure and successful initialization to its owner', async () => {
  for (const fails of [true, false]) {
    const posted: { type: string }[] = [], listeners = new Map<string, (event: unknown) => void>()
    const owner = 'https://app.mew.test', parent = { postMessage: (value: { type: string }) => posted.push(value) }
    let closed = false, mounted = false
    const context = vm.createContext({
      parent, location: { origin: 'https://preview.test' },
      window: { addEventListener: (type: string, listener: (event: unknown) => void) => listeners.set(type, listener) },
      document: { querySelector: () => ({ content: owner }), createElement: () => ({}), body: { replaceChildren: () => { mounted = true } } },
      navigator: { serviceWorker: { controller: {}, register: async () => { if (fails) throw new Error('registration blocked') }, ready: Promise.resolve(), addEventListener: () => {} } },
    })
    vm.runInContext(await launcherCode, context)
    listeners.get('message')!({ source: parent, origin: owner, data: { type: 'mew-preview-init', path: '/', port: 3333 }, ports: [{ postMessage() {}, close() { closed = true } }] })
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(posted[0]!.type, 'mew-preview-ready')
    assert.equal(posted[1]!.type, fails ? 'mew-preview-failed' : 'mew-preview-initialized')
    assert.equal(mounted, !fails); assert.equal(closed, fails)
  }
})
