import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { chromium } from 'playwright-core'
import { domBrowserExecutable } from './browser-dom-executable.ts'
import { AUTOMATIC_RETRY_LIMIT } from '../src/utils/recovery-policy.ts'

test('command metadata retries quietly, retains cached rows, and offers recovery only after the retry budget or a permanent error', { skip: !domBrowserExecutable(), timeout: 60_000 }, async t => {
  const root = path.resolve(import.meta.dirname, '..')
  const source = `
import React from 'react';import {createRoot} from 'react-dom/client';
import {I18nProvider} from '${root}/src/i18n.tsx';
import {CommandButtonMenu} from '${root}/src/components/CommandButtonMenu.tsx';
localStorage.setItem('mew:locale','ko');
createRoot(document.getElementById('root')).render(<I18nProvider><CommandButtonMenu project=".workspace" title="명령 목록"/></I18nProvider>);`
  const bundle = await build({ input: 'virtual:command-recovery.tsx', write: false, platform: 'browser',
    onwarn(warning, warn) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning) },
    output: { format: 'iife' }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } }, plugins: [{
      name: 'fixture', resolveId(id) { if (id === 'virtual:command-recovery.tsx') return id; if (id.endsWith('.css')) return 'virtual:style' },
      load(id) { if (id === 'virtual:command-recovery.tsx') return source; if (id === 'virtual:style') return '' },
    }] })
  const indicatorCss = await fs.readFile(path.join(root, 'packages/ui/src/loading-indicator.css'), 'utf8')
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  t.after(() => browser.close())
  for (const width of [1100, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 700 }, hasTouch: width === 390 })
    page.setDefaultTimeout(5_000)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    let status = 0, reads = 0, runs = 0, nextName = '개발 서버'
    let releaseLoad: (() => void) | undefined
    await page.route('http://mew-command-recovery.test/**', async route => {
      const url = new URL(route.request().url())
      if (url.pathname === '/api/cmd-buttons') {
        reads++
        if (releaseLoad) await new Promise<void>(resolve => { releaseLoad = resolve })
        if (status === 0) return route.abort('failed')
        return route.fulfill({ status, json: status === 200
          ? { buttons: [{ name: nextName, command: 'npm run dev', oneShot: false, session: 'mewcmd-dev', running: false }] }
          : { error: status === 403 ? 'Command access denied' : 'Temporary metadata failure' } })
      }
      if (url.pathname === '/api/cmd-buttons/run') {
        runs++
        return route.fulfill({ status: 400, json: { error: 'Command execution rejected' } })
      }
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${indicatorCss}</style><div id="root"></div><script>${bundle.output.find(item => item.type === 'chunk')!.code}</script></html>` })
    })
    await page.clock.install()
    await page.goto('http://mew-command-recovery.test/')
    await page.getByRole('button', { name: '명령 목록', exact: true }).click()
    const menu = page.locator('[data-command-menu]')
    const loading = menu.getByRole('status', { name: '불러오는 중…' })
    const retry = menu.getByRole('button', { name: '다시 시도', exact: true })
    const nextPoll = async () => {
      const response = page.waitForResponse(res => new URL(res.url()).pathname === '/api/cmd-buttons')
      await page.clock.runFor(3000)
      await response
      await page.clock.runFor(1)
    }
    await loading.waitFor()
    assert.equal(await loading.textContent(), '', 'automatic waiting shows only the indicator')
    assert.equal(await loading.locator('.mew-loading-dot').count(), 3)
    assert.equal(await menu.getByText('Temporary metadata failure', { exact: true }).count(), 0)
    assert.equal(await menu.getByRole('button', { name: '명령 추가', exact: true }).isDisabled(), true)
    status = 200
    await nextPoll()
    const command = menu.getByRole('button', { name: '개발 서버', exact: true })
    await command.waitFor()
    await loading.waitFor({ state: 'hidden' })
    assert.equal(await command.isEnabled(), true)

    status = 503
    await nextPoll()
    await loading.waitFor()
    assert.equal(await command.isVisible(), true, 'polling failure preserves the last verified command list')
    assert.equal(await command.isDisabled(), true, 'cached actions wait for current metadata')
    await command.dispatchEvent('contextmenu')
    assert.equal(await menu.isVisible(), true, 'context menus cannot edit unverified command state')
    assert.equal(await page.getByRole('dialog').count(), 0)
    assert.equal(await menu.getByRole('alert').count(), 0)
    for (let attempt = 0; attempt < AUTOMATIC_RETRY_LIMIT - 1; attempt++) {
      await nextPoll()
      assert.equal(await retry.count(), 0, `failure ${attempt + 2} is still an automatic wait`)
    }
    await nextPoll()
    await retry.waitFor()
    await loading.waitFor({ state: 'hidden' })
    const exhaustedReads = reads
    await page.clock.runFor(12_000)
    assert.equal(reads, exhaustedReads, 'metadata polling stops after the initial failure and eleven retries')
    assert.equal(await command.isVisible(), true)
    status = 200
    const retryResponse = page.waitForResponse(res => new URL(res.url()).pathname === '/api/cmd-buttons')
    await retry.click()
    await retryResponse
    await retry.waitFor({ state: 'hidden' })
    assert.equal(await command.isEnabled(), true)

    status = 403
    await nextPoll()
    await menu.getByRole('alert').filter({ hasText: 'Command access denied' }).waitFor()
    const deniedReads = reads
    await page.clock.runFor(9000)
    assert.equal(reads, deniedReads, 'permission errors are surfaced immediately and are never auto retried')
    status = 200
    await retry.click()
    await retry.waitFor({ state: 'hidden' })
    await command.click()
    await menu.getByText('Command execution rejected', { exact: true }).waitFor()
    assert.equal(runs, 1, 'failed command executions are not automatically replayed')
    await nextPoll()
    assert.equal(await menu.getByText('Command execution rejected', { exact: true }).isVisible(), true, 'status polling cannot erase an action failure')

    // A slow successful request must not be perpetually superseded by polling.
    releaseLoad = () => {}
    nextName = '갱신된 개발 서버'
    const beforeSlow = reads
    const slowRequest = page.waitForRequest(request => new URL(request.url()).pathname === '/api/cmd-buttons')
    await page.clock.runFor(3000)
    await slowRequest
    await page.clock.runFor(9000)
    assert.equal(reads, beforeSlow + 1, 'only one metadata request runs at a time')
    const release = releaseLoad
    releaseLoad = undefined
    release?.()
    await menu.getByRole('button', { name: nextName, exact: true }).waitFor()
    assert.deepEqual(errors, [])
    await page.close()
  }
})
