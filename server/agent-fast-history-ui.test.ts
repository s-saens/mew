import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { connectTestBrowser } from './test-browser.ts'

const root = path.resolve(import.meta.dirname, '..')

test('history warms saved lists and previews before opening, and displays local search before provider completion', { timeout: 40_000 }, async t => {
  const source = `import React from '${root}/node_modules/react/index.js';
import {createRoot} from '${root}/node_modules/react-dom/client.js';
import {AgentPanel} from '${root}/src/components/AgentPanel.tsx';
import {I18nProvider} from '${root}/src/i18n.tsx';
localStorage.setItem('mew:locale','ko');window.messages=[];window.previewReleases={};window.previewInFlight=0;window.maxPreviewInFlight=0;
const message=(role,text)=>({type:'update',update:{sessionUpdate:role+'_message_chunk',content:{type:'text',text}}});
const saved=id=>[message('user','Saved '+id+' question'),{type:'turn_start'},message('agent','Saved '+id+' answer')];
const current=[message('user','Current question'),message('agent','Current answer')];
const recent=['first','second','third'].map(sessionId=>({sessionId,title:'Recent '+sessionId+' conversation',updatedAt:new Date().toISOString()}));
const history=(sessionId,events)=>({type:'history',page:{generation:'live-'+sessionId,sessionId,start:0,end:events.length,total:events.length,usersBefore:0,mode:'replace',events,controls:[]}});
const meta=sessionId=>({type:'meta',meta:{sessionId,startedAt:new Date().toISOString(),turns:1,busy:false,queued:[],usage:null,canLoad:true,canList:true}});
class Socket {
 static OPEN=1;static CLOSED=3;readyState=0;bufferedAmount=0;
 constructor(){window.socket=this;setTimeout(()=>{this.readyState=1;this.onopen?.();this.emit({type:'ready',cwd:'/workspace',connectionProbe:true,sessionHistoryPreviews:true});this.emit(history('current',current));this.emit(meta('current'))},10)}
 emit(event){this.onmessage?.({data:JSON.stringify(event)})}
 send(raw){
  const request=JSON.parse(raw);window.messages.push(request);
  if(request.type==='ping')return this.emit({type:'pong',id:request.id});
  if(request.type==='list_sessions'){
   const respond=(sessions,pending=false)=>this.emit({type:'sessions',requestId:request.requestId,query:request.query,sessions,pending});
   if(request.localOnly)return setTimeout(()=>respond(recent),0);
   if(!request.query){window.finishRecent=()=>respond([...recent,{sessionId:'provider',title:'Provider-only conversation'}]);return setTimeout(()=>respond(recent,true),0)}
   window.finishSearch=()=>respond([{sessionId:'search-local',title:'Local '+request.query+' match',snippet:'Saved matching text'},{sessionId:'search-provider',title:'Provider '+request.query+' match'}]);
   return setTimeout(()=>respond([{sessionId:'search-local',title:'Local '+request.query+' match',snippet:'Saved matching text'}],true),0);
  }
  if(request.type==='preview_session'){
   window.previewInFlight++;window.maxPreviewInFlight=Math.max(window.maxPreviewInFlight,window.previewInFlight);
   window.previewReleases[request.sessionId]=()=>{delete window.previewReleases[request.sessionId];window.previewInFlight--;this.emit({type:'session_preview',requestId:request.requestId,preview:{sessionId:request.sessionId,start:100,events:saved(request.sessionId)}})};return;
  }
  if(request.type==='load_session')window.finishLoad=()=>{this.emit(history(request.sessionId,[message('user','Fresh '+request.sessionId+' question'),message('agent','Fresh '+request.sessionId+' answer')]));this.emit(meta(request.sessionId))};
 }
 close(){this.readyState=3;this.onclose?.()}
}
window.WebSocket=Socket;
createRoot(document.getElementById('root')).render(<I18nProvider><div style={{height:'100vh',display:'flex'}}><AgentPanel cacheAccount="alice" project="test" workspacePath="/workspace" tree={[]} focusedFilePath={null} onOpenFile={()=>{}} onClose={()=>{}} /></div></I18nProvider>);`
  const bundle = await build({ input: 'virtual:fast-history.tsx', write: false, platform: 'browser', onwarn(warning, warn) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning) }, output: { format: 'iife' }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } }, plugins: [{
    name: 'fast-history-fixture',
    async resolveId(id, importer) {
      if (id === 'virtual:fast-history.tsx') return id
      if (id === '@mew/tmux-term') return 'virtual:terminal'
      if (id.endsWith('.css')) return 'virtual:style'
      if (id.endsWith('?raw')) { const resolved = await this.resolve(id.slice(0, -4), importer, { skipSelf: true }); if (resolved) return `${resolved.id}?raw` }
    },
    async load(id) {
      if (id === 'virtual:fast-history.tsx') return source
      if (id === 'virtual:terminal') return 'export const isHiddenTmuxSession=()=>false;export function TmuxTerminal(){return null}'
      if (id === 'virtual:style') return ''
      if (id.endsWith('?raw')) return `export default ${JSON.stringify(await fs.readFile(id.slice(0, -4), 'utf8'))}`
    },
  }] })
  const chunk = bundle.output.find(item => item.type === 'chunk')!
  const compiler = await compile(await fs.readFile(`${root}/src/index.css`, 'utf8'), { base: `${root}/src`, onDependency() {} })
  const content = await fs.readFile(`${root}/src/components/AgentPanel.tsx`, 'utf8')
  const css = compiler.build([...new Set((source + content).match(/[A-Za-z0-9_@!:/.[\]()%,-]+/g))])
  const browser = await connectTestBrowser()
  t.after(() => browser.close())
  for (const width of [1100, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } })
    page.setDefaultTimeout(6000)
    const errors: string[] = [], savedPointers: string[] = []
    let tabState = { tabs: [{ id: 'history', label: 'History', renamed: true, runtime: 'codex', cwd: '/workspace', sessionIds: { [JSON.stringify(['codex', '/workspace'])]: 'current' } }], activeId: 'history' }
    page.on('pageerror', error => errors.push(error.message))
    await page.route('http://mew-fast-history.test/**', async route => {
      const request = route.request(), pathname = new URL(request.url()).pathname
      if (pathname === '/app.js') return route.fulfill({ contentType: 'text/javascript', body: chunk.code })
      if (pathname === '/api/user-ui/agent-tabs') {
        if (request.method() === 'PUT') {
          tabState = request.postDataJSON()
          for (const tab of tabState.tabs) savedPointers.push(...Object.values(tab.sessionIds ?? {}))
        }
        return route.fulfill({ json: { state: tabState, claims: [] } })
      }
      if (pathname === '/api/user-ui/agent-tabs/history') return route.fulfill({ json: { preview: null } })
      if (pathname === '/api/agent-cwd') return route.fulfill({ json: { cwd: '/workspace' } })
      if (pathname === '/api/projects') return route.fulfill({ json: [] })
      if (pathname.startsWith('/api/')) return route.fulfill({ json: { settings: null, skills: [], jobs: [], commands: [], runtimes: [] } })
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html class="${width === 390 ? 'dark' : ''}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}html,body,#root{height:100%;margin:0}</style><div id="root"></div><script src="/app.js"></script></html>` })
    })
    await page.goto('http://mew-fast-history.test/')
    await page.getByText('Current question', { exact: true }).waitFor()
    const history = page.getByRole('button', { name: '히스토리', exact: true })
    const region = page.getByRole('region', { name: '지난 세션', exact: true })
    const search = region.getByLabel('대화 검색', { exact: true })
    const composer = page.locator('[data-keep-keyboard] [contenteditable="true"]')
    const send = page.getByRole('button', { name: '전송', exact: true })
    await composer.fill('Draft survives saved-history selection')
    await page.waitForFunction('window.messages.some(request=>request.type==="list_sessions"&&request.localOnly===true&&request.query==="")')
    await page.waitForFunction('window.messages.filter(request=>request.type==="preview_session").length===2')
    assert.equal(await page.evaluate('window.previewInFlight'), 2, 'saved transcript warming has only two concurrent reads')
    assert.equal(await page.evaluate('window.messages.some(request=>request.type==="load_session")'), false, 'warming never restores historical ACP sessions')
    assert.equal(await region.count(), 0, 'saved history is prepared before its first opening')
    await page.evaluate('window.previewReleases.first()')
    await page.waitForFunction('!!window.previewReleases.third')
    await page.evaluate('window.previewReleases.second();window.previewReleases.third()')
    assert.equal(await page.evaluate('window.maxPreviewInFlight'), 2)
    await history.click()
    await region.getByRole('button', { name: 'Recent first conversation' }).waitFor()
    await page.waitForFunction('typeof window.finishRecent==="function"')
    assert.equal(await region.getByText('Provider-only conversation', { exact: true }).count(), 0)
    assert.equal(await region.getByRole('button', { name: 'Recent first conversation' }).isVisible(), true, 'fresh provider listing does not hide the warmed list')
    const selected = region.getByRole('button', { name: 'Recent first conversation' })
    await selected.waitFor()
    await page.waitForFunction("Array.from(document.querySelectorAll('button')).some(button=>button.textContent.includes('Recent first conversation')&&!button.disabled)")
    await selected.click()
    await page.getByText('Saved first question', { exact: true }).waitFor()
    await page.waitForFunction('typeof window.finishLoad==="function"')
    assert.equal(await page.locator('[data-agent-history-preview]').count(), 1)
    assert.equal(await page.locator('[data-agent-loading]').count(), 0, 'preloaded text replaces the restoration cover immediately')
    assert.equal(await page.locator('[data-agent-conversation]').getAttribute('aria-busy'), 'true')
    assert.equal(savedPointers.includes('first'), false, 'a saved preview cannot adopt the historical session pointer')
    assert.equal(await send.isDisabled(), true)
    const promptsBefore = await page.evaluate('window.messages.filter(request=>request.type==="prompt").length')
    await composer.press('Control+Enter')
    assert.equal(await page.evaluate('window.messages.filter(request=>request.type==="prompt").length'), promptsBefore)
    assert.equal(await composer.innerText(), 'Draft survives saved-history selection')
    const adopted = page.waitForRequest(request => request.url().includes('/api/user-ui/agent-tabs') && request.method() === 'PUT'
      && request.postDataJSON().tabs.some((tab: { sessionIds: Record<string, string> }) => Object.values(tab.sessionIds).includes('first')))
    await page.evaluate('window.finishLoad()')
    await adopted
    await page.getByText('Fresh first answer', { exact: true }).waitFor()
    assert.equal(await page.getByText('Saved first question', { exact: true }).count(), 0)
    assert.equal(await page.locator('[data-agent-history-preview]').count(), 0)
    assert.equal(await page.locator('[data-agent-conversation]').getAttribute('aria-busy'), 'false')
    assert.equal(await send.isEnabled(), true)
    assert.equal(await composer.innerText(), 'Draft survives saved-history selection')
    await history.click()
    await search.fill('needle')
    await search.press('Enter')
    await region.getByRole('button', { name: 'Local needle match' }).waitFor()
    assert.equal(await region.getByText('Saved matching text', { exact: true }).isVisible(), true)
    assert.equal(await region.getByRole('button', { name: 'Provider needle match' }).count(), 0, 'local matches appear while provider search is held')
    assert.equal(await page.getByText('Fresh first answer', { exact: true }).isVisible(), true)
    assert.equal(await page.evaluate('window.messages.filter(request=>request.type==="load_session").length'), 1, 'searching does not restore another ACP session')
    await page.evaluate('window.finishSearch()')
    await region.getByRole('button', { name: 'Provider needle match' }).waitFor()
    const secondReads = await page.evaluate('window.messages.filter(request=>request.type==="preview_session"&&request.sessionId==="second").length')
    assert.equal(secondReads, 1, 'the second recent conversation was warmed once before searching')
    await search.fill('')
    await search.press('Enter')
    const second = region.getByRole('button', { name: 'Recent second conversation' })
    await second.waitFor()
    assert.equal(await region.getByText('Provider-only conversation', { exact: true }).count(), 0, 'returning to recent conversations does not wait for provider completion')
    await second.click()
    await page.getByText('Saved second question', { exact: true }).waitFor()
    assert.equal(await page.evaluate('window.messages.filter(request=>request.type==="preview_session"&&request.sessionId==="second").length'), secondReads,
      'query changes retain the completed preview instead of fetching the selected conversation again')
    assert.equal(savedPointers.includes('second'), false)
    assert.equal(await send.isDisabled(), true)
    assert.equal(await composer.innerText(), 'Draft survives saved-history selection')
    const secondAdopted = page.waitForRequest(request => request.url().includes('/api/user-ui/agent-tabs') && request.method() === 'PUT'
      && request.postDataJSON().tabs.some((tab: { sessionIds: Record<string, string> }) => Object.values(tab.sessionIds).includes('second')))
    await page.evaluate('window.finishLoad()')
    await secondAdopted
    await page.getByText('Fresh second answer', { exact: true }).waitFor()
    assert.equal(await page.getByText('Saved second question', { exact: true }).count(), 0)
    assert.equal(await page.locator('[data-agent-history-preview]').count(), 0)
    assert.equal(await send.isEnabled(), true)
    assert.equal(await composer.innerText(), 'Draft survives saved-history selection')
    assert.deepEqual(errors, [])
    t.diagnostic(`${width}px: warmed first opening, partial local search, bounded preview reads, read-only selection, and preview reuse after query changes verified`)
    await page.close()
  }
})
