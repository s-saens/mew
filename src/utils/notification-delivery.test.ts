import test from 'node:test'
import assert from 'node:assert/strict'
import { browserNotificationPermission, createBrowserNotificationDelivery, requestBrowserNotificationPermission } from '../../shared/browser-notifications.ts'

type Message = { source: unknown; origin: string; data: unknown }
const settle = async () => { for (let index = 0; index < 12; index++) await Promise.resolve() }

function fixture(options: { mobile?: boolean; worker?: boolean; pending?: boolean; handshake?: boolean; denied?: boolean } = {}) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const messages = new Set<(event: Message) => void>(), stateChanges = new Set<() => void>()
  const shown: { title: string; tag: string; silent: boolean; data: { protocol: string; id: string; clientId: string }; closed: boolean }[] = []
  const natives: NativeNotice[] = []
  const registrations: unknown[][] = []
  let permission: 'granted' | 'denied' | 'default' = options.denied ? 'denied' : 'granted'
  let permissionRequests = 0, constructorCalls = 0, portsClosed = 0
  class Port {
    peer!: Port
    onmessage: ((event: { data: unknown }) => void) | null = null
    postMessage(data: unknown) { this.peer.onmessage?.({ data }) }
    close() { portsClosed++ }
  }
  class NativeNotice {
    onclick: (() => void) | null = null
    onclose: (() => void) | null = null
    closed = false
    constructor(_title: string, _options: unknown) {
      constructorCalls++
      if (options.mobile) throw new TypeError('Illegal constructor. Use ServiceWorkerRegistration.showNotification() instead.')
      natives.push(this)
    }
    close() { this.closed = true }
    static get permission() { return permission }
    static requestPermission() { permissionRequests++; permission = 'granted'; return Promise.resolve(permission) }
  }
  const worker = {
    state: options.pending ? 'installing' : 'activated',
    postMessage(message: unknown, ports: Port[]) {
      assert.deepEqual(message, { type: 'mew-notification-client', protocol: 1 })
      if (options.handshake !== false) ports[0].postMessage({ type: 'mew-notification-client', protocol: 1, clientId: 'exact-client' })
    },
    addEventListener(_type: string, listener: () => void) { stateChanges.add(listener) },
    removeEventListener(_type: string, listener: () => void) { stateChanges.delete(listener) },
  }
  const registration = {
    active: options.pending ? null as typeof worker | null : worker,
    installing: options.pending ? worker : null,
    waiting: null,
    async showNotification(title: string, details: Omit<typeof shown[number], 'title' | 'closed'>) { shown.push({ title, ...details, closed: false }) },
    async getNotifications({ tag }: { tag: string }) { return shown.filter(notice => notice.tag === tag && !notice.closed).map(notice => ({ data: notice.data, close() { notice.closed = true } })) },
  }
  const target = {
    isSecureContext: true,
    location: { origin: 'https://mew.test' },
    navigator: {
      userAgent: '', platform: '', maxTouchPoints: 0, standalone: false,
      serviceWorker: options.worker === false ? undefined : {
        async register(...args: unknown[]) { registrations.push(args); return registration },
        addEventListener(_type: string, listener: (event: Message) => void) { messages.add(listener) },
        removeEventListener(_type: string, listener: (event: Message) => void) { messages.delete(listener) },
      },
    },
    Notification: NativeNotice as typeof NativeNotice | undefined,
    matchMedia(_query: string) { return { matches: false } },
    MessageChannel: class {
      port1 = new Port()
      port2 = new Port()
      constructor() { this.port1.peer = this.port2; this.port2.peer = this.port1 }
    },
  }
  Object.defineProperty(globalThis, 'window', { value: target, configurable: true })
  return {
    target, registration, worker, shown, natives, registrations, messages, stateChanges,
    get constructorCalls() { return constructorCalls }, get portsClosed() { return portsClosed }, get permissionRequests() { return permissionRequests },
    setPermission(value: typeof permission) { permission = value },
    click(id: string, overrides: Partial<Message> = {}) { for (const listener of messages) listener({ source: worker, origin: target.location.origin, data: { type: 'mew-notification-click', id }, ...overrides }) },
    restore() { if (original) Object.defineProperty(globalThis, 'window', original); else Reflect.deleteProperty(globalThis, 'window') },
  }
}

