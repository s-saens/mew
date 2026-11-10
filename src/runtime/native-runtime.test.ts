import test from 'node:test'
import assert from 'node:assert/strict'
import type { TestContext } from 'node:test'
import { configureAppRuntime, getAppRuntime, appSocketUrl } from './app-runtime.ts'
import { NativeDirectTransport, NATIVE_HTTP_LIMIT } from './native-direct-transport.ts'
import { nativeDirectPath, nativeResourceUrl } from './native-direct-path.ts'
import { initializeNativeApp, isNativeDirectHost } from './native-runtime.ts'
import { type MewNativeBridge, type NativeDirectBridge } from './native-bridge.ts'
import { scopedWorkspaceUrl } from '../api/workspace-transport.ts'
import { publicMewBaseUrl, configurePortPreviewBaseUrl } from '../utils/port-preview-url.ts'
import { setBrowserStorageScope, remoteStorageName } from '@mew/ui/browser-storage-scope'

const auth = { authenticated: true, email: 'person@example.test', role: 'owner' as const, mustChangePassword: false, displayName: null, avatarDataUrl: null }
const encoded = (value: string) => Buffer.from(value).toString('base64')
const settle = () => new Promise(resolve => setImmediate(resolve))

function fixture(t: TestContext) {
  const calls: { method: string; value: unknown }[] = [], events = new EventTarget()
  const direct: NativeDirectBridge = {
    async reload() { calls.push({ method: 'reload', value: null }) },
    async fetch(value) { calls.push({ method: 'fetch', value }); return { status: 200, headers: [['content-type', 'application/json']], bodyBase64: encoded(JSON.stringify(auth)) } },
    async cancel(value) { calls.push({ method: 'cancel', value }) },
    async openSocket(value) { calls.push({ method: 'open', value }) },
    async sendSocket(value) { calls.push({ method: 'send', value }) },
    async closeSocket(value) { calls.push({ method: 'close', value }) },
  }
  const transport = new NativeDirectTransport(direct, events)
  t.after(() => transport.close())
  const socketEvent = (detail: object) => {
    const event = new Event('mew-native-socket')
    Object.defineProperty(event, 'detail', { value: detail }); events.dispatchEvent(event)
  }
  const oldClose = Object.getOwnPropertyDescriptor(globalThis, 'CloseEvent')
  class TestCloseEvent extends Event {
    code: number; reason: string; wasClean: boolean
    constructor(type: string, init: { code?: number; reason?: string; wasClean?: boolean }) { super(type); this.code = init.code ?? 1000; this.reason = init.reason ?? ''; this.wasClean = !!init.wasClean }
  }
  Object.defineProperty(globalThis, 'CloseEvent', { configurable: true, value: TestCloseEvent })
  t.after(() => { if (oldClose) Object.defineProperty(globalThis, 'CloseEvent', oldClose); else Reflect.deleteProperty(globalThis, 'CloseEvent') })
  return { direct, transport, events, calls, socketEvent }
}

function nativeHost(t: TestContext, direct: NativeDirectBridge) {
  let reloads = 0
  const window = Object.assign(new EventTarget(), { top: undefined as unknown })
  window.top = window
  const location = { href: 'mew-app://workspace/', protocol: 'mew-app:', host: 'workspace', origin: 'null', reload() { reloads++ } }
  const bridge: MewNativeBridge = {
    version: 1, connection: { kind: 'direct', endpoint: 'https://host.test', scope: 'direct:https://host.test' }, direct,
    cache: { async get() { return null }, async put() {}, async remove() {} },
    notifications: { async permission() { return 'default' }, async request() { return 'default' }, async show() { return false }, async close() {} },
  }
  for (const [key, value] of Object.entries({ window, location, mewNative: bridge })) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key)
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
    t.after(() => { if (original) Object.defineProperty(globalThis, key, original); else Reflect.deleteProperty(globalThis, key) })
  }
  t.after(() => { configureAppRuntime({}); setBrowserStorageScope(); configurePortPreviewBaseUrl() })
  return { bridge, location, reloads: () => reloads }
}

