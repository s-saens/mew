import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { ReadableStream } from 'node:stream/web'

const source = fs.readFileSync(new URL('../public/remote-resource-worker.js', import.meta.url), 'utf8')
const token = 'resource_fixture_abcdefghijklmnop'
const origin = 'https://mew.test'
const settle = async () => { for (let index = 0; index < 8; index++) await Promise.resolve() }
type WorkerMessage = { type: string; [key: string]: unknown }

class Port {
  peer!: Port
  closed = false
  messages: WorkerMessage[] = []
  onmessage?: (event: { data: unknown }) => void
  postMessage(data: WorkerMessage) {
    this.messages.push(data)
    if (!this.closed && !this.peer.closed) this.peer.onmessage?.({ data })
  }
  close() { this.closed = true }
}

async function resource(path = `/__mew_ui/${token}/assets/app.js`, method = 'GET') {
  const listeners = new Map<string, (event: unknown) => void>()
  let now = 0, nextTimer = 0, upstream!: Port, response!: Promise<Response>
  const timers = new Map<number, { at: number; callback: () => void }>()
  const launcher = { id: 'launcher', url: `${origin}/launch/${token}`, postMessage(_message: unknown, ports: Port[]) { upstream = ports[0] } }
  vm.runInNewContext(source, {
    URL, Headers, Response, ReadableStream, Uint8Array,
    setTimeout(callback: () => void, delay: number) { const id = ++nextTimer; timers.set(id, { at: now + delay, callback }); return id },
    clearTimeout(id: number) { timers.delete(id) },
    MessageChannel: class {
      port1 = new Port()
      port2 = new Port()
      constructor() { this.port1.peer = this.port2; this.port2.peer = this.port1 }
    },
    self: {
      location: { origin },
      addEventListener(type: string, callback: (event: unknown) => void) { listeners.set(type, callback) },
      clients: {
        async get() { return { id: 'app', url: `${origin}/__mew_ui/${token}/index.html` } },
        async matchAll() { return [launcher] },
      },
    },
  })
  listeners.get('fetch')!({
    request: new Request(origin + path, { method }), clientId: 'app',
    respondWith(value: Promise<Response>) { response = value },
  })
  await settle()
  return {
    response,
    get upstream() { return upstream },
    get timers() { return timers.size },
    async tick(milliseconds: number) {
      const until = now + milliseconds
      while (true) {
        const entry = [...timers].filter(([, value]) => value.at <= until).sort((a, b) => a[1].at - b[1].at)[0]
        if (!entry) break
        now = entry[1].at
        timers.delete(entry[0]); entry[1].callback()
        await settle()
      }
      now = until
      await settle()
    },
    async headers(status = 200) {
      upstream.postMessage({ type: 'response', status, headers: { 'content-type': path.startsWith('/api/') ? 'text/event-stream' : 'text/javascript' }, centralOrigin: origin })
      await settle()
      return response
    },
    async send(type: string, bytes?: number[]) { upstream.postMessage({ type, bytes }); await settle() },
  }
}

test('resource worker terminates UI bodies that stall after headers or a chunk', async () => {
  for (const initialChunk of [false, true]) {
    const fixture = await resource()
    const response = await fixture.headers(), reader = response.body!.getReader()
    if (initialChunk) {
      const first = reader.read()
      await fixture.send('chunk', [1])
      assert.deepEqual((await first).value, new Uint8Array([1]))
    }
    const reading = reader.read()
    const rejected = assert.rejects(reading, /Direct connection interrupted/)
    await fixture.tick(29_999)
    assert.equal(fixture.upstream.peer.closed, false)
    await fixture.tick(1)
    await rejected
    assert.equal(fixture.upstream.peer.messages.at(-1)?.type, 'cancel')
    assert.equal(fixture.upstream.peer.closed, true)
    assert.equal(fixture.timers, 0)
  }
})

test('resource worker permits progressing UI downloads longer than 30 seconds', async () => {
  const fixture = await resource(), response = await fixture.headers(), reader = response.body!.getReader()
  for (let index = 0; index < 4; index++) {
    const reading = reader.read()
    await fixture.tick(20_000)
    await fixture.send('chunk', [index])
    assert.deepEqual((await reading).value, new Uint8Array([index]))
  }
  const ending = reader.read()
  await fixture.send('end')
  assert.equal((await ending).done, true)
  assert.equal(fixture.timers, 0)
  assert.equal(fixture.upstream.peer.closed, true)
})

test('resource worker does not time out a buffered UI body during consumer backpressure', async () => {
  const fixture = await resource(), response = await fixture.headers()
  await fixture.send('chunk', [1])
  assert.equal(fixture.timers, 0)
  await fixture.tick(120_000)
  assert.equal(fixture.upstream.peer.closed, false)
  const reader = response.body!.getReader()
  assert.deepEqual((await reader.read()).value, new Uint8Array([1]))
  const ending = reader.read()
  await fixture.send('end')
  assert.equal((await ending).done, true)
})

test('resource worker leaves API event streams open during long body waits', async () => {
  const fixture = await resource('/api/events'), response = await fixture.headers(), reader = response.body!.getReader()
  const reading = reader.read()
  await fixture.tick(120_000)
  assert.equal(fixture.timers, 0)
  assert.equal(fixture.upstream.peer.closed, false)
  await fixture.send('chunk', [1])
  assert.deepEqual((await reading).value, new Uint8Array([1]))
  await reader.cancel()
})

test('resource worker clears active UI timers after cancellation, end, error and bodyless responses', async () => {
  for (const completion of ['cancel', 'end', 'error', 'HEAD', '204']) {
    const fixture = await resource(undefined, completion === 'HEAD' ? 'HEAD' : 'GET')
    const response = await fixture.headers(completion === '204' ? 204 : 200)
    if (completion === 'cancel') await response.body!.cancel()
    else if (completion === 'end') { await fixture.send('end'); await response.text() }
    else if (completion === 'error') {
      const rejected = assert.rejects(response.text(), /Direct connection interrupted/)
      await fixture.send('error')
      await rejected
    } else assert.equal(response.body, null)
    assert.equal(fixture.timers, 0, completion)
    assert.equal(fixture.upstream.peer.closed, true, completion)
    await fixture.tick(120_000)
  }
})

test('resource worker retains the existing response header timeout', async () => {
  const fixture = await resource()
  await fixture.tick(30_000)
  assert.equal((await fixture.response).status, 503)
  assert.equal(fixture.timers, 0)
  assert.equal(fixture.upstream.peer.messages.at(-1)?.type, 'cancel')
})
