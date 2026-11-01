import test, { type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { DOMRect } from 'happy-dom'
import { exportJWK, generateKeyPair, jwtVerify, SignJWT, type JWK } from 'jose'
import { connectRemote } from './remote-connection.ts'
import { activeRemoteTransport, DataChannelTransport, setRemoteTransport } from './remote-transport.ts'
import { initializeRemoteApp } from './remote-app.ts'
import { portPreviewUrl } from './port-preview-url.ts'
import { REMOTE_LIMITS, type RemoteFrame } from '../../shared/remote-access.ts'
import { AgentConnectionWatch } from './agent-connection-watch.ts'

class Wire extends EventTarget {
  readyState = 'open'
  bufferedAmount = 0
  frames: RemoteFrame[] = []
  send(data: string) { this.frames.push(JSON.parse(data)) }
  close() { this.readyState = 'closed'; this.dispatchEvent(new Event('close')) }
  message(frame: unknown) { this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(frame) })) }
}
class SocketConstants {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
}
class TestCloseEvent extends Event {
  code: number
  constructor(type: string, init: CloseEventInit) { super(type); this.code = init.code ?? 0 }
}
function globals(values: Record<string, unknown>) {
  values = { DOMRect, ...values }
  const previous = new Map<string, PropertyDescriptor | undefined>()
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { configurable: true, value })
  }
  return () => { for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key) } }
}
async function until(done: () => boolean) {
  const deadline = performance.now() + 2000
  while (performance.now() < deadline) { if (done()) return; await new Promise(resolve => setImmediate(resolve)) }
  assert.fail('Remote fixture did not finish')
}
function transportFixture(t: TestContext) {
  const restore = globals({ location: new URL('https://app.example.test'), WebSocket: SocketConstants, CloseEvent: TestCloseEvent })
  const wire = new Wire(), transport = new DataChannelTransport(wire as never)
  t.after(() => { transport.close(); restore() })
  return { wire, transport }
}

test('remote socket connection timing starts at transmission after admission and preserves monotonic zero', async t => {
  const { wire, transport } = transportFixture(t)
  for (let index = 0; index < REMOTE_LIMITS.streams; index++) await transport.forward({ type: 'request', id: `busy-${index}`, method: 'GET', path: '/api/files', headers: {} })
  const socket = transport.socket('/api/agent/ws') as WebSocket & { readonly connectionStartedAt?: number }
  await new Promise(resolve => setImmediate(resolve))
  assert.equal('connectionStartedAt' in socket, true)
  assert.equal(socket.connectionStartedAt, undefined)
  assert.equal(wire.frames.some(frame => frame.type === 'socket'), false)
  t.mock.method(performance, 'now', () => 0)
  wire.message({ type: 'end', id: 'busy-0' })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(wire.frames.some(frame => frame.type === 'socket'), true)
  assert.equal(socket.connectionStartedAt, 0)
  assert.equal(Object.getOwnPropertyDescriptor(Object.getPrototypeOf(socket), 'connectionStartedAt')?.set, undefined)
})

test('a locally queued remote agent handshake is not replaced before transmission and cancellation removes its wait', async t => {
  const { wire, transport } = transportFixture(t)
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_900_000_000_000 })
  let now = 1000
  t.mock.method(performance, 'now', () => now)
  for (let index = 0; index < REMOTE_LIMITS.streams; index++) await transport.forward({ type: 'request', id: `busy-${index}`, method: 'GET', path: '/api/files', headers: {} })
  const socket = transport.socket('/api/agent/ws') as WebSocket & { readonly connectionStartedAt?: number }
  let reconnects = 0
  const watch = new AgentConnectionWatch(socket, { available: () => true, reconnect: () => { reconnects++ } })
  t.after(() => watch.dispose())
  await new Promise(resolve => setImmediate(resolve))
  for (let interval = 0; interval < 9; interval++) { now += 3000; t.mock.timers.tick(3000) }
  assert.equal(reconnects, 0)
  assert.equal(socket.connectionStartedAt, undefined)
  watch.dispose()
  socket.close()
  assert.equal(socket.readyState, SocketConstants.CLOSED)
  wire.message({ type: 'end', id: 'busy-0' })
  await new Promise(resolve => setImmediate(resolve))
  now += 60_000; t.mock.timers.tick(60_000)
  assert.equal(wire.frames.some(frame => frame.type === 'socket'), false, 'a canceled admission cannot transmit a late socket open')
  assert.equal(transport.sockets.size, 0)
  assert.equal(reconnects, 0)
})

