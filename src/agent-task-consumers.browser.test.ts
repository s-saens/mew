import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { build } from 'rolldown'
import { chromium } from 'playwright-core'
import { domBrowserExecutable } from '../server/browser-dom-executable.ts'

const root = path.resolve(import.meta.dirname, '..')
test('task bindings configure project creation and assistant sessions', { skip: !domBrowserExecutable(), timeout: 45_000 }, async t => {
  const source = `import React from 'react'; import {createRoot} from 'react-dom/client';
    import {ProjectCreationAgentDialog} from ${JSON.stringify(path.join(root, 'src/components/ProjectCreationAgentDialog.tsx'))};
    import {useAssistantTaskSet} from ${JSON.stringify(path.join(root, 'src/hooks/use-agent-task-set.ts'))};
    import {useMewcatAssistant} from ${JSON.stringify(path.join(root, 'src/hooks/use-mewcat-assistant.ts'))};
    window.sockets=[]; class Socket {static OPEN=1;static CLOSED=3;readyState=0;constructor(url){this.url=url;window.sockets.push(this)} close(){this.readyState=3}}; window.WebSocket=Socket;
    function Harness(){const {set,loaded,override}=useAssistantTaskSet();useMewcatAssistant({account:'owner',enabled:loaded,runtime:set?.runtime??'codex',preset:set,projectRoot:'/tmp',onAction:async()=>{}});return <><button data-manual onClick={override}>Choose runtime</button><ProjectCreationAgentDialog projectPath='/tmp' projectName='Example' onClose={()=>{}}/></>};
    createRoot(document.getElementById('root')).render(<Harness/>);`
  const result = await build({ input: 'virtual:consumers.tsx', write: false, platform: 'browser', transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': '"production"', 'import.meta.hot': 'false' } }, output: { format: 'iife', codeSplitting: false }, onLog(level, log, handler) { if (log.code !== 'MODULE_LEVEL_DIRECTIVE') handler(level, log) }, plugins: [{
    name: 'fixtures',
    resolveId(id, importer) {
      if (id === 'virtual:consumers.tsx') return id
      if (id.endsWith('.css')) return 'virtual:empty'
      if (id === '@mew/ui') return 'virtual:ui.tsx'
      if (id.endsWith('/api/workspace-api-context')) return 'virtual:api'
      if (id === '../i18n' && (importer?.endsWith('/ProjectCreationAgentDialog.tsx') || importer?.endsWith('/use-mewcat-assistant.ts'))) return 'virtual:i18n'
      if (id === './AgentPanel' && importer?.endsWith('/ProjectCreationAgentDialog.tsx')) return 'virtual:panel.tsx'
      if (id === './panel-close-button') return 'virtual:close.tsx'
    },
    load(id) {
      if (id === 'virtual:consumers.tsx') return source
      if (id === 'virtual:empty') return ''
      if (id === 'virtual:ui.tsx') return 'export function DialogFrame({children}) {return <div>{children}</div>}'
      if (id === 'virtual:close.tsx') return 'export function PanelCloseButton(){return <button>Close</button>}'
      if (id === 'virtual:i18n') return "export function useI18n(){return {locale:'en',t:key=>key}}"
      if (id === 'virtual:api') return `window.fixtureSet={id:'configured',name:'Configured',runtime:'claude',modelId:'model',role:'role',thinkingId:'high',thinkingConfigId:'effort'}; const api={fetchAgentTaskBindings:async()=>({bindings:{assistant:'configured',projectCreation:'configured'}}),fetchAgentSets:async()=>({sets:[window.fixtureSet]})}; export function useWorkspaceApi(){return api}`
      if (id === 'virtual:panel.tsx') return 'export function AgentPanel({requestedTab}){return <pre data-tab>{JSON.stringify(requestedTab)}</pre>}'
    },
  }] })
  const code = result.output.find(item => item.type === 'chunk')!.code
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  t.after(() => browser.close())
  const page = await browser.newPage()
  await page.route('http://task-consumers.test/**', route => route.fulfill({ contentType: 'text/html', body: `<div id="root"></div><script>${code}</script>` }))
  await page.goto('http://task-consumers.test/')
  await page.locator('[data-tab]').waitFor()
  const tab = JSON.parse(await page.locator('[data-tab]').innerText())
  assert.equal(tab.runtime, 'claude')
  assert.deepEqual(tab.preset, { id: 'configured', name: 'Configured', runtime: 'claude', modelId: 'model', role: 'role', thinkingId: 'high', thinkingConfigId: 'effort' })
  await page.waitForFunction("window.sockets.some(socket=>new URL(socket.url).searchParams.get('runtime')==='claude')")
  const query = new URL(await page.evaluate('window.sockets.at(-1).url') as string).searchParams
  assert.equal(query.get('runtime'), 'claude')
  assert.equal(query.get('model'), 'model')
  assert.equal(query.get('role'), 'role')
  assert.equal(query.get('thinking'), 'high')
  assert.equal(query.get('thinkingConfig'), 'effort')
  const initialCount = await page.evaluate('window.sockets.length') as number
  await page.locator('[data-manual]').click()
  await page.waitForFunction(`window.sockets.length > ${initialCount}`)
  assert.equal(new URL(await page.evaluate('window.sockets.at(-1).url') as string).searchParams.get('runtime'), 'codex')
  const manualCount = await page.evaluate('window.sockets.length') as number
  await page.evaluate("window.fixtureSet={...window.fixtureSet,modelId:'new-model'};window.dispatchEvent(new Event('mew:agent-task-bindings-changed'))")
  await page.waitForFunction(`window.sockets.length > ${manualCount}`)
  const revised = new URL(await page.evaluate('window.sockets.at(-1).url') as string).searchParams
  assert.equal(revised.get('model'), 'new-model')
  assert.notEqual(revised.get('mewcat'), query.get('mewcat'))
  assert.equal(JSON.parse(await page.locator('[data-tab]').innerText()).preset.modelId, 'model', 'an open project setup retains its initial preset')
})
