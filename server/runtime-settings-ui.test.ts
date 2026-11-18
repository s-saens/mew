import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { connectTestBrowser } from './test-browser.ts'

const root = path.resolve(import.meta.dirname, '..')
test('runtime settings show readiness first, preserve execution edits across tabs and confirm management actions', { timeout: 60_000 }, async t => {
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
  const componentFiles = chunk.moduleIds.filter(id => id.endsWith('.tsx') &&
    (id.startsWith(path.join(root, 'src/')) || id.startsWith(path.join(root, 'packages/'))))
  const componentSources = await Promise.all(componentFiles.map(file => fs.readFile(file, 'utf8')))
  const compiler = await compile(await fs.readFile(path.join(root, 'src/index.css'), 'utf8'), { base: path.join(root, 'src'), onDependency() {} })
  const css = compiler.build(componentSources.join('\n').match(/[A-Za-z0-9_@!&>:/.[\]()%,-]+/g) ?? [])
  const browser = await connectTestBrowser()
  t.after(() => browser.close())
  for (const width of [360, 1100]) {
    const page = await browser.newPage({ viewport: { width, height: 700 }, locale: 'ko-KR' })
    page.setDefaultTimeout(5000)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    let saved: unknown
    let resetRequests = 0, uninstallRequests = 0, uninstallable = false, installed = true
    await page.route('http://mew-settings.test/**', route => {
      const req = route.request(), pathname = new URL(req.url()).pathname
      if (pathname === '/app.js') return route.fulfill({ contentType: 'text/javascript; charset=utf-8', body: chunk.code })
      if (pathname === '/api/agent-runtimes') return route.fulfill({ json: { runtimes: [{ id: 'codex', label: 'Codex', surface: 'acp', installed, connectorInstalled: true, installing: false, installable: true, uninstallable, logoutable: true }] } })
      if (pathname === '/api/agent-runtimes/codex/install' && req.method() === 'DELETE') { uninstallRequests++; installed = false; return route.fulfill({ json: { status: { id: 'codex', installed: false }, output: '' } }) }
      if (pathname === '/api/agent-runtimes/codex/settings') {
        if (req.method() === 'DELETE') { resetRequests++; return route.fulfill({ json: { ok: true } }) }
        if (req.method() === 'PUT') { saved = req.postDataJSON(); return route.fulfill({ json: { settings: {} } }) }
        return route.fulfill({ json: { settings: { cmd: '/adapter', extraArgs: ['--debug'], env: { OLD_KEY: '****cret', KEEP_KEY: '****1234' } } } })
      }
      if (pathname.endsWith('/account')) return route.fulfill({ json: { account: {
        runtime: 'codex', authentication: 'connected', account: 'dev@example.test', subscription: 'paid', plan: 'Plus',
        subscriptionUrl: null, issue: null, note: null, checkedAt: '2026-11-18T00:00:00Z',
      } } })
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="ko" class="${width > 400 ? 'dark' : ''}"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style><div id="root"></div><script src="/app.js"></script></html>` })
    })
    await page.goto('http://mew-settings.test/')
    const open = page.getByRole('button', { name: 'Codex 설정', exact: true })
    const dialog = page.getByRole('dialog', { name: 'Codex 설정', exact: true })
    const overview = dialog.getByRole('tab', { name: '개요', exact: true })
    const advanced = dialog.getByRole('tab', { name: '고급 실행 설정', exact: true })
    const management = dialog.getByRole('tab', { name: '관리', exact: true })
    const save = dialog.getByRole('button', { name: '저장', exact: true })
    const reset = dialog.getByRole('button', { name: '실행 설정 초기화' })
    const remove = dialog.getByRole('button', { name: '런타임 삭제' })
    const command = dialog.getByLabel('Codex 연결 프로그램 실행 파일', { exact: true })

    await open.click()
    await dialog.getByText('dev@example.test').waitFor()
    await dialog.getByText('연결 프로그램', { exact: true }).waitFor()
    await dialog.getByText('Codex CLI', { exact: true }).waitFor()
    assert.equal(await overview.getAttribute('aria-selected'), 'true')
    assert.equal(await save.isVisible(), false)
    assert.equal(await remove.isVisible(), false)
    assert.equal(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth), true)
    const tabTop = (await overview.boundingBox())!.y

    await overview.focus()
    await page.keyboard.press('ArrowRight')
    await command.waitFor()
    assert.equal((await advanced.boundingBox())!.y, tabTop)
    assert.equal(await advanced.getAttribute('aria-selected'), 'true')
    assert.equal(await save.isDisabled(), true)
    await command.fill('/different-adapter')
    assert.equal(await save.isEnabled(), true)
    await command.fill('/adapter')
    assert.equal(await save.isDisabled(), true)
    await command.fill('')
    await dialog.getByLabel('추가 인자').fill('')
    await dialog.getByRole('button', { name: '줄 삭제' }).first().click()
    assert.equal(await save.isEnabled(), true)
    await advanced.focus()
    await page.keyboard.press('End')
    await reset.waitFor()
    assert.equal((await management.boundingBox())!.y, tabTop)
    assert.equal(await management.getAttribute('aria-selected'), 'true')
    assert.equal(await remove.isDisabled(), true)
    await dialog.getByText(/Mew에 포함된 연결 프로그램은 자동 삭제할 수 없습니다/).waitFor()
    await reset.click()
    await page.getByText(/모델 기본값과 공급자 로그인은 유지됩니다/).waitFor()
    await page.getByRole('button', { name: '취소', exact: true }).click()
    assert.equal(resetRequests, 0)
    await management.focus()
    await page.keyboard.press('Home')
    assert.equal(await overview.getAttribute('aria-selected'), 'true')
    await advanced.click()
    assert.equal(await command.inputValue(), '')
    assert.equal(await dialog.getByLabel('추가 인자').inputValue(), '')
    assert.equal(await dialog.getByLabel('환경 변수 이름').count(), 1)
    assert.equal(await dialog.getByLabel('환경 변수 이름').inputValue(), 'KEEP_KEY')
    if (width === 360) {
      const addVariable = dialog.getByRole('button', { name: '추가', exact: true })
      for (let i = 0; i < 10; i++) await addVariable.click()
      assert.equal(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth), true)
    }
    const saveBox = await save.boundingBox()
    assert.ok(saveBox && saveBox.x >= 0 && saveBox.x + saveBox.width <= width && saveBox.y >= 0 && saveBox.y + saveBox.height <= 700)
    await save.click()
    await dialog.waitFor({ state: 'hidden' })
    assert.deepEqual(saved, { cmd: null, extraArgs: [], removeEnv: ['OLD_KEY'] })

    await open.click()
    await management.click()
    await reset.click()
    await page.getByRole('button', { name: '초기화', exact: true }).click()
    await dialog.waitFor({ state: 'hidden' })
    assert.equal(resetRequests, 1)
    uninstallable = true
    await open.click()
    await management.click()
    await remove.click()
    await page.getByText(/등록된 삭제 명령을 실행합니다/).waitFor()
    await page.getByRole('button', { name: '삭제', exact: true }).click()
    await dialog.getByRole('status').filter({ hasText: '설치되지 않음' }).waitFor()
    assert.equal(uninstallRequests, 1)
    await overview.click()
    const overviewPanel = dialog.getByRole('tabpanel', { name: '개요' })
    await overviewPanel.getByText('연결 프로그램', { exact: true }).locator('..').getByText('설치됨', { exact: true }).waitFor()
    await overviewPanel.getByText('Codex CLI', { exact: true }).locator('..').getByText('설치되지 않음', { exact: true }).waitFor()
    await dialog.getByRole('button', { name: '설치', exact: true }).waitFor()
    assert.equal(await dialog.getByRole('button', { name: '로그인', exact: true }).isVisible(), false)
    await dialog.getByRole('button', { name: '닫기', exact: true }).click()
    await dialog.waitFor({ state: 'hidden' })
    assert.equal(await open.evaluate(el => el === el.ownerDocument.activeElement), true)
    assert.deepEqual(errors, [])
    await page.close()
  }
})
