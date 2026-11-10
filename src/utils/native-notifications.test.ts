import assert from 'node:assert/strict'
import test from 'node:test'
import { createNativeNotificationDelivery, nativeNotificationPermission, requestNativeNotificationPermission } from './native-notifications.ts'
import type { MewNativeBridge } from '../runtime/native-bridge.ts'

function fixture(t: test.TestContext) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'mewNative')
  const add = Object.getOwnPropertyDescriptor(globalThis, 'addEventListener')
  const remove = Object.getOwnPropertyDescriptor(globalThis, 'removeEventListener')
  const events = new EventTarget(), shown: string[] = [], closed: string[] = []
  let permission = 'denied', requested = 0
  const bridge = { version: 1, cache: {}, notifications: {
    permission: async () => permission,
    request: async () => { requested++; permission = 'granted'; return permission },
    show: async ({ id }: { id: string }) => { shown.push(id); return true },
    close: async ({ id }: { id: string }) => { closed.push(id) },
  } } as unknown as MewNativeBridge
  Object.defineProperty(globalThis, 'mewNative', { configurable: true, value: bridge })
  Object.defineProperty(globalThis, 'addEventListener', { configurable: true, value: events.addEventListener.bind(events) })
  Object.defineProperty(globalThis, 'removeEventListener', { configurable: true, value: events.removeEventListener.bind(events) })
  t.after(() => {
    for (const [key, descriptor] of [['mewNative', original], ['addEventListener', add], ['removeEventListener', remove]] as const) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  })
  return { bridge, shown, closed, requested: () => requested,
    foreground(next: string) { permission = next; events.dispatchEvent(new Event('mew:native-foreground')) },
    click(id: string) { const event = Object.assign(new Event('mew:native-notification-click'), { detail: { id } }); events.dispatchEvent(event) } }
}

test('native permission is read without prompting and explicit request updates subscribers', async t => {
  const f = fixture(t)
  let changes = 0
  assert.equal(nativeNotificationPermission(() => changes++), 'default')
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(nativeNotificationPermission(() => changes++), 'denied')
  assert.equal(f.requested(), 0)
  assert.equal(await requestNativeNotificationPermission(() => changes++), 'granted')
  assert.equal(f.requested(), 1)
  assert.equal(changes, 2)
})

test('only owned native notice IDs invoke click callbacks and disposal releases all notices', async t => {
  const f = fixture(t), clicks: string[] = []
  const delivery = createNativeNotificationDelivery(id => clicks.push(id))!
  assert.equal(await delivery.show('Agent completed', 'task-1'), true)
  f.click('foreign')
  f.click(f.shown[0])
  f.click(f.shown[0])
  assert.deepEqual(clicks, ['task-1'])
  assert.deepEqual(f.closed, [f.shown[0]])
  await delivery.show('Approval', 'task-2')
  delivery.dispose()
  f.click(f.shown[1])
  assert.deepEqual(clicks, ['task-1'])
  assert.equal(await delivery.show('After close', 'task-3'), false)
  assert.ok(f.closed.includes(f.shown[1]))
})

test('a notification finishing after disposal is closed instead of leaked', async t => {
  const f = fixture(t)
  let finish!: (value: boolean) => void
  let nativeId = ''
  f.bridge.notifications.show = ({ id }) => { nativeId = id; return new Promise(resolve => { finish = resolve }) }
  const delivery = createNativeNotificationDelivery(() => {})!
  const result = delivery.show('Pending', 'task-1')
  delivery.dispose()
  finish(true)
  assert.equal(await result, false)
  assert.ok(f.closed.includes(nativeId))
})

test('native delivery bounds active notices and survives permission or bridge failures', async t => {
  const f = fixture(t)
  const delivery = createNativeNotificationDelivery(() => {})!
  for (let index = 0; index < 31; index++) await delivery.show('Task', String(index))
  assert.deepEqual(f.closed, [f.shown[0]])
  f.bridge.notifications.show = () => Promise.reject(new Error('denied'))
  assert.equal(await delivery.show('Denied', 'new'), false)
  delivery.dispose()
})

test('returning to the app refreshes native permission after an iOS Settings change', async t => {
  const f = fixture(t)
  nativeNotificationPermission(() => {})
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(nativeNotificationPermission(() => {}), 'denied')
  f.foreground('granted')
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(nativeNotificationPermission(() => {}), 'granted')
})

test('late duplicate failures cannot remove a newer notice or close another delivery owner', async t => {
  const f = fixture(t)
  const waiting: { id: string; resolve(value: boolean): void }[] = []
  f.bridge.notifications.show = ({ id }) => new Promise(resolve => waiting.push({ id, resolve }))
  const clicks: string[] = []
  const delivery = createNativeNotificationDelivery(id => clicks.push(id))!
  const first = delivery.show('First', 'same-id')
  const second = delivery.show('Second', 'same-id')
  assert.notEqual(waiting[0].id, waiting[1].id)
  waiting[1].resolve(true)
  assert.equal(await second, true)
  waiting[0].resolve(false)
  assert.equal(await first, false)
  f.click(waiting[1].id)
  assert.deepEqual(clicks, ['same-id'])
  delivery.dispose()
})
