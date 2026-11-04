import './test-isolated-data.ts'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test, { type TestContext } from 'node:test'
import { chromium, type Browser, type BrowserContext, type CDPSession, type Page } from 'playwright-core'
import { WebSocket } from 'ws'
import { DomBrowserSession } from './dom-browser.ts'
import type { DomBrowserMessage } from '../shared/dom-browser.ts'

type PausedRequest = { method: string; postData?: string; headers: Record<string, string>; urlFragment?: string }

async function fixture(t: TestContext) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-browser-roles-test-'))
  const executables = { chromium: path.join(dir, 'chromium'), chrome: path.join(dir, 'chrome') }
  for (const file of Object.values(executables)) await fs.writeFile(file, '', { mode: 0o700 })
  const previous = { chrome: process.env.MEW_CHROME_EXECUTABLE, chromium: process.env.MEW_CHROMIUM_EXECUTABLE }
  process.env.MEW_CHROME_EXECUTABLE = executables.chrome
  process.env.MEW_CHROMIUM_EXECUTABLE = executables.chromium
  t.after(async () => {
    for (const [key, value] of Object.entries({ MEW_CHROME_EXECUTABLE: previous.chrome, MEW_CHROMIUM_EXECUTABLE: previous.chromium })) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    await fs.rm(dir, { recursive: true, force: true })
  })
  const messages: DomBrowserMessage[] = []
  let socketClosed = false
  const socket = Object.assign(new EventEmitter(), {
    readyState: WebSocket.OPEN, bufferedAmount: 0,
    send: (raw: string) => messages.push(JSON.parse(raw)), close: () => { socketClosed = true },
  })
  let runtimeNumber = 0
  const runtimes: ReturnType<typeof runtime>[] = []
  const redirects = new Map<string, { url: string; request?: PausedRequest }>()
  function runtime() {
    let url = 'about:blank', nativeIndex = 0, nextId = 1, requestId = 0
    const nativeHistory = [{ id: 0, url }]
    const pending = new Map<string, (allowed: boolean) => void>()
    const calls: string[] = [], sent: Array<{ method: string; params: Record<string, unknown> }> = []
    const frame = { id: 'main', url: () => url }
    const cdp = Object.assign(new EventEmitter(), {
      send: async (method: string, params: Record<string, unknown> = {}) => {
        sent.push({ method, params })
        if (method === 'Page.getFrameTree') return { frameTree: { frame } }
        if (method === 'Page.getNavigationHistory') return { currentIndex: nativeIndex, entries: nativeHistory }
        if (method === 'Fetch.continueRequest' || method === 'Fetch.failRequest') pending.get(String(params.requestId))?.(method === 'Fetch.continueRequest')
        return {}
      },
    })
    const paused = (target: string, request: PausedRequest = { method: 'GET', headers: {} }) => new Promise<boolean>(resolve => {
      const id = String(++requestId); pending.set(id, resolve)
      cdp.emit('Fetch.requestPaused', { requestId: id, resourceType: 'Document', frameId: 'main', request: { url: target, ...request } })
    })
    const navigate = async (target: string) => {
      calls.push('goto:' + target)
      const redirect = redirects.get(target)
      if (!await paused(redirect?.url ?? target, redirect?.request)) throw new Error('net::ERR_ABORTED')
      url = target
      nativeHistory.splice(nativeIndex + 1); nativeHistory.push({ id: nextId++, url }); nativeIndex++
      page.emit('framenavigated', frame)
    }
    const page = Object.assign(new EventEmitter(), {
      mainFrame: () => frame, url: () => url, title: async () => 'Fixture',
      setDefaultTimeout: () => {}, setDefaultNavigationTimeout: () => {}, exposeBinding: async () => {},
      addInitScript: async ({ content }: { content: string }) => { assert.ok(content.includes('rrwebRecord.record')) },
      setViewportSize: async () => {}, emulateMedia: async () => {},
      goto: navigate,
      goBack: async () => { calls.push('back'); url = nativeHistory[--nativeIndex].url; page.emit('framenavigated', frame) },
      goForward: async () => { calls.push('forward'); url = nativeHistory[++nativeIndex].url; page.emit('framenavigated', frame) },
      reload: async () => { calls.push('reload'); page.emit('framenavigated', frame) },
      evaluate: async (script: string) => script.includes('getBoundingClientRect') ? { x: 10, y: 20 } : undefined,
      mouse: { click: async () => { calls.push('mouse.click') } },
    })
    const state = { cookies: [], origins: [{ origin: 'http://localhost:8080', localStorage: [{ name: 'fixture', value: String(++runtimeNumber) }] }] }
    let wsHandler: (socket: { url: () => string; connectToServer: () => void; close: () => void }) => void
    const context = Object.assign(new EventEmitter(), {
      route: async () => {}, routeWebSocket: async (_pattern: string, handler: typeof wsHandler) => { wsHandler = handler },
      newPage: async () => page as unknown as Page, newCDPSession: async () => cdp as unknown as CDPSession,
      storageState: async () => state,
      close: async () => { calls.push('context.close'); page.emit('close') },
    })
    const browser = { newContext: async (options: unknown) => { contextOptions = options; return context as unknown as BrowserContext }, close: async () => { calls.push('browser.close') } } as unknown as Browser
    let contextOptions: unknown
    return { browser, page, cdp, calls, sent, paused, state, contextOptions: () => contextOptions, ws: () => wsHandler!, replace: (target: string) => { url = target; nativeHistory[nativeIndex].url = target; page.emit('framenavigated', frame) }, pushSameUrl: () => { nativeHistory.splice(nativeIndex + 1); nativeHistory.push({ id: nextId++, url }); nativeIndex++; page.emit('framenavigated', frame) } }
  }
  const launches: unknown[] = []
  t.mock.method(chromium, 'launch', async (options: Parameters<typeof chromium.launch>[0]) => {
    assert.equal(options?.headless, true); assert.equal(options?.chromiumSandbox, true)
    launches.push(options); const next = runtime(); runtimes.push(next); return next.browser
  })
  t.mock.method(chromium, 'connectOverCDP', async () => { assert.fail('must launch the selected native browser') })
  const session = new DomBrowserSession('runtime@example.test', socket as unknown as WebSocket, () => true)
  t.after(() => session.close())
  const send = (value: Record<string, unknown>) => socket.emit('message', Buffer.from(JSON.stringify(value)), false)
  const wait = async (predicate: () => unknown, label: string) => {
    const deadline = Date.now() + 2000
    while (!predicate()) { assert.ok(Date.now() < deadline, `Timed out: ${label}; errors=${JSON.stringify(messages.filter(m => m.type === 'error'))}`); await new Promise(resolve => setTimeout(resolve, 5)) }
  }
  const loaded = (target: string, from = 0) => wait(() => messages.slice(from).some(m => m.type === 'state' && m.url === target && !m.loading), target)
  const navigate = async (url: string) => { const from = messages.length; send({ type: 'navigate', url }); await loaded(url, from) }
  return { session, messages, send, wait, loaded, navigate, runtimes, launches, executables, redirects, socketClosed: () => socketClosed }
}

