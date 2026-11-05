import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { connectTestBrowser } from './test-browser.ts'

const root = path.resolve(import.meta.dirname, '..')
const prompt = '[[mew-document:.workspace:.mew/tasks/Task.md|Task title]]'

test('task requests choose a runtime and prepare an editable draft without sending it', { timeout: 60_000 }, async t => {
  const source = `
    import React from '${root}/node_modules/react/index.js';
    import {createRoot} from '${root}/node_modules/react-dom/client.js';
    import {AgentPanel} from '${root}/src/components/AgentPanel.tsx';
    import {DockWorkspace} from '${root}/src/components/DockWorkspace.tsx';
    import {I18nProvider} from '${root}/src/i18n.tsx';
    import {readAgentInputDraft} from '${root}/src/utils/agentInputDrafts.ts';
    window.messages=[];window.sockets=[];window.readDraft=(id='task-tab')=>readAgentInputDraft(id);
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
      const [workspace,setWorkspace]=React.useState('/workspace');
      window.switchWorkspace=setWorkspace;
      const taskRequest={id:'task-tab',label:'Task title',renamed:true,cwd:'/workspace',initialDraft:${JSON.stringify(prompt)}};
      const docked=location.search.includes('dock');
      const [requested,setRequested]=React.useState(location.search.includes('restore')||docked?null:taskRequest);
      const [layout,setLayout]=React.useState({version:1,groups:[{id:'agent',kind:'agent'},{id:'agent:other',kind:'agent'}],tabs:{'agent:existing-tab':'agent:other'},active:{'agent:other':'existing-tab'},tree:{axis:'row',ratio:.5,first:{id:'agent'},second:{id:'agent:other'}}});
      window.requestTask=(overrides={})=>setRequested({...taskRequest,...overrides});
      const handled=React.useCallback(()=>setRequested(null),[]);
      window.rerender=()=>setVersion(value=>value+1);
      const panel=<AgentPanel requestedTab={requested} onRequestedTabHandled={handled} project=".workspace" workspacePath={workspace}
        tree={[]} focusedFilePath={null} onOpenFile={()=>{}} onClose={()=>{}}/>;
      return <div data-version={version}>{docked?<DockWorkspace value={layout} onChange={setLayout} foreground="agent" apiRef={null} onEditorDrop={()=>"main"}>{panel}</DockWorkspace>:panel}</div>;
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
  const browser = await connectTestBrowser()
  t.after(() => browser.close())
  for (const { width, docked } of [{ width: 1100, docked: false }, { width: 390, docked: false }, { width: 1100, docked: true }]) await t.test(`${width}px ${docked ? 'split dock' : width === 390 ? 'agent preset' : 'runtime'}`, async matrix => {
    const page = await browser.newPage({ viewport: { width, height: 844 }, hasTouch: width === 390 })
    matrix.after(() => page.close())
    page.setDefaultTimeout(5_000)
    const errors: string[] = [], saved: Array<{ workspacePath: string; tabs: Array<Record<string, unknown>>; activeId: string | null }> = []
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
        return route.fulfill({ json: { state: saved.findLast(state => state.workspacePath === url.searchParams.get('workspace')) ?? (docked ? { tabs: [{ id: 'existing-tab', label: 'Existing conversation', renamed: true, runtime: 'codex', cwd: '/workspace' }], activeId: 'existing-tab' } : { tabs: [], activeId: null }), claims: [] } })
      }
      if (url.pathname === '/api/agent-cwd') return route.fulfill({ json: { cwd: url.searchParams.get('path') || '/workspace' } })
      if (url.pathname === '/api/projects') return route.fulfill({ json: [] })
      if (url.pathname === '/api/agent-runtimes') return route.fulfill({ json: { runtimes: [{ id: 'codex', installed: true }] } })
      if (url.pathname === '/api/agent-sets') return route.fulfill({ json: { sets: [{ id: 'task-preset', name: 'Task preset', runtime: 'codex', modelId: '', role: 'Implement carefully' }] } })
      if (url.pathname.startsWith('/api/')) return route.fulfill({ json: { settings: null, skills: [], jobs: [], commands: [], runtimes: [] } })
      return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{--spacing:.25rem}.hidden{display:none}[data-dock-workspace]{position:relative;height:844px;width:1100px}[data-dock-panel]{display:flex;flex-direction:column;overflow:hidden}[data-dock-inline-body]{overflow:auto}</style><div id="root"></div><script src="/app.js"></script></html>' })
    })
    const persistedResponse = page.waitForResponse(response => response.url().endsWith('/api/user-ui/agent-tabs') && response.request().method() === 'PUT' && response.request().postDataJSON().tabs.some((tab: { id: string }) => tab.id === 'task-tab'), { timeout: 20_000 })
    void persistedResponse.catch(() => {})
    await page.goto(`http://mew-task-session.test/${docked ? '?dock' : ''}`)
    if (docked) {
      const primary = page.locator('[data-dock-panel="agent"]')
      await page.locator('[data-dock-panel="agent:other"]').getByRole('tab', { name: /Existing conversation/ }).waitFor()
      await page.waitForFunction('window.sockets.length===1')
      assert.equal(await primary.isVisible(), false, 'the empty primary group starts hidden when existing tabs belong to another group')
      await page.evaluate('window.requestTask()')
      const picker = primary.locator('[data-runtime-id="codex"] button[aria-label="Codex"]')
      await picker.waitFor()
      assert.equal(await primary.isVisible(), true, 'a task request reveals the runtime picker in the empty primary group')
      assert.equal(await page.evaluate('window.sockets.length'), 1, 'the task still waits for the runtime choice alongside the existing conversation')
      assert.equal(await primary.getByRole('tab').count(), 0)
      await picker.click()
      await page.waitForFunction('window.sockets.length===2')
      await primary.getByRole('tab', { name: /Task title/, selected: true }).waitFor()
      assert.equal(await page.evaluate('window.readDraft()'), prompt)
      const input = page.locator('[data-dock-body="agent"] [data-agent-composer] [contenteditable="true"]')
      await input.waitFor()
      assert.ok((await input.innerText()).includes('Task title'))
      await page.evaluate(`const socket=window.sockets.find(socket=>new URL(socket.url).searchParams.get('tab')==='task-tab');socket.open();socket.emit({type:'models',models:{currentModelId:'task-model',availableModels:[{modelId:'task-model',name:'Task model'}]}});socket.emit({type:'meta',meta:{sessionId:'task-session',busy:false,queued:[],turns:0}});window.rerender()`)
      await page.waitForFunction('document.querySelector("[data-version]").dataset.version==="1"')
      assert.deepEqual(await page.evaluate('window.messages.filter(message=>message.type==="prompt")'), [], 'the docked task draft remains unsent after runtime initialization')
      await persistedResponse
      assert.deepEqual(errors, [])
      return
    }
    const runtime = page.locator('[data-runtime-id="codex"] button[aria-label="Codex"]')
    await runtime.waitFor()
    assert.equal(await page.evaluate('window.sockets.length'), 0, 'opening the task picker does not connect to a runtime')
    assert.equal(await page.getByRole('tab').count(), 0, 'the task tab is created only after runtime selection')
    assert.equal(saved.some(state => state.tabs.some(tab => tab.id === 'task-tab')), false, 'unselected requests do not enter the tab ledger')
    assert.equal(await page.evaluate('window.readDraft()'), '', 'selection is required before preparing the draft')
    await page.evaluate('window.requestTask();window.rerender()')
    await page.waitForFunction('document.querySelector("[data-version]").dataset.version==="1"')
    if (width === 390) {
      await page.getByRole('button', { name: 'Agent set', exact: true }).click()
      await page.getByRole('button', { name: /Task preset/ }).click()
    } else await runtime.click()
    await page.waitForFunction('window.sockets.length===1')
    const input = page.locator('[data-agent-composer] [contenteditable="true"]:visible')
    await input.waitFor()
    assert.equal(await page.evaluate('window.readDraft()'), prompt, 'only the titled document reference becomes the composer draft')
    assert.ok((await input.innerText()).includes('Task title'), 'the document title is visible in the editable composer')
    await page.getByRole('tab', { name: /Task title/, selected: true }).waitFor()
    const sentPrompts = () => page.evaluate<Array<Record<string, unknown>>>('window.messages.filter(message=>message.type==="prompt")')
    assert.deepEqual(await sentPrompts(), [], 'creating the tab cannot submit its draft')
    await page.evaluate('window.sockets[0].open()')
    await page.evaluate('window.rerender()')
    assert.deepEqual(await sentPrompts(), [], 'socket opening alone cannot submit the task')
    await page.evaluate(`window.sockets[0].emit({type:'models',models:{currentModelId:'task-model',availableModels:[{modelId:'task-model',name:'Task model'}]}})`)
    assert.deepEqual(await sentPrompts(), [], 'model discovery cannot submit the task')
    await page.evaluate(`window.sockets[0].emit({type:'meta',meta:{sessionId:'task-session',startedAt:new Date().toISOString(),turns:0,busy:false,queued:[],usage:null,canLoad:true,canList:true}})`)
    await page.evaluate('window.rerender()')
    await page.waitForFunction('document.querySelector("[data-version]").dataset.version==="3"')
    assert.deepEqual(await sentPrompts(), [], 'a ready session and rerenders leave the draft unsent')
    const edited = `${prompt} Review my edited task before implementing it.`
    await input.press('Control+End')
    await page.keyboard.insertText(' Review my edited task before implementing it.')
    assert.equal(await page.evaluate('window.readDraft()'), edited, 'the user can add instructions after the prepared tag')
    await page.evaluate('window.requestTask();window.rerender()')
    await page.waitForFunction('document.querySelector("[data-version]").dataset.version==="4"')
    assert.equal(await page.evaluate('window.readDraft()'), edited, 'repeated requests never overwrite an existing conversation draft')
    assert.equal(await page.evaluate('window.sockets.length'), 1, 'repeated requests do not create another connection')
    assert.deepEqual(await sentPrompts(), [], 'repeated requests cannot submit the edited draft')
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    await page.waitForFunction('window.messages.some(message=>message.type==="prompt")')
    const prompts = await sentPrompts()
    assert.equal(prompts.length, 1)
    assert.equal(prompts[0].text, edited)
    assert.equal(prompts[0].displayText, edited)
    const sentTag = page.locator('[data-agent-question-bubble] [data-agent-document]').filter({ hasText: 'Task title' })
    await sentTag.waitFor()
    assert.equal((await sentTag.innerText()).trim(), 'Task title', 'sent messages retain the document title')
    assert.equal((prompts[0].settings as { model?: string }).model, 'Task model')
    await page.evaluate(`window.rerender();window.sockets[0].emit({type:'meta',meta:{sessionId:'task-session',busy:false,queued:[],turns:1}})`)
    await page.waitForFunction('document.querySelector("[data-version]").dataset.version==="5"')
    assert.equal((await sentPrompts()).length, 1, 'rerenders and repeated session updates do not replay a user submission')
    await persistedResponse
    const persisted = saved.at(-1)?.tabs.find(tab => tab.id === 'task-tab')
    assert.ok(persisted, 'the named task tab is saved through the existing tab ledger')
    assert.equal(persisted.label, 'Task title')
    assert.equal(persisted.renamed, true)
    assert.equal(persisted.runtime, 'codex')
    if (width === 390) assert.equal((persisted.preset as { id: string }).id, 'task-preset', 'preset choice is kept on the task tab')
    assert.equal('initialDraft' in persisted, false, 'the draft stays outside the tab ledger')
    assert.equal('initialPrompt' in persisted, false)
    await page.goto('http://mew-task-session.test/?restore')
    await page.waitForFunction('window.sockets.length===1')
    await page.evaluate(`window.sockets[0].open();window.sockets[0].emit({type:'meta',meta:{sessionId:'task-session',busy:false,queued:[],turns:1}})`)
    await page.evaluate('window.rerender()')
    await page.waitForFunction('document.querySelector("[data-version]").dataset.version==="1"')
    assert.deepEqual(await sentPrompts(), [], 'restoring a saved task tab never submits the task again')
    assert.equal(await page.evaluate('window.readDraft()'), '', 'submitted task drafts do not reappear on restoration')
    if (width === 1100) {
      await page.evaluate("window.requestTask({id:'cancelled-tab'})")
      await runtime.waitFor()
      await page.getByRole('tab', { name: /Task title/ }).click()
      await input.fill('Keep this conversation draft')
      await page.getByRole('button', { name: 'New tab', exact: true }).click()
      await runtime.click()
      await page.waitForFunction('window.sockets.length===2')
      assert.equal(await page.evaluate("window.readDraft('cancelled-tab')"), '', 'choosing an existing tab cancels the pending task draft')
      assert.equal(await page.evaluate('window.readDraft()'), 'Keep this conversation draft', 'opening another runtime preserves the existing conversation draft')
      assert.equal(await input.locator('.cm-placeholder').count(), 1, 'an unrelated new conversation does not receive the cancelled task')
      assert.equal(saved.some(state => state.tabs.some(tab => tab.id === 'cancelled-tab')), false)
      await page.evaluate("window.requestTask({id:'other-workspace-task'})")
      await runtime.waitFor()
      const restoredWorkspace = page.waitForResponse(response => response.url().includes('/api/user-ui/agent-tabs?workspace=%2Fother'))
      await page.evaluate("window.switchWorkspace('/other')")
      await restoredWorkspace
      await runtime.waitFor()
      await runtime.click()
      await page.waitForFunction('window.sockets.some(socket=>new URL(socket.url).searchParams.get("cwd")==="/other")')
      assert.equal(await page.evaluate("window.readDraft('other-workspace-task')"), '', 'changing workspace cancels the pending task draft')
      assert.equal(await input.locator('.cm-placeholder').count(), 1, 'runtime selection in another workspace starts with an empty composer')
      assert.equal(saved.some(state => state.tabs.some(tab => tab.id === 'other-workspace-task')), false)
      assert.deepEqual(await sentPrompts(), [], 'cancellation and workspace changes cannot submit a task')
    }
    assert.deepEqual(errors, [])
  })
})
