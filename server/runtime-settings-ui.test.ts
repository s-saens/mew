import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { connectTestBrowser } from './test-browser.ts'

const root = path.resolve(import.meta.dirname, '..')
test('runtime settings distinguish connector and preserve only intended edits', { timeout: 60_000 }, async () => {
  const source = `import React from '${root}/node_modules/react/index.js';
import {createRoot} from '${root}/node_modules/react-dom/client.js';
import {I18nProvider} from '${root}/src/i18n.tsx';
import {RuntimeSettingsButton} from '${root}/src/components/RuntimeSettingsModal.tsx';
localStorage.setItem('mew:locale','ko');
createRoot(document.getElementById('root')).render(<I18nProvider><RuntimeSettingsButton runtimeId="codex" label="Codex"/></I18nProvider>);`
  const bundle = await build({ input: 'virtual:fixture.tsx', write: false, platform: 'browser', onLog(level, log, handler) { if (log.code !== 'MODULE_LEVEL_DIRECTIVE') handler(level, log) }, output: { format: 'iife', codeSplitting: false }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } }, plugins: [{
    name: 'fixture', resolveId(id) { if (id === 'virtual:fixture.tsx') return id; if (id.endsWith('.css')) return 'virtual:style' },
    async load(id) { if (id === 'virtual:fixture.tsx') return source; if (id === 'virtual:style') return ''; if (id.endsWith('?raw')) return `export default ${JSON.stringify(await fs.readFile(id.slice(0, -4), 'utf8'))}` },
  }] })
  const chunk = bundle.output.find(item => item.type === 'chunk')!
  const browser = await connectTestBrowser()
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 700 }, locale: 'ko-KR' })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    let saved: unknown
    let resetRequests = 0, uninstallRequests = 0, uninstallable = false, installed = true
    await page.route('http://mew-settings.test/**', route => {
      const req = route.request(), pathname = new URL(req.url()).pathname
      if (pathname === '/app.js') return route.fulfill({ contentType: 'text/javascript; charset=utf-8', body: chunk.code })
      if (pathname === '/api/agent-runtimes') return route.fulfill({ json: { runtimes: [{ id: 'codex', installed, installable: true, uninstallable }] } })
      if (pathname === '/api/agent-runtimes/codex/install' && req.method() === 'DELETE') { uninstallRequests++; installed = false; return route.fulfill({ json: { status: { id: 'codex', installed: false }, output: '' } }) }
      if (pathname === '/api/agent-runtimes/codex/settings') {
        if (req.method() === 'DELETE') { resetRequests++; return route.fulfill({ json: { ok: true } }) }
        if (req.method() === 'PUT') { saved = req.postDataJSON(); return route.fulfill({ json: { settings: {} } }) }
        return route.fulfill({ json: { settings: { cmd: '/adapter', extraArgs: ['--debug'], env: { OLD_KEY: '****cret', KEEP_KEY: '****1234' } } } })
      }
      if (pathname.endsWith('/account')) return route.fulfill({ status: 500, json: {} })
      return route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><div id="root"></div><script src="/app.js"></script>' })
    })
    await page.goto('http://mew-settings.test/')
    await page.waitForTimeout(500)
    assert.deepEqual(errors, [])
    await page.getByRole('button', { name: /Codex (설정|settings)/i }).click({ timeout: 5000 })
    await page.getByText('연결 프로그램 설치됨').waitFor()
    await page.getByText(/호스트에 설치된 Codex CLI/).waitFor()
    assert.equal(await page.getByRole('button', { name: '런타임 삭제' }).isDisabled(), true)
    await page.getByText(/Mew에 포함된 연결 프로그램은 자동 삭제할 수 없습니다/).waitFor()
    await page.getByRole('button', { name: '실행 설정 초기화' }).click()
    await page.getByText(/모델 기본값과 공급자 로그인은 유지됩니다/).waitFor()
    await page.getByRole('button', { name: '취소', exact: true }).last().click()
    assert.equal(resetRequests, 0)
    await page.getByRole('button', { name: '실행 설정 초기화' }).click()
    await page.getByRole('button', { name: '초기화', exact: true }).click()
    await page.getByRole('button', { name: /Codex (설정|settings)/i }).click()
    assert.equal(resetRequests, 1)
    await page.getByText('연결 프로그램 설치됨').waitFor()
    await page.getByText('고급 실행 설정').click()
    await page.getByLabel('Codex 연결 프로그램 실행 파일').fill('')
    await page.getByLabel('추가 인자').fill('')
    await page.getByRole('button', { name: '줄 삭제' }).first().click()
    await page.getByRole('button', { name: '저장', exact: true }).click()
    assert.deepEqual(saved, { cmd: null, extraArgs: [], removeEnv: ['OLD_KEY'] })
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
    uninstallable = true
    await page.getByRole('button', { name: /Codex (설정|settings)/i }).click()
    const remove = page.getByRole('button', { name: '런타임 삭제' })
    await remove.waitFor({ state: 'visible' })
    await remove.click()
    await page.getByText(/등록된 삭제 명령을 실행합니다/).waitFor()
    await page.getByRole('button', { name: '삭제', exact: true }).click()
    await page.getByText('연결 프로그램 설치되지 않음').waitFor()
    assert.equal(uninstallRequests, 1)
  } finally { await browser.close() }
})