test('mobile notification uses a dedicated worker and routes clicks from only its active worker', async () => {
  const f = fixture({ mobile: true }), clicks: string[] = [], delivery = createBrowserNotificationDelivery(id => clicks.push(id))
  try {
    assert.equal(await delivery.show('Mew', 'opaque-notice'), true)
    assert.equal(f.constructorCalls, 0)
    assert.deepEqual(f.registrations, [['/notification-worker.js', { scope: '/__mew_notifications__/' }]])
    assert.deepEqual(f.shown[0], { title: 'Mew', tag: 'opaque-notice', silent: true, data: { protocol: 'mew-notification-v1', id: 'opaque-notice', clientId: 'exact-client' }, closed: false })
    f.click('opaque-notice', { origin: 'https://foreign.test' })
    f.click('opaque-notice', { source: {} })
    f.click('unknown')
    assert.deepEqual(clicks, [])
    f.click('opaque-notice')
    await settle()
    assert.deepEqual(clicks, ['opaque-notice'])
    assert.equal(f.shown[0].closed, true)
  } finally { delivery.dispose(); f.restore() }
})

test('denied permission does not register or show a notification', async () => {
  const f = fixture({ denied: true }), delivery = createBrowserNotificationDelivery(() => {})
  try {
    assert.equal(await delivery.show('Mew', 'id'), false)
    assert.deepEqual(f.registrations, [])
    assert.equal(f.constructorCalls, 0)
  } finally { delivery.dispose(); f.restore() }
})

test('activation is bounded and removes its state listener before desktop fallback', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const f = fixture({ pending: true }), delivery = createBrowserNotificationDelivery(() => {})
  try {
    const result = delivery.show('Mew', 'id')
    await settle()
    assert.equal(f.stateChanges.size, 1)
    context.mock.timers.tick(5_000)
    assert.equal(await result, true)
    assert.equal(f.stateChanges.size, 0)
    assert.equal(f.constructorCalls, 1)
  } finally { delivery.dispose(); f.restore() }
})

test('missing handshake times out and safely handles the mobile constructor rejection', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const f = fixture({ mobile: true, handshake: false }), delivery = createBrowserNotificationDelivery(() => {})
  try {
    const result = delivery.show('Mew', 'id')
    await settle()
    context.mock.timers.tick(5_000)
    assert.equal(await result, false)
    assert.equal(f.portsClosed, 2)
  } finally { delivery.dispose(); f.restore() }
})

test('dispose cancels activation and removes all owned listeners immediately', async () => {
  const f = fixture({ pending: true }), delivery = createBrowserNotificationDelivery(() => {})
  try {
    const result = delivery.show('Mew', 'id')
    await settle()
    delivery.dispose()
    assert.equal(await result, false)
    assert.equal(f.stateChanges.size, 0)
    assert.equal(f.messages.size, 0)
    assert.equal(f.constructorCalls, 0)
  } finally { delivery.dispose(); f.restore() }
})

test('late async worker shows are closed after disposal', async () => {
  const f = fixture()
  let complete!: () => void
  const originalShow = f.registration.showNotification.bind(f.registration)
  f.registration.showNotification = async (title, details) => { await new Promise<void>(resolve => { complete = resolve }); await originalShow(title, details) }
  const delivery = createBrowserNotificationDelivery(() => {})
  try {
    const result = delivery.show('Mew', 'id')
    await settle()
    assert.equal(typeof complete, 'function')
    delivery.dispose()
    complete()
    assert.equal(await result, false)
    assert.equal(f.shown[0].closed, true)
    assert.equal(f.messages.size, 0)
  } finally { delivery.dispose(); f.restore() }
})

test('desktop fallback routes and closes direct notices when no service worker exists', async () => {
  const f = fixture({ worker: false }), clicks: string[] = [], delivery = createBrowserNotificationDelivery(id => clicks.push(id))
  try {
    assert.equal(await delivery.show('Mew', 'desktop'), true)
    f.natives[0].onclick!()
    assert.deepEqual(clicks, ['desktop'])
    assert.equal(f.natives[0].closed, true)
    assert.equal(f.natives[0].onclick, null)
  } finally { delivery.dispose(); f.restore() }
})

