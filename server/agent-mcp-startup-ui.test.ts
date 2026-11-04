import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { connectTestBrowser } from './test-browser.ts'

const root = path.resolve(import.meta.dirname, '..')

test('MCP startup diagnostics stay out of live and restored assistant turns on desktop/mobile', { timeout: 40_000 }, async () => {
  const source = `import React from '${root}/node_modules/react/index.js';
import {createRoot} from '${root}/node_modules/react-dom/client.js';
import {AgentPanel} from '${root}/src/components/AgentPanel.tsx';
import {I18nProvider} from '${root}/src/i18n.tsx';
import {HistoryIndex} from '${root}/shared/agent-history.ts';
import {readHistoryCache,historyCacheKey} from '${root}/src/utils/agent-history-cache.ts';
localStorage.setItem('mew:locale','en');
const startupOnly=new URLSearchParams(location.search).has('startupOnly');
const sessionId=startupOnly?'startup-only':'conversation';
const key='fixture-events:'+sessionId;
const startupEvents=[
 {type:'update',update:{sessionUpdate:'tool_call',toolCallId:'mcp_startup.fixture',title:'mcp__fixture__startup',kind:'other',status:'failed',content:[{type:'content',content:{type:'text',text:'MCP startup failed'}}]}},
 {type:'update',update:{sessionUpdate:'tool_call_update',toolCallId:'mcp_startup.fixture',status:'failed'}}
];
const events=JSON.parse(sessionStorage.getItem(key)||'null')??(startupOnly?startupEvents:[
 {type:'update',update:{sessionUpdate:'user_message_chunk',content:{type:'text',text:'First task'}}},
 {type:'turn_start'},
 {type:'update',update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'Normal completed answer'}}},
 {type:'turn_end',stopReason:'end_turn',durationMs:1000}
]);
const generation=Number(sessionStorage.getItem('fixture-generation')||'0')+1;
sessionStorage.setItem('fixture-generation',String(generation));
const index=new HistoryIndex('mcp-startup-'+generation);events.forEach(event=>index.push(event));
window.fixtureEvents=events;window.fixtureStartupEvents=startupEvents;
window.fixtureCached=()=>readHistoryCache(historyCacheKey('mcp-owner','codex',sessionId,'/workspace'));
const meta={type:'meta',meta:{sessionId,startedAt:new Date().toISOString(),turns:startupOnly?0:1,busy:false,queued:[],usage:null,canLoad:true,canList:true}};
class Socket {
 static OPEN=1;readyState=0;bufferedAmount=0;
 constructor(url){window.fixtureSocket=this;setTimeout(()=>{this.readyState=1;this.onopen?.();const query=new URL(url).searchParams;this.emit({type:'history',page:index.page(events,sessionId,{generation:query.get('generation'),after:query.has('after')?Number(query.get('after')):undefined})});this.emit(meta)},10)}
 emit(event){if(['update','turn_start','turn_end'].includes(event.type)){const position={generation:index.generation,seq:events.length};events.push(event);index.push(event);sessionStorage.setItem(key,JSON.stringify(events));event={type:'history_event',event,position}}this.onmessage?.({data:JSON.stringify(event)})}
 send(raw){const message=JSON.parse(raw);if(message.type==='history')this.emit({type:'history',page:index.page(events,sessionId,message.range)})}
 close(){this.readyState=3;this.onclose?.()}
}
window.WebSocket=Socket;
createRoot(document.getElementById('root')).render(<I18nProvider><div style={{height:'100vh',display:'flex'}}><AgentPanel cacheAccount="mcp-owner" project="test" workspacePath="/workspace" tree={[]} focusedFilePath={null} onOpenFile={()=>{}} onClose={()=>{}} /></div></I18nProvider>);`
  const bundle = await build({
    input: 'virtual:mcp-startup.tsx', write: false, platform: 'browser', output: { format: 'iife' },
    onLog(level, log, handler) { if (log.code !== 'MODULE_LEVEL_DIRECTIVE') handler(level, log) },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
    plugins: [{ name: 'mcp-startup-fixture', async resolveId(id, importer) {
      if (id === 'virtual:mcp-startup.tsx') return id
      if (id === '@mew/tmux-term') return 'virtual:terminal'
      if (id.endsWith('.css')) return 'virtual:style'
      if (id.endsWith('?raw')) {
        const resolved = await this.resolve(id.slice(0, -4), importer, { skipSelf: true })
        if (resolved) return `${resolved.id}?raw`
      }
    }, async load(id) {
      if (id === 'virtual:mcp-startup.tsx') return source
      if (id === 'virtual:terminal') return 'export const isHiddenTmuxSession=()=>false;export function TmuxTerminal(){return null}'
      if (id === 'virtual:style') return ''
      if (id.endsWith('?raw')) return `export default ${JSON.stringify(await fs.readFile(id.slice(0, -4), 'utf8'))}`
    } }],
  })
  const chunk = bundle.output.find(item => item.type === 'chunk')!
  const compiler = await compile(await fs.readFile(`${root}/src/index.css`, 'utf8'), { base: `${root}/src`, onDependency() {} })
  const content = await fs.readFile(`${root}/src/components/AgentPanel.tsx`, 'utf8')
  const css = compiler.build([...new Set((source + content).match(/[A-Za-z0-9_@!:/.[\]()%,-]+/g))])
  const browser = await connectTestBrowser()
  try {
    for (const width of [1100, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 844 }, hasTouch: width === 390 })
      page.setDefaultTimeout(5000)
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('http://mew-mcp-startup.test/**', async route => {
        const pathname = new URL(route.request().url()).pathname
        if (pathname === '/app.js') return route.fulfill({ contentType: 'text/javascript', body: chunk.code })
        if (pathname === '/api/user-ui/agent-tabs') {
          const id = new URL(page.url()).searchParams.has('startupOnly') ? 'startup-only' : 'conversation'
          return route.fulfill({ json: { state: { tabs: [{ id, label: 'MCP regression', renamed: true, runtime: 'codex', cwd: '/workspace', sessionIds: { [JSON.stringify(['codex', '/workspace'])]: id } }], activeId: id }, claims: [] } })
        }
        if (pathname === '/api/agent-cwd') return route.fulfill({ json: { cwd: '/workspace' } })
        if (pathname === '/api/projects') return route.fulfill({ json: [] })
        if (pathname.startsWith('/api/')) return route.fulfill({ json: { settings: null, skills: [], jobs: [], commands: [], runtimes: [] } })
        return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html class="dark"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}html,body,#root{height:100%;margin:0}</style><div id="root"></div><script src="/app.js"></script></html>` })
      })
      try {
        await page.goto('http://mew-mcp-startup.test/')
        const headers = page.locator('[data-agent-turn-header]')
        const summaries = page.locator('[data-agent-summary]')
        await summaries.getByText('Normal completed answer', { exact: true }).waitFor()
        assert.equal(await headers.count(), 1)
        await page.evaluate(`for(const event of window.fixtureStartupEvents) window.fixtureSocket.emit(event)`)
        await page.waitForFunction('window.fixtureCached().then(value=>value?.end===6)')
        assert.equal(await headers.count(), 1, 'late startup call and update never create another turn')
        assert.equal(await summaries.getByText('Done', { exact: true }).count(), 0)
        assert.equal(await page.evaluate('window.fixtureEvents.filter(event=>event.update?.toolCallId?.startsWith("mcp_startup.")).length'), 2, 'display filtering preserves raw sequence events')

        await page.reload()
        await summaries.getByText('Normal completed answer', { exact: true }).waitFor()
        await page.waitForFunction('window.fixtureCached().then(value=>value?.end===6)')
        assert.equal(await headers.count(), 1, 'historical replay retains one real answer')
        assert.equal(await summaries.getByText('Done', { exact: true }).count(), 0)

        await page.evaluate(`for(const event of [
          {type:'update',update:{sessionUpdate:'user_message_chunk',content:{type:'text',text:'Run a real MCP tool'}}},
          {type:'turn_start'},
          {type:'update',update:{sessionUpdate:'tool_call',toolCallId:'ordinary-mcp-call',title:'mcp__fixture__search',kind:'read',status:'pending'}},
          {type:'update',update:{sessionUpdate:'tool_call_update',toolCallId:'ordinary-mcp-call',status:'completed'}},
          {type:'update',update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'Done'}}},
          {type:'turn_end',stopReason:'end_turn'}
        ]) window.fixtureSocket.emit(event)`)
        await summaries.getByText('Done', { exact: true }).waitFor()
        assert.equal(await headers.count(), 2, 'genuine assistant Done remains a normal reply')
        const realTurn = headers.last().locator('..')
        await headers.last().locator('button[aria-expanded]').click()
        await realTurn.getByRole('button', { name: 'Work details', exact: true }).click()
        await realTurn.getByText('mcp__fixture__search', { exact: true }).waitFor()
        assert.equal(await realTurn.getByText('mcp__fixture__startup', { exact: true }).count(), 0)

        await page.goto('http://mew-mcp-startup.test/?startupOnly=1')
        await page.waitForFunction('window.fixtureCached().then(value=>value?.end===2)')
        assert.equal(await headers.count(), 0, 'startup-only history produces no assistant bubble')
        assert.equal(await summaries.count(), 0)
        assert.deepEqual(errors, [])
      } finally { await page.close() }
    }
  } finally { await browser.close() }
})
