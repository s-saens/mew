import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core'
import { connectTestBrowser, testBrowserEndpoint } from './test-browser.ts'

test('UI tests select Obscura CDP independently of the product browser executable', () => {
  assert.equal(testBrowserEndpoint({ MEW_BROWSER_EXECUTABLE: '/unrelated/chrome' }), 'ws://127.0.0.1:9222')
  for (const endpoint of ['ws://127.0.0.1:9333', 'http://localhost:9333', 'wss://browser.example.test/cdp']) {
    assert.equal(testBrowserEndpoint({ MEW_TEST_BROWSER_CDP_URL: endpoint }), endpoint)
  }
  for (const endpoint of ['', './obscura', 'file:///tmp/browser', 'ws://user:password@localhost:9222', 'ws://localhost:9222/#fragment']) {
    assert.throws(() => testBrowserEndpoint({ MEW_TEST_BROWSER_CDP_URL: endpoint }), /MEW_TEST_BROWSER_CDP_URL/)
  }
})

test('CDP attachment isolates and closes only test-owned contexts, then disconnects once', async t => {
  const calls: string[] = [], options: unknown[] = []
  const context = (name: string) => {
    const events = new EventEmitter()
    return Object.assign(events, { close: async () => { calls.push(name); events.emit('close') } }) as unknown as BrowserContext
  }
  const existing = context('existing'), explicit = context('explicit'), pageContext = context('page')
  const page = { context: () => pageContext } as Page
  const connected = {
    contexts: () => [existing, explicit, pageContext],
    newContext: async (value: unknown) => { options.push(value); return explicit },
    newPage: async (value: unknown) => { options.push(value); return page },
    close: async () => { calls.push('disconnect') },
    isConnected() { return this === connected },
  } as unknown as Browser
  t.mock.method(chromium, 'launch', async () => { assert.fail('UI tests must never fall back to Chromium') })
  t.mock.method(chromium, 'connectOverCDP', async (...args: unknown[]) => {
    assert.deepEqual(args, ['ws://127.0.0.1:9222', { timeout: 15_000 }])
    return connected
  })
  const browser = await connectTestBrowser({ env: {} })
  assert.equal(browser.isConnected(), true)
  assert.deepEqual(browser.contexts(), [], 'the service default context is not exposed')
  assert.equal(await browser.newContext({ viewport: { width: 390, height: 844 } }), explicit)
  assert.equal(await browser.newPage({ locale: 'ko-KR' }), page)
  assert.deepEqual(options, [{ viewport: { width: 390, height: 844 } }, { locale: 'ko-KR' }])
  assert.deepEqual(browser.contexts(), [explicit, pageContext])
  await explicit.close()
  assert.deepEqual(browser.contexts(), [pageContext])
  await Promise.all([browser.close(), browser.close()])
  assert.deepEqual(calls, ['explicit', 'page', 'disconnect'])
  assert.deepEqual(browser.contexts(), [])
})

test('an unavailable Obscura endpoint fails with an actionable message and no browser fallback', async t => {
  t.mock.method(chromium, 'launch', async () => { assert.fail('must not launch Chromium') })
  t.mock.method(chromium, 'connectOverCDP', async () => { throw new Error('upstream-private-detail') })
  await assert.rejects(connectTestBrowser({ env: {}, timeout: 1 }), error => {
    assert.ok(error instanceof Error)
    assert.match(error.message, /Obscura.*MEW_TEST_BROWSER_CDP_URL/)
    assert.doesNotMatch(error.message, /upstream-private-detail/)
    return true
  })
})
