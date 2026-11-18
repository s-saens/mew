import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { connectTestBrowser } from './test-browser.ts'
import type { UpdateItem, UpdatesStatus } from '../shared/updates.ts'

const root = path.resolve(import.meta.dirname, '..')
const updateItem = (id: string, label: string, available: boolean, canUpdate = available): UpdateItem => ({
  id, label, category: 'agent', current: '1.0.0', latest: available ? '2.0.0' : '1.0.0', available, canUpdate, error: null,
})

async function pickerFixture() {
  const source = `import React from '${root}/node_modules/react/index.js';
import {createRoot} from '${root}/node_modules/react-dom/client.js';
import {useRuntimeUpdates, RuntimeUpdateAction} from '${root}/src/components/runtime-update-actions.tsx';
import {I18nProvider} from '${root}/src/i18n.tsx';
localStorage.setItem('mew:locale', 'ko');
function Picker({canViewSessions, installed}) {
  const updates = useRuntimeUpdates(true);
  const runtimes = [['codex', 'Codex'], ['kimi', 'Kimi Code'], ['cursor', 'Cursor CLI']];
  return runtimes.map(([id, label], index) => <div key={id} data-id={id} className="relative flex flex-wrap items-center gap-2 px-2">
    <span className="min-w-0 flex-1 truncate">{label}</span>
    <RuntimeUpdateAction runtimeId={id} runtimeLabel={label} installed={id !== 'cursor' || installed} canViewSessions={canViewSessions} updates={updates}/>
    <kbd>{index + 1}</kbd>
  </div>);
}
function App() {
  const [open, setOpen] = React.useState(false);
  const [canViewSessions, setCanViewSessions] = React.useState(true);
  const [installed, setInstalled] = React.useState(true);
  return <>
    <button onClick={() => setOpen(value => !value)}>{open ? 'close picker' : 'open picker'}</button>
    <button onClick={() => setCanViewSessions(value => !value)}>toggle terminal permission</button>
    <button onClick={() => setInstalled(false)}>remove cursor executable</button>
    <div>picker ready</div>
    {open && <Picker canViewSessions={canViewSessions} installed={installed}/>}
  </>;
};
createRoot(document.getElementById('root')).render(<I18nProvider><App/></I18nProvider>);`
  const bundle = await build({
    input: 'virtual:fixture.tsx', write: false, platform: 'browser',
    onLog(level, log, handler) { if (log.code !== 'MODULE_LEVEL_DIRECTIVE') handler(level, log) },
    output: { format: 'iife', codeSplitting: false },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
    plugins: [{
      name: 'fixture',
      resolveId(id) {
        if (id === 'virtual:fixture.tsx') return id
        if (id === '@mew/tmux-term') return 'virtual:terminal.tsx'
        if (id.endsWith('.css')) return 'virtual:style'
      },
      load(id) {
        if (id === 'virtual:fixture.tsx') return source
        if (id === 'virtual:terminal.tsx') return 'export const isHiddenTmuxSession = () => false; export function TmuxTerminal({sessionName}) { return <textarea aria-label="fixture terminal" data-session={sessionName} defaultValue="fixture update output"/>; }'
        if (id === 'virtual:style') return ''
      },
    }],
  })
  const chunk = bundle.output.find(item => item.type === 'chunk')!
  const content = await Promise.all(['src/components/runtime-update-actions.tsx', 'src/components/SessionTerminalPopup.tsx'].map(file => fs.readFile(path.join(root, file), 'utf8')))
  const compiler = await compile(await fs.readFile(path.join(root, 'src/index.css'), 'utf8'), { base: path.join(root, 'src'), onDependency() {} })
  const css = compiler.build([...new Set([source, ...content].join('\n').match(/[A-Za-z0-9_@!:/.[\]()%,-]+/g))])
  return `<html><head><meta charset="utf-8"><style>${css}</style></head><body><div id="root"></div><script>${chunk.code}</script></body></html>`
}

test('runtime updates load independently and run only the matching available update', { timeout: 60_000 }, async () => {
  const fixture = await pickerFixture()
  const browser = await connectTestBrowser()
  try {
    const page = await browser.newPage()
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    let reads = 0
    const requests: string[][] = []
    const status = { items: [updateItem('cli:codex', 'Codex CLI', true), updateItem('agent:kimi', 'Kimi Code', false), updateItem('agent:cursor', 'Cursor CLI', true, false)], checkedAt: 1, job: { running: false, items: [] } }
    await page.route('http://mew.test/**', async route => {
      const url = route.request().url()
      if (url.includes('/api/updates/status')) { reads++; await gate; return route.fulfill({ json: status }) }
      if (url.includes('/api/updates/run')) { requests.push(route.request().postDataJSON().ids); return route.fulfill({ status: 409, json: { error: 'agent is running' } }) }
      return route.fulfill({ contentType: 'text/html', body: fixture })
    })
    await page.goto('http://mew.test/')
    assert.equal(reads, 0)
    await page.getByRole('button', { name: 'open picker' }).click()
    await page.getByText('picker ready').waitFor()
    assert.equal(await page.locator('[data-id] button').count(), 0)
    release()
    await page.locator('[data-id="codex"] button').waitFor({ timeout: 5000 }).catch(async error => { throw new Error(`${error} reads=${reads} html=${await page.locator('body').innerHTML()}`) })
    assert.equal(await page.locator('[data-id="kimi"] button, [data-id="cursor"] button').count(), 0)
    await page.locator('[data-id="codex"] button').click()
    await page.getByRole('alert').waitFor()
    await page.getByRole('button', { name: '다시 시도', exact: true }).waitFor()
    assert.deepEqual(requests, [['cli:codex']])
  } finally { await browser.close() }
})

