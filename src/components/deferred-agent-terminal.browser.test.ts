import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'rolldown'
import { chromium } from 'playwright-core'
import { domBrowserExecutable } from '../../server/browser-dom-executable.ts'

test('a closed agent terminal avoids xterm and a canceled download cannot attach an old session', { skip: !domBrowserExecutable(), timeout: 15_000 }, async t => {
  const terminal = new URL('./deferred-agent-terminal.tsx', import.meta.url).pathname
  const result = await build({
    input: 'virtual:terminal-fixture.tsx', write: false, platform: 'browser', output: { format: 'esm' },
    onwarn(warning, warn) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning) },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('production') } },
    plugins: [{
      name: 'isolated-agent-terminal',
      resolveId(id) { if (id.startsWith('virtual:')) return id; if (id.endsWith('.css')) return 'virtual:style' },
      transform(code, id) {
        if (id.endsWith('/tmux-term/src/TmuxTerminal.tsx')) return code + '\n;window.__terminalModuleLoaded = true;'
      },
      load(id) {
        if (id === 'virtual:style') return ''
        if (id === 'virtual:terminal-fixture.tsx') return `
          import React from ${JSON.stringify(import.meta.resolve('react'))};
          import {createRoot} from ${JSON.stringify(import.meta.resolve('react-dom/client'))};
          import {DeferredAgentTerminal} from ${JSON.stringify(terminal)};
          const root=createRoot(document.getElementById('root'));
          window.sockets=[];
          const socketFactory=url=>{
            const socket={url,readyState:1,sent:[],send(raw){this.sent.push(JSON.parse(raw))},close(){this.readyState=3;this.onclose?.()}};
            window.sockets.push(socket);queueMicrotask(()=>socket.onopen?.());return socket;
          };
          window.show=session=>root.render(<div style={{width:700,height:400}}>{session && <DeferredAgentTerminal key={session} sessionName={session} socketFactory={socketFactory}/>}</div>);
          window.show(null);`
      },
    }],
  })
  const chunks = result.output.filter(chunk => chunk.type === 'chunk')
  const entry = chunks.find(chunk => chunk.isEntry)!
  const renderer = chunks.find(chunk => Object.keys(chunk.modules).some(id => id.endsWith('/tmux-term/src/TmuxTerminal.tsx')))!
  assert.ok(renderer && renderer !== entry, 'the real terminal remains a dynamic entry')
  const scripts = new Map(chunks.map(chunk => [`/${chunk.fileName}`, chunk.code]))
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  t.after(() => browser.close())
  const page = await browser.newPage()
  page.setDefaultTimeout(3000)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  let reads = 0, release!: () => void, requested!: () => void
  const download = new Promise<void>(resolve => { requested = resolve })
  await page.route('http://terminal.test/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path === `/${renderer.fileName}`) {
      reads++
      await new Promise<void>(resolve => { release = resolve; requested() })
    }
    const script = scripts.get(path)
    await route.fulfill(script === undefined
      ? { contentType: 'text/html', body: `<div id="root"></div><script type="module" src="/${entry.fileName}"></script>` }
      : { contentType: 'text/javascript', body: script })
  })
  await page.goto('http://terminal.test/')
  assert.equal(reads, 0)
  await page.evaluate(() => (window as any).show('old-session'))
  await download
  await page.locator('[role="status"][aria-busy="true"]').waitFor({ state: 'attached' })
  assert.equal(await page.locator('.xterm').count(), 0)
  await page.evaluate(() => (window as any).show(null))
  await page.locator('[role="status"][aria-busy="true"]').waitFor({ state: 'detached' })
  release()
  await page.waitForFunction(() => (window as any).__terminalModuleLoaded === true)
  assert.equal(await page.locator('.xterm').count(), 0)
  assert.equal(await page.evaluate(() => (window as any).sockets.length), 0)

  await page.evaluate(() => (window as any).show('current-session'))
  await page.locator('.xterm').waitFor()
  await page.waitForFunction(() => (window as any).sockets.length === 1)
  assert.match(await page.evaluate(() => (window as any).sockets[0].url), /session=current-session/)
  assert.equal(reads, 1, 'reopening reuses the completed module')
  const composer = page.locator('textarea:not(.xterm-helper-textarea)')
  await composer.fill('echo current')
  await composer.press('Control+Enter')
  await page.waitForFunction(() => (window as any).sockets[0].sent.some((frame: any) => frame.type === 'input' && frame.data === 'echo current'))
  await page.evaluate(() => (window as any).show(null))
  await page.locator('.xterm').waitFor({ state: 'detached' })
  assert.equal(await page.evaluate(() => (window as any).sockets[0].readyState), 3)
  assert.deepEqual(errors, [])
})