test('localhost sessions use native Chromium, history, input, and guarded networking', async t => {
  const f = await fixture(t)
  f.send({ type: 'resize', width: 390, height: 700 })
  assert.equal(f.runtimes.length, 0, 'viewport changes do not launch the wrong engine before the URL is known')
  await f.navigate('http://localhost:8080/one')
  assert.equal((f.launches[0] as { executablePath: string }).executablePath, f.executables.chromium)
  assert.deepEqual((f.runtimes[0].contextOptions() as { viewport: unknown }).viewport, { width: 390, height: 700 })
  await f.navigate('http://localhost:8080/two')
  const generation = (f.messages.findLast(m => m.type === 'state') as { generation: number }).generation
  f.send({ type: 'click', generation, id: 42 }); await f.wait(() => f.runtimes[0].calls.includes('mouse.click'), 'native pointer')
  f.send({ type: 'back' }); await f.loaded('http://localhost:8080/one')
  f.send({ type: 'forward' }); await f.wait(() => f.runtimes[0].calls.includes('forward'), 'native forward')
  f.send({ type: 'reload' }); await f.wait(() => f.runtimes[0].calls.includes('reload'), 'native reload')
  const socket = { url: () => 'ws://localhost:8080/hmr', connectToServer: () => {}, close: () => assert.fail('allowed HMR socket') }
  f.runtimes[0].ws()(socket)
  assert.equal(await f.runtimes[0].paused('http://localhost:4999/private'), false)
  await f.session.close()
  assert.deepEqual(f.runtimes[0].calls.slice(-2), ['context.close', 'browser.close'])
})

