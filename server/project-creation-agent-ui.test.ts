import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { connectTestBrowser } from './test-browser.ts'

const root = path.resolve(import.meta.dirname, '..')

test('project creation reuses live agent chat, pins its cwd, sends its interview once, and preserves the conversation on close', { timeout: 60_000 }, async t => {
  const app = await fs.readFile(`${root}/src/App.tsx`, 'utf8')
  const createWithAgent = app.match(/onCreateWithAgent=\{(async project => \{[\s\S]*?\n\s*\})\}/)?.[1]
  const closeCreation = app.match(/<ProjectCreationAgentDialog[^\n]*onClose=\{(\(\) => \{[^}]*\})\}/)?.[1]
  assert.ok(createWithAgent && closeCreation, 'exercise the actual App creation and close callbacks')
  const source = `import React from 'react';
import {createRoot} from 'react-dom/client';
import {ProjectCreationAgentDialog} from '${root}/src/components/ProjectCreationAgentDialog.tsx';
import {AgentPanel} from '${root}/src/components/AgentPanel.tsx';
import {I18nProvider} from '${root}/src/i18n.tsx';
window.messages=[];window.socketUrls=[];window.sockets=[];
class Socket {
 static OPEN=1;static CLOSED=3;readyState=1;
 constructor(url){window.socketUrls.push(url);window.sockets.push(this);window.socket=this;setTimeout(()=>{
  this.onopen?.();this.emit({type:'replay',events:[]});this.ready();
 },20)}
 ready(){this.emit({type:'meta',meta:{sessionId:'setup-session',startedAt:new Date().toISOString(),turns:0,busy:false,queued:[],usage:null,canLoad:false,canList:false}})}
 emit(value){this.onmessage?.({data:JSON.stringify(value)})}
 send(raw){const value=JSON.parse(raw);window.messages.push(value);if(value.type==='prompt'){setTimeout(()=>{this.emit({type:'update',update:{sessionUpdate:'user_message_chunk',content:{type:'text',text:value.displayText??value.text}}});this.emit({type:'turn_start',startedAt:new Date().toISOString()});this.emit({type:'update',update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'어떤 프로젝트를 만들고 싶으세요?'}}});this.emit({type:'turn_end',stopReason:'end_turn',durationMs:100});},10)}}
 close(){if(this.readyState===3)return;this.readyState=3;this.onclose?.({code:1006})}
}
window.WebSocket=Socket;
const staleTabs={state:{tabs:[{id:'earlier-incarnation',label:'Earlier tab',runtime:null,cwd:'/managed/Garden'}],activeId:'earlier-incarnation'},claims:[]};
function Fixture(){
 const [view,setView]=React.useState('before');
 const [preparedAgentTabs,setPreparedAgentTabs]=React.useState(()=>Promise.resolve(staleTabs));
 const [creationAgentProject,setCreationAgentProject]=React.useState(null);
 const openRootProject=async()=>{await new Promise(resolve=>setTimeout(resolve,20));setPreparedAgentTabs(Promise.resolve(staleTabs));return true};
 const create=${createWithAgent};const close=${closeCreation};
 window.resume=()=>setView('regular');window.beginSetup=()=>create({path:'/managed/Garden',name:'Garden'});
 return <I18nProvider>{creationAgentProject?<ProjectCreationAgentDialog projectName="Garden" projectPath="/managed/Garden" cacheAccount="account-a" onClose={()=>{close();setView('closed')}}/>:view==='before'||view==='regular'?<AgentPanel preparedTabs={preparedAgentTabs} project=".workspace" workspacePath="/managed/Garden" tree={[]} focusedFilePath={null} onOpenFile={()=>{}} onClose={()=>{}}/>:<div>Closed</div>}</I18nProvider>}
createRoot(document.getElementById('root')).render(<Fixture/>);`
  const candidates = [source]
  const bundle = await build({ onLog(level, log, handler) { if (log.code !== 'MODULE_LEVEL_DIRECTIVE') handler(level, log) }, input: 'virtual:project-creation.tsx', write: false, platform: 'browser', output: { format: 'iife' }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } }, plugins: [{
    name: 'fixture',
    async resolveId(id, importer) {
      if (id === 'virtual:project-creation.tsx') return id
      if (id === '@mew/tmux-term') return 'virtual:terminal'
      if (id.endsWith('.css')) return 'virtual:style'
      if (id.endsWith('?raw')) { const resolved = await this.resolve(id.slice(0, -4), importer, { skipSelf: true }); if (resolved) return `${resolved.id}?raw` }
    },
    async load(id) {
      if (id === 'virtual:project-creation.tsx') return source
      if (id === 'virtual:terminal') return 'export const isHiddenTmuxSession=()=>false;export function TmuxTerminal(){return null}'
      if (id === 'virtual:style') return ''
      if (id.endsWith('?raw')) return `export default ${JSON.stringify(await fs.readFile(id.slice(0, -4), 'utf8'))}`
      if (id.endsWith('.tsx')) candidates.push(await fs.readFile(id, 'utf8'))
    },
  }] })
  const chunk = bundle.output.find(item => item.type === 'chunk')!
  const compiler = await compile(await fs.readFile(`${root}/src/index.css`, 'utf8'), { base: `${root}/src`, onDependency() {} })
  const css = compiler.build([...new Set(candidates.join('\n').match(/[A-Za-z0-9_@!:/.[\]()%,-]+/g))])
  const browser = await connectTestBrowser()
  t.after(() => browser.close())
  for (const width of [1100, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } })
    page.setDefaultTimeout(6000)
    const errors: string[] = [], cwdRequests: string[] = []
    let savedState: unknown = null, ledgerReads = 0
    const savedSnapshots: { tabs: { id: string; cwd: string }[] }[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(() => { localStorage.setItem('mew:locale', 'ko'); localStorage.setItem('mew:ui-locale', 'ko') })
    await page.route('http://mew-project-creation.test/**', route => {
      const url = new URL(route.request().url()), pathname = url.pathname
      if (pathname === '/app.js') return route.fulfill({ contentType: 'text/javascript', body: chunk.code })
      if (pathname === '/api/user-ui/agent-tabs') {
        if (route.request().method() === 'PUT') { savedState = route.request().postDataJSON(); savedSnapshots.push(savedState as { tabs: { id: string; cwd: string }[] }) }
        else ledgerReads++
        return route.fulfill({ json: { state: savedState, claims: [] } })
      }
      if (pathname === '/api/agent-cwd') { cwdRequests.push(url.searchParams.get('path') ?? ''); return route.fulfill({ json: { cwd: '/managed/Garden' } }) }
      if (pathname === '/api/agent/runtimes') return route.fulfill({ json: { runtimes: [{ id: 'codex', installed: true, installing: false }] } })
      if (pathname === '/api/projects') return route.fulfill({ json: [] })
      if (pathname.startsWith('/api/')) return route.fulfill({ json: { settings: null, skills: [], jobs: [], commands: [], runtimes: [{ id: 'codex', installed: true, installing: false }] } })
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html class="${width > 768 ? 'dark' : ''}" lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}html,body,#root{height:100%;margin:0}</style><div id="root"></div><script src="/app.js"></script></html>` })
    })
    await page.goto('http://mew-project-creation.test/')
    await page.getByText('Earlier tab', { exact: true }).waitFor()
    assert.equal(ledgerReads, 0, 'the initial non-null prefetch supplies the earlier tab state')
    await page.evaluate('window.beginSetup()')
    const dialog = page.getByRole('dialog', { name: '에이전트랑 만들기 · Garden' })
    await dialog.waitFor()
    assert.equal(await page.evaluate('window.messages.length'), 0, 'choosing a runtime precedes agent startup')
    await dialog.getByRole('button', { name: 'Codex', exact: true }).click()
    await page.waitForFunction('window.messages.filter(message=>message.type==="prompt").length===1')
    const prompts = await page.evaluate('window.messages.filter(message=>message.type==="prompt")') as { text: string; displayText: string }[]
    assert.equal(prompts[0].displayText, '에이전트랑 만들기')
    await page.getByText('어떤 프로젝트를 만들고 싶으세요?', { exact: true }).waitFor()
    assert.equal(await page.getByText(prompts[0].text, { exact: true }).count(), 0, 'raw setup instructions stay out of the displayed conversation')
    assert.match(prompts[0].text, /Start by asking me a focused question/)
    assert.match(prompts[0].text, /Mew default instructions/)
    assert.match(prompts[0].text, /configured Documents location/)
    assert.ok((await page.evaluate('window.socketUrls') as string[]).every(url => new URL(url).searchParams.get('cwd') === '/managed/Garden'))
    await page.screenshot({ path: `/tmp/mew-project-creation-agent-${width}.png` })
    await page.evaluate('window.socket.ready();window.socket.ready()')
    assert.equal(await page.evaluate('window.messages.filter(message=>message.type==="prompt").length'), 1)
    await page.evaluate('window.socket.close()')
    await page.waitForFunction('window.sockets.length===2')
    await page.evaluate('window.socket.ready()')
    assert.equal(await page.evaluate('window.messages.filter(message=>message.type==="prompt").length'), 1, 'reconnection never repeats the interview')
    const box = await dialog.boundingBox()
    assert.ok(box && box.x >= 0 && box.x + box.width <= width + 1 && box.height <= 844)
    await dialog.getByRole('button', { name: '닫기', exact: true }).first().click()
    await page.getByText('Closed', { exact: true }).waitFor()
    assert.equal(await page.evaluate('window.messages.some(message=>message.type==="close_session")'), false, 'closing the popup preserves its session')
    const newTab = (savedState as { tabs: { id: string; cwd: string }[] }).tabs.find(tab => tab.id !== 'earlier-incarnation')
    assert.ok(newTab && newTab.cwd === '/managed/Garden')
    const readsBeforeRestore = ledgerReads, snapshotsBeforeRestore = savedSnapshots.length
    await page.evaluate('window.resume()')
    const draft = page.locator('[contenteditable="true"][aria-placeholder="텍스트 입력"]')
    await draft.waitFor()
    await page.waitForFunction('window.sockets.length===3')
    assert.ok(ledgerReads > readsBeforeRestore, 'closing clears the stale non-null prefetch and rereads the live tab ledger')
    assert.ok((savedState as { tabs: { id: string }[] }).tabs.some(tab => tab.id === newTab.id), 'normal panel restoration preserves the newly created conversation')
    assert.ok(savedSnapshots.slice(snapshotsBeforeRestore).every(state => state.tabs.some(tab => tab.id === newTab.id)), 'no restoration save overwrites the new conversation with the older path snapshot')
    await page.evaluate('window.socket.ready()')
    assert.equal(await page.evaluate('window.messages.filter(message=>message.type==="prompt").length'), 1, 'restoration does not retain the bootstrap prompt')
    await draft.fill('A garden planner for my family')
    await draft.press('Control+Enter')
    await page.waitForFunction('window.messages.filter(message=>message.type==="prompt").length===2')
    assert.equal(await page.evaluate('window.messages.filter(message=>message.type==="prompt")[1].text'), 'A garden planner for my family')
    assert.deepEqual(errors, [])
    assert.ok(cwdRequests.length >= 1)
    await page.close()
  }
})
