import test, { type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { primeRemoteSignal, takePrimedRemoteSignal } from './remote-signal-prime.ts'

class Signal extends EventTarget {
  static CLOSING = 2
  static instances: Signal[] = []
  readyState = 0
  closes = 0
  url: string
  protocols?: string[]
  constructor(url: string, protocols?: string[]) { super(); this.url = url; this.protocols = protocols; Signal.instances.push(this) }
  close() { if (this.readyState === 3) return; this.readyState = 3; this.closes++; this.dispatchEvent(new Event('close')) }
  message(data: unknown) { this.dispatchEvent(new MessageEvent('message', { data })) }
}
const url = 'wss://mew.example.test/central/signal?role=browser&bootstrap=1&owner=owner&name=home'
const protocols = ['mew-admission-v1', 'mew-admission.fixture.signed.capability']
function fixture(t: TestContext) {
  const browser = new EventTarget(), values = { location: new URL('https://mew.example.test/owner/home'), window: browser, WebSocket: Signal }
  const previous = new Map<string, PropertyDescriptor | undefined>()
  for (const [key, value] of Object.entries(values)) { previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, value }) }
  Signal.instances = []
  t.mock.timers.enable({ apis: ['setTimeout'] })
  t.after(() => { browser.dispatchEvent(new Event('pagehide')); for (const signal of Signal.instances) signal.close(); for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key) } })
  return browser
}

test('one exact controller adopts the early socket and its bounded FIFO once', t => {
  const browser = fixture(t)
  primeRemoteSignal(url, protocols); primeRemoteSignal(url, protocols)
  const socket = Signal.instances[0]!
  socket.message('{"type":"challenge"}'); socket.message('{"type":"error"}')
  const adopted = takePrimedRemoteSignal(url, protocols)!
  assert.equal(Signal.instances.length, 1)
  assert.equal(adopted.socket, socket)
  assert.deepEqual(adopted.messages.map(event => event.data), ['{"type":"challenge"}', '{"type":"error"}'])
  assert.equal(adopted.failed, false)
  assert.equal(takePrimedRemoteSignal(url, protocols), undefined)
  browser.dispatchEvent(new Event('pagehide')); t.mock.timers.tick(20_000)
  assert.equal(socket.closes, 0, 'the authenticated controller owns cleanup after adoption')
})

for (const changed of ['url', 'protocol']) test(`changed ${changed} discards the socket instead of crossing settings`, t => {
  fixture(t); primeRemoteSignal(url, protocols)
  assert.throws(() => takePrimedRemoteSignal(changed === 'url' ? url + '&hint=another-instance' : url, changed === 'protocol' ? ['mew-admission-v1', 'mew-admission.another.signed.capability'] : protocols), /연결 설정이 변경/)
  assert.equal(Signal.instances[0]!.closes, 1)
  assert.equal(takePrimedRemoteSignal(url, protocols), undefined)
})

for (const data of [42, 'A'.repeat(65_537), '가'.repeat(22_000)]) test(`the early queue rejects invalid or oversized ${typeof data} payloads`, t => {
  fixture(t); primeRemoteSignal(url, protocols)
  Signal.instances[0]!.message(data)
  const adopted = takePrimedRemoteSignal(url, protocols)!
  assert.equal(adopted.failed, true)
  assert.deepEqual(adopted.messages, [])
  assert.equal(Signal.instances[0]!.closes, 1)
})

test('more than eight buffered messages close the early socket', t => {
  fixture(t); primeRemoteSignal(url, protocols)
  for (let index = 0; index < 9; index++) Signal.instances[0]!.message('{}')
  assert.equal(takePrimedRemoteSignal(url, protocols)!.failed, true)
  assert.equal(Signal.instances[0]!.closes, 1)
})

test('duplicate starts cannot extend the ten second TTL and page exit cancels an unused socket', t => {
  const browser = fixture(t)
  primeRemoteSignal(url, protocols); t.mock.timers.tick(9999); primeRemoteSignal(url, protocols); t.mock.timers.tick(1)
  assert.equal(Signal.instances[0]!.closes, 1)
  assert.equal(takePrimedRemoteSignal(url, protocols), undefined)
  primeRemoteSignal(url, protocols); browser.dispatchEvent(new Event('pagehide'))
  assert.equal(Signal.instances[1]!.closes, 1)
})

test('transport failure remains visible to the full controller', t => {
  fixture(t); primeRemoteSignal(url, protocols); Signal.instances[0]!.dispatchEvent(new Event('error'))
  assert.equal(takePrimedRemoteSignal(url, protocols)!.failed, true)
})

test('a foreign shared-slot version closes only its socket and falls back without executing its callbacks', t => {
  fixture(t)
  const socket = new Signal(url)
  let called = false
  Object.defineProperty(window, Symbol.for('mewlink.remote-signal-prime'), { configurable: true, value: { version: 2, socket, dispose() { called = true } } })
  primeRemoteSignal(url, protocols)
  assert.equal(socket.closes, 1)
  assert.equal(called, false)
  assert.equal(Signal.instances.length, 2)
  assert.equal(takePrimedRemoteSignal(url, protocols)!.socket, Signal.instances[1])
})

test('a malformed shared slot cannot inject queued payloads or accessors into its controller', t => {
  fixture(t); primeRemoteSignal(url, protocols)
  const slot = Object.getOwnPropertyDescriptor(window, Symbol.for('mewlink.remote-signal-prime'))!.value
  slot.messages.push(new MessageEvent('message', { data: 'A'.repeat(65_537) }))
  assert.equal(takePrimedRemoteSignal(url, protocols), undefined)
  assert.equal(Signal.instances[0]!.closes, 1)
  let called = false
  Object.defineProperty(window, Symbol.for('mewlink.remote-signal-prime'), { configurable: true, get() { called = true; throw new Error('untrusted-accessor') } })
  primeRemoteSignal(url, protocols)
  assert.equal(called, false)
  assert.ok(takePrimedRemoteSignal(url, protocols))
})

for (const target of ['wss://other.example.test/central/signal?role=browser&bootstrap=1', 'ws://mew.example.test/central/signal?role=browser&bootstrap=1', 'wss://mew.example.test/api/workspace?role=browser&bootstrap=1']) test('only the same origin bootstrap signaling endpoint can be primed: ' + target, t => {
  fixture(t); assert.throws(() => primeRemoteSignal(target), /주소 설정/); assert.equal(Signal.instances.length, 0)
})
