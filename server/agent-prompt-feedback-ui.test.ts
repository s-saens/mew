import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { chromium, type Locator, type Page } from 'playwright-core'
import { domBrowserExecutable } from './browser-dom-executable.ts'

const root = path.resolve(import.meta.dirname, '..')

async function composerValue(input: Locator): Promise<string> {
  if (await input.locator('.cm-placeholder').count()) return ''
  return (await input.locator('.cm-line').allTextContents()).join('\n')
}

async function emit(page: Page, script: string): Promise<void> {
  await page.evaluate(script)
  await page.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
}

test('agent prompts show immediate bubbles and reply dots without server echoes on desktop and mobile', { skip: !domBrowserExecutable(), timeout: 40_000 }, async () => {
  const source = `import React from '${root}/node_modules/react/index.js';
import {createRoot} from '${root}/node_modules/react-dom/client.js';
import {AgentPanel} from '${root}/src/components/AgentPanel.tsx';
import {I18nProvider} from '${root}/src/i18n.tsx';
localStorage.setItem('mew:locale','ko');window.messages=[];window.throwSend=false;
const startup=new URLSearchParams(location.search).has('startup');
const user=text=>({type:'update',update:{sessionUpdate:'user_message_chunk',content:{type:'text',text}}});
const reply=text=>({type:'update',update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text}}});
window.user=user;window.reply=reply;
window.meta=(busy=false,queued=[])=>({type:'meta',meta:{sessionId:'first',startedAt:new Date().toISOString(),turns:1,busy,queued,queuedKinds:queued.map(()=> 'prompt'),usage:null,canLoad:false,canList:false}});
class Socket {
 static OPEN=1;readyState=1;
 constructor(){window.socket=this;window.openFixture=()=>{
  this.readyState=1;this.onopen?.();this.emit({type:'replay',restored:true,events:startup?[]:[user('Repeated prompt'),{type:'turn_start'},reply('Earlier answer'),{type:'turn_end',stopReason:'end_turn'}]});
  this.emit({type:'models',models:{currentModelId:'astra',availableModels:[{modelId:'astra',name:'Astra'}]}});
  this.emit(window.meta());
 };if(startup)this.readyState=0;else setTimeout(window.openFixture,20)}
 emit(value){this.onmessage?.({data:JSON.stringify(value)})}
 send(raw){if(this.readyState!==1 || window.throwSend)throw new Error('fixture send failed');window.messages.push(JSON.parse(raw))}
 close(){}
}
window.WebSocket=Socket;
createRoot(document.getElementById('root')).render(<I18nProvider><AgentPanel project="test" workspacePath="/workspace" tree={[]} focusedFilePath={null} onOpenFile={()=>{}} onClose={()=>{}} /></I18nProvider>);`
  const bundle = await build({ input: 'virtual:prompt-feedback.tsx', write: false, platform: 'browser', output: { format: 'iife' }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
    onwarn(warning, handler) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') handler(warning) }, plugins: [{
    name: 'fixture',
    async resolveId(id, importer) {
      if (id === 'virtual:prompt-feedback.tsx') return id
      if (id === '@mew/tmux-term') return 'virtual:terminal'
      if (id.endsWith('.css')) return 'virtual:style'
      if (id.endsWith('?raw')) { const resolved = await this.resolve(id.slice(0, -4), importer, { skipSelf: true }); if (resolved) return `${resolved.id}?raw` }
    },
    async load(id) {
      if (id === 'virtual:prompt-feedback.tsx') return source
      if (id === 'virtual:terminal') return 'export const isHiddenTmuxSession=()=>false;export function TmuxTerminal(){return null}'
      if (id === 'virtual:style') return ''
      if (id.endsWith('?raw')) return `export default ${JSON.stringify(await fs.readFile(id.slice(0, -4), 'utf8'))}`
    },
  }] })
  const chunk = bundle.output.find(item => item.type === 'chunk')!
  const compiler = await compile(await fs.readFile(`${root}/src/index.css`, 'utf8'), { base: `${root}/src`, onDependency() {} })
  const content = (await Promise.all(['src/components/AgentPanel.tsx', 'src/components/MentionTextarea.tsx', 'src/components/DockWorkspace.tsx'].map(file => fs.readFile(`${root}/${file}`, 'utf8')))).join('\n')
  const css = compiler.build([...new Set((source + content).match(/[A-Za-z0-9_@!:/.[\]()%,-]+/g))])
    + await fs.readFile(`${root}/packages/ui/src/loading-indicator.css`, 'utf8')
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  try {
    for (const width of [1100, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 844 } })
      page.setDefaultTimeout(4000)
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('http://mew-prompt-feedback.test/**', route => {
        const pathname = new URL(route.request().url()).pathname
        if (pathname === '/app.js') return route.fulfill({ contentType: 'text/javascript', body: chunk.code })
        if (pathname === '/api/user-ui/agent-tabs') return route.fulfill({ json: { state: { tabs: [{ id: 'first', label: 'Codex', runtime: 'codex', cwd: '/workspace' }], activeId: 'first' }, claims: [] } })
        if (pathname === '/api/agent-cwd') return route.fulfill({ json: { cwd: '/workspace' } })
        if (pathname === '/api/projects') return route.fulfill({ json: [] })
        if (pathname.startsWith('/api/')) return route.fulfill({ json: { settings: null, skills: [], jobs: [], commands: [], runtimes: [] } })
        return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html class="${width === 1100 ? 'dark' : ''}" lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}html,body,#root{height:100%;margin:0}</style><div id="root"></div><script src="/app.js"></script></html>` })
      })
      await page.goto('http://mew-prompt-feedback.test/')
      await page.getByTitle('모델', { exact: true }).filter({ hasText: 'Astra' }).waitFor()
      const input = page.locator('[contenteditable="true"][aria-placeholder="텍스트 입력"]')
      const questions = page.locator('[data-agent-question]')
      const repeated = questions.filter({ hasText: 'Repeated prompt' })
      const waiting = page.locator('[data-agent-reply-pending]:visible')
      await repeated.waitFor()
      assert.equal(await repeated.count(), 1)

      // The socket deliberately emits nothing in response to a submission.
      await input.fill('Repeated prompt')
      await input.press('Control+Enter')
      await repeated.nth(1).waitFor()
      await waiting.waitFor()
      assert.equal(await repeated.count(), 2, 'an earlier identical prompt cannot consume the new local bubble')
      assert.equal(await waiting.getAttribute('role'), 'status')
      assert.equal(await waiting.locator('.mew-loading-dot').count(), 3)
      assert.equal(await composerValue(input), '')
      assert.equal(await page.evaluate('window.messages.filter(message=>message.type==="prompt").length'), 1)
      await page.screenshot({ path: `/tmp/mew-agent-prompt-feedback-${width}.png` })

      await emit(page, "window.socket.emit(window.user('Repeated prompt'))")
      await waiting.waitFor()
      assert.equal(await repeated.count(), 2, 'the user echo replaces its local bubble')
      await emit(page, "window.socket.emit({type:'turn_start',startedAt:Date.now()});window.socket.emit(window.meta(true))")
      await waiting.waitFor()
      assert.equal(await repeated.count(), 2)
      const turnButton = page.locator('[data-agent-turn-header]').last().getByRole('button').first()
      await turnButton.click()
      await waiting.waitFor()
      assert.equal(await turnButton.getAttribute('aria-expanded'), 'true', 'expanded empty replies retain their dots')
      assert.equal(await waiting.locator('.mew-loading-dot').count(), 3)

      await emit(page, "window.socket.emit(window.reply('The new answer'))")
      await waiting.waitFor({ state: 'hidden' })
      await page.getByRole('paragraph').filter({ hasText: 'The new answer' }).waitFor()
      await emit(page, "window.socket.emit({type:'turn_end',stopReason:'end_turn'});window.socket.emit(window.meta())")

      await input.fill('Repeated prompt')
      await input.press('Control+Enter')
      await repeated.nth(2).waitFor()
      await waiting.waitFor()
      assert.equal(await repeated.count(), 3, 'a second identical submission remains distinct')
      await emit(page, "window.socket.emit(window.user('Repeated prompt'));window.socket.emit({type:'turn_start'});window.socket.emit(window.meta(true))")
      await waiting.waitFor()
      assert.equal(await repeated.count(), 3)
      await emit(page, "window.socket.emit({type:'turn_end',stopReason:'cancelled'});window.socket.emit(window.meta())")
      await waiting.waitFor({ state: 'hidden' })

      await input.fill('Failure prompt')
      await input.press('Control+Enter')
      await questions.filter({ hasText: 'Failure prompt' }).waitFor()
      await waiting.waitFor()
      await emit(page, "window.socket.emit({type:'error',message:'fixture prompt rejected'});window.socket.emit(window.meta())")
      await waiting.waitFor({ state: 'hidden' })
      await page.getByText('fixture prompt rejected', { exact: true }).waitFor()

      // Once busy is confirmed, additional prompts belong to the existing queue.
      await emit(page, "window.socket.emit(window.user('Active turn'));window.socket.emit({type:'turn_start'});window.socket.emit(window.meta(true))")
      await questions.filter({ hasText: 'Active turn' }).waitFor()
      const beforeQueue = await questions.count()
      await input.fill('Queued next prompt')
      await input.press('Control+Enter')
      await emit(page, "window.socket.emit(window.meta(true,['Queued next prompt']))")
      await page.locator('[data-agent-queue]').filter({ hasText: 'Queued next prompt' }).waitFor()
      assert.equal(await questions.count(), beforeQueue, 'busy submissions keep the server queue behavior')
      await emit(page, "window.socket.emit({type:'turn_end',stopReason:'end_turn'});window.socket.emit(window.meta())")
      await waiting.waitFor({ state: 'hidden' })

      const beforeRapid = await repeated.count()
      for (let index = 0; index < 2; index++) {
        await input.fill('Repeated prompt')
        await input.press('Control+Enter')
      }
      await repeated.nth(beforeRapid).waitFor()
      await waiting.waitFor()
      assert.equal(await repeated.count(), beforeRapid + 1, 'a rapid second send awaits server queue confirmation')
      await emit(page, "window.socket.emit(window.user('Repeated prompt'));window.socket.emit({type:'turn_start'});window.socket.emit(window.meta(true,['Repeated prompt']))")
      await waiting.waitFor()
      assert.equal(await repeated.count(), beforeRapid + 1, 'same-frame echo and identical queued text keep the active bubble')
      await page.locator('[data-agent-queue]').filter({ hasText: 'Repeated prompt' }).waitFor()
      await emit(page, "window.socket.emit({type:'turn_end',stopReason:'end_turn'});window.socket.emit(window.user('Repeated prompt'));window.socket.emit({type:'turn_start'});window.socket.emit(window.meta(true))")
      await repeated.nth(beforeRapid + 1).waitFor()
      await waiting.waitFor()
      assert.equal(await repeated.count(), beforeRapid + 2, 'the queued identical prompt creates its own user bubble when execution starts')
      await emit(page, "window.socket.emit(window.reply('Queued answer'));window.socket.emit({type:'turn_end',stopReason:'end_turn'});window.socket.emit(window.meta())")
      await waiting.waitFor({ state: 'hidden' })

      const promptsBeforeFailure = await page.evaluate('window.messages.filter(message=>message.type==="prompt").length')
      for (const failure of ['closed', 'throw']) {
        await emit(page, failure === 'closed' ? 'window.socket.readyState=3' : 'window.socket.readyState=1;window.throwSend=true')
        await input.fill(`Keep draft after ${failure}`)
        await input.press('Control+Enter')
        assert.equal(await composerValue(input), `Keep draft after ${failure}`, 'a failed socket send preserves the draft')
        assert.equal(await questions.filter({ hasText: `Keep draft after ${failure}` }).count(), 0)
        assert.equal(await waiting.count(), 0)
      }
      assert.equal(await page.evaluate('window.messages.filter(message=>message.type==="prompt").length'), promptsBeforeFailure)
      assert.deepEqual(errors, [])

      await page.evaluate('localStorage.clear()')
      await page.goto('http://mew-prompt-feedback.test/?startup')
      await input.waitFor()
      await input.fill('Startup question')
      await input.press('Control+Enter')
      await questions.filter({ hasText: 'Startup question' }).waitFor()
      await waiting.waitFor()
      assert.equal(await page.evaluate('window.messages.filter(message=>message.type==="prompt").length'), 0, 'startup feedback precedes the socket opening')
      await page.locator('[data-agent-startup-queue]').waitFor()
      await emit(page, 'window.openFixture()')
      await page.locator('[data-agent-startup-queue]').waitFor({ state: 'hidden' })
      await waiting.waitFor()
      assert.equal(await questions.filter({ hasText: 'Startup question' }).count(), 1, 'initialization preserves the local bubble until its echo')
      assert.equal(await page.evaluate('window.messages.filter(message=>message.type==="prompt").length'), 1, 'startup flush sends the prompt once')
      await emit(page, "window.socket.emit(window.user('Startup question'));window.socket.emit({type:'turn_start'});window.socket.emit(window.meta(true))")
      await waiting.waitFor()
      assert.equal(await questions.filter({ hasText: 'Startup question' }).count(), 1)
      await emit(page, "window.socket.emit({type:'turn_end',stopReason:'end_turn'});window.socket.emit(window.meta())")
      await waiting.waitFor({ state: 'hidden' })
      assert.deepEqual(errors, [])
      await page.close()
    }
  } finally { await browser.close() }
})
