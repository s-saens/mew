import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { connectTestBrowser } from './test-browser.ts'

const root = path.resolve(import.meta.dirname, '..')

test('two workspace providers retain agent sockets, links, sheets and downloads across active-view changes', { timeout: 45_000 }, async t => {
  const source = `import React,{useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {AgentPanel} from '${root}/src/components/AgentPanel.tsx';
import {SheetViewer} from '${root}/src/components/SheetViewer.tsx';
import {DownloadLink} from '${root}/src/components/DownloadLink.tsx';
import {I18nProvider} from '${root}/src/i18n.tsx';
import {WorkspaceApiProvider,useWorkspaceApi} from '${root}/src/api/workspace-api-context.tsx';
import {WorkspaceViewProvider} from '${root}/src/workspace/workspace-view-context.ts';
import {createWorkspaceClient,workspaceClient} from '${root}/src/api/client.ts';
import {configureAppRuntime} from '${root}/src/runtime/app-runtime.ts';
import {editorImageUrl} from '${root}/src/utils/editor-image-url.ts';
import {readAgentInputDraft} from '${root}/src/utils/agentInputDrafts.ts';
localStorage.setItem('mew:locale','en');window.sockets=[];window.socketMessages=[];window.opened=[];window.prepared=[];
class Socket {readyState=0;bufferedAmount=0;
constructor(url){this.url=url;window.sockets.push(this);setTimeout(()=>{if(this.readyState===3)return;this.readyState=1;this.onopen?.();if(new URL(url).pathname!='/api/agent/ws')return;this.emit({type:'replay',restored:true,events:[{type:'update',update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'[Open same document](./same.md)'}}}]});this.emit({type:'meta',meta:{sessionId:'saved',startedAt:new Date().toISOString(),turns:1,busy:false,queued:[],usage:null,canLoad:true,canList:true}})},20)}
emit(value){this.onmessage?.({data:JSON.stringify(value)})}send(raw){window.socketMessages.push({url:this.url,message:JSON.parse(raw)})}close(){this.readyState=3;this.onclose?.()}}
configureAppRuntime({transport:{fetch:(...args)=>fetch(...args),socket:url=>new Socket(url),close(){}},resourceUrl:url=>url,prepareResourceUrl:async url=>{window.prepared.push(url);return url},releaseResourceUrl(){}});
const specs=[{id:'a',workspacePath:'/worktrees/a',projectPath:'/projects/a'},{id:'b',workspacePath:'/projects/b',projectPath:'/projects/b'}].map(scope=>({...scope,api:createWorkspaceClient(scope)}));
const states=new Map(specs.map(scope=>[scope.id,Promise.resolve({state:{tabs:[{id:'same-agent',label:'Agent '+scope.id,renamed:true,runtime:'codex',cwd:scope.workspacePath},{id:'same-shell',label:'Shell '+scope.id,renamed:true,runtime:'tmux',cwd:scope.workspacePath}],activeId:'same-agent'},claims:[]})]));
window.changeDefault=()=>workspaceClient.setProject('changed');
window.readDraft=id=>{const scope=specs.find(scope=>scope.id===id);return readAgentInputDraft('same-agent',{account:'fixture',...scope})};
function Resources({scope}){const api=useWorkspaceApi();return <><SheetViewer path="same.csv"/><img alt={'Image '+scope.id} src={editorImageUrl('./same.png','readme.md','.workspace',{path:scope.workspacePath},api.resourceUrl)}/><DownloadLink href="/api/download?project=.workspace&path=same.csv" name="same.csv">Download {scope.id}</DownloadLink></>}
function Panel({scope,active,onFocus}){const ref=useRef(null);return <section ref={ref} id={scope.id} onPointerDown={onFocus}><WorkspaceViewProvider value={{id:scope.id,compact:true,active,root:ref}}><WorkspaceApiProvider client={scope.api}><button onClick={onFocus}>Focus {scope.id}</button><div style={{height:420,overflow:'hidden'}}><AgentPanel embedded cacheAccount="fixture" project=".workspace" workspacePath={scope.projectPath} workingPath={scope.workspacePath} preparedTabs={states.get(scope.id)} tree={[]} focusedFilePath={null} onOpenFile={(project,path)=>window.opened.push({id:scope.id,project,path})} onClose={()=>{}}/></div><Resources scope={scope}/></WorkspaceApiProvider></WorkspaceViewProvider></section>}
function Fixture(){const [active,setActive]=useState('a');return <I18nProvider><main>{specs.map(scope=><Panel key={scope.id} scope={scope} active={active===scope.id} onFocus={()=>setActive(scope.id)}/>)}</main></I18nProvider>}
createRoot(document.getElementById('root')).render(<Fixture/>);`
  const bundle = await build({ input: 'virtual:resources.tsx', write: false, platform: 'browser', output: { format: 'iife', codeSplitting: false },
    onLog(level, log, handler) { if (log.code !== 'MODULE_LEVEL_DIRECTIVE') handler(level, log) },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
    plugins: [{ name: 'resources-fixture', async resolveId(id, importer) {
      if (id === 'virtual:resources.tsx') return id
      if (id === '@mew/tmux-term') return 'virtual:terminal.tsx'
      if (id.endsWith('.css')) return 'virtual:style'
      if (id.endsWith('?raw')) { const resolved = await this.resolve(id.slice(0, -4), importer, { skipSelf: true }); if (resolved) return resolved.id + '?raw' }
    }, async load(id) {
      if (id === 'virtual:resources.tsx') return source
      if (id === 'virtual:style') return ''
      if (id === 'virtual:terminal.tsx') return `import {useEffect} from 'react';export const isHiddenTmuxSession=()=>false;export function TmuxTerminal({socketFactory,sessionName}){useEffect(()=>{const socket=socketFactory('ws://mew-resources.test/api/tmux/ws?session='+sessionName);return()=>socket.close()},[socketFactory,sessionName]);return <span>Terminal connected</span>}`
      if (id.endsWith('?raw')) return 'export default ' + JSON.stringify(await fs.readFile(id.slice(0, -4), 'utf8'))
    } }],
  })
  const code = bundle.output.find(item => item.type === 'chunk')!.code
  const browser = await connectTestBrowser()
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1300, height: 900 }, acceptDownloads: true })
  page.setDefaultTimeout(5000)
  const requests: { url: URL; method: string }[] = [], errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('http://mew-resources.test/**', route => {
    const url = new URL(route.request().url()), pathname = url.pathname
    if (pathname === '/app.js') return route.fulfill({ contentType: 'text/javascript', body: code })
    if (pathname.startsWith('/api/')) {
      requests.push({ url, method: route.request().method() })
      const scope = url.searchParams.get('mewWorkspacePath')
      if (pathname === '/api/raw') return route.fulfill(url.searchParams.get('path')!.endsWith('.csv')
        ? { contentType: 'text/csv', body: 'Name\n' + scope }
        : { contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="red"/></svg>' })
      if (pathname === '/api/download') return route.fulfill({ contentType: 'text/csv', headers: { 'Content-Disposition': 'attachment; filename="same.csv"' }, body: 'download ' + scope })
      if (pathname === '/api/agent-file-link') return route.fulfill({ json: { target: { project: '.workspace', path: 'same.md', line: null } } })
      if (pathname === '/api/agent-runtimes') return route.fulfill({ json: { runtimes: [{ id: 'codex', installed: true }, { id: 'tmux', installed: true }] } })
      if (pathname.startsWith('/api/agent-runtimes/tmux/terminal/')) return route.fulfill({ json: { ok: true, session: 'same-shell' } })
      if (pathname === '/api/projects' || pathname === '/api/tree') return route.fulfill({ json: [] })
      return route.fulfill({ json: { state: null, claims: [], settings: null, commands: [], skills: [], sets: [], jobs: [] } })
    }
    return route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><style>main{display:flex;gap:12px}section{width:48%;height:850px}button{min-height:24px}img{width:8px}</style><div id="root"></div><script src="/app.js"></script>' })
  })
  await page.goto('http://mew-resources.test/')
  await page.locator('#a [data-agent-turn-header] button').first().click()
  await page.locator('#b [data-agent-turn-header] button').first().click()
  await page.locator('#a').getByRole('link', { name: 'Open same document' }).waitFor().catch(async error => { throw new Error(error.message + '\n' + JSON.stringify({ errors, state: await page.evaluate('({text:document.body.innerText,sockets:window.sockets?.map(socket=>socket.url)})') })) })
  await page.locator('#b').getByRole('link', { name: 'Open same document' }).waitFor()
  await page.locator('#a td').getByText('/worktrees/a', { exact: true }).waitFor()
  await page.locator('#b td').getByText('/projects/b', { exact: true }).waitFor()
  await page.locator('#b').getByRole('button', { name: 'Focus b', exact: true }).click()
  await page.evaluate('window.changeDefault()')
  await page.evaluate("window.dispatchEvent(new CustomEvent('mew:insert-ref',{detail:{target:'agent',text:'B-only reference',workspacePath:'/projects/b'}}))")
  await page.waitForFunction("document.querySelector('#b [data-agent-composer] .cm-content')?.textContent.includes('B-only reference')")
  assert.equal(await page.locator('#a [data-agent-composer] .cm-content').textContent().then(text => text?.includes('B-only reference')), false)
  await page.locator('#a').getByRole('link', { name: 'Open same document' }).click()
  await page.waitForFunction('window.opened.length===1')
  await page.evaluate("window.dispatchEvent(new CustomEvent('mew:insert-ref',{detail:{target:'agent',text:'A-only reference',workspacePath:'/worktrees/a'}}))")
  await page.waitForFunction("window.readDraft('a').includes('A-only reference') && window.readDraft('b').includes('B-only reference')")
  const link = requests.find(request => request.url.pathname === '/api/agent-file-link')!
  assert.equal(link.url.searchParams.get('mewWorkspacePath'), '/worktrees/a')
  assert.equal(link.url.searchParams.get('mewProjectPath'), '/projects/a')
  for (const id of ['a', 'b']) {
    await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download ' + id, exact: true }).click()]).catch(async error => {
      throw new Error(error.message + '\n' + JSON.stringify({ prepared: await page.evaluate('window.prepared'), downloads: requests.filter(request => request.url.pathname === '/api/download').map(request => request.url.href), errors }))
    })
  }
  await page.locator('#a').getByRole('tab', { name: /Shell a/ }).click()
  await page.waitForFunction("window.sockets.some(socket=>new URL(socket.url).pathname==='/api/tmux/ws')")
  await page.locator('#a').getByRole('tab', { name: /Agent a/ }).getByRole('button', { name: 'Close tab', exact: true }).click()
  await page.waitForFunction("!document.querySelector('#a [role=tab][aria-label=\"Agent a\"]')")
  assert.equal(await page.evaluate("window.readDraft('a')"), '')
  assert.equal(await page.evaluate("window.readDraft('b').includes('B-only reference')"), true, 'closing a same-ID tab clears only its own root draft')
  const stopped = requests.find(request => request.url.pathname === '/api/agent/commands/stop-tab/same-agent')
  assert.equal(stopped?.url.searchParams.get('mewWorkspacePath'), '/worktrees/a')
  const state = await page.evaluate('({sockets:window.sockets.map(socket=>socket.url),prepared:window.prepared,opened:window.opened})') as { sockets: string[]; prepared: string[]; opened: object[] }
  assert.deepEqual(state.sockets.filter(url => new URL(url).pathname === '/api/agent/ws').map(url => new URL(url).searchParams.get('mewWorkspacePath')).sort(), ['/projects/b', '/worktrees/a'])
  assert.deepEqual(state.prepared.map(url => new URL(url, 'http://mew-resources.test').searchParams.get('mewWorkspacePath')), ['/worktrees/a', '/projects/b'])
  assert.equal(new URL(state.sockets.find(url => new URL(url).pathname === '/api/tmux/ws')!).searchParams.get('mewWorkspacePath'), '/worktrees/a')
  assert.deepEqual(state.opened, [{ id: 'a', project: '.workspace', path: 'same.md' }])
  for (const request of requests.filter(request => ['/api/raw', '/api/download'].includes(request.url.pathname))) assert.ok(['/worktrees/a', '/projects/b'].includes(request.url.searchParams.get('mewWorkspacePath') ?? ''))
  assert.deepEqual(errors, [])
})
