import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { chromium } from 'playwright-core'
import { domBrowserExecutable } from './browser-dom-executable.ts'

const root = path.resolve(import.meta.dirname, '..')

test('agent connections replace stalled handshakes and relay paths promptly while preserving the conversation and focused draft', { skip: !domBrowserExecutable(), timeout: 30_000 }, async () => {
  const source = `import React from '${root}/node_modules/react/index.js';
import {createRoot} from '${root}/node_modules/react-dom/client.js';
import {AgentPanel} from '${root}/src/components/AgentPanel.tsx';
import {I18nProvider} from '${root}/src/i18n.tsx';
localStorage.setItem('mew:locale','ko');window.sockets=[];window.messages=[];window.autoPong=true;
const tab={id:'latency',label:'latency',renamed:true,runtime:'codex',cwd:'/workspace'};
localStorage.setItem('mew:agent-tabs:'+JSON.stringify('/workspace'),JSON.stringify([tab]));
localStorage.setItem('mew:agent-active-tab:'+JSON.stringify('/workspace'),'latency');
class Socket {
 static OPEN=1;static CLOSED=3;readyState=0;bufferedAmount=0;createdAt=Date.now();
 constructor(url){this.url=url;window.sockets.push(this)}
 emit(value){this.onmessage?.({data:JSON.stringify(value)})}
 open(){this.readyState=1;this.onopen?.()}
 sync(probe=true){this.emit({type:'ready',cwd:'/workspace',...(probe?{connectionProbe:true}:{})});this.emit({type:'replay',restored:true,events:[{type:'update',update:{sessionUpdate:'user_message_chunk',content:{type:'text',text:'Preserved conversation'}}}]});this.emit({type:'meta',meta:{sessionId:'latency',startedAt:new Date().toISOString(),turns:1,busy:false,queued:[],usage:null,canLoad:true,canList:true}})}
 send(raw){if(this.readyState!==1)throw Error('send before OPEN');const value=JSON.parse(raw);window.messages.push(value);if(value.type==='ping'&&window.autoPong)queueMicrotask(()=>this.emit({type:'pong',id:value.id}))}
 close(){this.readyState=3;this.onclose?.()}
}
window.WebSocket=Socket;
createRoot(document.getElementById('root')).render(<I18nProvider><AgentPanel project="test" workspacePath="/workspace" tree={[]} focusedFilePath={null} onOpenFile={()=>{}} onClose={()=>{}} /></I18nProvider>);`
  const bundle = await build({ input: 'virtual:latency.tsx', write: false, platform: 'browser', output: { format: 'iife' }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } }, plugins: [{
    name: 'latency-fixture',
    async resolveId(id, importer) {
      if (id === 'virtual:latency.tsx') return id
      if (id === '@mew/tmux-term') return 'virtual:terminal'
      if (id.endsWith('.css')) return 'virtual:style'
      if (id.endsWith('?raw')) { const resolved = await this.resolve(id.slice(0, -4), importer, { skipSelf: true }); if (resolved) return `${resolved.id}?raw` }
    },
    async load(id) {
      if (id === 'virtual:latency.tsx') return source
      if (id === 'virtual:terminal') return 'export const isHiddenTmuxSession=()=>false;export function TmuxTerminal(){return null}'
      if (id === 'virtual:style') return ''
      if (id.endsWith('?raw')) return `export default ${JSON.stringify(await fs.readFile(id.slice(0, -4), 'utf8'))}`
    },
  }] })
  const chunk = bundle.output.find(item => item.type === 'chunk')!
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 844 } })
    page.setDefaultTimeout(4000)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('http://mew-agent-latency.test/**', route => {
      const pathname = new URL(route.request().url()).pathname
      if (pathname === '/app.js') return route.fulfill({ contentType: 'text/javascript', body: chunk.code })
      if (pathname === '/api/user-ui/agent-tabs') return route.fulfill({ json: { state: { tabs: [{ id: 'latency', label: 'latency', renamed: true, runtime: 'codex', cwd: '/workspace', sessionIds: { [JSON.stringify(['codex', '/workspace'])]: 'latency' } }], activeId: 'latency' }, claims: [] } })
      if (pathname === '/api/agent-cwd') return route.fulfill({ json: { cwd: '/workspace' } })
      if (pathname === '/api/projects') return route.fulfill({ json: [] })
      if (pathname.startsWith('/api/')) return route.fulfill({ json: { settings: null, skills: [], jobs: [], commands: [], runtimes: [] } })
      return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="ko"><meta charset="utf-8"><style>html,body,#root{height:100%;margin:0}[hidden]{display:none!important}</style><div id="root"></div><script src="/app.js"></script></html>' })
    })
    await page.clock.install()
    await page.goto('http://mew-agent-latency.test/')
    await page.waitForFunction('window.sockets.length===1')
    await page.clock.pauseAt(new Date(await page.evaluate<number>('Date.now() + 1000')))
    const session = page.locator('[data-agent-session]:visible')
    const draft = session.locator('[contenteditable="true"][aria-placeholder="텍스트 입력"]')
    const overlay = session.locator('[data-agent-loading]')
    const send = session.getByRole('button', { name: '전송', exact: true })
    await draft.fill('Draft during connection setup')
    await page.evaluate('window.stale=window.sockets[0];window.staleCallbacks={open:window.stale.onopen,message:window.stale.onmessage,close:window.stale.onclose}')
    const remaining = await page.evaluate<number>('3000-(Date.now()-window.sockets[0].createdAt)')
    await page.clock.runFor(remaining - 1)
    assert.equal(await page.evaluate('window.sockets.length'), 1)
    await page.clock.runFor(1)
    assert.equal(await page.evaluate('window.sockets.length'), 2, 'CONNECTING is replaced after its three-second handshake deadline')
    assert.equal(await page.evaluate('window.stale.readyState'), 3)
    await page.evaluate(`window.staleCallbacks.open();window.staleCallbacks.message({data:JSON.stringify({type:'meta',meta:{sessionId:'poisoned-session',busy:false,queued:[]}})});window.staleCallbacks.message({data:JSON.stringify({type:'update',update:{sessionUpdate:'user_message_chunk',content:{type:'text',text:'Stale socket transcript'}}})});window.staleCallbacks.close()`)
    assert.equal(await session.getByText('Stale socket transcript', { exact: true }).count(), 0)
    assert.equal(await send.isDisabled(), true, 'a queued stale open/meta cannot make the new socket ready')
    await page.evaluate('window.sockets[1].open()')
    await page.clock.runFor(2999)
    assert.equal(await page.evaluate('window.sockets.length'), 2)
    await page.clock.runFor(1)
    assert.equal(await page.evaluate('window.sockets.length'), 3, 'OPEN without any server packet also expires after three seconds')
    assert.equal(await page.evaluate('new URL(window.sockets[2].url).searchParams.get("resume")'), 'latency', 'late metadata cannot replace the retained session identity')
    await page.evaluate('window.sockets[2].open();window.sockets[2].sync()')
    await overlay.waitFor({ state: 'hidden' })
    await session.getByText('Preserved conversation', { exact: true }).waitFor()
    assert.equal(await draft.innerText(), 'Draft during connection setup')
    await draft.fill('Submit this once')
    await send.click()
    assert.equal(await page.evaluate('window.messages.filter(message=>message.type==="prompt").length'), 1)
    await draft.fill('Unsent focused draft')
    await draft.press('End')
    await draft.evaluate(element => {
      const view = element.ownerDocument.defaultView as unknown as { retainedDraft: unknown; retainedFocus: unknown }
      view.retainedDraft = element
      view.retainedFocus = element.ownerDocument.activeElement
    })
    await page.evaluate(`window.dispatchEvent(new Event('online'));window.dispatchEvent(new Event('pageshow'));window.dispatchEvent(new Event('mew:remote-reconnected'));document.dispatchEvent(new Event('visibilitychange'))`)
    await page.clock.runFor(750)
    assert.equal(await page.evaluate('window.sockets.length'), 3, 'a healthy matching pong retains the same socket during an event burst')
    assert.equal(await page.evaluate('window.messages.filter(message=>message.type==="ping").length'), 1)
    await page.evaluate('window.autoPong=false;window.dispatchEvent(new Event("online"))')
    const ping = await page.evaluate<{ type: string; id: string }>('window.messages.filter(message=>message.type==="ping").at(-1)')
    await page.evaluate(`window.sockets[2].emit({type:'pong',id:'unrelated-probe'});window.sockets[2].emit({type:'meta',meta:{sessionId:'latency',busy:false,queued:[]}})`)
    await page.clock.runFor(749)
    assert.equal(await page.evaluate('window.sockets.length'), 3)
    await page.clock.runFor(1)
    assert.equal(await page.evaluate('window.sockets.length'), 4, 'a stalled OPEN path is replaced 750ms after its fresh ping')
    assert.equal(await page.evaluate('window.sockets[2].readyState'), 3)
    assert.ok(ping.id.length > 0)
    await page.evaluate('window.autoPong=true;window.sockets[3].open();window.sockets[3].sync()')
    await overlay.waitFor({ state: 'hidden' })
    assert.equal(await draft.innerText(), 'Unsent focused draft')
    assert.equal(await draft.evaluate(element => element === (element.ownerDocument.defaultView as unknown as { retainedDraft: unknown }).retainedDraft), true)
    assert.equal(await draft.evaluate(element => element.ownerDocument.activeElement === (element.ownerDocument.defaultView as unknown as { retainedFocus: unknown }).retainedFocus), true)
    assert.equal(await session.getByText('Preserved conversation', { exact: true }).count(), 1)
    assert.equal(await page.evaluate('window.messages.filter(message=>message.type==="prompt").length'), 1, 'replacing either handshake or relay never replays the accepted prompt')
    assert.equal(await session.getByRole('alert').count(), 0)
    assert.equal(await session.getByRole('button', { name: '다시 연결', exact: true }).count(), 0)

    await page.evaluate('window.sockets[3].close()')
    await page.clock.runFor(0)
    assert.equal(await page.evaluate('window.sockets.length'), 5)
    await page.evaluate('window.sockets[4].open();window.sockets[4].sync(false)')
    await overlay.waitFor({ state: 'hidden' })
    const previousPings = await page.evaluate<number>('window.messages.filter(message=>message.type==="ping").length')
    await page.clock.runFor(14_999)
    await page.evaluate('window.dispatchEvent(new Event("online"))')
    assert.equal(await page.evaluate('window.sockets.length'), 5, 'a fresh legacy connection stays usable without probe support')
    assert.equal(await page.evaluate('window.messages.filter(message=>message.type==="ping").length'), previousPings, 'legacy servers are never sent unsupported ping frames')
    await page.clock.runFor(1)
    await page.evaluate('document.dispatchEvent(new Event("visibilitychange"))')
    assert.equal(await page.evaluate('window.sockets.length'), 6, 'foreground return replaces a legacy connection stale for fifteen seconds')
    await page.evaluate('window.fixtureHidden=true;Object.defineProperty(document,"visibilityState",{configurable:true,get:()=>window.fixtureHidden?"hidden":"visible"});document.dispatchEvent(new Event("visibilitychange"))')
    await page.clock.runFor(30_000)
    assert.equal(await page.evaluate('window.sockets.length'), 6, 'an unavailable background tab does not churn handshake replacements')
    await page.evaluate('window.fixtureHidden=false;document.dispatchEvent(new Event("visibilitychange"))')
    assert.equal(await page.evaluate('window.sockets.length'), 6, 'background time does not consume the active handshake budget')
    await page.clock.runFor(2999)
    assert.equal(await page.evaluate('window.sockets.length'), 6)
    await page.clock.runFor(1)
    assert.equal(await page.evaluate('window.sockets.length'), 7, 'a stalled handshake is replaced after three seconds of visible time')
    await page.evaluate('window.sockets[6].open();window.sockets[6].sync()')
    await overlay.waitFor({ state: 'hidden' })
    await page.evaluate('window.fixtureOnline=false;Object.defineProperty(navigator,"onLine",{configurable:true,get:()=>window.fixtureOnline});window.dispatchEvent(new Event("offline"));window.sockets[6].close()')
    await page.clock.runFor(60_000)
    assert.equal(await page.evaluate('window.sockets.length'), 7, 'offline errors cannot churn reconnect attempts')
    await page.evaluate('window.fixtureOnline=true;window.dispatchEvent(new Event("online"))')
    assert.equal(await page.evaluate('window.sockets.length'), 8, 'returning online opens an unscheduled pending connection immediately')
    await page.clock.runFor(500)
    await page.evaluate('window.fixtureOnline=false;window.dispatchEvent(new Event("offline"))')
    await page.clock.runFor(60_000)
    await page.evaluate('window.fixtureOnline=true;window.dispatchEvent(new Event("online"))')
    assert.equal(await page.evaluate('window.sockets.length'), 8, 'offline time is excluded from the handshake budget')
    await page.clock.runFor(2499)
    assert.equal(await page.evaluate('window.sockets.length'), 8)
    await page.clock.runFor(1)
    assert.equal(await page.evaluate('window.sockets.length'), 9)
    await page.evaluate('window.sockets[8].open();window.sockets[8].sync()')
    await overlay.waitFor({ state: 'hidden' })
    assert.equal(await draft.innerText(), 'Unsent focused draft')
    assert.equal(await page.evaluate('window.messages.filter(message=>message.type==="prompt").length'), 1)
    assert.deepEqual(errors, [])
  } finally { await browser.close() }
})
