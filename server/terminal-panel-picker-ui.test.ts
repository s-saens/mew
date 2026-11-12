import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { connectTestBrowser } from './test-browser.ts'

const root = path.resolve(import.meta.dirname, '..')

test('terminal panel creates and restores selected terminal backends', { timeout: 40_000 }, async () => {
  const source = `import React from '${root}/node_modules/react/index.js';
import {createRoot} from '${root}/node_modules/react-dom/client.js';
import {AgentPanel} from '${root}/src/components/AgentPanel.tsx';
import {DockWorkspace} from '${root}/src/components/DockWorkspace.tsx';
import {I18nProvider} from '${root}/src/i18n.tsx';
import {setBinding} from '${root}/packages/shortcuts/src/index.ts';
import {captureAppTabShortcuts} from '${root}/src/utils/app-tab-shortcuts.ts';
import {useFocusedWorkspacePanel} from '${root}/src/hooks/use-focused-workspace-panel.ts';
import {useMobilePanelSwipe} from '${root}/src/hooks/use-mobile-panel-swipe.ts';
import {startInputFocusTracking} from '${root}/packages/ui/src/input-focus.ts';
startInputFocusTracking();
localStorage.setItem('mew:locale','ko');window.messages=[];window.sockets={};
const tabs=['first','second'].map(id=>({id,label:id,renamed:true,runtime:'codex',cwd:'/workspace'}));
localStorage.setItem('mew:agent-tabs:'+JSON.stringify('/workspace'),JSON.stringify(tabs));
localStorage.setItem('mew:agent-active-tab:'+JSON.stringify('/workspace'),'first');
class Socket {
 static OPEN=1;readyState=0;
 constructor(url){this.url=url;this.tab=new URL(url).searchParams.get('tab');window.sockets[this.tab]=this}
 emit(value){this.onmessage?.({data:JSON.stringify(value)})}
 open(restore=true){this.readyState=1;this.onopen?.();if(!restore)return;this.emit({type:'replay',restored:true,events:[{type:'update',update:{sessionUpdate:'user_message_chunk',content:{type:'text',text:'Saved conversation'}}}]});this.emit({type:'meta',meta:{sessionId:new URL(this.url).searchParams.get('resume')||this.tab,startedAt:new Date().toISOString(),turns:1,busy:false,queued:[],usage:null,canLoad:true,canList:true}})}
 send(raw){if(this.readyState!==1)throw new Error('sent while disconnected');window.messages.push({tab:this.tab,...JSON.parse(raw)})}
 close(){this.readyState=3;this.onclose?.()}
}
window.WebSocket=Socket;
window.fileCreates=0;window.editorCloses=0;window.setNewBinding=keys=>setBinding('newTab',keys);
captureAppTabShortcuts({closeEditorTab(){window.editorCloses++},create(){window.fileCreates++}});
function Fixture({terminal=false}){
 useFocusedWorkspacePanel();
 const [next,setNext]=React.useState(0),[previous,setPrevious]=React.useState(0);
 const navigate=direction=>direction>0?setNext(value=>value+1):setPrevious(value=>value+1);
 window.moveAgentTab=navigate;
 const swipe=useMobilePanelSwipe((panel,direction)=>navigate(direction));
 const group=terminal?'terminal:restored':'agent:restored',kind=terminal?'terminal':'agent';
 const [layout,setLayout]=React.useState({version:1,groups:[{id:group,kind}],tabs:{[kind+':first']:group,[kind+':second']:group},active:{[group]:'first'},tree:{id:group}});
 const panel=<div ref={swipe} data-workspace-panel={kind} style={{height:'100%',width:'100%'}}><AgentPanel nextTabSignal={next} previousTabSignal={previous} terminalOpen={terminal} agentOpen={!terminal} project="test" workspacePath="/workspace" tree={[]} focusedFilePath={null} onOpenFile={()=>{}} onClose={()=>{}} /></div>;
 return <><button id="outside" data-sidebar data-workspace-panel="sidebar">Sidebar</button><input id="editor" data-workspace-panel="editor"/><div style={{height:'calc(100% - 40px)',position:'relative',display:'flex'}}>{matchMedia('(min-width:768px)').matches?<DockWorkspace value={layout} onChange={setLayout} foreground={kind} apiRef={null} onEditorDrop={()=>'main'}>{panel}</DockWorkspace>:panel}</div></>;
}
let rootView=createRoot(document.getElementById('root'));
rootView.render(<I18nProvider><Fixture/></I18nProvider>);
window.showTerminal=()=>{rootView.unmount();rootView=createRoot(document.getElementById('root'));rootView.render(<I18nProvider><Fixture terminal/></I18nProvider>)};`
  const bundle = await build({ input: 'virtual:connection.tsx', write: false, platform: 'browser', output: { format: 'iife', codeSplitting: false }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } }, plugins: [{
    name: 'fixture',
    async resolveId(id, importer) {
      if (id === 'virtual:connection.tsx') return id
      if (id === '@mew/tmux-term') return 'virtual:terminal.tsx'
      if (id.endsWith('.css')) return 'virtual:style'
      if (id.endsWith('?raw')) { const resolved = await this.resolve(id.slice(0, -4), importer, { skipSelf: true }); if (resolved) return `${resolved.id}?raw` }
    },
    async load(id) {
      if (id === 'virtual:connection.tsx') return source
      if (id === 'virtual:terminal.tsx') return 'export const isHiddenTmuxSession=()=>false;export function TmuxTerminal(){return <textarea data-test-terminal/>}'
      if (id === 'virtual:style') return ''
      if (id.endsWith('?raw')) return `export default ${JSON.stringify(await fs.readFile(id.slice(0, -4), 'utf8'))}`
    },
  }] })
  const chunk = bundle.output.find(item => item.type === 'chunk')!
  const compiler = await compile(await fs.readFile(`${root}/src/index.css`, 'utf8'), { base: `${root}/src`, onDependency() {} })
  const content = (await Promise.all(['src/components/AgentPanel.tsx', 'src/components/MentionTextarea.tsx', 'src/components/DockWorkspace.tsx', 'packages/ui/src/ConfirmDialog.tsx', 'packages/ui/src/dialog-frame.tsx'].map(file => fs.readFile(`${root}/${file}`, 'utf8')))).join('\n')
  const css = compiler.build([...new Set((source + content).match(/[A-Za-z0-9_@!:/.[\]()%,-]+/g))])
  const browser = await connectTestBrowser()
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 844 } })
    page.setDefaultTimeout(5000)
    let state: { tabs: Array<{ id: string; label: string; runtime: string; cwd: string }>; activeId: string | null } = { tabs: [{ id: 'first', label: 'first', runtime: 'tmux', cwd: '/workspace' }], activeId: 'first' }
    const starts: string[] = []
    await page.route('http://mew-close.test/**', async route => {
      const request = route.request(), pathname = new URL(request.url()).pathname
      if (pathname === '/app.js') return route.fulfill({ contentType: 'text/javascript', body: chunk.code })
      if (pathname === '/api/user-ui/agent-tabs') {
        if (request.method() === 'PUT') { const body = request.postDataJSON(); state = { tabs: body.tabs, activeId: body.activeId }; return route.fulfill({ json: { state } }) }
        return route.fulfill({ json: { state, claims: [] } })
      }
      if (pathname === '/api/terminal-backends') return route.fulfill({ json: { backends: [{ id: 'shell', label: 'Shell', installed: true }, { id: 'tmux', label: 'tmux', installed: true }, { id: 'zellij', label: 'Zellij', installed: false }, { id: 'screen', label: 'Screen', installed: true }] } })
      const terminal = pathname.match(/^\/api\/agent-runtimes\/([^/]+)\/terminal\//)
      if (terminal) { if (request.method() === 'POST') starts.push(terminal[1]); return route.fulfill({ json: { ok: true, session: 'fixture-shell' } }) }
      if (pathname === '/api/agent-cwd') return route.fulfill({ json: { cwd: '/workspace' } })
      if (pathname.startsWith('/api/')) return route.fulfill({ json: { settings: null, skills: [], jobs: [], commands: [], runtimes: [] } })
      return route.fulfill({ contentType: 'text/html', body: `<html><head><meta charset="utf-8"><style>${css}html,body,#root{height:100%;margin:0}</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>` })
    })
    await page.goto('http://mew-close.test/')
    await page.evaluate('window.showTerminal()')
    await page.getByRole('tab', { name: /first/ }).waitFor()
    await page.getByRole('button', { name: '새 탭', exact: true }).click()
    await page.getByRole('button', { name: /^기본 터미널/ }).click()
    await page.getByRole('tab', { name: /기본 터미널/, selected: true }).waitFor()
    await page.getByRole('button', { name: '새 탭', exact: true }).click()
    assert.equal(await page.getByRole('button', { name: /Zellij/ }).isDisabled(), true)
    const saved = page.waitForResponse(response => response.url().includes('/api/user-ui/agent-tabs') && response.request().method() === 'PUT' && response.request().postDataJSON().tabs.some((tab: { runtime: string }) => tab.runtime === 'screen'))
    await page.getByRole('button', { name: /^GNU Screen/ }).click()
    await page.getByRole('tab', { name: /GNU Screen/, selected: true }).waitFor()
    await page.waitForFunction("document.querySelectorAll('[role=tab]').length === 3")
    await saved
    assert.deepEqual(state.tabs.map(tab => tab.runtime), ['tmux', 'shell', 'screen'])
    assert.ok(starts.includes('shell') && starts.includes('screen'))
    await page.evaluate('window.showTerminal()')
    await page.getByRole('tab', { name: /기본 터미널/ }).waitFor()
    await page.getByRole('tab', { name: /GNU Screen/ }).waitFor()
    assert.equal(await page.getByRole('tab').count(), 3)
  } finally { await browser.close() }
})