test('native paths stay on the selected local host and permit direct-only administration', () => {
  assert.equal(nativeDirectPath('/api/auth/setup'), '/api/auth/setup')
  assert.equal(nativeDirectPath('/api/remote-access/register'), '/api/remote-access/register')
  assert.equal(nativeDirectPath('ws://workspace/api/collab?room=example', true), '/api/collab?room=example')
  for (const value of ['https://foreign.test/api/file', '//foreign.test/api/file', '/api/a/../secret', '/api/%2e%2e/auth', '/api/a%2fb', '/api/.private', '/api/file#fragment', '/api/file?x=%0a', '/api/a\\b', '/assets/main.js']) assert.throws(() => nativeDirectPath(value), value)
  assert.throws(() => nativeDirectPath('/api/not-a-socket', true))
  assert.equal(nativeResourceUrl('/api/file/raw?path=a'), 'mew-app://workspace/api/file/raw?path=a')
  assert.equal(nativeResourceUrl('https://images.test/a.png'), 'https://images.test/a.png')
})

test('native HTTP preserves multipart bodies, safe request headers, and HTTP error statuses', async t => {
  const f = fixture(t), form = new FormData()
  form.set('message', 'Hello'); form.set('file', new Blob(['content'], { type: 'text/plain' }), 'note.txt')
  f.direct.fetch = async value => {
    assert.equal(value.path, '/api/upload?target=test')
    const headers = new Headers(value.headers)
    assert.match(headers.get('content-type')!, /^multipart\/form-data; boundary=/)
    assert.equal(headers.get('cookie'), null); assert.equal(headers.get('origin'), null)
    assert.match(Buffer.from(value.bodyBase64!, 'base64').toString(), /name="file"; filename="note.txt"/)
    return { status: 403, headers: [['content-type', 'text/plain'], ['set-cookie', 'secret=private'], ['content-encoding', 'gzip']], bodyBase64: encoded('Denied') }
  }
  const response = await f.transport.fetch('/api/upload?target=test', { method: 'POST', body: form, headers: { Cookie: 'secret=private', Origin: 'https://foreign.test' } })
  assert.equal(response.status, 403); assert.equal(await response.text(), 'Denied')
  assert.equal(response.headers.get('set-cookie'), null); assert.equal(response.headers.get('content-encoding'), null)
})

test('native HTTP rejects malformed bridge replies and preserves HEAD body semantics', async t => {
  const f = fixture(t)
  f.direct.fetch = async () => ({ status: 204, headers: [], bodyBase64: '' })
  assert.equal(await (await f.transport.fetch('/api/file', { method: 'HEAD' })).text(), '')
  f.direct.fetch = async () => ({ status: 200, headers: [], bodyBase64: 'bad!' })
  await assert.rejects(f.transport.fetch('/api/file'), /response body/)
  f.direct.fetch = async () => ({ status: 200, headers: [['x-test', 'bad\r\nheader']], bodyBase64: '' })
  await assert.rejects(f.transport.fetch('/api/file'), /response/)
  f.direct.fetch = async () => ({ status: 999, headers: [], bodyBase64: '' })
  await assert.rejects(f.transport.fetch('/api/file'), /response/)
})

test('native HTTP cancellation rejects immediately and ignores a late native result', async t => {
  const f = fixture(t), abort = new AbortController()
  let complete!: (value: Awaited<ReturnType<NativeDirectBridge['fetch']>>) => void
  f.direct.fetch = () => new Promise(resolve => { complete = resolve })
  const pending = f.transport.fetch('/api/file', { signal: abort.signal })
  await settle(); abort.abort()
  await assert.rejects(pending, { name: 'AbortError' })
  assert.equal(f.calls.filter(call => call.method === 'cancel').length, 1)
  complete({ status: 200, headers: [], bodyBase64: encoded('late') }); await settle()
  assert.equal(f.calls.filter(call => call.method === 'cancel').length, 1)
})

