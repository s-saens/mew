import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { build } from 'rolldown'
import { connectTestBrowser } from './test-browser.ts'

test('Mewlink command UI survives a ten-minute suspension and resumes without notices or remounts', { timeout: 40_000 }, async t => {
  const root = path.resolve(import.meta.dirname, '..')
  const source = `
import React,{useEffect,useState} from '${root}/node_modules/react/index.js';
import {createRoot} from '${root}/node_modules/react-dom/client.js';
import {PanelNotice} from '${root}/packages/ui/src/panel-notice.tsx';
import {useAgentCommands} from '${root}/src/hooks/use-agent-commands.ts';
import {DataChannelTransport,setRemoteTransport,openMewSocket} from '${root}/src/utils/remote-transport.ts';
import {encodeRemoteBytes} from '${root}/src/utils/remote-codec.ts';
const scope={runtime:'codex',cwd:'/workspace',sessionId:'session'};
window.host={reads:0,writes:[],sockets:0,mode:'ready',holdRead:false,records:[{...scope,id:'existing',tab:'tab',command:'Retained command',session:'command-session',state:'running',startedAt:1,finishedAt:null,exitCode:null,afterUserCount:0}]};
const pendingWrites=new Map();
class Channel extends EventTarget {
  readyState='open';bufferedAmount=0;
  reply(frame){this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(frame)}))}
  response(id,status,value){this.reply({type:'response',id,status,headers:{'content-type':'application/json'},responseWindow:1});this.reply({type:'chunk',id,data:encodeRemoteBytes(new TextEncoder().encode(JSON.stringify(value)))});this.reply({type:'end',id})}
  send(raw){const frame=JSON.parse(raw);queueMicrotask(()=>{
    if(frame.type==='socket'){window.host.sockets++;this.reply({type:'open',id:frame.id});return}
    if(frame.type==='request'&&frame.method==='GET'){
      window.host.reads++;
      if(!window.host.holdRead)this.response(frame.id,window.host.mode==='permission'?403:200,window.host.mode==='permission'?{error:'Access denied'}:{commands:window.host.records});
    }
    if(frame.type==='request'&&frame.method==='POST'){window.host.writes.push(frame.id);pendingWrites.set(frame.id,'')}
    if(frame.type==='chunk'&&pendingWrites.has(frame.id))pendingWrites.set(frame.id,pendingWrites.get(frame.id)+atob(frame.data));
    if(frame.type==='end'&&pendingWrites.has(frame.id)){
      const input=JSON.parse(pendingWrites.get(frame.id));pendingWrites.delete(frame.id);
      const command={...input,session:'started-session',state:'running',startedAt:2,finishedAt:null,exitCode:null};window.host.records.push(command);this.response(frame.id,200,{command});
    }
  })}
  close(){this.readyState='closed'}
}
window.transport=new DataChannelTransport(new Channel());setRemoteTransport(window.transport);
window.mounts=0;window.unmounts=0;window.noticeCount=0;window.hidden=false;window.socketCloses=0;
Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>window.hidden?'hidden':'visible'});
const visibility=value=>{window.hidden=value;document.dispatchEvent(new Event('visibilitychange'))};
window.suspend=()=>{visibility(true);window.transport.suspendForReconnect()};
window.resume=()=>{window.transport.resumeAfterReconnect();visibility(false)};
window.connect=()=>{window.sessionSocket=openMewSocket('wss://'+location.host+'/api/agent/ws?resume=session');window.sessionSocket.onclose=()=>window.socketCloses++};
function Harness(){
  const cli=useAgentCommands(scope,true),[draft,setDraft]=useState('');window.commands=cli;
  useEffect(()=>{window.mounts++;return()=>window.unmounts++},[]);
  return React.createElement('main',null,
    cli.error&&React.createElement(PanelNotice,null,cli.error,cli.readFailed&&React.createElement('button',{onClick:cli.retryRefresh,'aria-label':'Retry'},'Retry')),
    React.createElement('ul',null,cli.records.map(record=>React.createElement('li',{key:record.id,'data-command-id':record.id},record.command+' '+record.state))),
    React.createElement('textarea',{'aria-label':'Draft',value:draft,onChange:event=>setDraft(event.target.value)}),
    React.createElement('button',{onClick:()=>cli.submit('tab','Run once',0)},'Run command'));
}
new MutationObserver(mutations=>{for(const mutation of mutations)for(const node of mutation.addedNodes)if(node.nodeType===1&&(node.matches('[role="alert"]')||node.querySelector('[role="alert"]')))window.noticeCount++}).observe(document.getElementById('root'),{childList:true,subtree:true});
const app=createRoot(document.getElementById('root'));app.render(React.createElement(Harness));window.unmount=()=>app.unmount();`
  const bundle = await build({
    input: 'virtual:mewlink-background-recovery.tsx', write: false, platform: 'browser',
    output: { format: 'iife', codeSplitting: false },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
    plugins: [{ name: 'fixture', resolveId(id) { if (id === 'virtual:mewlink-background-recovery.tsx') return id }, load(id) { if (id === 'virtual:mewlink-background-recovery.tsx') return source } }],
  })
  const code = bundle.output.find(item => item.type === 'chunk')!.code
  const browser = await connectTestBrowser()
  t.after(() => browser.close())
  for (const width of [390, 1100]) {
    await t.test(`${width}px`, async () => {
      const page = await browser.newPage({ viewport: { width, height: 844 } })
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.clock.install({ time: new Date('2030-01-01T00:00:00Z') })
      await page.clock.pauseAt(new Date('2030-01-01T00:00:01Z'))
      await page.route('https://mewlink-background-recovery.test/**', route => route.fulfill({ contentType: 'text/html', body: `<style>body{margin:0;background:#202435;color:#eee;font:16px sans-serif}main{position:relative;padding:12px}textarea{box-sizing:border-box;width:100%;height:100px}li{padding:8px}</style><div id="root"></div><script>${code}</script>` }))
      await page.goto('https://mewlink-background-recovery.test/')
      await page.waitForFunction('window.commands.records.length===1')
      await page.getByRole('button', { name: 'Run command', exact: true }).click()
      await page.waitForFunction('window.commands.records.length===2 && !window.commands.submitting')
      await page.getByRole('textbox', { name: 'Draft' }).fill('Keep this unsent draft')
      await page.getByRole('textbox', { name: 'Draft' }).focus()
      await page.locator('main, textarea, [data-command-id="existing"]').evaluateAll(elements => {
        for (const element of elements) element.setAttribute('data-retained', 'true')
      })
      const initialReads = await page.evaluate<number>('window.host.reads')

      await page.evaluate('window.suspend();window.connect()')
      await page.clock.runFor(10 * 60_000)
      assert.equal(await page.evaluate('window.host.reads'), initialReads, 'suspended polling waits without sending or consuming retries')
      assert.equal(await page.evaluate('window.commands.error'), null)
      assert.equal(await page.evaluate('window.commands.readFailed'), false)
      assert.equal(await page.evaluate('window.sessionSocket.readyState'), 0, 'a session socket remains CONNECTING through suspension')
      assert.equal(await page.evaluate('window.socketCloses'), 0, 'the waiting socket never triggers a failed-session retry')
      assert.equal(await page.evaluate('window.noticeCount'), 0, 'no transient warning appears during the whole background interval')
      assert.equal(await page.getByRole('alert').count(), 0)
      assert.equal(await page.locator('[data-retained="true"]').count(), 3, 'panel, command row and draft retain their DOM nodes')
      assert.equal(await page.getByRole('textbox', { name: 'Draft' }).inputValue(), 'Keep this unsent draft')
      assert.equal(await page.getByRole('textbox', { name: 'Draft' }).evaluate(element => element === element.ownerDocument.activeElement), true)
      assert.equal(await page.evaluate('window.commands.records.length'), 2)

      await page.evaluate('window.host.records[0].state="completed";window.resume()')
      await page.waitForFunction('window.commands.records[0].state==="completed" && window.sessionSocket.readyState===1')
      assert.equal(await page.evaluate('window.host.reads'), initialReads + 1, 'the waiting poll refreshes immediately after reconnection')
      assert.equal(await page.evaluate('window.host.sockets'), 1, 'the original waiting session socket opens once')
      await page.clock.runFor(20_000)
      assert.equal(await page.evaluate('window.commands.error'), null, 'normal polling continues beyond the old recovery limit')
      assert.equal(await page.evaluate('window.host.writes.length'), 1, 'recovery never replays the accepted command')
      assert.equal(await page.evaluate('window.mounts'), 1)
      assert.equal(await page.evaluate('window.unmounts'), 0)
      assert.equal(await page.locator('[data-retained="true"]').count(), 3)
      assert.equal(await page.getByRole('textbox', { name: 'Draft' }).evaluate(element => element === element.ownerDocument.activeElement), true)

      const readsBeforeInFlight = await page.evaluate<number>('window.host.reads')
      await page.evaluate('window.host.holdRead=true')
      await page.clock.runFor(1500)
      await page.waitForFunction(`window.host.reads===${readsBeforeInFlight + 1} && window.transport.requests.size===1`)
      await page.evaluate('window.suspend();window.host.holdRead=false')
      await page.clock.runFor(3000)
      assert.equal(await page.evaluate('window.noticeCount'), 0, 'interrupting an in-flight read is also quiet')
      await page.evaluate('window.host.records[0].state="failed";window.resume()')
      await page.waitForFunction('window.commands.records[0].state==="failed"')
      assert.equal(await page.evaluate('window.host.reads'), readsBeforeInFlight + 2, 'an interrupted safe read retries automatically once recovery is ready')
      assert.equal(await page.evaluate('window.host.writes.length'), 1)
      assert.equal(await page.getByRole('textbox', { name: 'Draft' }).inputValue(), 'Keep this unsent draft')
      assert.equal(await page.locator('[data-retained="true"]').count(), 3)
      assert.equal(await page.evaluate('window.noticeCount'), 0)

      await page.evaluate('window.host.mode="permission"')
      await page.clock.runFor(1500)
      await page.waitForFunction('window.commands.readFailed && window.commands.error==="Access denied"')
      assert.equal(await page.getByRole('alert').innerText(), 'Access deniedRetry', 'a real HTTP 403 still exposes its recovery action')
      const deniedReads = await page.evaluate<number>('window.host.reads')
      await page.clock.runFor(10_000)
      assert.equal(await page.evaluate('window.host.reads'), deniedReads, 'authorization failures stop polling immediately')
      assert.equal(await page.evaluate('window.host.writes.length'), 1)
      assert.deepEqual(errors, [])
      await page.evaluate('window.unmount();window.transport.close()')
      await page.close()
    })
  }
})
