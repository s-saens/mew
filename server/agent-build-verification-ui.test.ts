import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { connectTestBrowser } from './test-browser.ts'
import { defaultBranchGuidance } from '../shared/branch-guidance.ts'
import { documentationGuidanceKeys } from '../shared/agent-guidance.ts'
import { defaultAgentBuildVerificationSettings } from '../shared/agent-build-verification.ts'

const root = path.resolve(import.meta.dirname, '..')

test('composer execution toggles capture choices, restore per-tab drafts, announce state, and replace instruction controls', { timeout: 90_000 }, async t => {
  const source = `import React from '${root}/node_modules/react/index.js';
import {createRoot} from '${root}/node_modules/react-dom/client.js';
import {AgentPanel} from '${root}/src/components/AgentPanel.tsx';
import {I18nProvider} from '${root}/src/i18n.tsx';
localStorage.setItem('mew:locale','ko'); window.messages=[];
const meta={sessionId:'conversation',startedAt:new Date().toISOString(),turns:0,busy:false,queued:[],usage:null,canLoad:false,canList:false};
class Socket {
 static OPEN=1;readyState=1;
 constructor(){window.socket=this;setTimeout(()=>{this.onopen?.();this.emit({type:'replay',events:[]});this.emit({type:'models',models:{currentModelId:'test',availableModels:[{modelId:'test',name:'Test'}]}});this.emit({type:'meta',meta})},20)}
 emit(value){this.onmessage?.({data:JSON.stringify(value)})}
 send(raw){window.messages.push(JSON.parse(raw))}
 close(){}
}
window.WebSocket=Socket;
window.queue=()=>window.socket.emit({type:'meta',meta:{...meta,queued:['queued question'],queuedSettings:[{model:'Test',thinking:'—',permission:'—',execution:{build:true,deploy:false}}]}});
createRoot(document.getElementById('root')).render(<I18nProvider><AgentPanel project="test" workspacePath="/workspace" tree={[]} focusedFilePath={null} onOpenFile={()=>{}} onOpenGuidanceFile={()=>{}} onClose={()=>{}} /></I18nProvider>);`
  const bundle = await build({ input: 'virtual:connection.tsx', write: false, platform: 'browser', onwarn(warning, warn) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning) }, output: { format: 'iife' }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } }, plugins: [{
    name: 'fixture',
    async resolveId(id, importer) {
      if (id === 'virtual:connection.tsx') return id
      if (id === '@mew/tmux-term') return 'virtual:terminal'
      if (id.endsWith('.css')) return 'virtual:style'
      if (id.endsWith('?raw')) { const resolved = await this.resolve(id.slice(0, -4), importer, { skipSelf: true }); if (resolved) return `${resolved.id}?raw` }
    },
    async load(id) {
      if (id === 'virtual:connection.tsx') return source
      if (id === 'virtual:terminal') return 'export const isHiddenTmuxSession=()=>false;export function TmuxTerminal(){return null}'
      if (id === 'virtual:style') return ''
      if (id.endsWith('?raw')) return `export default ${JSON.stringify(await fs.readFile(id.slice(0, -4), 'utf8'))}`
    },
  }] })
  const chunk = bundle.output.find(item => item.type === 'chunk')!
  const compiler = await compile(await fs.readFile(`${root}/src/index.css`, 'utf8'), { base: `${root}/src`, onDependency() {} })
  const content = (await Promise.all(['src/components/AgentPanel.tsx', 'src/components/agent-execution-toggles.tsx', 'packages/ui/src/Toast.tsx', 'src/components/agent-guidance-settings.tsx', 'src/components/agent-header-select.tsx', 'src/components/MentionTextarea.tsx', 'src/components/DockWorkspace.tsx'].map(file => fs.readFile(`${root}/${file}`, 'utf8')))).join('\n')
  const css = compiler.build([...new Set((source + content).match(/[A-Za-z0-9_@!:/.[\]()%,-]+/g))])
  const browser = await connectTestBrowser()
  t.after(() => browser.close())
  for (const width of [1100, 390, 320]) for (const dark of [true, false]) {
    await t.test(`${width}px ${dark ? 'dark' : 'light'}`, async matrix => {
      const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: width < 768 })
      matrix.after(() => context.close())
      const page = await context.newPage()
      page.setDefaultTimeout(5000)
      const errors: string[] = [], writes: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('http://mew-execution.test/**', async route => {
        const pathname = new URL(route.request().url()).pathname
        if (pathname === '/app.js') return route.fulfill({ contentType: 'text/javascript', body: chunk.code })
        if (pathname === '/api/user-ui/agent-tabs') return route.fulfill({ json: { state: { tabs: [{ id: 'first', label: 'Codex', runtime: 'codex', cwd: '/workspace' }], activeId: 'first' }, claims: [] } })
        if (pathname === '/api/agent-cwd') return route.fulfill({ json: { cwd: '/workspace' } })
        if (pathname === '/api/projects') return route.fulfill({ json: [] })
        if (pathname === '/api/fs/agent-guidance') {
          if (route.request().method() !== 'GET') writes.push(route.request().method())
          return route.fulfill({ json: {
            path: '/data/agent-guidance.md', content: '# Guidance', instructions: '', revision: 'initial',
            settings: { commit: 'inherit', commitLanguage: 'en', language: 'inherit', detail: 'inherit', subagents: 'inherit', debugger: 'enabled', testing: 'required', codeQuality: 'required', ...Object.fromEntries(documentationGuidanceKeys.map(key => [key, 'required'])) },
            capacityRetry: { delaySeconds: 30, maxRetries: 20 }, branch: { value: defaultBranchGuidance, custom: false },
            buildVerification: { value: defaultAgentBuildVerificationSettings, custom: false },
          } })
        }
        if (pathname.startsWith('/api/')) return route.fulfill({ json: { settings: null, skills: [], jobs: [], commands: [], runtimes: [] } })
        return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html class="${dark ? 'dark' : ''}" lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}html,body,#root{height:100%;margin:0}</style><div id="root"></div><script src="/app.js"></script></html>` })
      })
      await page.goto('http://mew-execution.test/')
      const buildButton = page.getByRole('button', { name: '빌드', exact: true })
      const deployButton = page.getByRole('button', { name: '배포', exact: true })
      const input = page.locator('[contenteditable="true"][aria-placeholder="텍스트 입력"]')
      await buildButton.waitFor()
      assert.equal(await buildButton.getAttribute('aria-pressed'), 'true')
      assert.equal(await deployButton.getAttribute('aria-pressed'), 'false')
      assert.equal(await buildButton.innerText(), '', 'controls contain icons only')
      await input.fill('capture execution choices')
      await buildButton.click()
      await page.getByRole('status').filter({ hasText: '빌드 off' }).waitFor()
      await deployButton.focus()
      await deployButton.press('Space')
      await page.getByRole('status').filter({ hasText: '배포 on' }).waitFor()
      assert.equal(await buildButton.getAttribute('aria-pressed'), 'false')
      assert.equal(await deployButton.getAttribute('aria-pressed'), 'true')
      await input.press('Control+Enter')
      const sent = await page.evaluate<any>('window.messages.find(message => message.type === "prompt")')
      assert.equal(sent.text, 'capture execution choices')
      assert.deepEqual(sent.settings.execution, { build: false, deploy: true })
      assert.equal(sent.displayText, sent.text, 'execution instructions never pollute the user transcript')
      for (const button of [buildButton, deployButton]) {
        const box = (await button.boundingBox())!
        assert.ok(box.x >= 0 && box.x + box.width <= width && box.y + box.height <= 844, 'toggle stays inside viewport')
      }
      await page.reload()
      await buildButton.waitFor()
      assert.equal(await buildButton.getAttribute('aria-pressed'), 'false', 'build choice survives refresh')
      assert.equal(await deployButton.getAttribute('aria-pressed'), 'true', 'deployment choice survives refresh')
      await page.evaluate('window.queue()')
      await page.locator('[data-queue-row="0"]').getByRole('button', { name: '편집', exact: true }).click()
      assert.equal(await buildButton.getAttribute('aria-pressed'), 'true', 'queue editing restores the captured build choice')
      assert.equal(await deployButton.getAttribute('aria-pressed'), 'false', 'queue editing restores the captured deployment choice')
      await buildButton.click()
      await page.getByRole('button', { name: '저장', exact: true }).click()
      const edited = await page.evaluate<any>('window.messages.find(message => message.type === "edit_queued")')
      assert.deepEqual(edited.settings.execution, { build: false, deploy: false })
      assert.equal(await deployButton.getAttribute('aria-pressed'), 'true', 'queue edits leave the normal composer preference intact')
      await page.getByRole('button', { name: '에이전트 기본 지침', exact: true }).click()
      const dialog = page.getByRole('dialog', { name: '에이전트 기본 지침', exact: true })
      await dialog.getByRole('combobox', { name: '커밋 언어', exact: true }).waitFor()
      assert.equal(await dialog.getByRole('combobox', { name: '빌드 검증', exact: true }).count(), 0)
      assert.equal(await dialog.getByText('빌드 세부 설정', { exact: true }).count(), 0)
      await dialog.getByRole('button', { name: '닫기', exact: true }).click()
      assert.deepEqual(writes, [], 'toggling execution never rewrites shared instructions')
      assert.deepEqual(errors, [])
    })
  }
})