test('local/external transitions select distinct binaries, restore per-engine state, and keep URL history', async t => {
  const f = await fixture(t)
  await f.navigate('http://localhost:8080/one')
  await f.navigate('https://example.test/external')
  assert.equal((f.launches[1] as { executablePath: string }).executablePath, f.executables.chrome)
  assert.equal(f.socketClosed(), false, 'changing engines keeps the viewer connection')
  assert.deepEqual(f.runtimes[0].calls.slice(-2), ['context.close', 'browser.close'])
  const from = f.messages.length; f.send({ type: 'back' }); await f.loaded('http://localhost:8080/one', from)
  assert.equal((f.launches[2] as { executablePath: string }).executablePath, f.executables.chromium)
  assert.deepEqual((f.runtimes[2].contextOptions() as { storageState: unknown }).storageState, f.runtimes[0].state)
  assert.ok(f.runtimes[2].calls.includes('goto:http://localhost:8080/one'), 'cross-runtime history reloads its saved URL')
  const next = f.messages.length; f.send({ type: 'forward' }); await f.loaded('https://example.test/external', next)
  assert.deepEqual((f.runtimes[3].contextOptions() as { storageState: unknown }).storageState, f.runtimes[1].state)
})

test('a cross-engine redirect preserves its URL fragment and POST body without leaking source cookies', async t => {
  const f = await fixture(t)
  f.redirects.set('http://localhost:8080/redirect', { url: 'https://example.test/submit', request: { method: 'POST', postData: 'field=value', urlFragment: '#done', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: 'local=private' } } })
  f.send({ type: 'navigate', url: 'http://localhost:8080/redirect' })
  await f.loaded('https://example.test/submit#done')
  const resumed = f.runtimes[1].sent.find(c => c.method === 'Fetch.continueRequest' && c.params.method === 'POST')!
  assert.ok(resumed)
  assert.equal(resumed.params.postData, Buffer.from('field=value').toString('base64'))
  assert.ok(!(resumed.params.headers as { name: string }[]).some(h => h.name.toLowerCase() === 'cookie'))
  assert.equal(f.messages.some(m => m.type === 'error'), false)
})

test('replaceState updates the current history slot and missing Chrome leaves the current snapshot generation usable', async t => {
  const f = await fixture(t)
  await f.navigate('http://localhost:8080/start')
  f.runtimes[0].replace('http://localhost:8080/replaced')
  await f.loaded('http://localhost:8080/replaced')
  assert.equal((f.messages.findLast(m => m.type === 'state') as { canGoBack: boolean }).canGoBack, false)
  const generation = (f.messages.findLast(m => m.type === 'state') as { generation: number }).generation
  process.env.MEW_CHROME_EXECUTABLE = path.join(os.tmpdir(), 'mew-missing-chrome-fixture')
  f.send({ type: 'navigate', url: 'https://example.test/' })
  await f.wait(() => f.messages.some(m => m.type === 'error'), 'missing Chrome error')
  assert.equal((f.messages.findLast(m => m.type === 'state') as { generation: number }).generation, generation)
  assert.ok(!f.runtimes[0].calls.includes('context.close'))
})

test('cross-engine redirect loops stop after ten switches', async t => {
  const f = await fixture(t)
  const local = 'http://localhost:8080/loop', external = 'https://example.test/loop'
  f.redirects.set(local, { url: external })
  f.redirects.set(external, { url: local })
  f.send({ type: 'navigate', url: local })
  await f.wait(() => f.messages.some(m => m.type === 'error' && /리다이렉트/.test(m.message)), 'bounded engine switches')
  assert.equal(f.runtimes.length, 11)
})

test('independent successful document switches do not accumulate a redirect-loop budget', async t => {
  const f = await fixture(t)
  await f.navigate('http://localhost:8080/start')
  for (let i = 0; i < 12; i++) {
    const target = i % 2 ? `http://localhost:8080/step-${i}` : `https://example.test/step-${i}`
    const from = f.messages.length
    assert.equal(await f.runtimes.at(-1)!.paused(target), false)
    await f.loaded(target, from)
  }
  assert.equal(f.messages.some(m => m.type === 'error'), false)
})

test('batched same-URL pushState visits remain distinct in native Back traversal', async t => {
  const f = await fixture(t)
  const start = 'http://localhost:8080/start', same = 'http://localhost:8080/same'
  await f.navigate(start)
  await f.navigate(same)
  f.runtimes[0].pushSameUrl()
  f.runtimes[0].pushSameUrl()
  await f.navigate('http://localhost:8080/end')
  for (const target of [same, same, same, start]) {
    const from = f.messages.length
    f.send({ type: 'back' })
    await f.loaded(target, from)
  }
  assert.equal(f.runtimes[0].calls.filter(call => call === 'back').length, 4)
  assert.equal((f.messages.findLast(m => m.type === 'state') as { canGoBack: boolean }).canGoBack, false)
})