test('native request admission and request-body size are bounded', async t => {
  const f = fixture(t)
  f.direct.fetch = () => new Promise(() => {})
  const pending = Array.from({ length: 16 }, () => f.transport.fetch('/api/file'))
  const settled = Promise.allSettled(pending)
  await assert.rejects(f.transport.fetch('/api/file'), /queue is full/)
  f.transport.close(); assert.equal((await settled).filter(value => value.status === 'rejected').length, 16)
  const other = fixture(t)
  await assert.rejects(other.transport.fetch('/api/upload', { method: 'POST', body: new Uint8Array(NATIVE_HTTP_LIMIT + 1) }), /body is too large/)
  assert.equal(other.calls.filter(call => call.method === 'fetch').length, 0)
})

test('native sockets preserve text, binary snapshots, protocol selection, and event handlers', async t => {
  const f = fixture(t), ws = f.transport.socket('ws://workspace/api/collab', ['mew-collab'])
  const id = (f.calls[0].value as { id: string }).id, messages: unknown[] = []
  let opened = 0
  ws.onopen = () => opened++
  ws.onmessage = event => messages.push(event.data)
  assert.throws(() => ws.send('too soon'), { name: 'InvalidStateError' })
  f.socketEvent({ id, type: 'open', protocol: 'mew-collab' })
  assert.equal(opened, 1); assert.equal(ws.protocol, 'mew-collab')
  ws.binaryType = 'arraybuffer'
  f.socketEvent({ id, type: 'message', binary: false, bodyBase64: encoded('hello') })
  f.socketEvent({ id, type: 'message', binary: true, bodyBase64: 'AQID' })
  assert.equal(messages[0], 'hello'); assert.deepEqual(new Uint8Array(messages[1] as ArrayBuffer), new Uint8Array([1, 2, 3]))
  const bytes = new Uint8Array([7, 8]); ws.send(bytes); bytes.fill(0); ws.send('text')
  await settle()
  const sent = f.calls.filter(call => call.method === 'send').map(call => call.value as { binary: boolean; bodyBase64: string })
  assert.deepEqual(sent, [{ binary: true, bodyBase64: 'Bwg=', id }, { binary: false, bodyBase64: encoded('text'), id }])
  assert.equal(ws.bufferedAmount, 0)
  f.socketEvent({ id, type: 'close', code: 1000, wasClean: true })
  assert.equal(ws.readyState, ws.CLOSED)
})

test('socket close flushes accepted sends and hostile messages close only their own connection', async t => {
  const f = fixture(t), ws = f.transport.socket('/api/agent/ws'), id = (f.calls[0].value as { id: string }).id
  let errors = 0, closes = 0
  ws.onerror = () => errors++; ws.onclose = () => closes++
  f.socketEvent({ id, type: 'open', protocol: '' })
  ws.send('accepted'); ws.close(1000, 'done'); await settle()
  assert.deepEqual(f.calls.map(call => call.method), ['open', 'send', 'close'])
  f.socketEvent({ id, type: 'close', code: 1000, wasClean: true })
  assert.equal(closes, 1)
  f.socketEvent({ id, type: 'message', binary: true, bodyBase64: 'bad!' })
  assert.equal(errors, 0)
  const second = f.transport.socket('/api/agent/ws'), id2 = (f.calls.at(-1)!.value as { id: string }).id
  second.onerror = () => errors++
  f.socketEvent({ id: id2, type: 'open', protocol: '' })
  f.socketEvent({ id: id2, type: 'message', binary: true, bodyBase64: 'bad!' })
  assert.equal(errors, 1); assert.equal(second.readyState, second.CLOSED)
})

test('socket message and protocol limits reject before native work', async t => {
  const f = fixture(t)
  assert.throws(() => f.transport.socket('/api/agent/ws', ['duplicate', 'duplicate']), { name: 'SyntaxError' })
  const ws = f.transport.socket('/api/agent/ws'), id = (f.calls[0].value as { id: string }).id
  f.socketEvent({ id, type: 'open', protocol: '' })
  assert.throws(() => ws.send(new Uint8Array(1024 * 1024 + 1)), { name: 'QuotaExceededError' })
  assert.equal(f.calls.filter(call => call.method === 'send').length, 0)
  f.socketEvent({ id, type: 'close', code: 1009 })
})

