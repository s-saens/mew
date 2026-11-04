import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
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

test('UI tests use the dedicated Chromium executable independently of ordinary Chrome', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-ui-browser-selection-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const chrome = path.join(directory, 'ordinary-chrome')
  fs.writeFileSync(chrome, '', { mode: 0o700 })
  const launched = {} as Browser
  t.mock.method(chromium, 'launch', async (options: Parameters<typeof chromium.launch>[0]) => {
    assert.equal(options?.executablePath, process.execPath)
    return launched
  })
  t.mock.method(chromium, 'connectOverCDP', async () => { assert.fail('UI tests must not use external CDP') })
  assert.equal(await connectTestBrowser({ env: {
    MEW_CHROMIUM_EXECUTABLE: process.execPath,
    MEW_CHROME_EXECUTABLE: chrome,
    MEW_BROWSER_EXECUTABLE: chrome,
  } }), launched)
})

test('Chromium launch failures retain their cause and actionable browser configuration guidance', async t => {
  const failure = new Error('Chromium sandbox initialization failed')
  t.mock.method(chromium, 'launch', async () => { throw failure })
  await assert.rejects(connectTestBrowser({ env: { MEW_BROWSER_EXECUTABLE: process.execPath } }), error => {
    assert.ok(error instanceof Error)
    assert.match(error.message, /Chromium.*MEW_CHROMIUM_EXECUTABLE/)
    assert.equal(error.cause, failure)
    return true
  })
})

test('invalid explicit browser configuration fails before launching a browser', async t => {
  t.mock.method(chromium, 'launch', async () => { assert.fail('invalid executable must not launch') })
  await assert.rejects(connectTestBrowser({ env: { MEW_BROWSER_EXECUTABLE: './relative-chromium' } }), /MEW_BROWSER_EXECUTABLE/)
})

test('ordinary Chrome cannot replace missing Chromium for UI tests', async t => {
  t.mock.method(fs, 'statSync', (file: string) => {
    if (['/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/opt/google/chrome/chrome'].includes(file)) return { isFile: () => true } as fs.Stats
    throw new Error('fixture executable is unavailable')
  })
  t.mock.method(fs, 'accessSync', () => {})
  t.mock.method(chromium, 'launch', async () => { assert.fail('missing executable must not launch') })
  await assert.rejects(connectTestBrowser({ env: {} }), /Install Playwright Chromium.*MEW_CHROMIUM_EXECUTABLE/)
})
