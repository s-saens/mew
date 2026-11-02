import test, { type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { enableRemoteResources } from './remote-resources.ts'

const origin = 'https://app.mew.test'
const settle = async () => { for (let index = 0; index < 20; index++) await Promise.resolve() }
class Port {
  peer!: Port
  closed = false
  onmessage?: (event: { data: unknown }) => void
  postMessage(data: unknown) { queueMicrotask(() => { if (!this.peer.closed) this.peer.onmessage?.({ data }) }) }
  close() { this.closed = true }
}
class Channel {
  static channels: Channel[] = []
  port1 = new Port()
  port2 = new Port()
  constructor() { this.port1.peer = this.port2; this.port2.peer = this.port1; Channel.channels.push(this) }
}
class Events extends EventTarget {
  listeners = new Map<string, Set<EventListenerOrEventListenerObject>>()
  override addEventListener(type: string, callback: EventListenerOrEventListenerObject | null, options?: AddEventListenerOptions | boolean) {
    if (callback) { const listeners = this.listeners.get(type) ?? new Set(); listeners.add(callback); this.listeners.set(type, listeners) }
    super.addEventListener(type, callback, options)
  }
  override removeEventListener(type: string, callback: EventListenerOrEventListenerObject | null, options?: EventListenerOptions | boolean) {
    if (callback) this.listeners.get(type)?.delete(callback)
    super.removeEventListener(type, callback, options)
  }
}

function fixture(t: TestContext, options: { controlled?: boolean; script?: string; scope?: string; state?: string; active?: boolean; version?: number; silent?: boolean; replaceDuringProbe?: boolean } = {}) {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  Channel.channels.length = 0
  const probes: unknown[] = []
  const controller = Object.assign(new Events(), { scriptURL: options.script ?? `${origin}/remote-resource-worker.js`, state: options.state ?? 'activated', postMessage(message: unknown, ports: Port[]) {
    probes.push(message)
    if (options.replaceDuringProbe) serviceWorker.controller = { ...controller }
    if (!options.silent) ports[0].postMessage({ type: 'mew-resource-ready', protocol: options.version ?? 1 })
  } })
  const registration = { active: options.active === false ? { ...controller } : controller, scope: options.scope ?? origin + '/' }
  let resolveRegister!: (value: typeof registration) => void, rejectRegister!: (error: Error) => void, registrations = 0
  const registered = new Promise<typeof registration>((resolve, reject) => { resolveRegister = resolve; rejectRegister = reject })
  const serviceWorker = Object.assign(new Events(), {
    controller: options.controlled === false ? null : controller,
    ready: Promise.resolve(registration),
    getRegistration: async () => registration,
    register: async () => { registrations++; return registered },
  })
  const window = new Events(), previous = new Map<string, PropertyDescriptor | undefined>()
  for (const [name, value] of Object.entries({ navigator: { serviceWorker }, location: { origin }, window, MessageChannel: Channel })) {
    previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name)); Object.defineProperty(globalThis, name, { configurable: true, value })
  }
  t.after(() => {
    window.dispatchEvent(new Event('pagehide'))
    for (const [name, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name) }
  })
  return { serviceWorker, registration, controller, window, probes, registrations: () => registrations, resolveRegister: () => resolveRegister(registration), rejectRegister,
    activate() { serviceWorker.controller = controller; registration.active = controller; serviceWorker.dispatchEvent(new Event('controllerchange')) },
  }
}

test('a live exact worker answers a versioned probe and releases warm startup while registration remains pending', async t => {
  const f = fixture(t)
  const dispose = await enableRemoteResources()
  await settle()
  assert.equal(f.registrations(), 1, 'still check the public worker script for updates')
  assert.deepEqual(f.probes, [{ type: 'mew-resource-ready', protocol: 1 }])
  assert.equal(Channel.channels[0].port1.closed, true)
  assert.equal(Channel.channels[0].port2.closed, true)
  assert.equal(f.serviceWorker.listeners.get('message')?.size, 1)
  dispose()
  assert.equal(f.serviceWorker.listeners.get('message')?.size, 0)
  assert.equal(f.window.listeners.get('pagehide')?.size, 0)
})