test('remote socket handshake timing excludes local DataChannel backpressure', async t => {
  const { wire, transport } = transportFixture(t)
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_900_000_000_000 })
  let now = 1000
  t.mock.method(performance, 'now', () => now)
  wire.bufferedAmount = REMOTE_LIMITS.queue + 1
  const socket = transport.socket('/api/agent/ws') as WebSocket & { readonly connectionStartedAt?: number }
  await new Promise(resolve => setImmediate(resolve))
  let reconnects = 0
  const watch = new AgentConnectionWatch(socket, { available: () => true, reconnect: () => { reconnects++ } })
  t.after(() => watch.dispose())
  now += 3000; t.mock.timers.tick(3000)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(socket.connectionStartedAt, undefined)
  assert.equal(reconnects, 0)
  wire.bufferedAmount = 0
  now += 10; t.mock.timers.tick(10)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(socket.connectionStartedAt, now)
  assert.equal(wire.frames.filter(frame => frame.type === 'socket').length, 1)
  now += 2999; t.mock.timers.tick(2999)
  assert.equal(reconnects, 0)
  now += 1; t.mock.timers.tick(1)
  assert.equal(reconnects, 1, 'the three-second response deadline starts only after the socket frame was sent')
})

test('reconnect interrupts active response bodies and writes while keeping the wire open for fresh reads and subscriptions', async t => {
  const { wire, transport } = transportFixture(t)
  const responsePromise = transport.fetch('/api/files')
  await until(() => wire.frames.length > 0)
  const id = wire.frames[0]!.id
  wire.message({ type: 'response', id, status: 200, headers: {}, responseWindow: 1 })
  const response = await responsePromise, reading = assert.rejects(response.text(), /결과를 확인/)
  const pending = assert.rejects(transport.fetch('/api/files', { method: 'POST', body: 'once' }), /결과를 확인/)
  const socket = transport.socket('/api/presence')
  let closed = 0
  socket.onclose = event => { assert.equal(event.code, 1006); closed++ }
  transport.suspendForReconnect()
  await Promise.all([reading, pending])
  assert.equal(closed, 1)
  assert.equal(transport.closed, false)
  assert.equal(wire.readyState, 'open')
  assert.equal(transport.requests.size, 0)
  assert.equal(transport.sockets.size, 0)
  const fresh = transport.fetch('/api/files')
  const retry = transport.socket('/api/presence')
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(retry.readyState, SocketConstants.CONNECTING)
  const beforeResume = wire.frames.length
  transport.resumeAfterReconnect()
  await until(() => wire.frames.slice(beforeResume).some(frame => frame.type === 'request') && wire.frames.some(frame => frame.type === 'socket'))
  const freshFrame = wire.frames.filter(frame => frame.type === 'request').at(-1)!
  wire.message({ type: 'response', id: freshFrame.id, status: 204, headers: {} })
  wire.message({ type: 'end', id: freshFrame.id })
  assert.equal((await fresh).status, 204)
  assert.equal(wire.frames.filter(frame => frame.type === 'request' && frame.method === 'GET').length, 2, 'an interrupted response body is never replayed')
  const subscription = wire.frames.find(frame => frame.type === 'socket')!
  wire.message({ type: 'open', id: subscription.id })
  assert.equal(retry.readyState, SocketConstants.OPEN)
})

