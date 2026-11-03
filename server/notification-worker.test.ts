import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

const source = fs.readFileSync(new URL('../public/notification-worker.js', import.meta.url), 'utf8')
const origin = 'https://mew.test'
type WorkerEvent = {
  origin?: string
  source?: unknown
  ports?: unknown[]
  data?: unknown
  notification?: unknown
  waitUntil(value: Promise<unknown>): void
}

function fixture() {
  const listeners = new Map<string, (event: WorkerEvent) => void>()
  const messages: unknown[] = [], focused: string[] = [], lookedUp: string[] = []
  const clients = new Map([
    ['exact-client', { id: 'exact-client', type: 'window', url: origin + '/project/private', async focus() { focused.push('exact-client') }, postMessage(data: unknown) { messages.push(data) } }],
    ['other-client', { id: 'other-client', type: 'window', url: origin + '/', async focus() { focused.push('other-client') }, postMessage(data: unknown) { messages.push(data) } }],
  ])
  let skipped = false
  vm.runInNewContext(source, { URL, self: {
    location: { origin },
    async skipWaiting() { skipped = true },
    addEventListener(type: string, callback: (event: WorkerEvent) => void) { listeners.set(type, callback) },
    clients: { async get(id: string) { lookedUp.push(id); return clients.get(id) } },
  } })
  return {
    messages, focused, lookedUp, clients, listeners,
    get skipped() { return skipped },
    async dispatch(type: string, event: Omit<WorkerEvent, 'waitUntil'>) {
      const work: Promise<unknown>[] = []
      listeners.get(type)!({ ...event, waitUntil(value) { work.push(value) } })
      await Promise.all(work)
    },
  }
}

test('notification worker activates independently without fetch interception or claiming clients', async () => {
  const f = fixture()
  await f.dispatch('install', {})
  assert.equal(f.skipped, true)
  assert.deepEqual([...f.listeners.keys()], ['install', 'message', 'notificationclick'])
})

test('worker handshake identifies only the exact same-origin window using its own port', async () => {
  const f = fixture(), replies: unknown[] = []
  let closed = 0
  await f.dispatch('message', {
    origin,
    source: { id: 'exact-client', type: 'window', url: origin + '/project/private' },
    ports: [{ postMessage(message: unknown) { replies.push(message) }, close() { closed++ } }],
    data: { type: 'mew-notification-client', protocol: 1 },
  })
  assert.deepEqual(JSON.parse(JSON.stringify(replies)), [{ type: 'mew-notification-client', protocol: 1, clientId: 'exact-client' }])
  assert.deepEqual(f.lookedUp, ['exact-client'])
  assert.equal(closed, 1)
})

test('worker rejects unsafe origins, sources, protocols and handshake ports', async () => {
  const cases = [
    { origin: 'https://foreign.test' },
    { source: { id: 'exact-client', type: 'worker', url: origin + '/' } },
    { source: { id: 'exact-client', type: 'window', url: 'https://foreign.test/' } },
    { source: { id: 'missing-client', type: 'window', url: origin + '/' } },
    { source: { id: 'exact-client', type: 'window', url: 'invalid' } },
    { data: { type: 'mew-notification-client', protocol: 2 } },
    { ports: [] },
    { ports: [{}, {}] },
  ]
  for (const override of cases) {
    const f = fixture(), replies: unknown[] = []
    await f.dispatch('message', {
      origin, source: { id: 'exact-client', type: 'window', url: origin + '/' },
      data: { type: 'mew-notification-client', protocol: 1 },
      ports: [{ postMessage(message: unknown) { replies.push(message) }, close() {} }],
      ...override,
    })
    assert.deepEqual(replies, [])
  }
})

test('notification click closes the notice, focuses only its exact client and sends an opaque ID', async () => {
  const f = fixture()
  let closed = false
  await f.dispatch('notificationclick', { notification: {
    tag: 'opaque', data: { protocol: 'mew-notification-v1', id: 'opaque', clientId: 'exact-client' },
    close() { closed = true },
  } })
  assert.equal(closed, true)
  assert.deepEqual(f.lookedUp, ['exact-client'])
  assert.deepEqual(f.focused, ['exact-client'])
  assert.deepEqual(JSON.parse(JSON.stringify(f.messages)), [{ type: 'mew-notification-click', id: 'opaque' }])
})

test('closed, foreign, non-window and mismatched clients never redirect to another tab', async () => {
  for (const kind of ['missing', 'foreign', 'worker', 'mismatch', 'invalid-url']) {
    const f = fixture(), client = f.clients.get('exact-client')!
    if (kind === 'missing') f.clients.delete('exact-client')
    if (kind === 'foreign') client.url = 'https://foreign.test/'
    if (kind === 'worker') client.type = 'worker'
    if (kind === 'mismatch') client.id = 'other-client'
    if (kind === 'invalid-url') client.url = 'invalid'
    await f.dispatch('notificationclick', { notification: {
      tag: 'opaque', data: { protocol: 'mew-notification-v1', id: 'opaque', clientId: 'exact-client' }, close() {},
    } })
    assert.deepEqual(f.focused, [])
    assert.deepEqual(f.messages, [])
    assert.deepEqual(f.lookedUp, ['exact-client'])
  }
})

test('malformed click payloads are closed and ignored', async () => {
  for (const data of [undefined, {}, { protocol: 'wrong', id: 'opaque', clientId: 'exact-client' }, { protocol: 'mew-notification-v1', id: '', clientId: 'exact-client' }, { protocol: 'mew-notification-v1', id: 'opaque', clientId: 1 }, { protocol: 'mew-notification-v1', id: 'wrong-tag', clientId: 'exact-client' }]) {
    const f = fixture()
    let closed = false
    await f.dispatch('notificationclick', { notification: { tag: 'opaque', data, close() { closed = true } } })
    assert.equal(closed, true)
    assert.deepEqual(f.lookedUp, [])
    assert.deepEqual(f.messages, [])
  }
})
