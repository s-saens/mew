import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { chromium } from 'playwright-core'
import { domBrowserExecutable } from './browser-dom-executable.ts'

const root = path.resolve(import.meta.dirname, '..')
const prompt = '[[.workspace:.mew/tasks/Task.md]]\nFirst organize this task document, then implement its contents.'

test('requested task tabs send their initial prompt once after session initialization and do not persist it', { skip: !domBrowserExecutable(), timeout: 40_000 }, async t => {
  const source = `
    import React from '${root}/node_modules/react/index.js';
    import {createRoot} from '${root}/node_modules/react-dom/client.js';
    import {AgentPanel} from '${root}/src/components/AgentPanel.tsx';
    import {I18nProvider} from '${root}/src/i18n.tsx';
    window.messages=[];window.sockets=[];
    class Socket {
      static OPEN=1;static CLOSED=3;readyState=0;
      constructor(url){this.url=url;window.sockets.push(this)}
      emit(value){this.onmessage?.({data:JSON.stringify(value)})}
      open(){this.readyState=1;this.onopen?.()}
      send(raw){if(this.readyState!==1)throw new Error('sent while disconnected');window.messages.push(JSON.parse(raw))}
      close(){this.readyState=3;this.onclose?.()}
    }
    window.WebSocket=Socket;
    function Fixture(){
      const [version,setVersion]=React.useState(0);
      const [requested,setRequested]=React.useState(location.search.includes('restore')?null:{id:'task-tab',label:'Task title',renamed:true,runtime:'codex',cwd:'/workspace',initialPrompt:${JSON.stringify(prompt)}});
      const handled=React.useCallback(()=>setRequested(null),[]);
      window.rerender=()=>setVersion(value=>value+1);
      return <div data-version={version}><AgentPanel requestedTab={requested} onRequestedTabHandled={handled} project=".workspace" workspacePath="/workspace"
        tree={[]} focusedFilePath={null} onOpenFile={()=>{}} onClose={()=>{}}/></div>;
    }
    createRoot(document.getElementById('root')).render(<I18nProvider><Fixture/></I18nProvider>);
  `
  const bundle = await build({
    onLog(level, log, handler) { if (log.code !== 'MODULE_LEVEL_DIRECTIVE') handler(level, log) },
    input: 'virtual:task-session.tsx', write: false, platform: 'browser', output: { format: 'iife', codeSplitting: false },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
    plugins: [{ name: 'fixture', async resolveId(id, importer) {
      if (id === 'virtual:task-session.tsx') return id
      if (id === '@mew/tmux-term') return 'virtual:terminal'
      if (id.endsWith('.css')) return 'virtual:style'
      if (id.endsWith('?raw')) { const resolved = await this.resolve(id.slice(0, -4), importer, { skipSelf: true }); if (resolved) return `${resolved.id}?raw` }
    }, async load(id) {
      if (id === 'virtual:task-session.tsx') return source
      if (id === 'virtual:terminal') return 'export const isHiddenTmuxSession=()=>false;export function TmuxTerminal(){return null}'
      if (id === 'virtual:style') return ''
      if (id.endsWith('?raw')) return `export default ${JSON.stringify(await fs.readFile(id.slice(0, -4), 'utf8'))}`
    } }],
  })
  const chunk = bundle.output.find(item => item.type === 'chunk')!
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  t.after(() => browser.close())
  const page = await browser.newPage()
  page.setDefaultTimeout(5_000)
  const errors: string[] = [], saved: Array<{ tabs: Array<Record<string, unknown>>; activeId: string | null }> = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => { localStorage.setItem('mew:locale', 'en'); localStorage.setItem('mew:ui-locale', 'en') })
  await page.route('http://mew-task-session.test/**', route => {
    const url = new URL(route.request().url())
    if (url.pathname === '/app.js') return route.fulfill({ contentType: 'text/javascript', body: chunk.code })
    if (url.pathname === '/api/user-ui/agent-tabs') {
      if (route.request().method() === 'PUT') {
        const state = route.request().postDataJSON()
        saved.push(state)
        return route.fulfill({ json: { state } })
      }
      return route.fulfill({ json: { state: saved.at(-1) ?? { tabs: [], activeId: null }, claims: [] } })
    }
    if (url.pathname === '/api/agent-cwd') return route.fulfill({ json: { cwd: '/workspace' } })
    if (url.pathname === '/api/projects') return route.fulfill({ json: [] })
    if (url.pathname === '/api/agent-runtimes') return route.fulfill({ json: { runtimes: [{ id: 'codex', installed: true }] } })
    if (url.pathname === '/api/agent-sets') return route.fulfill({ json: { sets: [] } })
    if (url.pathname.startsWith('/api/')) return route.fulfill({ json: { settings: null, skills: [], jobs: [], commands: [], runtimes: [] } })
    return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><meta charset="utf-8"><div id="root"></div><script src="/app.js"></script></html>' })
  })
  const persistedResponse = page.waitForResponse(response => response.url().endsWith('/api/user-ui/agent-tabs') && response.request().method() === 'PUT' && response.request().postDataJSON().tabs.some((tab: { id: string }) => tab.id === 'task-tab'))
  await page.goto('http://mew-task-session.test/')
  await page.waitForFunction('window.sockets.length===1')
  const sentPrompts = () => page.evaluate<Array<Record<string, unknown>>>('window.messages.filter(message=>message.type==="prompt")')
  assert.deepEqual(await sentPrompts(), [], 'creation queues the request before opening the runtime connection')
  await page.evaluate('window.sockets[0].open()')
  await page.evaluate('window.rerender()')
  assert.deepEqual(await sentPrompts(), [], 'socket opening alone cannot submit the task')
  await page.evaluate(`window.sockets[0].emit({type:'models',models:{currentModelId:'task-model',availableModels:[{modelId:'task-model',name:'Task model'}]}})`)
  assert.deepEqual(await sentPrompts(), [], 'model discovery still waits for a ready session')
  await page.evaluate(`window.sockets[0].emit({type:'meta',meta:{sessionId:'task-session',startedAt:new Date().toISOString(),turns:0,busy:false,queued:[],usage:null,canLoad:true,canList:true}})`)
  await page.waitForFunction('window.messages.some(message=>message.type==="prompt")')
  const prompts = await sentPrompts()
  assert.equal(prompts.length, 1)
  assert.equal(prompts[0].text, prompt)
  assert.equal(prompts[0].displayText, prompt)
  assert.equal((prompts[0].settings as { model?: string }).model, 'Task model', 'the request records initialized session controls without overriding the session default')
  await page.evaluate(`window.rerender();window.sockets[0].emit({type:'meta',meta:{sessionId:'task-session',busy:false,queued:[],turns:1}})`)
  await page.waitForFunction('document.querySelector("[data-version]").dataset.version==="2"')
  assert.equal((await sentPrompts()).length, 1, 'rerenders and repeated session updates do not replay the task')
  await persistedResponse
  const persisted = saved.at(-1)?.tabs.find(tab => tab.id === 'task-tab')
  assert.ok(persisted, 'the named task tab is saved through the existing tab ledger')
  assert.equal(persisted.label, 'Task title')
  assert.equal(persisted.renamed, true)
  assert.equal('initialPrompt' in persisted, false, 'automatic requests remain transient')
  await page.goto('http://mew-task-session.test/?restore')
  await page.waitForFunction('window.sockets.length===1')
  await page.evaluate(`window.sockets[0].open();window.sockets[0].emit({type:'meta',meta:{sessionId:'task-session',busy:false,queued:[],turns:1}})`)
  await page.evaluate('window.rerender()')
  assert.deepEqual(await sentPrompts(), [], 'restoring a saved task tab does not submit the task again')
  assert.deepEqual(errors, [])
})
