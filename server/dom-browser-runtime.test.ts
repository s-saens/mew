import './test-isolated-data.ts'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import { chromium, type Browser, type BrowserContext, type CDPSession, type Page } from 'playwright-core'
import { WebSocket } from 'ws'
import { DomBrowserSession } from './dom-browser.ts'

test('DOM sessions use owned Chromium, native navigation/input, and CDP redirect guards', async t => {
  const previousExecutable = process.env.MEW_BROWSER_EXECUTABLE
  process.env.MEW_BROWSER_EXECUTABLE = process.execPath
  t.after(() => {
    if (previousExecutable === undefined) delete process.env.MEW_BROWSER_EXECUTABLE
    else process.env.MEW_BROWSER_EXECUTABLE = previousExecutable
  })
  const calls: string[] = []
  const sent: { method: string; params?: Record<string, unknown> }[] = []
  let initScript = ''
  const socket = Object.assign(new EventEmitter(), {
    readyState: WebSocket.OPEN, bufferedAmount: 0,
    send: () => {}, close: () => { calls.push('socket.close') },
  })
  const frame = { id: 'main' }
  const cdp = Object.assign(new EventEmitter(), {
    send: async (method: string, params?: Record<string, unknown>) => {
      sent.push({ method, params })
      if (method === 'Page.getFrameTree') return { frameTree: { frame } }
      if (method === 'Page.getNavigationHistory') return { currentIndex: 0, entries: [{ url: 'http://localhost:8080/' }] }
      return {}
    },
  })
  const page = Object.assign(new EventEmitter(), {
    mainFrame: () => frame,
    setDefaultTimeout: () => {}, setDefaultNavigationTimeout: () => {},
    exposeBinding: async () => {},
    addInitScript: async ({ content }: { content: string }) => { initScript = content },
    url: () => 'http://localhost:8080/', title: async () => 'Fixture',
    goto: async () => { calls.push('goto') },
    goBack: async () => { calls.push('back') },
    goForward: async () => { calls.push('forward') },
    reload: async () => { calls.push('reload') },
    evaluate: async (script: string) => script.includes('getBoundingClientRect') ? { x: 10, y: 20 } : undefined,
    mouse: { click: async (x: number, y: number) => { assert.deepEqual([x, y], [10, 20]); calls.push('mouse.click') } },
  })
  let routeSocket: (socket: { url: () => string; connectToServer: () => void; close: () => void }) => void
  const context = Object.assign(new EventEmitter(), {
    route: async () => {},
    routeWebSocket: async (_pattern: string, handler: typeof routeSocket) => { routeSocket = handler },
    newPage: async () => page as unknown as Page,
    newCDPSession: async () => cdp as unknown as CDPSession,
    close: async () => { calls.push('context.close') },
  })
  const browser = {
    newContext: async () => context as unknown as BrowserContext,
    close: async () => { calls.push('browser.close') },
  } as unknown as Browser
  const launch = t.mock.method(chromium, 'launch', async (options: Parameters<typeof chromium.launch>[0]) => {
    assert.equal(options?.headless, true)
    assert.equal(options?.chromiumSandbox, true)
    assert.ok(options?.executablePath)
    return browser
  })
  t.mock.method(chromium, 'connectOverCDP', async () => { assert.fail('DOM sessions must not attach to Obscura') })
  const session = new DomBrowserSession('runtime@example.test', socket as unknown as WebSocket, () => true)
  t.after(() => session.close())
  const command = async (value: Record<string, unknown>, expected: string) => {
    socket.emit('message', Buffer.from(JSON.stringify(value)), false)
    const deadline = Date.now() + 2000
    while (!calls.includes(expected)) {
      assert.ok(Date.now() < deadline, `command did not finish: ${expected}`)
      await new Promise(resolve => setTimeout(resolve, 5))
    }
  }
  await command({ type: 'navigate', url: 'http://localhost:8080/' }, 'goto')
  assert.equal(launch.mock.callCount(), 1)
  assert.ok(initScript.includes('rrwebRecord.record'))
  assert.ok(!initScript.includes('Object.defineProperty(prototype'))
  assert.ok(sent.some(call => call.method === 'Fetch.enable'))

  routeSocket!({ url: () => 'ws://localhost:8080/hmr', connectToServer: () => { calls.push('native.websocket') }, close: () => assert.fail('allowed HMR socket') })
  assert.ok(calls.includes('native.websocket'))
  routeSocket!({ url: () => 'ws://localhost:4999/private', connectToServer: () => assert.fail('blocked port'), close: () => { calls.push('blocked.websocket') } })
  assert.ok(calls.includes('blocked.websocket'))
  cdp.emit('Fetch.requestPaused', { requestId: 'blocked', resourceType: 'Document', frameId: 'main', request: { url: 'http://localhost:4999/private' } })
  assert.ok(sent.some(call => call.method === 'Fetch.failRequest' && call.params?.requestId === 'blocked'))
  cdp.emit('Fetch.requestPaused', { requestId: 'asset', resourceType: 'Stylesheet', frameId: 'main', request: { url: 'http://localhost:8080/style.css' } })
  assert.ok(sent.some(call => call.method === 'Fetch.continueRequest' && call.params?.requestId === 'asset'))

  await command({ type: 'click', generation: 1, id: 42 }, 'mouse.click')
  await command({ type: 'back' }, 'back')
  await command({ type: 'forward' }, 'forward')
  await command({ type: 'reload' }, 'reload')
  await session.close()
  assert.deepEqual(calls.slice(-3), ['socket.close', 'context.close', 'browser.close'])
})
