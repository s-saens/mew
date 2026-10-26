import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { chromium } from 'playwright-core'
import { domBrowserExecutable } from './browser-dom-executable.ts'

const root = path.resolve(import.meta.dirname, '..')
test('saved history is readable while ACP restores, without adopting its pointer or sending actions', { skip: !domBrowserExecutable(), timeout: 40_000 }, async t => {
  const source = `import React from '${root}/node_modules/react/index.js';
import {createRoot} from '${root}/node_modules/react-dom/client.js';
import {AgentPanel} from '${root}/src/components/AgentPanel.tsx';
import {I18nProvider} from '${root}/src/i18n.tsx';
localStorage.setItem('mew:locale','ko');window.messages=[];
Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.copied=text}}});
const message=(role,text)=>({type:'update',update:{sessionUpdate:role+'_message_chunk',content:{type:'text',text}}});
const current=[message('user','Current question'),message('agent','Current answer')];
const saved=[message('user','Selected question'),{type:'turn_start'},message('agent','Saved selected answer'),{type:'permission',id:'saved-approval',toolCall:{title:'Saved approval'},options:[{optionId:'allow',name:'Allow saved approval',kind:'allow_once'}]}];
const fresh=[message('user','Selected question'),message('agent','Fresh selected answer')];
const page=(id,events)=>({generation:'live-'+id,sessionId:id,start:0,end:events.length,total:events.length,usersBefore:0,mode:'replace',events,controls:[]});
const meta=id=>({type:'meta',meta:{sessionId:id,startedAt:new Date().toISOString(),turns:1,busy:false,queued:[],usage:null,canLoad:true,canList:true}});
class Socket {
 static OPEN=1;readyState=0;
 constructor(url){window.socket=this;setTimeout(()=>{this.readyState=1;this.onopen?.();window.finishInitial=()=>{this.emit({type:'history',page:page('current',current)});this.emit(meta('current'))};if(location.search.includes('startup'))this.emit({type:'history_preview',preview:{sessionId:'current',start:100,events:saved}});else window.finishInitial()},10)}
 emit(event){this.onmessage?.({data:JSON.stringify(event)})}
 send(raw){const request=JSON.parse(raw);window.messages.push(request);if(request.type==='list_sessions'){window.finishSessionList=()=>this.emit({type:'sessions',sessions:[{sessionId:'available',title:'Available conversation'},{sessionId:'taken',title:'Occupied conversation'}]});if(!window.holdSessionList)window.finishSessionList()}if(request.type==='load_session'){window.selectedAt=performance.now();setTimeout(()=>this.emit({type:'history_preview',preview:{sessionId:request.sessionId,start:100,events:saved}}),10);window.finish=error=>{clearTimeout(this.timer);if(error)this.emit({type:'error',message:error});else{this.emit({type:'history',page:page(request.sessionId,fresh)});this.emit(meta(request.sessionId))}};this.timer=setTimeout(()=>window.finish(),3000)}}
 close(){clearTimeout(this.timer);this.readyState=3;this.onclose?.()}
}
window.WebSocket=Socket;
createRoot(document.getElementById('root')).render(<I18nProvider><div style={{height:'100vh',display:'flex'}}><AgentPanel cacheAccount="alice" project="test" workspacePath="/workspace" tree={[]} focusedFilePath={null} onOpenFile={()=>{}} onClose={()=>{}} /></div></I18nProvider>);`
  const bundle = await build({ input: 'virtual:preview.tsx', write: false, platform: 'browser', output: { format: 'iife' }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } }, plugins: [{
    name: 'history-preview-fixture',
    async resolveId(id, importer) {
      if (id === 'virtual:preview.tsx') return id
      if (id === '@mew/tmux-term') return 'virtual:terminal'
      if (id.endsWith('.css')) return 'virtual:style'
      if (id.endsWith('?raw')) { const resolved = await this.resolve(id.slice(0, -4), importer, { skipSelf: true }); if (resolved) return `${resolved.id}?raw` }
    },
    async load(id) {
      if (id === 'virtual:preview.tsx') return source
      if (id === 'virtual:terminal') return 'export const isHiddenTmuxSession=()=>false;export function TmuxTerminal(){return null}'
      if (id === 'virtual:style') return ''
      if (id.endsWith('?raw')) return `export default ${JSON.stringify(await fs.readFile(id.slice(0, -4), 'utf8'))}`
    },
  }] })
  const chunk = bundle.output.find(item => item.type === 'chunk')!
  const compiler = await compile(await fs.readFile(`${root}/src/index.css`, 'utf8'), { base: `${root}/src`, onDependency() {} })
  const content = await fs.readFile(`${root}/src/components/AgentPanel.tsx`, 'utf8')
  const css = compiler.build([...new Set((source + content).match(/[A-Za-z0-9_@!:/.[\]()%,-]+/g))])
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  try {
    for (const width of [1100, 390]) for (const dark of [false, true]) {
      const page = await browser.newPage({ viewport: { width, height: 844 } })
      page.setDefaultTimeout(6000)
      const errors: string[] = [], savedPointers: string[] = []
      let holdClaims = false, claimReads = 0, releaseClaims: (() => void) | undefined
      page.on('pageerror', error => errors.push(error.message))
      await page.route('http://mew-history-preview.test/**', async route => {
        const request = route.request(), pathname = new URL(request.url()).pathname
        if (pathname === '/app.js') return route.fulfill({ contentType: 'text/javascript', body: chunk.code })
        if (pathname === '/api/user-ui/agent-tabs') {
          if (request.method() === 'GET') claimReads++
          if (request.method() === 'PUT') {
            const state = request.postDataJSON()
            for (const tab of state?.tabs ?? []) savedPointers.push(...Object.values<string>(tab.sessionIds ?? {}))
          }
          if (request.method() === 'GET' && holdClaims) await new Promise<void>(resolve => { releaseClaims = resolve })
          return route.fulfill({ json: { state: { tabs: [{ id: 'history', label: 'History', renamed: true, runtime: 'codex', cwd: '/workspace', sessionIds: { [JSON.stringify(['codex', '/workspace'])]: 'current' } }], activeId: 'history' }, claims: claimReads > 1 ? [{ workspacePath: '/other-workspace', tabId: 'occupied', sessionId: 'taken' }] : [] } })
        }
        if (pathname === '/api/agent-cwd') return route.fulfill({ json: { cwd: '/workspace' } })
        if (pathname === '/api/projects') return route.fulfill({ json: [] })
        if (pathname.startsWith('/api/')) return route.fulfill({ json: { settings: null, skills: [], jobs: [], commands: [], runtimes: [] } })
        return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html class="${dark ? 'dark' : ''}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}html,body,#root{height:100%;margin:0}</style><div id="root"></div><script src="/app.js"></script></html>` })
      })
      await page.goto('http://mew-history-preview.test/')
      await page.getByText('Current question', { exact: true }).waitFor()
      const composer = page.locator('[data-keep-keyboard] [contenteditable="true"]')
      await composer.fill('Draft during restoration')
      const history = page.getByRole('button', { name: '히스토리', exact: true })
      const historyRegion = page.getByRole('region', { name: '지난 세션', exact: true })
      const availableSession = historyRegion.getByRole('button', { name: 'Available conversation' })
      const occupiedSession = historyRegion.getByRole('button', { name: 'Occupied conversation' })
      const sessionInput = historyRegion.getByLabel('세션 ID', { exact: true })
      const openSession = historyRegion.getByRole('button', { name: '열기', exact: true })
      const refreshCurrent = historyRegion.getByRole('button', { name: '현재 대화 새로고침', exact: true })
      holdClaims = true
      await page.evaluate('window.holdSessionList=true')
      const claimsRequest = page.waitForRequest(request => request.url().includes('/api/user-ui/agent-tabs') && request.method() === 'GET')
      await history.click()
      await claimsRequest
      await page.waitForFunction('window.messages.some(request=>request.type==="list_sessions")')
      assert.equal(await historyRegion.getByRole('status', { name: '불러오는 중…', exact: true }).count(), 1, 'the first opening waits for its first session list')
      await page.evaluate('window.finishSessionList()')
      await availableSession.waitFor({ state: 'visible' })
      assert.equal(await sessionInput.isDisabled(), true, 'direct session IDs wait for current claims')
      assert.equal(await openSession.isDisabled(), true)
      assert.equal(await refreshCurrent.isDisabled(), true, 'refresh waits for current claims')
      assert.equal(await availableSession.isDisabled(), true, 'the list appears before claims finish, but cannot be selected')
      assert.equal(await occupiedSession.isDisabled(), true)
      const heldClaimReads = claimReads
      await history.click()
      await history.click()
      await page.waitForFunction('window.messages.filter(request=>request.type==="list_sessions").length===2')
      assert.equal(await availableSession.isVisible(), true, 'reopening during claims loading keeps the cached list')
      assert.equal(await sessionInput.isDisabled(), true)
      assert.equal(await refreshCurrent.isDisabled(), true)
      assert.equal(await availableSession.isDisabled(), true, 'reopening keeps selection locked until the shared claims request finishes')
      assert.equal(claimReads, heldClaimReads, 'reopening shares the pending claims request instead of sending another GET')
      holdClaims = false
      assert.ok(releaseClaims, 'the claims request remains pending while the session list arrives')
      releaseClaims()
      await sessionInput.fill('available')
      assert.equal(await availableSession.isEnabled(), true)
      assert.equal(await occupiedSession.isDisabled(), true, 'another workspace retains its session claim')
      assert.equal(await refreshCurrent.isEnabled(), true)
      assert.equal(await openSession.isEnabled(), true)
      await sessionInput.fill('taken')
      assert.equal(await openSession.isDisabled(), true, 'direct IDs also respect refreshed claims')
      await history.click()
      await history.click()
      await page.waitForFunction('window.messages.filter(request=>request.type==="list_sessions").length===3')
      assert.equal(await availableSession.isVisible(), true, 'reopening keeps the cached list while the next ACP list is delayed')
      assert.equal(await historyRegion.getByRole('status', { name: '불러오는 중…', exact: true }).count(), 0)
      await history.click()
      await page.evaluate('window.holdSessionList=false')
      const pick = async (id: string) => {
        await page.getByRole('button', { name: '히스토리', exact: true }).click()
        const panel = await page.locator('[data-agent-session]:visible').boundingBox()
        const dropdown = await page.getByRole('region', { name: '지난 세션', exact: true }).boundingBox()
        assert.ok(panel && dropdown)
        assert.ok(Math.abs(dropdown.width - panel.width * 0.8) < 2, 'history width follows the panel')
        assert.ok(Math.abs(dropdown.height - panel.height * 0.5) < 2, 'history height follows the panel')
        assert.ok(dropdown.x >= panel.x && dropdown.x + dropdown.width <= panel.x + panel.width, 'history stays within the panel')
        await page.getByLabel('세션 ID', { exact: true }).fill(id)
        await page.getByRole('button', { name: '열기', exact: true }).click()
      }
      await pick('selected')
      await page.getByText('Selected question', { exact: true }).waitFor({ state: 'visible' })
      const latency = await page.evaluate('performance.now()-window.selectedAt') as number
      t.diagnostic(`${width}px ${dark ? 'dark' : 'light'} first saved content: ${Math.round(latency)}ms (ACP delay 3000ms)`)
      assert.ok(latency < 1500, 'the saved conversation appears before ACP completes')
      await page.evaluate('clearTimeout(window.socket.timer)')
      assert.equal(await page.locator('[data-agent-loading]').count(), 0)
      assert.equal(await page.locator('[data-agent-conversation]').getAttribute('aria-busy'), 'true')
      assert.equal(savedPointers.includes('selected'), false, 'preview never updates the saved ACP pointer')
      const send = page.getByRole('button', { name: '전송', exact: true })
      assert.equal(await send.isDisabled(), true)
      const requestsBefore = await page.evaluate('window.messages.length')
      await composer.press('Control+Enter')
      assert.equal(await page.evaluate('window.messages.length'), requestsBefore)
      assert.equal(await composer.innerText(), 'Draft during restoration')
      await page.evaluate("window.socket.emit({type:'history',page:{generation:'live-current',sessionId:'current',start:0,end:0,total:2,usersBefore:0,mode:'prepend',events:[],controls:[]}})")
      assert.equal(await page.locator('[data-agent-history-preview]').count(), 1, 'an old in-flight page cannot finish the selected restoration')
      await page.evaluate("window.socket.emit({type:'history',page:{generation:'live-selected',sessionId:'selected',start:0,end:3,total:3,usersBefore:0,mode:'replace',events:[],controls:[]}})")
      assert.equal(await send.isDisabled(), true, 'a missing final range keeps preview read-only while retrying')
      assert.equal(await page.locator('[data-agent-history-preview]').count(), 1)
      const header = page.locator('[data-agent-turn-header]').filter({ hasText: 'Saved selected answer' })
      await header.locator('button[aria-expanded]').press('Enter')
      assert.equal(await page.getByRole('button', { name: 'Allow saved approval', exact: true }).isDisabled(), true)
      await header.getByRole('button', { name: '이 답변 복사', exact: true }).click()
      assert.equal(await page.evaluate('window.copied'), 'Saved selected answer')
      await page.screenshot({ path: `/tmp/mew-history-preview-${width}-${dark ? 'dark' : 'light'}.png` })
      const adopted = page.waitForRequest(request => request.url().includes('/api/user-ui/agent-tabs') && request.method() === 'PUT'
        && request.postDataJSON().tabs.some((tab: { sessionIds: Record<string, string> }) => Object.values(tab.sessionIds).includes('selected')))
      await page.evaluate('window.finish()')
      await adopted
      await page.getByText('Fresh selected answer', { exact: true }).waitFor({ state: 'visible' })
      assert.equal(await send.isEnabled(), true)
      assert.equal(await page.locator('[data-agent-conversation]').getAttribute('aria-busy'), 'false')
      await page.evaluate("window.socket.emit({type:'history_preview',preview:{sessionId:'selected',start:0,events:[{type:'update',update:{sessionUpdate:'user_message_chunk',content:{type:'text',text:'Late stale preview'}}}]}})")
      assert.equal(await page.getByText('Late stale preview', { exact: true }).count(), 0)
      await pick('failed')
      await page.locator('[data-agent-history-preview] [data-agent-turn-header]').filter({ hasText: 'Saved selected answer' }).waitFor()
      await page.evaluate("window.finish('History restoration failed')")
      await page.getByText('Fresh selected answer', { exact: true }).waitFor({ state: 'visible' })
      assert.equal(await send.isEnabled(), true)
      assert.equal(savedPointers.includes('failed'), false, 'failed preview does not become a session pointer')
      assert.equal(await composer.innerText(), 'Draft during restoration')
      assert.deepEqual(errors, [])
      await page.goto('http://mew-history-preview.test/?startup')
      await page.getByText('Selected question', { exact: true }).waitFor({ state: 'visible' })
      assert.equal(await page.locator('[data-agent-history-preview]').count(), 1, 'saved server records also appear during automatic restoration')
      assert.equal(await send.isDisabled(), true, 'automatic restore preview cannot send into an unconfirmed session')
      await composer.press('Control+Enter')
      assert.equal(await page.evaluate('window.messages.length'), 0)
      await page.evaluate('window.finishInitial()')
      await page.getByText('Current question', { exact: true }).waitFor({ state: 'visible' })
      assert.equal(await page.locator('[data-agent-history-preview]').count(), 0)
      assert.equal(await send.isEnabled(), true)
      assert.deepEqual(errors, [])
      await page.close()
    }
  } finally { await browser.close() }
})