for (const method of ['GET', 'HEAD']) {
  test(`${method} reads started during recovery wait and complete on the same transport`, async t => {
    const { wire, transport } = transportFixture(t)
    transport.suspendForReconnect()
    let settled = false
    const reading = transport.fetch('/api/files', { method }).finally(() => { settled = true })
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(settled, false)
    assert.deepEqual(wire.frames, [])
    transport.resumeAfterReconnect()
    await until(() => wire.frames.some(frame => frame.type === 'request'))
    const request = wire.frames.find(frame => frame.type === 'request')!
    assert.equal(request.type === 'request' && request.method, method)
    wire.message({ type: 'response', id: request.id, status: 204, headers: {} })
    wire.message({ type: 'end', id: request.id })
    assert.equal((await reading).status, 204)
    assert.equal(transport.closed, false)
  })

  test(`${method} interrupted before response headers is retried once after recovery`, async t => {
    const { wire, transport } = transportFixture(t)
    const reading = transport.fetch('/api/files', { method })
    await until(() => wire.frames.some(frame => frame.type === 'request'))
    const first = wire.frames.find(frame => frame.type === 'request')!
    transport.suspendForReconnect()
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(wire.frames.filter(frame => frame.type === 'request').length, 1)
    transport.resumeAfterReconnect()
    await until(() => wire.frames.filter(frame => frame.type === 'request').length === 2)
    const retry = wire.frames.filter(frame => frame.type === 'request').at(-1)!
    assert.notEqual(retry.id, first.id)
    wire.message({ type: 'response', id: first.id, status: 403, headers: {} })
    wire.message({ type: 'end', id: first.id })
    wire.message({ type: 'response', id: retry.id, status: 204, headers: {} })
    wire.message({ type: 'end', id: retry.id })
    assert.equal((await reading).status, 204)
    assert.equal(wire.frames.filter(frame => frame.type === 'request').length, 2)
  })
}

test('safe response headers queued just before suspension are not exposed from an obsolete generation', async t => {
  const { wire, transport } = transportFixture(t)
  const reading = transport.fetch('/api/files')
  await until(() => wire.frames.some(frame => frame.type === 'request'))
  const first = wire.frames.find(frame => frame.type === 'request')!
  wire.message({ type: 'response', id: first.id, status: 403, headers: {} })
  wire.message({ type: 'end', id: first.id })
  transport.suspendForReconnect(); transport.resumeAfterReconnect()
  await until(() => wire.frames.filter(frame => frame.type === 'request').length === 2)
  const retry = wire.frames.filter(frame => frame.type === 'request').at(-1)!
  wire.message({ type: 'response', id: retry.id, status: 204, headers: {} })
  wire.message({ type: 'end', id: retry.id })
  assert.equal((await reading).status, 204)
})

test('safe reads awaiting stream admission recover without replaying the previous writes', async t => {
  const { wire, transport } = transportFixture(t)
  for (let index = 0; index < REMOTE_LIMITS.streams; index++) await transport.forward({ type: 'request', id: `write-${index}`, method: 'POST', path: '/api/files', headers: {} })
  const reading = transport.fetch('/api/files')
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(wire.frames.filter(frame => frame.type === 'request' && frame.method === 'GET').length, 0)
  transport.suspendForReconnect(); transport.resumeAfterReconnect()
  await until(() => wire.frames.some(frame => frame.type === 'request' && frame.method === 'GET'))
  const request = wire.frames.find(frame => frame.type === 'request' && frame.method === 'GET')!
  wire.message({ type: 'response', id: request.id, status: 204, headers: {} })
  wire.message({ type: 'end', id: request.id })
  assert.equal((await reading).status, 204)
  assert.equal(wire.frames.filter(frame => frame.type === 'request' && frame.method === 'POST').length, REMOTE_LIMITS.streams)
})

test('suspended writes fail without being queued or sent after recovery', async t => {
  const { wire, transport } = transportFixture(t)
  transport.suspendForReconnect()
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) await assert.rejects(transport.fetch('/api/files', { method, body: 'once' }), /결과를 확인/)
  transport.resumeAfterReconnect()
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(wire.frames, [])
})

test('aborted recovery reads and closed subscriptions are removed without sending on resume', async t => {
  const { wire, transport } = transportFixture(t)
  transport.suspendForReconnect()
  const abort = new AbortController()
  const reading = assert.rejects(transport.fetch('/api/files', { signal: abort.signal }), { name: 'AbortError' })
  const socket = transport.socket('/api/presence')
  let closed = 0
  socket.onclose = () => closed++
  abort.abort(); socket.close()
  await reading
  transport.resumeAfterReconnect()
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(wire.frames, [])
  assert.equal(socket.readyState, SocketConstants.CLOSED)
  assert.equal(closed, 1)
})

test('recovery waiting is bounded and releases aborted and closed requests', async t => {
  const { wire, transport } = transportFixture(t)
  transport.suspendForReconnect()
  const abort = new AbortController()
  const first = assert.rejects(transport.fetch('/api/files', { signal: abort.signal }), { name: 'AbortError' })
  const waiting = Array.from({ length: REMOTE_LIMITS.streams * 4 - 1 }, () => assert.rejects(transport.fetch('/api/files'), /연결이 종료/))
  await assert.rejects(transport.fetch('/api/files'), /대기열이 가득/)
  abort.abort(); await first
  waiting.push(assert.rejects(transport.fetch('/api/files'), /연결이 종료/))
  transport.close()
  await Promise.all(waiting)
  assert.equal(transport.requests.size, 0)
  assert.deepEqual(wire.frames, [])
})

