import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { chromium, type Browser } from 'playwright-core'
import { connectTestBrowser } from './test-browser.ts'

test('UI tests launch an owned headless Chromium browser and ignore the retired CDP endpoint', async t => {
  const launched = {} as Browser
  const launch = t.mock.method(chromium, 'launch', async (...args: unknown[]) => {
    assert.deepEqual(args, [{ executablePath: process.execPath, chromiumSandbox: true, headless: true, timeout: 15_000 }])
    return launched
  })
  t.mock.method(chromium, 'connectOverCDP', async () => { assert.fail('UI tests must launch their own Chromium browser') })
  const browser = await connectTestBrowser({ env: {
    MEW_BROWSER_EXECUTABLE: process.execPath,
    MEW_TEST_BROWSER_CDP_URL: 'not-a-cdp-url',
  } })
  assert.equal(browser, launched, 'the caller owns and closes the actual launched browser')
  assert.equal(launch.mock.callCount(), 1)
})

test('UI browser launch forwards an explicit startup timeout', async t => {
  const launched = {} as Browser
  t.mock.method(chromium, 'launch', async (...args: unknown[]) => {
    assert.deepEqual(args, [{ executablePath: process.execPath, chromiumSandbox: true, headless: true, timeout: 2000 }])
    return launched
  })
  assert.equal(await connectTestBrowser({ env: { MEW_BROWSER_EXECUTABLE: process.execPath }, timeout: 2000 }), launched)
})

test('Chromium launch failures retain their cause and actionable browser configuration guidance', async t => {
  const failure = new Error('Chromium sandbox initialization failed')
  t.mock.method(chromium, 'launch', async () => { throw failure })
  await assert.rejects(connectTestBrowser({ env: { MEW_BROWSER_EXECUTABLE: process.execPath } }), error => {
    assert.ok(error instanceof Error)
    assert.match(error.message, /Chromium.*MEW_BROWSER_EXECUTABLE/)
    assert.equal(error.cause, failure)
    return true
  })
})

test('invalid explicit browser configuration fails before launching a browser', async t => {
  t.mock.method(chromium, 'launch', async () => { assert.fail('invalid executable must not launch') })
  await assert.rejects(connectTestBrowser({ env: { MEW_BROWSER_EXECUTABLE: './relative-chromium' } }), /MEW_BROWSER_EXECUTABLE/)
})

test('missing Chromium executables produce installation guidance without launching a browser', async t => {
  t.mock.method(fs, 'statSync', () => { throw new Error('fixture executable is unavailable') })
  t.mock.method(chromium, 'launch', async () => { assert.fail('missing executable must not launch') })
  await assert.rejects(connectTestBrowser({ env: {} }), /Install Chrome\/Chromium.*MEW_BROWSER_EXECUTABLE/)
})
