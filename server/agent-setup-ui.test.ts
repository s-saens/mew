import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { connectTestBrowser } from './test-browser.ts'

const root = path.resolve(import.meta.dirname, '..')
test('Agent setup lists and installs runtimes and creates a set using an installed runtime', { timeout: 60_000 }, async () => {
  const source = `
import React from '${root}/node_modules/react/index.js';
import {createRoot} from '${root}/node_modules/react-dom/client.js';
import {I18nProvider} from '${root}/src/i18n.tsx';
import {AgentSetupModal} from '${root}/src/components/AgentSetupModal.tsx';
localStorage.setItem('mew:locale','ko');
createRoot(document.getElementById('root')).render(<I18nProvider><AgentSetupModal onClose={()=>{}}/></I18nProvider>);`
  const bundle = await build({ input: 'virtual:setup.tsx', write: false, platform: 'browser', onLog(level, log, handler) { if (log.code !== 'MODULE_LEVEL_DIRECTIVE') handler(level, log) }, output: { format: 'iife', codeSplitting: false }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } }, plugins: [{
    name: 'fixture', resolveId(id) { if (id === 'virtual:setup.tsx') return id; if (id.endsWith('.css')) return 'virtual:style' },
    async load(id) { if (id === 'virtual:setup.tsx') return source; if (id === 'virtual:style') return ''; if (id.endsWith('?raw')) return `export default ${JSON.stringify(await fs.readFile(id.slice(0, -4), 'utf8'))}` },
  }] })
  const chunk = bundle.output.find(item => item.type === 'chunk')!
  const browser = await connectTestBrowser()
  try {
    const page = await browser.newPage()
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    let installed = false
    let sets: Record<string, unknown>[] = []
    const runtime = () => ({ id: 'claude', label: 'Claude Agent', surface: 'acp', installed, installing: false, installable: true, uninstallable: true, logoutable: true })
    await page.route('http://localhost:48977/**', route => {
      const pathname = new URL(route.request().url()).pathname
      if (pathname === '/app.js') return route.fulfill({ contentType: 'text/javascript; charset=utf-8', body: chunk.code })
      if (pathname === '/api/agent-runtimes') return route.fulfill({ json: { runtimes: [runtime()] } })
      if (pathname === '/api/agent-runtimes/claude/install') {
        installed = route.request().method() !== 'DELETE'
        return route.fulfill({ json: { status: runtime(), output: '' } })
      }
      if (pathname === '/api/agent-runtimes/claude/settings') return route.fulfill({ json: { settings: null } })
      if (pathname === '/api/agent-runtimes/claude/account') return route.fulfill({ status: 500, json: {} })
      if (pathname === '/api/agent-task-bindings') return route.fulfill({ json: { bindings: {} } })
      if (pathname === '/api/agent-sets') { if (route.request().method() === 'PUT') sets = route.request().postDataJSON().sets; return route.fulfill({ json: { sets } }) }
      if (pathname.endsWith('/models')) return route.fulfill({ json: { models: [] } })
      return route.fulfill({ contentType: 'text/html', body: '<!doctype html><div id="root"></div><script src="/app.js"></script>' })
    })
    await page.goto('http://localhost:48977/')
    await page.getByRole('button', { name: '설치', exact: true }).click({ timeout: 3000 })
    await page.getByText('설치됨', { exact: true }).waitFor()
    await page.getByRole('button', { name: '+ 새 에이전트셋 추가' }).click()
    const editor = page.getByRole('dialog', { name: '새 에이전트셋' })
    assert.match(await editor.getByRole('combobox', { name: '에이전트' }).textContent() ?? '', /Claude/)
    await editor.getByLabel('이름', { exact: true }).fill('My agent')
    await editor.getByLabel('역할 지침').fill('Help')
    await editor.getByRole('button', { name: '저장', exact: true }).click()
    await editor.waitFor({ state: 'hidden' })
    assert.equal(sets[0].runtime, 'claude')
    await page.getByRole('button', { name: 'Claude Agent 설정' }).click()
    const settings = page.getByRole('dialog', { name: 'Claude Agent 설정' })
    await settings.getByRole('tab', { name: '관리' }).click()
    await settings.getByRole('button', { name: '런타임 삭제' }).click()
    await page.getByRole('button', { name: '삭제', exact: true }).click()
    await settings.getByRole('status').filter({ hasText: '설치되지 않음' }).waitFor()
    await settings.getByRole('button', { name: '닫기', exact: true }).click()
    await page.getByRole('button', { name: '설치', exact: true }).waitFor({ timeout: 3000 })
    assert.deepEqual(errors, [])
  } finally { await browser.close() }
})
