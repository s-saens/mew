import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { connectTestBrowser } from './test-browser.ts'

const root = path.resolve(import.meta.dirname, '..')

test('device transcript arriving after the connection gate remains readable without replacing synchronized history', { timeout: 30_000 }, async t => {
  const source = `import React from '${root}/node_modules/react/index.js';
import {createRoot} from '${root}/node_modules/react-dom/client.js';
import {AgentPanel} from '${root}/src/components/AgentPanel.tsx';
import {I18nProvider} from '${root}/src/i18n.tsx';
localStorage.setItem('mew:locale','ko');
window.message=(role,text)=>({type:'update',update:{sessionUpdate:role+'_message_chunk',content:{type:'text',text}}});
class Socket {
 static OPEN=1;static CLOSED=3;readyState=0;
 constructor(url){this.url=url;window.socket=this;setTimeout(()=>{this.readyState=1;this.onopen?.();this.emit({type:'ready',cwd:'/workspace',connectionProbe:true})},5)}
 emit(value){this.onmessage?.({data:JSON.stringify(value)})}
 finish(){const events=[window.message('user','Live question'),window.message('agent','Live answer')];this.emit({type:'history',page:{sessionId:'saved',generation:'live',start:0,end:2,total:2,usersBefore:0,mode:'replace',events,controls:[]}});this.emit({type:'meta',meta:{sessionId:'saved',startedAt:new Date().toISOString(),turns:1,busy:false,queued:[],usage:null,canLoad:true,canList:true}})}
 send(){}
 close(){this.readyState=3;this.onclose?.()}
}
window.WebSocket=Socket;
createRoot(document.getElementById('root')).render(<I18nProvider><AgentPanel cacheAccount="alice" project="test" workspacePath="/workspace" tree={[]} focusedFilePath={null} onOpenFile={()=>{}} onClose={()=>{}} /></I18nProvider>);`
  const bundle = await build({ input: 'virtual:late-cache.tsx', write: false, platform: 'browser', output: { format: 'iife' }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } }, onwarn(warning, warn) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning) }, plugins: [{
    name: 'late-device-cache',
    async resolveId(id, importer) {
      if (id === 'virtual:late-cache.tsx') return id
      if (id === '../utils/agent-history-cache') return 'virtual:cache'
      if (id === '@mew/tmux-term') return 'virtual:terminal'
      if (id.endsWith('.css')) return 'virtual:style'
      if (id.endsWith('?raw')) { const resolved = await this.resolve(id.slice(0, -4), importer, { skipSelf: true }); if (resolved) return `${resolved.id}?raw` }
    },
    async load(id) {
      if (id === 'virtual:late-cache.tsx') return source
      if (id === 'virtual:cache') return `export * from '${root}/src/utils/agent-history-cache.ts';export const readHistoryCache=()=>{const cached={sessionId:'saved',generation:'device',start:0,end:2,total:2,usersBefore:0,events:[window.message('user','Late cached question'),window.message('agent','Late cached answer')]};return location.search.includes('eager')?Promise.resolve(cached):new Promise(resolve=>{window.finishCache=()=>resolve(cached)})};`
      if (id === 'virtual:terminal') return 'export const isHiddenTmuxSession=()=>false;export function TmuxTerminal(){return null}'
      if (id === 'virtual:style') return ''
      if (id.endsWith('?raw')) return `export default ${JSON.stringify(await fs.readFile(id.slice(0, -4), 'utf8'))}`
    },
  }] })
  const browser = await connectTestBrowser()
  t.after(() => browser.close())
  const chunk = bundle.output.find(item => item.type === 'chunk')!
  for (const mode of ['before-synchronization', 'after-synchronization', 'eager']) {
    const page = await browser.newPage()
    page.setDefaultTimeout(5000)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('http://mew-late-cache.test/**', route => {
      const pathname = new URL(route.request().url()).pathname
      if (pathname === '/app.js') return route.fulfill({ contentType: 'text/javascript', body: chunk.code })
      if (pathname === '/api/user-ui/agent-tabs') return route.fulfill({ json: { state: { tabs: [{ id: 'saved-tab', label: 'Saved', renamed: true, runtime: 'codex', cwd: '/workspace', sessionIds: { [JSON.stringify(['codex', '/workspace'])]: 'saved' } }], activeId: 'saved-tab' }, claims: [] } })
      if (pathname === '/api/user-ui/agent-tabs/history') return route.fulfill({ json: { preview: null } })
      if (pathname === '/api/agent-cwd') return route.fulfill({ json: { cwd: '/workspace' } })
      if (pathname === '/api/projects') return route.fulfill({ json: [] })
      if (pathname.startsWith('/api/')) return route.fulfill({ json: { skills: [], jobs: [], commands: [], runtimes: [] } })
      return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><meta charset="utf-8"><style>.hidden,[hidden]{display:none!important}</style><div id="root"></div><script src="/app.js"></script></html>' })
    })
    await page.goto(`http://mew-late-cache.test/?${mode}`)
    await page.waitForFunction('window.socket?.readyState===1').catch(error => { throw new Error(`${error.message}\n${JSON.stringify(errors)}`) })
    if (mode === 'eager') {
      assert.equal(await page.evaluate('new URL(window.socket.url).searchParams.get("generation")'), 'device')
      assert.equal(await page.evaluate('new URL(window.socket.url).searchParams.get("after")'), '2', 'cache within the connection gate retains incremental synchronization')
      await page.getByText('Late cached question', { exact: true }).waitFor()
      await page.evaluate('window.socket.finish()')
      await page.getByText('Live question', { exact: true }).waitFor()
      assert.deepEqual(errors, [])
      await page.close()
      continue
    }
    assert.equal(await page.evaluate('new URL(window.socket.url).searchParams.has("generation")'), false, 'the socket starts before the stalled device read finishes')
    if (mode === 'after-synchronization') {
      await page.evaluate('window.socket.finish()')
      await page.getByText('Live question', { exact: true }).waitFor()
    }
    await page.evaluate('window.finishCache()')
    if (mode === 'before-synchronization') {
      await page.getByText('Late cached question', { exact: true }).waitFor().catch(async error => {
        throw new Error(`${error.message}\n${JSON.stringify(errors)}\n${await page.locator('body').innerText()}`)
      })
      assert.equal(await page.locator('[data-agent-history-preview]').count(), 1)
      assert.equal(await page.locator('[data-agent-loading]').count(), 0)
      const send = page.getByRole('button', { name: '전송', exact: true })
      const composer = page.locator('[data-keep-keyboard] [contenteditable="true"]')
      await composer.fill('Keep this draft')
      assert.equal(await send.isDisabled(), true)
      await page.evaluate('window.socket.finish()')
      await page.getByText('Live question', { exact: true }).waitFor()
      assert.equal(await composer.innerText(), 'Keep this draft')
      assert.equal(await send.isEnabled(), true)
    }
    await page.waitForTimeout(30)
    assert.equal(await page.getByText('Late cached question', { exact: true }).count(), 0)
    assert.equal(await page.locator('[data-agent-history-preview]').count(), 0)
    assert.equal(await page.getByText('Live question', { exact: true }).isVisible(), true)
    assert.deepEqual(errors, [])
    await page.close()
  }
})