test('native bootstrap isolates account storage and reloads once on identity change', async t => {
  const f = fixture(t), host = nativeHost(t, f.direct)
  assert.equal(isNativeDirectHost(host.bridge, 'https://host.test/'), false)
  const status = await initializeNativeApp()
  assert.deepEqual(status, auth)
  assert.equal(getAppRuntime().transport instanceof NativeDirectTransport, true)
  assert.match(remoteStorageName('draft'), /person@example.test.*direct:https:\/\/host.test/)
  assert.equal(getAppRuntime().onAuthChanged?.(auth), false)
  assert.equal(getAppRuntime().onAuthChanged?.({ ...auth, email: 'other@example.test' }), true)
  getAppRuntime().onAuthChanged?.({ ...auth, email: 'other@example.test' })
  assert.equal(f.calls.filter(call => call.method === 'reload').length, 1)
  assert.equal(host.reloads(), 0)
  assert.equal(publicMewBaseUrl(), 'https://host.test')
})

test('custom scheme preserves workspace API scope and browser-panel socket resolution', t => {
  const f = fixture(t); nativeHost(t, f.direct)
  const scope = { workspacePath: '/projects/mew', projectPath: '/projects/mew' }
  const relative = scopedWorkspaceUrl('/api/file?path=note.md', scope)
  assert.match(relative, /mewWorkspacePath=/)
  assert.match(scopedWorkspaceUrl('mew-app://workspace/api/file', scope), /^mew-app:\/\/workspace\/api\/file\?/)
  assert.equal(scopedWorkspaceUrl('https://foreign.test/api/file', scope), 'https://foreign.test/api/file')
  assert.equal(appSocketUrl('/api/browser-desktop/ws').href, 'https://workspace/api/browser-desktop/ws')
})

test('verified account IDs isolate recreated same-email users while email changes keep the identity', async t => {
  const f = fixture(t)
  nativeHost(t, f.direct)
  const current = { ...auth, accountId: 'account-original' }
  f.direct.fetch = async () => ({ status: 200, headers: [], bodyBase64: encoded(JSON.stringify(current)) })
  await initializeNativeApp()
  assert.match(remoteStorageName('draft'), /account-original/)
  assert.doesNotMatch(remoteStorageName('draft'), /person@example.test/)
  assert.equal(getAppRuntime().onAuthChanged?.({ ...current, email: 'renamed@example.test' }), false)
  assert.equal(getAppRuntime().onAuthChanged?.({ ...current, accountId: 'account-recreated' }), true)
  assert.equal(f.calls.filter(call => call.method === 'reload').length, 1)
})

test('ordinary browser bootstrap remains unchanged even when a page defines a native-looking global', async t => {
  const f = fixture(t), host = nativeHost(t, f.direct)
  host.location.href = 'https://host.test/'; host.location.protocol = 'https:'; host.location.origin = 'https://host.test'
  assert.equal(await initializeNativeApp(), undefined)
  assert.equal(getAppRuntime().transport, undefined)
  assert.equal(f.calls.length, 0)
})

test('native endpoint spelling may retain IPv6 or default-port forms without losing scope binding', t => {
  const f = fixture(t), host = nativeHost(t, f.direct)
  for (const endpoint of ['https://host.test:443', 'https://[0:0:0:0:0:0:0:1]:443']) {
    const bridge = { ...host.bridge, connection: { ...host.bridge.connection, endpoint, scope: `direct:${endpoint}` } }
    assert.equal(isNativeDirectHost(bridge, 'mew-app://workspace/'), true)
  }
  const foreignPath = { ...host.bridge, connection: { ...host.bridge.connection, endpoint: 'https://host.test/subpath', scope: 'direct:https://host.test/subpath' } }
  assert.equal(isNativeDirectHost(foreignPath, 'mew-app://workspace/'), false)
})