test('an update failure does not interrupt a controller whose resource protocol was already verified', async t => {
  const f = fixture(t), dispose = await enableRemoteResources()
  f.rejectRegister(new Error('fixture update network failure'))
  await settle()
  assert.equal(f.serviceWorker.listeners.get('message')?.size, 1)
  dispose()
})

test('first installation still waits for successful registration and the exact active controller', async t => {
  const f = fixture(t, { controlled: false })
  let ready = false
  const pending = enableRemoteResources().then(dispose => { ready = true; return dispose })
  await settle()
  assert.equal(f.registrations(), 1)
  assert.equal(ready, false)
  assert.deepEqual(f.probes, [])
  f.resolveRegister()
  await settle()
  assert.equal(ready, false)
  f.activate()
  const dispose = await pending
  assert.equal(ready, true)
  dispose()
})

test('controller claim during activation finishes when that same worker later activates', async t => {
  const f = fixture(t, { controlled: false, state: 'activating' })
  const pending = enableRemoteResources()
  await settle(); f.resolveRegister(); await settle(); f.activate(); await settle()
  assert.equal(f.controller.listeners.get('statechange')?.size, 1)
  f.controller.state = 'activated'; f.controller.dispatchEvent(new Event('statechange'))
  const dispose = await pending
  assert.equal(f.controller.listeners.get('statechange')?.size, 0)
  dispose()
})

for (const [name, options] of [
  ['foreign script', { script: `${origin}/foreign-worker.js` }],
  ['other-origin script', { script: 'https://foreign.test/remote-resource-worker.js' }],
  ['query-bearing script', { script: `${origin}/remote-resource-worker.js?old=1` }],
  ['different scope', { scope: origin + '/launch/' }],
  ['inactive controller', { state: 'activating' }],
  ['different active worker', { active: false }],
  ['controller replaced during probe', { replaceDuringProbe: true }],
  ['incompatible protocol', { version: 2 }],
] as const) test(`${name} cannot bypass the awaited registration path`, async t => {
  const f = fixture(t, options)
  let ready = false
  const pending = enableRemoteResources().then(dispose => { ready = true; return dispose })
  await settle()
  assert.equal(f.registrations(), 1)
  assert.equal(ready, false)
  const rejected = assert.rejects(pending, /fixture registration failure/)
  f.rejectRegister(new Error('fixture registration failure'))
  await rejected
  assert.equal(f.serviceWorker.listeners.get('message')?.size, 0)
  assert.equal(f.window.listeners.get('pagehide')?.size, 0)
})

test('legacy workers without a readiness response use the bounded fallback and preserve registration errors', async t => {
  const f = fixture(t, { silent: true })
  const pending = enableRemoteResources()
  await settle()
  assert.equal(f.registrations(), 0)
  t.mock.timers.tick(39); await settle()
  assert.equal(f.registrations(), 0)
  t.mock.timers.tick(1); await settle()
  assert.equal(f.registrations(), 1)
  const rejected = assert.rejects(pending, /fixture registration failure/)
  f.rejectRegister(new Error('fixture registration failure'))
  await rejected
  assert.equal(Channel.channels[0].port1.closed, true)
})

for (const controlled of [true, false]) test(`page departure cancels pending ${controlled ? 'readiness' : 'controller'} waits and removes their listeners`, async t => {
    const f = fixture(t, { controlled, silent: true }), pending = enableRemoteResources()
    await settle()
    if (!controlled) { f.resolveRegister(); await settle(); assert.equal(f.serviceWorker.listeners.get('controllerchange')?.size, 1) }
    const rejected = assert.rejects(pending, { name: 'AbortError' })
    f.window.dispatchEvent(new Event('pagehide'))
    await rejected
    assert.equal(f.serviceWorker.listeners.get('message')?.size, 0)
    assert.equal(f.serviceWorker.listeners.get('controllerchange')?.size ?? 0, 0)
    assert.equal(f.window.listeners.get('pagehide')?.size, 0)
    for (const channel of Channel.channels) { assert.equal(channel.port1.closed, true); assert.equal(channel.port2.closed, true) }
})

test('a registration failure on the first visit remains a startup failure', async t => {
  const f = fixture(t, { controlled: false }), pending = enableRemoteResources()
  const rejected = assert.rejects(pending, /first install denied/)
  await settle(); f.rejectRegister(new Error('first install denied'))
  await rejected
  assert.equal(f.serviceWorker.listeners.get('message')?.size, 0)
})
