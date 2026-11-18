import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { connectTestBrowser } from './test-browser.ts'

const root = path.resolve(import.meta.dirname, '..')
async function fixtureBundle(source: string) {
  const bundle = await build({ input: 'virtual:fixture.tsx', write: false, platform: 'browser', onLog(level, log, handler) { if (log.code !== 'MODULE_LEVEL_DIRECTIVE') handler(level, log) }, output: { format: 'iife', codeSplitting: false }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } }, plugins: [{
    name: 'fixture',
    async resolveId(id, importer) {
      if (id === 'virtual:fixture.tsx') return id
      if (id.endsWith('.css')) return 'virtual:style'
      if (id.endsWith('?raw')) {
        const resolved = await this.resolve(id.slice(0, -4), importer, { skipSelf: true })
        if (resolved) return `${resolved.id}?raw`
      }
    },
    async load(id) {
      if (id === 'virtual:fixture.tsx') return source
      if (id === 'virtual:style') return ''
      if (id.endsWith('?raw')) return `export default ${JSON.stringify(await fs.readFile(id.slice(0, -4), 'utf8'))}`
    },
  }] })
  return bundle.output.find(item => item.type === 'chunk')!.code
}

test('Install becomes a terminal action with live output, retry and retained results on desktop and mobile', { timeout: 60_000 }, async t => {
  const source = `import React from '${root}/node_modules/react/index.js';
import {createRoot} from '${root}/node_modules/react-dom/client.js';
import {DialogFrame} from '@mew/ui';
import {setUiLocale} from '@mew/ui/i18n-core';
import {RuntimeInstallAction} from '${root}/src/components/RuntimeInstallProgress.tsx';
import {useRuntimeInstall} from '${root}/src/hooks/use-runtime-install.ts';
import {refreshAgentRuntimes,subscribeAgentRuntimes} from '${root}/src/utils/agentPickerCache.ts';
setUiLocale('ko');
function Fixture(){
  const [status,setStatus]=React.useState(null);
  const installation=useRuntimeInstall();
  React.useEffect(()=>{
    const dispose=subscribeAgentRuntimes(items=>setStatus(items[0]));
    void refreshAgentRuntimes();
    return dispose;
  },[]);
  return <RuntimeInstallAction runtimeId="fixture" label="Fixture runtime" status={status} {...installation}/>;
}
createRoot(document.getElementById('root')).render(
  <DialogFrame labelledBy="setup-title" onClose={()=>{}}>
    <h2 id="setup-title">Setup</h2>
    <Fixture/>
  </DialogFrame>
);`
  const code = await fixtureBundle(source)
  const compiler = await compile(await fs.readFile(`${root}/src/index.css`, 'utf8'), { base: `${root}/src`, onDependency() {} })
  const files = ['src/components/RuntimeInstallProgress.tsx', 'src/components/SessionTerminalPopup.tsx', 'packages/ui/src/dialog-frame.tsx']
  const content = (await Promise.all(files.map(file => fs.readFile(path.join(root, file), 'utf8')))).join('\n')
  const css = compiler.build(content.match(/[A-Za-z0-9_:[\]./!%#()-]+/g) ?? [])
  const browser = await connectTestBrowser()
  t.after(() => browser.close())
  for (const [width, dark] of [[1100, true], [390, false]] as const) {
    const page = await browser.newPage({ viewport: { width, height: 700 } })
    let state: 'idle' | 'running' | 'failed' | 'succeeded' = 'idle'
    let output = '', polls = 0, attempts = 0
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    const status = () => ({
      id: 'fixture', label: 'Fixture runtime', installed: state === 'succeeded', installing: state === 'running', installable: true,
      installation: state === 'idle' ? undefined : { state, output },
    })
    await page.route('http://mew-install.test/**', route => {
      const request = route.request()
      const url = new URL(request.url())
      if (url.pathname === '/app.js') return route.fulfill({ contentType: 'text/javascript', body: code })
      if (url.pathname === '/api/agent-runtimes') {
        polls++
        return route.fulfill({ json: { runtimes: [status()] } })
      }
      if (url.pathname === '/api/agent-runtimes/fixture/install') {
        if (request.method() === 'POST') {
          assert.equal(url.searchParams.get('background'), '1')
          state = 'running'
          output = `downloading attempt ${++attempts}\n`
          return route.fulfill({ status: 202, json: { status: status(), output, attempt: String(attempts) } })
        }
        assert.equal(url.searchParams.get('attempt'), String(attempts))
        if (state === 'failed') return route.fulfill({ status: 400, json: { error: 'fixture failed' } })
        return route.fulfill({ json: { status: status(), output } })
      }
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html class="${dark ? 'dark' : ''}"><head><meta charset="utf-8"><style>${css}body{margin:0}</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>` })
    })

    await page.goto('http://mew-install.test/')
    const install = page.getByRole('button', { name: '설치', exact: true })
    await install.focus()
    await page.keyboard.press('Enter')
    const terminal = page.getByRole('button', { name: 'Fixture runtime · 설치 · 터미널 세션 보기' })
    await terminal.waitFor()
    assert.ok(await terminal.evaluate(el => el.ownerDocument.activeElement === el), 'the replaced action retains keyboard focus')
    await page.keyboard.press('Enter')
    const popup = page.getByRole('dialog', { name: 'Fixture runtime · 설치' })
    const log = popup.getByLabel('실행 로그')
    await log.getByText('downloading attempt 1', { exact: true }).waitFor()
    assert.equal(await popup.getByRole('status').textContent(), '설치 중…')
    assert.ok(await log.evaluate(el => el.ownerDocument.activeElement === el), 'the terminal owns focus above the parent dialog')

    output += Array.from({ length: 80 }, (_, i) => `extracting ${i} ${'x'.repeat(120)}`).join('\n')
    await log.getByText(/extracting 79/).waitFor()
    assert.ok(await log.evaluate(el => el.scrollTop > 0), 'new logs follow the bottom')
    await log.evaluate(el => { el.scrollTop = 0; el.dispatchEvent(new el.ownerDocument.defaultView!.Event('scroll')) })
    output += '\nmore output'
    await log.getByText(/more output/).waitFor()
    assert.equal(await log.evaluate(el => el.scrollTop), 0, 'reading earlier logs preserves scroll position')
    assert.ok(await log.evaluate(el => el.scrollWidth <= el.clientWidth))
    assert.ok(await popup.evaluate(el => el.ownerDocument.documentElement.scrollWidth <= el.ownerDocument.documentElement.clientWidth))

    await page.keyboard.press('Escape')
    await popup.waitFor({ state: 'hidden' })
    assert.ok(await terminal.evaluate(el => el.ownerDocument.activeElement === el), 'closing restores focus to the terminal action')
    await terminal.click()
    assert.equal(attempts, 1, 'closing and reopening does not run another install')
    state = 'failed'; output += '\nfixture failed'
    await popup.getByRole('status').getByText('실패', { exact: true }).waitFor()
    await log.getByText(/fixture failed/).waitFor()
    await popup.getByRole('button', { name: '닫기', exact: true }).click()

    await page.getByRole('button', { name: '다시 시도', exact: true }).click()
    await terminal.click()
    await log.getByText('downloading attempt 2', { exact: true }).waitFor()
    assert.doesNotMatch(await log.textContent() ?? '', /fixture failed/)
    state = 'succeeded'; output += 'fixture complete'
    await popup.getByRole('status').getByText('설치됨', { exact: true }).waitFor()
    await log.getByText(/fixture complete/).waitFor()
    await popup.getByRole('button', { name: '닫기', exact: true }).click()
    await terminal.and(page.locator(':not([aria-busy])')).waitFor()
    const finalPolls = polls
    await page.waitForTimeout(1100)
    assert.equal(polls, finalPolls, 'polling stops after completion')
    await page.reload()
    await terminal.click()
    await log.getByText(/fixture complete/).waitFor()
    assert.equal(attempts, 2)
    assert.deepEqual(errors, [])
    await page.close()
  }
})

test('successful installation keeps the agent picker open and makes the runtime selectable', { timeout: 30_000 }, async t => {
  const code = await fixtureBundle(`import React from '${root}/node_modules/react/index.js';
import {createRoot} from '${root}/node_modules/react-dom/client.js';
import {I18nProvider} from '${root}/src/i18n.tsx';
import {AgentPanel} from '${root}/src/components/AgentPanel.tsx';
localStorage.setItem('mew:locale','ko');
createRoot(document.getElementById('root')).render(<I18nProvider>
  <AgentPanel requestedPicker project="test" workspacePath="/workspace" tree={[]} focusedFilePath={null} onOpenFile={()=>{}} onClose={()=>{}} />
</I18nProvider>);`)
  const browser = await connectTestBrowser()
  t.after(() => browser.close())
  const page = await browser.newPage()
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  let installed = false
  const runtime = () => ({ id: 'kimi', installed, installable: true, installing: false, installation: installed ? { state: 'succeeded', output: 'Kimi installation complete' } : undefined })
  await page.route('http://mew-picker-install.test/**', route => {
    const request = route.request()
    const { pathname } = new URL(request.url())
    if (pathname === '/app.js') return route.fulfill({ contentType: 'text/javascript', body: code })
    if (pathname === '/api/agent-runtimes') return route.fulfill({ json: { runtimes: [runtime()] } })
    if (pathname === '/api/agent-runtimes/kimi/install' && request.method() === 'POST') {
      installed = true
      return route.fulfill({ json: { status: runtime(), output: 'Kimi installation complete' } })
    }
    if (pathname === '/api/user-ui/agent-tabs') return route.fulfill({ json: { state: { tabs: [], activeId: null }, claims: [] } })
    if (pathname === '/api/updates/status') return route.fulfill({ json: { items: [], job: { running: false, items: [] } } })
    if (pathname.startsWith('/api/')) return route.fulfill({ json: {} })
    return route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><div id="root"></div><script src="/app.js"></script>' })
  })
  await page.goto('http://mew-picker-install.test/')
  const kimi = page.locator('[data-runtime-id="kimi"]')
  await kimi.getByRole('button', { name: '설치', exact: true }).click()
  await kimi.getByRole('button', { name: 'Kimi Code · 설치 · 터미널 세션 보기' }).click()
  const popup = page.getByRole('dialog', { name: 'Kimi Code · 설치' })
  await popup.getByText('Kimi installation complete', { exact: true }).waitFor()
  assert.equal(await page.getByRole('tab').count(), 0, 'the user remains in the picker')
  await popup.getByRole('button', { name: '닫기', exact: true }).click()
  assert.equal(await kimi.getByRole('button', { name: 'Kimi Code', exact: true }).isEnabled(), true)
  assert.deepEqual(errors, [])
})
