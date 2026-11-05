import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { connectTestBrowser } from './test-browser.ts'

const root = path.resolve(import.meta.dirname, '..')

test('restored tabs prefetch saved text without starting ACP, and replace read-only previews after synchronization', { timeout: 40_000 }, async t => {
  const source = `import React from '${root}/node_modules/react/index.js';
import {createRoot} from '${root}/node_modules/react-dom/client.js';
import {AgentPanel} from '${root}/src/components/AgentPanel.tsx';
import {I18nProvider} from '${root}/src/i18n.tsx';
localStorage.setItem('mew:locale','ko');window.messages=[];window.sockets={};window.socketAttempts={};
const message=(role,text)=>({type:'update',update:{sessionUpdate:role+'_message_chunk',content:{type:'text',text}}});
class Socket {
 static OPEN=1;static CLOSED=3;readyState=0;
 constructor(url){this.tab=new URL(url).searchParams.get('tab');window.socketAttempts[this.tab]=(window.socketAttempts[this.tab]??0)+1;window.sockets[this.tab]=this;setTimeout(()=>{this.readyState=1;this.onopen?.()},10)}
 emit(event){this.onmessage?.({data:JSON.stringify(event)})}
 finish(){const sessionId=this.tab+'-session',events=[message('user','Authoritative '+this.tab+' question'),message('agent','Authoritative '+this.tab+' answer')];this.emit({type:'history',page:{generation:'live-'+this.tab,sessionId,start:0,end:events.length,total:events.length,usersBefore:0,mode:'replace',events,controls:[]}});this.emit({type:'meta',meta:{sessionId,startedAt:new Date().toISOString(),turns:1,busy:false,queued:[],usage:null,canLoad:true,canList:true}})}
 send(raw){window.messages.push({tab:this.tab,...JSON.parse(raw)})}
 close(){this.readyState=3;this.onclose?.()}
}
window.WebSocket=Socket;
createRoot(document.getElementById('root')).render(<I18nProvider><div style={{height:'100vh',display:'flex'}}><AgentPanel cacheAccount="alice" project="test" workspacePath="/workspace" tree={[]} focusedFilePath={null} onOpenFile={()=>{}} onClose={()=>{}} /></div></I18nProvider>);`
  const bundle = await build({ input: 'virtual:tab-preview.tsx', write: false, platform: 'browser', onwarn(warning, warn) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning) }, output: { format: 'iife' }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } }, plugins: [{
    name: 'tab-preview-fixture',
    async resolveId(id, importer) {
      if (id === 'virtual:tab-preview.tsx') return id
      if (id === '@mew/tmux-term') return 'virtual:terminal'
      if (id.endsWith('.css')) return 'virtual:style'
      if (id.endsWith('?raw')) { const resolved = await this.resolve(id.slice(0, -4), importer, { skipSelf: true }); if (resolved) return `${resolved.id}?raw` }
    },
    async load(id) {
      if (id === 'virtual:tab-preview.tsx') return source
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
    const errors: string[] = [], requests: string[] = []
    const releases = new Map<string, () => void>()
    let resolveFirstReads!: () => void, resolveThirdRead!: () => void
    const firstReads = new Promise<void>(resolve => { resolveFirstReads = resolve })
    const thirdRead = new Promise<void>(resolve => { resolveThirdRead = resolve })
    let inFlight = 0, maxInFlight = 0
    page.on('pageerror', error => errors.push(error.message))
    const tabs = ['first', 'second', 'third'].map(id => ({ id, label: id, renamed: true, runtime: 'codex', cwd: '/workspace', sessionIds: { [JSON.stringify(['codex', '/workspace'])]: `${id}-session` } }))
    let tabState = { tabs: [...tabs, { id: 'terminal', label: 'terminal', runtime: 'tmux', cwd: '/workspace' }], activeId: 'first' }
    await page.route('http://mew-tab-preview.test/**', async route => {
      const request = route.request(), url = new URL(request.url())
      if (url.pathname === '/app.js') return route.fulfill({ contentType: 'text/javascript', body: chunk.code })
      if (url.pathname === '/api/user-ui/agent-tabs') {
        if (request.method() === 'PUT') tabState = request.postDataJSON()
        return route.fulfill({ json: { state: tabState, claims: [] } })
      }
      if (url.pathname === '/api/user-ui/agent-tabs/history') {
        assert.equal(url.searchParams.get('workspace'), '/workspace')
        const tab = url.searchParams.get('tab')!
        requests.push(tab)
        if (requests.length === 2) resolveFirstReads()
        if (tab === 'third') resolveThirdRead()
        inFlight++
        maxInFlight = Math.max(maxInFlight, inFlight)
        await new Promise<void>(resolve => { releases.set(tab, resolve) })
        inFlight--
        return route.fulfill({ json: { preview: { sessionId: `${tab}-session`, start: 100, events: [
          { type: 'update', update: { sessionUpdate: 'user_message_chunk', content: { type: 'text', text: `Saved ${tab} question` } } },
          { type: 'turn_start' },
          { type: 'update', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: `Saved ${tab} answer` } } },
          { type: 'permission', id: `saved-${tab}-approval`, toolCall: { title: 'Saved approval' }, options: [{ optionId: 'allow', name: 'Allow saved approval', kind: 'allow_once' }] },
        ] } } })
      }
      if (url.pathname === '/api/agent-cwd') return route.fulfill({ json: { cwd: '/workspace' } })
      if (url.pathname === '/api/projects') return route.fulfill({ json: [] })
      if (url.pathname.startsWith('/api/')) return route.fulfill({ json: { settings: null, skills: [], jobs: [], commands: [], runtimes: [] } })
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html class="${width === 390 ? 'dark' : ''}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}html,body,#root{height:100%;margin:0}</style><div id="root"></div><script src="/app.js"></script></html>` })
    })
    await page.goto('http://mew-tab-preview.test/')
    await page.waitForFunction('!!window.sockets.first')
    await firstReads
    assert.equal(requests.length, 2, 'prefetch starts at most two concurrent saved transcript reads')
    assert.equal(inFlight, 2)
    assert.deepEqual(await page.evaluate('Object.keys(window.sockets)'), ['first'], 'unopened tabs do not initialize ACP just to prefetch text')
    // Finish ACP before its HTTP read to verify a late saved preview cannot replace synchronized text.
    await page.evaluate('window.sockets.first.finish()')
    await page.getByText('Authoritative first question', { exact: true }).waitFor()
    releases.get('first')!()
    await thirdRead
    const secondResponse = page.waitForResponse(response => response.url().includes('/api/user-ui/agent-tabs/history') && new URL(response.url()).searchParams.get('tab') === 'second')
    releases.get('second')!()
    await secondResponse
    assert.equal(await page.getByText('Saved first question', { exact: true }).count(), 0)
    assert.deepEqual(await page.evaluate('Object.keys(window.sockets)'), ['first'])
    const tabBar = page.locator('[data-agent-tab-bar]:visible')
    await tabBar.getByRole('tab').filter({ hasText: 'second' }).click()
    const session = page.locator('[data-agent-session]:visible')
    await session.getByText('Saved second question', { exact: true }).waitFor()
    await page.waitForFunction('!!window.sockets.second && window.sockets.second.readyState===1')
    assert.deepEqual(await page.evaluate('Object.keys(window.sockets)'), ['first', 'second'])
    assert.equal(await session.locator('[data-agent-history-preview]').count(), 1)
    assert.equal(await session.locator('[data-agent-loading]').count(), 0, 'saved text replaces the initial loading cover while ACP waits')
    assert.equal(await session.locator('[data-agent-conversation]').getAttribute('aria-busy'), 'true')
    const composer = session.locator('[data-keep-keyboard] [contenteditable="true"]')
    const send = session.getByRole('button', { name: '전송', exact: true })
    await composer.fill('Draft while second ACP restores')
    assert.equal(await send.isDisabled(), true)
    const before = await page.evaluate('window.messages.length')
    await composer.press('Control+Enter')
    await session.locator('[data-agent-turn-header]').filter({ hasText: 'Saved second answer' }).locator('button[aria-expanded]').press('Enter')
    assert.equal(await session.getByRole('button', { name: 'Allow saved approval', exact: true }).isDisabled(), true)
    await session.locator('[data-agent-conversation]').evaluate(element => { element.scrollTop = 0; element.dispatchEvent(new Event('scroll')) })
    assert.equal(await page.evaluate('window.messages.length'), before, 'saved previews cannot send prompts, approvals, or provider history RPCs')
    assert.equal(await page.evaluate('window.messages.some(request=>["history","load_session","list_sessions"].includes(request.type))'), false)
    await page.evaluate('window.sockets.second.finish()')
    await session.getByText('Authoritative second answer', { exact: true }).waitFor()
    assert.equal(await session.getByText('Saved second question', { exact: true }).count(), 0)
    assert.equal(await session.locator('[data-agent-history-preview]').count(), 0)
    assert.equal(await session.locator('[data-agent-conversation]').getAttribute('aria-busy'), 'false')
    assert.equal(await composer.innerText(), 'Draft while second ACP restores')
    assert.equal(await send.isEnabled(), true)
    await tabBar.getByRole('tab').filter({ hasText: 'first' }).click()
    await page.getByText('Authoritative first question', { exact: true }).waitFor({ state: 'visible' })
    await tabBar.getByRole('tab').filter({ hasText: 'second' }).click()
    await session.getByText('Authoritative second answer', { exact: true }).waitFor({ state: 'visible' })
    assert.deepEqual(await page.evaluate('window.socketAttempts'), { first: 1, second: 1 }, 'revisiting synchronized tabs keeps their existing connections')
    assert.equal(await composer.innerText(), 'Draft while second ACP restores')
    await tabBar.getByRole('tab').filter({ hasText: 'third' }).click()
    await page.waitForFunction('!!window.sockets.third && window.sockets.third.readyState===1')
    await page.evaluate('window.sockets.third.finish()')
    await page.getByText('Authoritative third question', { exact: true }).waitFor()
    const thirdResponse = page.waitForResponse(response => response.url().includes('/api/user-ui/agent-tabs/history') && new URL(response.url()).searchParams.get('tab') === 'third')
    releases.get('third')!()
    await thirdResponse
    await page.waitForTimeout(50)
    assert.equal(await page.getByText('Saved third question', { exact: true }).count(), 0, 'late HTTP reads cannot resurrect previews after ACP synchronization')
    assert.equal(await page.getByText('Authoritative third question', { exact: true }).isVisible(), true)
    assert.equal(maxInFlight, 2)
    assert.deepEqual([...requests].sort(), ['first', 'second', 'third'], 'terminal tabs do not request saved agent transcripts')
    assert.deepEqual(errors, [])
    t.diagnostic(`${width}px: unopened transcript prefetch, read-only first visit, and authoritative replacement verified`)
    await page.close()
  }
})