test('terminal close rejects recovery reads and closes waiting subscriptions exactly once', async t => {
  const { wire, transport } = transportFixture(t)
  transport.suspendForReconnect()
  const reading = assert.rejects(transport.fetch('/api/files'), /연결이 종료/)
  const socket = transport.socket('/api/presence')
  let closed = 0
  socket.onclose = () => closed++
  transport.close(); transport.resumeAfterReconnect()
  await reading
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(wire.frames, [])
  assert.equal(socket.readyState, SocketConstants.CLOSED)
  assert.equal(closed, 1)
  assert.equal(transport.sockets.size, 0)
})

test('a reconnect never replays writes waiting for backpressure or admission into the replacement bridge', async t => {
  const { wire, transport } = transportFixture(t)
  const request = (id: string): RemoteFrame => ({ type: 'request', id, method: 'POST', path: '/api/files', headers: {} })
  for (let i = 0; i < REMOTE_LIMITS.streams; i++) await transport.forward(request(`active-${i}`))
  const queued = transport.forward(request('queued-write'))
  const queuedBody = transport.forward({ type: 'chunk', id: 'queued-write', data: btoa('command') })
  wire.bufferedAmount = REMOTE_LIMITS.queue + 1
  const buffered = transport.forward({ type: 'chunk', id: 'active-0', data: btoa('command') })
  const settled = Promise.allSettled([queued, queuedBody, buffered])
  transport.suspendForReconnect()
  wire.frames = []
  transport.resumeAfterReconnect()
  wire.bufferedAmount = 0
  await settled
  assert.deepEqual(wire.frames, [])
  await transport.forward(request('fresh-write'))
  assert.deepEqual(wire.frames.map(frame => frame.id), ['fresh-write'])
})

test('queued fetches and uploads cannot survive a suspend and immediate resume', async t => {
  const { wire, transport } = transportFixture(t)
  wire.bufferedAmount = REMOTE_LIMITS.queue + 1
  const pending = Array.from({ length: REMOTE_LIMITS.streams + 1 }, () => transport.fetch('/api/files', { method: 'POST', body: 'command' }))
  const settled = Promise.allSettled(pending)
  await until(() => transport.requests.size === REMOTE_LIMITS.streams)
  transport.suspendForReconnect()
  transport.resumeAfterReconnect()
  wire.bufferedAmount = 0
  assert.ok((await settled).every(result => result.status === 'rejected'))
  await new Promise(resolve => setTimeout(resolve, 15))
  assert.deepEqual(wire.frames, [])
  assert.equal(transport.closed, false)
})

