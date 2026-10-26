import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { chromium, type Route } from 'playwright-core'
import { domBrowserExecutable } from './browser-dom-executable.ts'

const root = path.resolve(import.meta.dirname, '..')

test('worktree changes preserve existing agent sessions and create new agent and terminal tabs in the selected folder', { skip: !domBrowserExecutable(), timeout: 40_000 }, async () => {
  const source = `import React from '${root}/node_modules/react/index.js';
import {createRoot} from '${root}/node_modules/react-dom/client.js';
import {AgentPanel} from '${root}/src/components/AgentPanel.tsx';
import {I18nProvider} from '${root}/src/i18n.tsx';
localStorage.setItem('mew:locale','ko');window.sockets=[];
class Socket {
 static OPEN=1;readyState=0;
 constructor(url){this.url=url;window.sockets.push(this)}
 send(){}
 close(){this.readyState=3;this.onclose?.()}
}
window.WebSocket=Socket;
window.openRuntime=runtime=>window.dispatchEvent(new CustomEvent('mew:open-agent-runtime',{detail:runtime}));
function Fixture(){
 const [workingPath,setWorkingPath]=React.useState('/alpha');
 window.moveWorking=()=>setWorkingPath('/alpha-worktree');
 return <AgentPanel project=".workspace" workspacePath="/alpha" workingPath={workingPath} tree={[]} focusedFilePath={null} onOpenFile={()=>{}} onClose={()=>{}} />;
}
createRoot(document.getElementById('root')).render(<I18nProvider><Fixture/></I18nProvider>);`
  const bundle = await build({ input: 'virtual:worktree.tsx', write: false, platform: 'browser', output: { format: 'iife', codeSplitting: false }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } }, plugins: [{
    name: 'fixture',
    async resolveId(id, importer) {
      if (id === 'virtual:worktree.tsx') return id
      if (id === '@mew/tmux-term') return 'virtual:terminal.tsx'
      if (id.endsWith('.css')) return 'virtual:style'
      if (id.endsWith('?raw')) { const resolved = await this.resolve(id.slice(0, -4), importer, { skipSelf: true }); if (resolved) return `${resolved.id}?raw` }
    },
    async load(id) {
      if (id === 'virtual:worktree.tsx') return source
      if (id === 'virtual:terminal.tsx') return 'export const isHiddenTmuxSession=()=>false;export function TmuxTerminal(){return <textarea data-test-terminal/>}'
      if (id === 'virtual:style') return ''
      if (id.endsWith('?raw')) return `export default ${JSON.stringify(await fs.readFile(id.slice(0, -4), 'utf8'))}`
    },
  }] })
  const chunk = bundle.output.find(item => item.type === 'chunk')!
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  const page = await browser.newPage()
  page.setDefaultTimeout(5_000)
  const errors: string[] = []
  const saved: Array<{ workspacePath: string; tabs: Array<{ id: string; runtime: string; cwd: string }> }> = []
  const terminals: Array<{ cwd: string }> = []
  let tabReads = 0
  let pendingCwd: Route | undefined
  let holdNextCwd = true
  page.on('pageerror', error => errors.push(error.message))
  try {
    await page.route('http://mew-worktree-agent.test/**', async route => {
      const url = new URL(route.request().url())
      if (url.pathname === '/app.js') return route.fulfill({ contentType: 'text/javascript', body: chunk.code })
      if (url.pathname === '/api/user-ui/agent-tabs') {
        if (route.request().method() === 'PUT') {
          const body = route.request().postDataJSON()
          saved.push(body)
          return route.fulfill({ json: { state: body } })
        }
        tabReads++
        return route.fulfill({ json: { state: { tabs: [{ id: 'existing', label: 'existing', renamed: true, runtime: 'codex', cwd: '/alpha' }], activeId: 'existing' }, claims: [] } })
      }
      if (url.pathname === '/api/agent-cwd') {
        if (url.searchParams.get('path') === '/alpha-worktree' && holdNextCwd) { holdNextCwd = false; pendingCwd = route; return }
        return route.fulfill({ json: { cwd: url.searchParams.get('path') } })
      }
      if (url.pathname.startsWith('/api/agent-runtimes/tmux/terminal/')) {
        terminals.push(route.request().postDataJSON())
        return route.fulfill({ json: { ok: true, session: 'worktree-shell' } })
      }
      if (url.pathname === '/api/agent-runtimes') return route.fulfill({ json: { runtimes: [{ id: 'codex', installed: true }, { id: 'tmux', installed: true }] } })
      if (url.pathname === '/api/projects') return route.fulfill({ json: [] })
      if (url.pathname === '/api/agent-sets') return route.fulfill({ json: { sets: [] } })
      if (url.pathname.startsWith('/api/')) return route.fulfill({ json: { settings: null, skills: [], jobs: [], commands: [], runtimes: [] } })
      return route.fulfill({ contentType: 'text/html', body: '<html><head><meta charset="utf-8"></head><body><div id="root"></div><script src="/app.js"></script></body></html>' })
    })
    await page.goto('http://mew-worktree-agent.test/')
    await page.waitForFunction('window.sockets.some(socket=>new URL(socket.url).searchParams.get("tab")==="existing")')
    const workingRequest = page.waitForRequest(request => new URL(request.url()).pathname === '/api/agent-cwd' && new URL(request.url()).searchParams.get('path') === '/alpha-worktree')
    await page.evaluate('window.moveWorking()')
    await workingRequest
    await page.evaluate('window.openRuntime("codex")')
    await page.waitForFunction('window.sockets.some(socket=>new URL(socket.url).searchParams.get("cwd")==="/alpha-worktree")')
    const savedThreeTabs = page.waitForResponse(response => response.url().endsWith('/api/user-ui/agent-tabs') && response.request().method() === 'PUT' && response.request().postDataJSON().tabs.length === 3)
    await page.evaluate('window.openRuntime("tmux")')
    await page.locator('[data-test-terminal]').waitFor()
    assert.deepEqual(terminals, [{ cwd: '/alpha-worktree' }])
    await page.waitForFunction('document.querySelectorAll("[role=tab]").length===3')
    await pendingCwd?.fulfill({ json: { cwd: '/alpha-worktree' } })
    pendingCwd = undefined
    await savedThreeTabs
    const state = saved.at(-1)!
    assert.equal(state.workspacePath, '/alpha', 'tab persistence remains attached to the logical project')
    assert.equal(state.tabs.find(tab => tab.id === 'existing')?.cwd, '/alpha')
    assert.deepEqual(state.tabs.filter(tab => tab.id !== 'existing').map(tab => [tab.runtime, tab.cwd]), [['codex', '/alpha-worktree'], ['tmux', '/alpha-worktree']])
    assert.equal(await page.evaluate('window.sockets.filter(socket=>new URL(socket.url).searchParams.get("tab")==="existing").length'), 1, 'worktree selection does not recreate the existing connection')
    assert.equal(tabReads, 1, 'changing the file root does not restore another project tab list')
    assert.deepEqual(errors, [])
  } finally {
    await pendingCwd?.abort().catch(() => {})
    await browser.close()
  }
})
