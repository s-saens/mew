import './test-isolated-data.ts'
import assert from 'node:assert/strict'
import fs, { type Stats } from 'node:fs'
import test from 'node:test'
import { chromium } from 'playwright-core'
import { loginDesktopExecutable } from './login-desktop.ts'

test('login Chrome selection honors its dedicated override before the legacy executable', t => {
  const installed = new Set(['/fixture/chrome', '/fixture/legacy'])
  t.mock.method(fs, 'statSync', (file: string) => {
    if (!installed.has(file)) throw new Error('not installed')
    return { isFile: () => true } as Stats
  })
  t.mock.method(fs, 'accessSync', (file: string) => {
    if (!installed.has(file)) throw new Error('not executable')
  })
  assert.equal(loginDesktopExecutable({ MEW_CHROME_EXECUTABLE: '/fixture/chrome', MEW_BROWSER_EXECUTABLE: '/fixture/legacy', MEW_CHROMIUM_EXECUTABLE: '/fixture/ignored' }), '/fixture/chrome')
  assert.equal(loginDesktopExecutable({ MEW_BROWSER_EXECUTABLE: '/fixture/legacy' }), '/fixture/legacy')
  assert.throws(() => loginDesktopExecutable({ MEW_CHROME_EXECUTABLE: './chrome', MEW_BROWSER_EXECUTABLE: '/fixture/legacy' }), /MEW_CHROME_EXECUTABLE/)
})

test('login requires ordinary Chrome and never falls back to Playwright Chromium', t => {
  t.mock.method(fs, 'statSync', () => { throw new Error('not installed') })
  t.mock.method(chromium, 'executablePath', () => { assert.fail('login must not discover Playwright Chromium') })
  assert.throws(() => loginDesktopExecutable({ MEW_CHROMIUM_EXECUTABLE: '/fixture/chromium' }), /Google Chrome.*MEW_CHROME_EXECUTABLE/)
})