test('app reconnect controls preserve the MessagePort and announce verified recovery exactly once', async t => {
  const browser = new EventTarget(), frames: RemoteFrame[] = []
  let launcherPort!: MessagePort, handshakes = 0, online = 0, recovered = 0
  browser.addEventListener('online', () => online++)
  browser.addEventListener('mew:remote-reconnected', () => {
    recovered++
    assert.equal((activeRemoteTransport() as DataChannelTransport).suspended, false)
  })
  const restore = globals({ location: new URL('https://app.example.test/__mew_ui/abcdefghijklmnopqrst/index.html'), window: browser, WebSocket: SocketConstants, CloseEvent: TestCloseEvent, parent: { postMessage(_value: unknown, _origin: string, ports: MessagePort[]) {
    handshakes++
    launcherPort = ports[0]!
    launcherPort.onmessage = ({ data }) => {
      if (typeof data !== 'string') return
      const frame = JSON.parse(data) as RemoteFrame
      frames.push(frame)
      if (frame.type === 'request' && frame.path === '/api/auth/me') {
        launcherPort.postMessage(JSON.stringify({ type: 'response', id: frame.id, status: 200, headers: {}, responseWindow: 1 }))
        launcherPort.postMessage(JSON.stringify({ type: 'chunk', id: frame.id, data: btoa(JSON.stringify({ authenticated: true, email: 'user@example.test' })) }))
        launcherPort.postMessage(JSON.stringify({ type: 'end', id: frame.id }))
      }
    }
    launcherPort.postMessage({ type: 'mew-app-context', instance: 'instance', previewBaseUrl: 'https://mew.run/user/home' })
  } } })
  t.after(() => { browser.dispatchEvent(new Event('pagehide')); setRemoteTransport(null); launcherPort?.close(); restore() })
  assert.equal((await initializeRemoteApp()).email, 'user@example.test')
  assert.equal(portPreviewUrl(5555), 'https://mew.run/user/home/5555')
  const transport = activeRemoteTransport() as DataChannelTransport
  const pending = assert.rejects(transport.fetch('/api/files', { method: 'POST', body: 'write-once' }), /결과를 확인/)
  await until(() => frames.some(frame => frame.type === 'request' && frame.path === '/api/files'))
  launcherPort.postMessage({ type: 'mew-app-reconnecting' })
  await pending
  assert.equal(transport.suspended, true)
  assert.equal(recovered, 0)
  assert.equal(transport.channel.readyState, 'open')
  const waitingRead = transport.fetch('/api/auth/me')
  launcherPort.postMessage({ type: 'mew-app-reconnected' })
  launcherPort.postMessage({ type: 'mew-app-reconnected' })
  await until(() => online === 1)
  assert.equal(recovered, 1)
  assert.equal(activeRemoteTransport(), transport)
  assert.equal(transport.suspended, false)
  assert.equal((await waitingRead).status, 200)
  assert.equal(portPreviewUrl(5555), 'https://mew.run/user/home/5555')
  assert.equal(handshakes, 1)
  const fresh = transport.fetch('/api/auth/me')
  assert.equal((await fresh).status, 200)
  assert.equal(frames.filter(frame => frame.type === 'request' && frame.method === 'POST').length, 1)
})

function bootstrapFixture(t: TestContext, reconnecting = false, authStatusPending = false) {
  const browser = new EventTarget(), frames: RemoteFrame[] = []
  let launcherPort!: MessagePort, handshakes = 0
  const restore = globals({ location: new URL('https://app.example.test/__mew_ui/abcdefghijklmnopqrst/index.html'), window: browser, WebSocket: SocketConstants, CloseEvent: TestCloseEvent, parent: { postMessage(_value: unknown, _origin: string, ports: MessagePort[]) {
    handshakes++; launcherPort = ports[0]!
    launcherPort.onmessage = ({ data }) => { if (typeof data === 'string') frames.push(JSON.parse(data)) }
    launcherPort.postMessage({ type: 'mew-app-context', instance: 'instance', reconnecting, authStatusPending, initialAuth: reconnecting ? { authenticated: true, email: 'stale@example.test', role: 'owner', mustChangePassword: false } : undefined })
  } } })
  const initializing = initializeRemoteApp()
  void initializing.catch(() => {})
  t.after(() => { browser.dispatchEvent(new Event('pagehide')); setRemoteTransport(null); launcherPort?.close(); restore() })
  const send = (value: unknown) => launcherPort.postMessage(typeof value === 'string' ? value : JSON.stringify(value))
  return { initializing, frames, handshakes: () => handshakes, control: (type: string) => launcherPort.postMessage({ type }), authStatus: (status: unknown) => launcherPort.postMessage({ type: 'mew-app-auth-status', status }), status: (email = 'user@example.test') => launcherPort.postMessage({ type: 'mew-app-auth-status', status: { authenticated: true, email, role: 'owner', mustChangePassword: false } }), send, reply(id: string, email = 'user@example.test') {
    send({ type: 'response', id, status: 200, headers: {}, responseWindow: 1 })
    send({ type: 'chunk', id, data: btoa(JSON.stringify({ authenticated: true, email })) })
    send({ type: 'end', id })
  } }
}

test('app bootstrap shares the launcher authentication already in flight without another GET', async t => {
  const fixture = bootstrapFixture(t, false, true)
  await until(() => activeRemoteTransport() !== null)
  assert.throws(() => portPreviewUrl(5555), /기기 주소/)
  assert.deepEqual(fixture.frames, [])
  fixture.status()
  assert.equal((await fixture.initializing).email, 'user@example.test')
  assert.deepEqual(fixture.frames, [])
})

test('shared authentication waits for recovery and cannot use the previous connection status', async t => {
  const fixture = bootstrapFixture(t, true, true)
  let settled = false
  void fixture.initializing.then(() => { settled = true })
  await until(() => (activeRemoteTransport() as DataChannelTransport | null)?.suspended === true)
  fixture.status('current@example.test')
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(settled, false)
  fixture.control('mew-app-reconnected')
  assert.equal((await fixture.initializing).email, 'current@example.test')
  assert.deepEqual(fixture.frames, [])
})

