import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { connectTestBrowser } from './test-browser.ts'

const root = path.resolve(import.meta.dirname, '..')
function releasePending(pending: { release?: () => void }) {
  assert.ok(pending.release)
  pending.release()
}
test('task defaults select configured sets without replacing explicit choices or existing jobs', { timeout: 60_000 }, async () => {
  const source = `import React from '${root}/node_modules/react/index.js';
import {createRoot} from '${root}/node_modules/react-dom/client.js';
import {I18nProvider} from '${root}/src/i18n.tsx';
import {GitAiCommitDialog} from '${root}/src/components/git-ai-commit-dialog.tsx';
import {ScheduleModal} from '${root}/src/components/ScheduleModal.tsx';
localStorage.setItem('mew:locale','ko');
createRoot(document.getElementById('root')).render(<I18nProvider>{location.pathname === '/schedule' ? <ScheduleModal onClose={()=>{}}/> : <GitAiCommitDialog project="demo" files={['one.txt']} onFinished={()=>{}} onClose={()=>{}}/>}</I18nProvider>);`
  const bundle = await build({ input: 'virtual:defaults.tsx', write: false, platform: 'browser', onLog(level, log, handler) { if (log.code !== 'MODULE_LEVEL_DIRECTIVE') handler(level, log) }, output: { format: 'iife' }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } }, plugins: [{
    name: 'fixture', resolveId(id) { if (id === 'virtual:defaults.tsx') return id; if (id.endsWith('.css')) return 'virtual:style' },
    async load(id) { if (id === 'virtual:defaults.tsx') return source; if (id === 'virtual:style') return ''; if (id.endsWith('?raw')) return `export default ${JSON.stringify(await fs.readFile(id.slice(0, -4), 'utf8'))}` },
  }] })
  const chunk = bundle.output.find(item => item.type === 'chunk')!
  const files = ['src/components/git-ai-commit-dialog.tsx', 'src/components/AgentSetPicker.tsx', 'src/components/ScheduleModal.tsx', 'packages/ui/src/dialog-frame.tsx', 'packages/ui/src/select-field.tsx']
  const content = (await Promise.all(files.map(file => fs.readFile(path.join(root, file), 'utf8')))).join('\n')
  const compiler = await compile(await fs.readFile(`${root}/src/index.css`, 'utf8'), { base: `${root}/src`, onDependency() {} })
  const css = compiler.build([...new Set((source + content).match(/[A-Za-z0-9_@!:/.[\]()%,-]+/g))])
  const browser = await connectTestBrowser()
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 844 } })
    page.setDefaultTimeout(5000)
    const sets = [
      { id: 'default', name: 'Default agent', runtime: 'codex', role: 'Default', modelId: '' },
      { id: 'alternate', name: 'Alternate agent', runtime: 'claude', role: 'Alternate', modelId: '' },
    ]
    const runtimes = [{ id: 'codex', label: 'Codex' }, { id: 'claude', label: 'Claude' }]
    const existing = { id: 'old', name: 'Existing schedule', cron: '0 2 * * *', project: '', agent: 'claude', agentSet: sets[1], prompt: 'Keep this', enabled: true, command: '', lastRun: null, session: '', running: false }
    let saved: { id: string; agent: string; agentSetId?: string; prompt: string }[] = []
    const started: string[] = []
    let existingCommit = false
    let delayBindings = false
    const pending: { release?: () => void } = {}
    await page.route('http://mew-defaults.test/**', async route => {
      const request = route.request(), p = new URL(request.url()).pathname
      if (p === '/app.js') return route.fulfill({ contentType: 'text/javascript; charset=utf-8', body: chunk.code })
      if (p === '/api/agent-task-bindings') {
        if (delayBindings) await new Promise<void>(resolve => { pending.release = resolve })
        return route.fulfill({ json: { bindings: { gitCommit: 'default', schedule: 'default' } } })
      }
      if (p === '/api/agent-sets') return route.fulfill({ json: { sets } })
      if (p === '/api/projects') return route.fulfill({ json: [] })
      if (p === '/api/workspace') return route.fulfill({ json: { path: '/workspace', projects: [] } })
      if (p === '/api/schedules') {
        if (request.method() === 'PUT') saved = request.postDataJSON().jobs
        return route.fulfill({ json: { jobs: saved.length ? saved.map(job => ({ ...existing, ...job, agentSet: sets.find(set => set.id === job.agentSetId) })) : [existing], runtimes, agentSets: sets, otherLines: [] } })
      }
      if (p.startsWith('/api/git/ai-commit')) {
        if (request.method() === 'POST') { started.push(request.postDataJSON().agentSetId); return route.fulfill({ json: { job: { id: 'new', state: 'running', agentSetName: sets.find(s => s.id === started.at(-1))!.name, output: '', startedAt: Date.now() } } }) }
        return route.fulfill({ json: { job: existingCommit ? { id: 'previous', state: 'completed', agentSetName: 'Previous agent', output: '', startedAt: 1, result: { commits: [], skipped: [] } } : null } })
      }
      return route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><meta charset="utf-8"><style>${css}</style><div id="root"></div><script src="/app.js"></script>` })
    })
    await page.goto('http://mew-defaults.test/commit')
    await page.getByText('Default agent', { exact: true }).waitFor()
    await page.getByRole('button', { name: '변경사항 분석' }).click()
    assert.deepEqual(started, ['default'])
    await page.reload()
    await page.getByText('Default agent', { exact: true }).waitFor()
    await page.getByRole('button', { name: '에이전트셋 선택', exact: true }).click()
    await page.getByRole('button', { name: /Alternate agent/ }).first().click()
    await page.getByRole('button', { name: '변경사항 분석' }).click()
    assert.deepEqual(started, ['default', 'alternate'])
    delayBindings = true
    pending.release = undefined
    await page.reload()
    await page.getByRole('button', { name: /Alternate agent/ }).first().click()
    const bindingResponse = page.waitForResponse(response => response.url().endsWith('/api/agent-task-bindings'))
    releasePending(pending)
    await bindingResponse
    await page.getByText('Alternate agent', { exact: true }).waitFor()
    await page.getByRole('button', { name: '변경사항 분석' }).click()
    assert.deepEqual(started, ['default', 'alternate', 'alternate'], 'late defaults do not replace an explicit choice')
    delayBindings = false
    existingCommit = true
    await page.reload()
    await page.getByText('Previous agent · 자동 커밋 완료', { exact: true }).waitFor()
    delayBindings = true
    pending.release = undefined
    await page.goto('http://mew-defaults.test/schedule')
    const add = page.getByRole('button', { name: '+ 예약 작업 추가' })
    await page.getByRole('button', { name: /Existing schedule/ }).waitFor()
    assert.ok(await add.isDisabled(), 'new schedules wait for their default')
    releasePending(pending)
    await add.waitFor({ state: 'visible' })
    await page.waitForFunction(`!Array.from(document.querySelectorAll('button')).find(button => button.textContent.includes('+ 예약 작업 추가')).disabled`)
    await page.getByRole('button', { name: /Existing schedule/ }).click()
    assert.equal(await page.getByRole('combobox', { name: '에이전트셋' }).innerText(), 'Alternate agent')
    await page.getByRole('button', { name: '+ 예약 작업 추가' }).click()
    const agent = page.getByRole('combobox', { name: '에이전트셋' })
    assert.equal(await agent.innerText(), 'Default agent')
    await agent.click(); await page.getByRole('option', { name: 'Alternate agent' }).click()
    await page.getByRole('textbox', { name: '작업 이름' }).fill('New schedule')
    await page.getByRole('textbox', { name: '작업 내용' }).fill('Do this')
    await page.getByRole('button', { name: '저장', exact: true }).click()
    await page.waitForFunction(`!document.querySelector('[role=combobox]:disabled')`)
    assert.equal(saved.length, 2)
    assert.deepEqual(saved.map(({ agent, agentSetId, prompt }) => ({ agent, agentSetId, prompt })), [
      { agent: 'claude', agentSetId: 'alternate', prompt: 'Keep this' },
      { agent: 'claude', agentSetId: 'alternate', prompt: 'Do this' },
    ])
  } finally { await browser.close() }
})
