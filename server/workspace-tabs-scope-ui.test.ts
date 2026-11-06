import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'rolldown'
import { connectTestBrowser } from './test-browser.ts'

// Real hook state, storage, request and collaboration boundaries with a test-owned transport.
test('two workspace hooks isolate same-named files, delayed saves, database events and collaboration', { timeout: 30_000 }, async t => {
  const modulePath = (path: string) => JSON.stringify(new URL(path, import.meta.url).pathname)
  const source = `
import React from ${JSON.stringify(import.meta.resolve('react'))};
import {createRoot} from ${JSON.stringify(import.meta.resolve('react-dom/client'))};
import {useTabs} from ${modulePath('../src/hooks/useTabs.ts')};
import {useCollab} from ${modulePath('../src/hooks/useCollab.ts')};
import {useTaskList} from ${modulePath('../src/hooks/use-task-list.ts')};
import {WorkspaceApiProvider} from ${modulePath('../src/api/workspace-api-context.tsx')};
import {createWorkspaceClient,workspaceClient} from ${modulePath('../src/api/client.ts')};
import {configureAppRuntime} from ${modulePath('../src/runtime/app-runtime.ts')};
import {setContentIdentity,setContentWorkspace} from ${modulePath('../src/utils/contentCache.ts')};
import {SHARED_MEMO_PROJECT,SHARED_MEMO_PATH} from ${modulePath('../shared/shared-memo.ts')};
window.panels={};window.docs={};window.requests=[];window.writes=[];window.sockets=[];window.finishSave={};window.notices=[];
configureAppRuntime({transport:{
  async fetch(input,init={}){
    const url=new URL(String(input),location.origin),root=url.searchParams.get('mewWorkspacePath');
    window.requests.push({root,path:url.pathname,method:init.method||'GET'});
    if(url.pathname==='/api/file' && init.method==='PUT'){
      const body=JSON.parse(init.body);window.writes.push({root,body});
      return new Promise(resolve=>{window.finishSave[root]=()=>resolve(Response.json({ok:true,content:body.content}))});
    }
    if(url.pathname==='/api/file')return Response.json({path:'same.txt',content:'server:'+root,editable:true,version:{size:9,mtimeMs:1,tag:root}});
    if(url.pathname==='/api/file-access')return Response.json({view:true,edit:true});
    if(url.pathname==='/api/task-list')return Response.json({tasks:[],canEdit:true});
    if(url.pathname==='/api/task-list/events')return new Response('');
    return Response.json({});
  },
  socket(url){const socket={url,readyState:0,binaryType:'',send(){},close(){this.readyState=3;this.closed=true}};window.sockets.push(socket);return socket},close(){}
}});
setContentIdentity('owner@example.test');
const clients={a:createWorkspaceClient({workspacePath:'/a',projectPath:'/a'}),b:createWorkspaceClient({workspacePath:'/b',projectPath:'/b'})};window.clients=clients;
window.focusB=()=>{workspaceClient.setProject('focused');setContentWorkspace('/b')};
const noop=()=>{};
function Panel({id}){
  const tabs=useTabs('.workspace',noop,message=>window.notices.push(message),'/'+id,undefined,undefined,true,'/'+id+'/docs','owner@example.test');
  const doc=useCollab('.workspace','same.txt','owner@example.test');
  useTaskList('/'+id,'owner@example.test',true);
  window.panels[id]=tabs;window.docs[id]=doc;
  return <output data-panel={id}>{tabs.activeTab?.content}</output>;
}
function Memo(){useCollab(SHARED_MEMO_PROJECT,SHARED_MEMO_PATH,'owner@example.test');return null}
const app=createRoot(document.getElementById('root'));
app.render(<><WorkspaceApiProvider client={clients.a}><Panel id="a"/><Memo/></WorkspaceApiProvider><WorkspaceApiProvider client={clients.b}><Panel id="b"/></WorkspaceApiProvider></>);
window.unmount=()=>app.unmount();`
  const bundle = await build({ input: 'virtual:workspace-hook-scope.tsx', write: false, platform: 'browser', output: { format: 'iife', codeSplitting: false },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
    plugins: [{ name: 'workspace-hooks', resolveId: id => id === 'virtual:workspace-hook-scope.tsx' ? id : undefined,
      load: id => id === 'virtual:workspace-hook-scope.tsx' ? source : undefined }],
  })
  const code = bundle.output.find(item => item.type === 'chunk')!.code
  const browser = await connectTestBrowser()
  t.after(() => browser.close())
  const page = await browser.newPage(), errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.clock.install({ time: new Date('2030-01-01T00:00:00Z') })
  await page.clock.pauseAt(new Date('2030-01-01T00:00:01Z'))
  await page.route('https://workspace-hooks.test/**', route => route.fulfill({ contentType: 'text/html', body: `<div id="root"></div><script>${code}</script>` }))
  await page.goto('https://workspace-hooks.test/')
  await page.waitForFunction('window.panels.a?.hydrated && window.panels.b?.hydrated && window.sockets.length===3')
  const rooms = await page.evaluate<Array<{ root: string | null; room: string | null }>>('window.sockets.map(socket=>{const url=new URL(socket.url);return {root:url.searchParams.get("mewWorkspacePath"),room:url.searchParams.get("room")}})')
  assert.deepEqual(rooms.filter(room => room.root).map(room => room.root).sort(), ['/a', '/b'])
  assert.deepEqual(rooms.filter(room => room.root === null).map(room => room.room), ['__mew_shared__:memo'])
  assert.equal(await page.evaluate('window.docs.a.ydoc===window.docs.b.ydoc'), false)
  await page.waitForFunction('window.requests.filter(request=>request.path==="/api/task-list/events").length===2')
  assert.deepEqual(await page.evaluate('window.requests.filter(request=>request.path==="/api/task-list/events").map(request=>request.root).sort()'), ['/a', '/b'])
  await page.evaluate('window.panels.a.openFile("same.txt");window.panels.b.openFile("same.txt")')
  await page.waitForFunction('window.panels.a.activeTab?.content==="server:/a" && window.panels.b.activeTab?.content==="server:/b"')
  await page.evaluate('window.panels.a.updateTabContent("same.txt","draft A");window.focusB();window.panels.b.updateTabContent("same.txt","draft B")')
  await page.clock.runFor(500)
  await page.waitForFunction('window.writes.length===2')
  const writes = await page.evaluate<Array<{ root: string; body: { content: string; expectedContent: string; workspace: string } }>>('window.writes')
  assert.deepEqual(writes.map(write => [write.root, write.body.content, write.body.expectedContent, write.body.workspace]).sort(), [
    ['/a', 'draft A', 'server:/a', '/a'], ['/b', 'draft B', 'server:/b', '/b'],
  ])
  await page.evaluate('window.finishSave["/b"]()')
  await page.waitForFunction('window.panels.b.activeTab.status==="saved"')
  assert.equal(await page.evaluate('window.panels.a.activeTab.savedContent'), 'server:/a')
  await page.evaluate('window.finishSave["/a"]()')
  await page.waitForFunction('window.panels.a.activeTab.status==="saved"')
  assert.deepEqual(await page.evaluate('Object.fromEntries(Object.entries(window.clients).map(([key,client])=>[key,client.cache.getCachedFile(".workspace","same.txt").content]))'), { a: 'draft A', b: 'draft B' })
  await page.evaluate('window.dispatchEvent(new CustomEvent("mew:database-page-updated",{detail:{workspacePath:"/a",project:".workspace",path:"same.txt",content:"database A"}}))')
  await page.waitForFunction('window.panels.a.activeTab.content==="database A"')
  assert.equal(await page.evaluate('window.panels.b.activeTab.content'), 'draft B')
  await page.evaluate('window.dispatchEvent(new Event("mew:permissions-changed"))')
  await page.waitForFunction('window.requests.filter(request=>request.path==="/api/file-access").length===2')
  assert.deepEqual(await page.evaluate('window.requests.filter(request=>request.path==="/api/file-access").map(request=>request.root).sort()'), ['/a', '/b'])
  await page.evaluate('window.unmount()')
  assert.equal(await page.evaluate('window.sockets.every(socket=>socket.closed)'), true)
  assert.deepEqual(errors, [])
})
