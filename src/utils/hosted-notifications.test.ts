import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createNotificationDelivery,
  getBrowserNotificationPermission,
  installHostedBrowserNotifications,
  onBrowserNotificationPermissionChange,
  requestBrowserNotificationPermissionForApp,
} from './browser-notifications.ts'

function fixture(t: { after(callback: () => void): void }) {
  const host = {} as { parent: unknown }
  host.parent = host
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', { value: host, configurable: true })
  const sent: Record<string, unknown>[] = []
  const port = { postMessage(message: Record<string, unknown>) { sent.push(message) } } as unknown as MessagePort
  const bridge = installHostedBrowserNotifications(port)
  t.after(() => {
    bridge.dispose()
    if (previous) Object.defineProperty(globalThis, 'window', previous)
    else Reflect.deleteProperty(globalThis, 'window')
  })
  return { bridge, sent, port }
}

test('hosted permission follows trusted parent state and permission requests are relayed synchronously', async t => {
  const f = fixture(t)
  assert.equal(getBrowserNotificationPermission(), 'unsupported')
  assert.deepEqual(f.sent, [{ type: 'mew-notification-state-request' }])
  let changes = 0
  const unsubscribe = onBrowserNotificationPermissionChange(() => changes++)
  t.after(unsubscribe)
  f.bridge.update({ type: 'mew-notification-state', permission: 'install-required' })
  assert.equal(getBrowserNotificationPermission(), 'install-required')
  f.bridge.update({ type: 'mew-notification-state', permission: 'unknown' })
  assert.equal(changes, 1)
  const request = requestBrowserNotificationPermissionForApp()
  const message = f.sent.at(-1)!
  assert.equal(message.type, 'mew-notification-permission-request', 'the user gesture is relayed before awaiting anything')
  f.bridge.update({ type: 'mew-notification-permission-result', requestId: message.requestId, permission: 'granted' })
  assert.equal(await request, 'granted')
  assert.equal(getBrowserNotificationPermission(), 'granted')
})

test('the permission prompt allows time for user input beyond worker setup deadlines', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const f = fixture(t)
  const permission = requestBrowserNotificationPermissionForApp().catch(error => error)
  const message = f.sent.at(-1)!
  t.mock.timers.tick(10_000)
  f.bridge.update({ type: 'mew-notification-permission-result', requestId: message.requestId, permission: 'granted' })
  assert.equal(await permission, 'granted')
})

test('hosted notifications use opaque actions and close prevents stale click navigation', async t => {
  const f = fixture(t)
  const clicked: string[] = []
  const delivery = createNotificationDelivery(id => clicked.push(id))
  t.after(() => delivery.dispose())
  const shown = delivery.show('mew · New chat message', 'opaque-id')
  const message = f.sent.at(-1)!
  assert.deepEqual(Object.keys(message).sort(), ['id', 'requestId', 'title', 'type'])
  assert.equal(message.type, 'mew-notification-show')
  f.bridge.update({ type: 'mew-notification-result', requestId: message.requestId, shown: true })
  assert.equal(await shown, true)
  f.bridge.update({ type: 'mew-notification-click', id: 'another-tab-id' })
  assert.deepEqual(clicked, [])
  f.bridge.update({ type: 'mew-notification-click', id: 'opaque-id' })
  assert.deepEqual(clicked, ['opaque-id'])
  delivery.close('opaque-id')
  f.bridge.update({ type: 'mew-notification-click', id: 'opaque-id' })
  assert.deepEqual(clicked, ['opaque-id'])
  assert.deepEqual(f.sent.at(-1), { type: 'mew-notification-close', id: 'opaque-id' })
})

test('disconnect resolves pending requests and drops notices and clicks from a previous connection', async t => {
  const f = fixture(t)
  const clicked: string[] = []
  const delivery = createNotificationDelivery(id => clicked.push(id))
  const shown = delivery.show('mew · New chat message', 'old-id')
  const message = f.sent.at(-1)!
  const permission = requestBrowserNotificationPermissionForApp()
  const failure = assert.rejects(permission, /timed out/)
  f.bridge.dispose()
  assert.equal(await shown, false)
  await failure
  f.bridge.update({ type: 'mew-notification-result', requestId: message.requestId, shown: true })
  f.bridge.update({ type: 'mew-notification-click', id: 'old-id' })
  assert.deepEqual(clicked, [])
  assert.equal(await delivery.show('mew', 'after-disconnect'), false)
  delivery.dispose()
})

test('replacing the hosted connection cancels its pending delivery and preserves only new permission state', async t => {
  const f = fixture(t)
  const delivery = createNotificationDelivery(() => assert.fail('stale action'))
  const old = delivery.show('mew', 'old-connection')
  const next = installHostedBrowserNotifications(f.port)
  t.after(() => next.dispose())
  assert.equal(await old, false)
  f.bridge.update({ type: 'mew-notification-state', permission: 'granted' })
  assert.equal(getBrowserNotificationPermission(), 'unsupported')
  next.update({ type: 'mew-notification-state', permission: 'denied' })
  assert.equal(getBrowserNotificationPermission(), 'denied')
  delivery.dispose()
})

test('an outdated parent times out without leaving a pending request or faking successful display', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  fixture(t)
  const delivery = createNotificationDelivery(() => {})
  t.after(() => delivery.dispose())
  const shown = delivery.show('mew', 'old-parent')
  t.mock.timers.tick(5000)
  assert.equal(await shown, false)
  assert.equal(getBrowserNotificationPermission(), 'unsupported')
})
