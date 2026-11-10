import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { build } from 'rolldown'
import { connectTestBrowser } from './test-browser.ts'

const root = path.resolve(import.meta.dirname, '..')

test('terminal auxiliary keys preserve input focus through the mobile panel', { timeout: 30_000 }, async () => {
  const source = `import React from '${root}/node_modules/react/index.js';
import {createRoot} from '${root}/node_modules/react-dom/client.js';
import {AgentPanel} from '${root}/src/components/AgentPanel.tsx';
import {I18nProvider} from '${root}/src/i18n.tsx';
createRoot(document.getElementById('root')).render(<I18nProvider><AgentPanel terminalOpen agentOpen={false} project="test" workspacePath="/workspace" tree={[]} focusedFilePath={null} onOpenFile={()=>{}} onClose={()=>{}} /></I18nProvider>);`
  const bundle = await build({ input: 'virtual:panel.tsx', write: false, platform: 'browser', output: { format: 'iife', codeSplitting: false }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } }, plugins: [{
    name: 'fixture',
    async resolveId(id, importer) {
      if (id === 'virtual:panel.tsx') return id
      if (id === '@mew/tmux-term') return 'virtual:terminal.tsx'
      if (id.endsWith('.css')) return 'virtual:style'
      if (id.endsWith('?raw')) { const resolved = await this.resolve(id.slice(0, -4), importer, { skipSelf: true }); if (resolved) return `${resolved.id}?raw` }
    },
    async load(id) {
      if (id === 'virtual:panel.tsx') return source
      if (id === 'virtual:terminal.tsx') return `import React from '${root}/node_modules/react/index.js';import {MobileKeyBar} from '${root}/packages/mobile-keys/src/MobileKeyBar.tsx';export const isHiddenTmuxSession=()=>false;export function TmuxTerminal(){return <><MobileKeyBar placement="flow" ctrlActive={false} shiftActive={false} onToggleCtrl={()=>{window.presses++}} onToggleShift={()=>{}} onEsc={()=>{}} onTab={()=>{}} onArrow={()=>{}}/><textarea data-terminal-input/></>}`
      if (id === 'virtual:style') return ''
      if (id.endsWith('?raw')) return 'export default ""'
    },
  }] })
  const chunk = bundle.output.find(item => item.type === 'chunk')!
  const browser = await connectTestBrowser()
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
    await page.route('http://mew-terminal-panel.test/**', route => {
      const pathname = new URL(route.request().url()).pathname
      if (pathname === '/app.js') return route.fulfill({ contentType: 'text/javascript', body: chunk.code })
      if (pathname === '/api/user-ui/agent-tabs') return route.fulfill({ json: { state: { tabs: [{ id: 'first', label: 'first', runtime: 'tmux', cwd: '/workspace' }], activeId: 'first' }, claims: [] } })
      if (pathname === '/api/agent-runtimes') return route.fulfill({ json: { runtimes: [{ id: 'tmux', installed: true }] } })
      if (pathname.startsWith('/api/agent-runtimes/tmux/terminal/')) return route.fulfill({ json: { ok: true, session: 'fixture-shell' } })
      if (pathname.startsWith('/api/')) return route.fulfill({ json: { settings: null, skills: [], jobs: [], commands: [], runtimes: [] } })
      return route.fulfill({ contentType: 'text/html', body: '<meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script>window.presses=0</script><script src="/app.js"></script>' })
    })
    await page.goto('http://mew-terminal-panel.test/')
    const input = page.locator('[data-terminal-input]:visible')
    await input.waitFor({ timeout: 5000 })
    const ctrl = page.locator('[data-mobile-key-bar]:visible').getByRole('button', { name: 'Ctrl', exact: true })
    await input.focus()
    await input.evaluate(el => { const win = el.ownerDocument.defaultView! as any; win.focusCalls = 0; const focus = el.focus.bind(el); el.focus = (...args: Parameters<typeof el.focus>) => { win.focusCalls++; return focus(...args) } })
    await ctrl.tap()
    assert.equal(await input.evaluate(el => el === el.ownerDocument.activeElement), true, 'focused input stays focused after panel click handling')
    assert.equal(await page.evaluate('window.focusCalls'), 0, 'retained input focus is not requested again')
    await input.evaluate(el => el.blur())
    await ctrl.tap()
    assert.equal(await input.evaluate(el => el === el.ownerDocument.activeElement), false, 'unfocused input stays unfocused')
    assert.equal(await page.evaluate('window.focusCalls'), 0, 'unfocused input is not focused')
    assert.equal(await page.evaluate('window.presses'), 2)
  } finally { await browser.close() }
})