test('runtime update turns into terminal access and keeps failed and completed sessions available', { timeout: 60_000 }, async t => {
  const fixture = await pickerFixture()
  const browser = await connectTestBrowser()
  t.after(() => browser.close())
  const id = 'agent:cursor'
  const session = 'mewcmd-update-cursor-fixture'
  for (const width of [1100, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 780 } })
    const requests: string[][] = []
    const pageErrors: string[] = []
    page.on('pageerror', error => pageErrors.push(error.message))
    let deletes = 0
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const candidate = updateItem(id, 'Cursor CLI', true)
    let status: UpdatesStatus = { items: [candidate], checkedAt: 1, job: { running: false, items: [] } }
    const failMessage = 'Update failed: ' + 'error-detail/'.repeat(100)
    await page.route('http://mew.test/**', async route => {
      const pathname = new URL(route.request().url()).pathname
      if (pathname === '/api/updates/status') return route.fulfill({ json: status })
      if (pathname === '/api/updates/run') {
        requests.push(route.request().postDataJSON().ids)
        if (requests.length === 1) {
          await gate
          status = { ...status, checkedAt: 0, job: { running: true, items: [{ id, state: 'queued', error: null }] } }
          return route.fulfill({ json: status })
        }
        const completed: UpdatesStatus = { ...status, checkedAt: 0, job: { running: false, items: [{ id, state: 'succeeded', error: null, session }] } }
        status = { ...completed, checkedAt: 2, items: [{ ...candidate, available: false, canUpdate: false, current: candidate.latest, session }] }
        return route.fulfill({ json: completed })
      }
      if (route.request().method() === 'DELETE') { deletes++; return route.fulfill({ json: { ok: true } }) }
      return route.fulfill({ contentType: 'text/html', body: fixture })
    })
    try {
      await page.goto('http://mew.test/')
      const openPicker = page.getByRole('button', { name: 'open picker' })
      const closePicker = page.getByRole('button', { name: 'close picker' })
      const togglePermission = page.getByRole('button', { name: 'toggle terminal permission' })
      await openPicker.click()
      const row = page.locator('[data-id="cursor"]')
      const update = row.getByRole('button', { name: '업데이트', exact: true })
      const terminal = row.getByRole('button', { name: 'Cursor CLI 터미널 세션', exact: true })
      await update.waitFor()
      const updateBounds = await update.boundingBox()
      await update.click()
      await terminal.waitFor()
      assert.equal(await terminal.isDisabled(), true)
      assert.deepEqual(await terminal.boundingBox(), updateBounds, 'starting retains the update button slot')
      const launch = page.waitForResponse(response => response.url().endsWith('/api/updates/run'))
      release()
      await launch
      status = { ...status, items: [{ ...candidate, session }], job: { running: true, items: [{ id, state: 'running', error: null, session }] } }

      await terminal.click()
      const popup = page.getByRole('dialog', { name: 'Cursor CLI' })
      const output = popup.getByRole('textbox', { name: 'fixture terminal' })
      await output.waitFor()
      assert.equal(await output.getAttribute('data-session'), session)
      assert.equal(await output.inputValue(), 'fixture update output')
      assert.equal(await popup.getByRole('button', { name: '종료', exact: true }).count(), 0)
      assert.equal(await popup.evaluate(el => el.ownerDocument.body.contains(el) && !el.closest('[data-id]')), true)
      status = { ...status, job: { running: false, items: [{ id, state: 'failed', error: failMessage, session }] } }
      await popup.getByRole('status').filter({ hasText: '실패' }).waitFor()
      await popup.getByRole('button', { name: '닫기', exact: true }).click()
      assert.equal(await terminal.evaluate(el => el.ownerDocument.activeElement === el), true)
      const retry = row.getByRole('button', { name: '다시 시도', exact: true })
      const error = row.getByRole('alert')
      await error.waitFor()
      assert.equal(await retry.isEnabled(), true)
      assert.equal(await terminal.isEnabled(), true)
      assert.equal(await row.evaluate(el => el.scrollWidth <= el.clientWidth), true)
      const shortcutBounds = await row.locator('kbd').boundingBox(), alertBounds = await error.boundingBox()
      assert.ok(shortcutBounds && alertBounds && shortcutBounds.y + shortcutBounds.height <= alertBounds.y)

      await terminal.click()
      await output.waitFor()
      await togglePermission.dispatchEvent('click')
      await popup.waitFor({ state: 'hidden' })
      await terminal.waitFor({ state: 'hidden' })
      assert.equal(await retry.isEnabled(), true)
      await togglePermission.click()
      await terminal.waitFor()
      assert.equal(await popup.count(), 0)
      await retry.click()
      await terminal.click()
      await popup.getByRole('status').filter({ hasText: '완료' }).waitFor()
      assert.equal(await output.getAttribute('data-session'), session)
      assert.equal(await row.getByRole('button', { name: '업데이트', exact: true }).count(), 0)
      await popup.getByRole('button', { name: '닫기', exact: true }).click()

      await closePicker.click()
      status = { ...status, job: { running: false, items: [{ id: 'cli:codex', state: 'succeeded', error: null }] } }
      await openPicker.click()
      await terminal.click()
      assert.equal(await output.getAttribute('data-session'), session)
      await popup.getByRole('button', { name: '닫기', exact: true }).click()
      await page.getByRole('button', { name: 'remove cursor executable' }).click()
      assert.equal(await terminal.isEnabled(), true)
      assert.deepEqual(requests, [[id], [id]])
      assert.equal(deletes, 0)
      assert.deepEqual(pageErrors, [])
    } finally {
      release()
      await page.close()
    }
  }
})