test('disconnect rejects a bootstrap waiting for the launcher authentication result', async t => {
  const fixture = bootstrapFixture(t, false, true)
  const rejected = assert.rejects(fixture.initializing, /연결이 종료/)
  await until(() => activeRemoteTransport() !== null)
  fixture.control('mew-app-disconnected')
  await rejected
  assert.deepEqual(fixture.frames, [])
})

test('an invalid shared authentication result fails closed instead of entering the app or waiting indefinitely', async t => {
  const fixture = bootstrapFixture(t, false, true)
  const rejected = assert.rejects(fixture.initializing, /연결이 종료/)
  await until(() => activeRemoteTransport() !== null)
  fixture.authStatus({ authenticated: true, email: 'user@example.test', role: 'invalid', mustChangePassword: false })
  await rejected
  assert.equal((activeRemoteTransport() as DataChannelTransport).closed, true)
  assert.deepEqual(fixture.frames, [])
})

test('app bootstrap waits for recovery when its initial context is already reconnecting', async t => {
  const fixture = bootstrapFixture(t, true)
  await until(() => (activeRemoteTransport() as DataChannelTransport | null)?.suspended === true)
  assert.deepEqual(fixture.frames, [])
  fixture.control('mew-app-reconnected')
  await until(() => fixture.frames.some(frame => frame.type === 'request'))
  const request = fixture.frames.find(frame => frame.type === 'request')!
  fixture.reply(request.id)
  assert.equal((await fixture.initializing).email, 'user@example.test')
  assert.equal(fixture.handshakes(), 1)
  assert.equal(fixture.frames.filter(frame => frame.type === 'request').length, 1)
})

for (const stage of ['headers', 'body']) {
  test(`app bootstrap retries only its initial authentication GET after ${stage} are interrupted by a fast reconnect`, async t => {
    const fixture = bootstrapFixture(t)
    await until(() => fixture.frames.some(frame => frame.type === 'request'))
    const first = fixture.frames.find(frame => frame.type === 'request')!
    if (stage === 'body') fixture.send({ type: 'response', id: first.id, status: 200, headers: {}, responseWindow: 1 })
    const transport = activeRemoteTransport() as DataChannelTransport
    const interruptedWrite = assert.rejects(transport.fetch('/api/files', { method: 'POST', body: 'once' }), /결과를 확인/)
    await until(() => fixture.frames.some(frame => frame.type === 'request' && frame.method === 'POST'))
    fixture.control('mew-app-reconnecting'); fixture.control('mew-app-reconnected')
    await until(() => fixture.frames.filter(frame => frame.type === 'request' && frame.path === '/api/auth/me').length === 2)
    await interruptedWrite
    const latest = fixture.frames.filter(frame => frame.type === 'request' && frame.path === '/api/auth/me').at(-1)!
    if (stage === 'headers') fixture.reply(first.id, 'stale@example.test')
    else fixture.send({ type: 'end', id: first.id })
    fixture.reply(latest.id)
    assert.equal((await fixture.initializing).email, 'user@example.test')
    assert.equal(fixture.handshakes(), 1)
    assert.equal(activeRemoteTransport(), transport)
    assert.equal(fixture.frames.filter(frame => frame.type === 'request' && frame.method === 'POST').length, 1)
  })
}

test('a malformed authentication body after header recovery fails without a third request', async t => {
  const fixture = bootstrapFixture(t)
  const rejected = assert.rejects(fixture.initializing, SyntaxError)
  await until(() => fixture.frames.some(frame => frame.type === 'request'))
  fixture.control('mew-app-reconnecting'); fixture.control('mew-app-reconnected')
  await until(() => fixture.frames.filter(frame => frame.type === 'request').length === 2)
  const retry = fixture.frames.filter(frame => frame.type === 'request').at(-1)!
  fixture.send({ type: 'response', id: retry.id, status: 200, headers: {}, responseWindow: 1 })
  fixture.send({ type: 'chunk', id: retry.id, data: btoa('invalid JSON') })
  fixture.send({ type: 'end', id: retry.id })
  await rejected
  assert.equal(fixture.frames.filter(frame => frame.type === 'request').length, 2)
})