test('only thirty owned notices remain active and disposal closes them', async () => {
  const f = fixture(), delivery = createBrowserNotificationDelivery(() => {})
  try {
    for (let index = 0; index < 32; index++) await delivery.show('Mew', String(index))
    await settle()
    assert.equal(f.shown.filter(value => !value.closed).length, 30)
    delivery.dispose()
    await settle()
    assert.equal(f.shown.filter(value => !value.closed).length, 0)
  } finally { delivery.dispose(); f.restore() }
})

test('iOS regular tabs require installation even when Notification is absent', () => {
  const f = fixture()
  try {
    f.target.navigator.userAgent = 'iPhone'
    f.target.Notification = undefined
    assert.equal(browserNotificationPermission(), 'install-required')
    f.target.navigator.standalone = true
    assert.equal(browserNotificationPermission(), 'unsupported')
  } finally { f.restore() }
})

test('iPad desktop agent and installed display modes are recognized', () => {
  const f = fixture()
  try {
    f.target.navigator.platform = 'MacIntel'
    f.target.navigator.maxTouchPoints = 5
    assert.equal(browserNotificationPermission(), 'install-required')
    f.target.matchMedia = query => ({ matches: query === '(display-mode: standalone)' })
    assert.equal(browserNotificationPermission(), 'granted')
    f.target.isSecureContext = false
    assert.equal(browserNotificationPermission(), 'unsupported')
  } finally { f.restore() }
})

test('permission request is invoked synchronously within the caller gesture', async () => {
  const f = fixture()
  try {
    f.setPermission('default')
    const result = requestBrowserNotificationPermission()
    assert.equal(f.permissionRequests, 1)
    assert.equal(await result, 'granted')
  } finally { f.restore() }
})

test('first installation waits for its own active worker without reading page-scope ready', async () => {
  const f = fixture({ pending: true }), delivery = createBrowserNotificationDelivery(() => {})
  Object.defineProperty(f.target.navigator.serviceWorker!, 'ready', { get() { throw new Error('Page-scope ready must never be read') } })
  try {
    const result = delivery.show('Mew', 'id')
    await settle()
    f.worker.state = 'activated'
    f.registration.active = f.worker
    for (const changed of f.stateChanges) changed()
    assert.equal(await result, true)
    assert.equal(f.constructorCalls, 0)
    assert.equal(f.stateChanges.size, 0)
  } finally { delivery.dispose(); f.restore() }
})

test('registration failures fall back without leaking a pending deadline', async () => {
  const f = fixture(), delivery = createBrowserNotificationDelivery(() => {})
  f.target.navigator.serviceWorker!.register = () => { throw new Error('Registration unavailable') }
  try {
    assert.equal(await delivery.show('Mew', 'id'), true)
    assert.equal(f.constructorCalls, 1)
  } finally { delivery.dispose(); f.restore() }
})

test('a stalled registration is bounded even when its promise never resolves', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const f = fixture(), delivery = createBrowserNotificationDelivery(() => {})
  f.target.navigator.serviceWorker!.register = () => new Promise(() => {})
  try {
    const result = delivery.show('Mew', 'id')
    await settle()
    context.mock.timers.tick(5_000)
    assert.equal(await result, true)
    assert.equal(f.constructorCalls, 1)
  } finally { delivery.dispose(); f.restore() }
})

test('closing a pending notice prevents its late async worker show from remaining visible', async () => {
  const f = fixture()
  let complete!: () => void
  const originalShow = f.registration.showNotification.bind(f.registration)
  f.registration.showNotification = async (title, details) => { await new Promise<void>(resolve => { complete = resolve }); await originalShow(title, details) }
  const delivery = createBrowserNotificationDelivery(() => {})
  try {
    const result = delivery.show('Mew', 'id')
    await settle()
    delivery.close('id')
    complete()
    assert.equal(await result, false)
    assert.equal(f.shown[0].closed, true)
  } finally { delivery.dispose(); f.restore() }
})