test('disconnecting during app bootstrap rejects the recovery waiter and closes the transport', async t => {
  const fixture = bootstrapFixture(t, true)
  const rejected = assert.rejects(fixture.initializing, /연결이 종료/)
  await until(() => (activeRemoteTransport() as DataChannelTransport | null)?.suspended === true)
  const transport = activeRemoteTransport() as DataChannelTransport
  fixture.control('mew-app-disconnected')
  await rejected
  assert.equal(transport.closed, true)
  assert.equal(activeRemoteTransport(), null)
  assert.deepEqual(fixture.frames, [])
})

const fingerprint = Array(32).fill('AB').join(':')
const sdp = `v=0\r\na=fingerprint:sha-256 ${fingerprint}\r\n`
class Peer {
  static latest: Peer
  channel = new Wire()
  connectionState = 'new'
  constructor() { Peer.latest = this }
  createDataChannel() { return this.channel }
  async createOffer() { return { type: 'offer', sdp } }
  async setLocalDescription() {}
  close() { this.connectionState = 'closed' }
}
class Signal extends SocketConstants {
  static latest: Signal
  readyState = 1
  frames: Record<string, unknown>[] = []
  onmessage?: (event: { data: string }) => void
  onclose?: () => void
  constructor() { super(); Signal.latest = this }
  send(data: string) { this.frames.push(JSON.parse(data)) }
  close() { if (this.readyState === 3) return; this.readyState = 3; this.onclose?.() }
  message(value: unknown) { this.onmessage?.({ data: JSON.stringify(value) }) }
}
function connectionFixture(t: TestContext, key: JWK = {}, options: Parameters<typeof connectRemote>[2] = {}) {
  const restore = globals({ RTCPeerConnection: Peer, WebSocket: Signal, location: new URL('https://app.example.test'), document: Object.assign(new EventTarget(), { visibilityState: 'visible' }), window: new EventTarget() })
  t.mock.method(globalThis, 'fetch', async () => Response.json(key))
  const states: string[] = []
  const close = connectRemote('instance', state => states.push(state), options)
  t.after(() => { close(); restore() })
  return { signal: Signal.latest, peer: Peer.latest, states }
}

test('reconnections reuse the supplied non-extractable browser key and export only its public key', async t => {
  const browser = await crypto.subtle.generateKey('Ed25519', false, ['sign', 'verify']) as CryptoKeyPair
  const central = await generateKeyPair('EdDSA'), host = await generateKeyPair('EdDSA')
  const { signal, peer, states } = connectionFixture(t, await exportJWK(central.publicKey), { keyPair: browser, session: 'stored-session' })
  signal.message({ type: 'challenge', protocol: 1 })
  await until(() => signal.frames.length > 0 || states.includes('error'))
  assert.equal(browser.privateKey.extractable, false)
  assert.deepEqual(signal.frames[0]!.publicKey, await exportJWK(browser.publicKey))
  assert.equal(JSON.stringify(signal.frames).includes('stored-session'), false)
  const ticket = await new SignJWT({ connection: 'connection', challenge: 'challenge', generation: 'generation', fingerprint, authMode: 'local', instanceKey: await exportJWK(host.publicKey) }).setProtectedHeader({ alg: 'EdDSA' }).setIssuer('https://app.example.test').setAudience('instance').setSubject('subject').setIssuedAt().setExpirationTime('60s').sign(central.privateKey)
  signal.message({ type: 'ticket', connection: 'connection', ticket })
  await until(() => peer.channel.frames.length > 0 || states.includes('error'))
  assert.equal(states.includes('error'), false)
  const authentication = peer.channel.frames[0] as unknown as { proof: string; session: string }
  const proof = await jwtVerify(authentication.proof, browser.publicKey, { issuer: 'mew-browser', audience: 'instance' })
  assert.equal(proof.payload.connection, 'connection')
  assert.equal(authentication.session, 'stored-session')
})

for (const [code, expected] of [['access-revoked', 'revoked'], ['permission-denied', 'denied'], ['offline', 'error'], ['connection-denied', 'error']]) {
  test(`signaling ${code} produces ${expected} so recovery can distinguish permission revocation`, async t => {
    const { signal, peer, states } = connectionFixture(t)
    signal.message({ type: 'error', code })
    await until(() => states.length > 0)
    assert.deepEqual(states, [expected])
    assert.equal(peer.channel.readyState, 'closed')
  })
}
