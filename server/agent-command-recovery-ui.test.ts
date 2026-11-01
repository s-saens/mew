import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { build } from 'rolldown'
import { chromium } from 'playwright-core'
import { domBrowserExecutable } from './browser-dom-executable.ts'

test('agent command polling keeps recovering quietly with bounded backoff and preserves operation failures', { skip: !domBrowserExecutable(), timeout: 20_000 }, async t => {
  const root = path.resolve(import.meta.dirname, '..')
  const source = `
import React from '${root}/node_modules/react/index.js';
import {createRoot} from '${root}/node_modules/react-dom/client.js';
import {useAgentCommands} from '${root}/src/hooks/use-agent-commands.ts';
window.reads=0;window.starts=[];window.mode='ready';window.rejectStart=false;
window.list=async()=>{window.reads++;if(window.holdRead)await new Promise(resolve=>window.finishRead=resolve);if(window.mode==='temporary')throw new TypeError('Failed to fetch');if(window.mode==='permission')throw Object.assign(new Error('Access denied'),{status:403});if(window.mode==='malformed')throw new SyntaxError('Invalid command response');return {commands:[{id:'existing',startedAt:1}]}};
window.start=async command=>{window.starts.push(command);if(window.rejectStart)throw new Error('Command rejected');return {command:{id:command.id,startedAt:2}}};
function Harness(){window.commands=useAgentCommands({runtime:'codex',cwd:'/workspace',sessionId:'session'},true);return null}
const app=createRoot(document.getElementById('root'));app.render(React.createElement(Harness));window.unmount=()=>app.unmount();`
  const bundle = await build({ input: 'virtual:agent-command-recovery.ts', write: false, platform: 'browser', output: { format: 'iife', codeSplitting: false }, transform: { define: { 'process.env.NODE_ENV': JSON.stringify('test') } }, plugins: [{
    name: 'fixture', resolveId(id, importer) {
      if (id === 'virtual:agent-command-recovery.ts') return id
      if (id === '../api/agent-commands' && importer?.endsWith('/use-agent-commands.ts')) return 'virtual:commands'
    }, load(id) {
      if (id === 'virtual:agent-command-recovery.ts') return source
      if (id === 'virtual:commands') return 'export const listAgentCommands=(...args)=>window.list(...args);export const startAgentCommand=(...args)=>window.start(...args)'
    },
  }] })
  const code = bundle.output.find(item => item.type === 'chunk')!.code
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  t.after(() => browser.close())
  const page = await browser.newPage(), errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.clock.install({ time: new Date('2030-01-01T00:00:00Z') })
  await page.clock.pauseAt(new Date('2030-01-01T00:00:01Z'))
  await page.route('https://agent-command-recovery.test/**', route => route.fulfill({ contentType: 'text/html', body: `<div id="root"></div><script>${code}</script>` }))
  await page.goto('https://agent-command-recovery.test/')
  await page.waitForFunction('window.commands.records.length===1')
  await page.evaluate('window.mode="temporary"')
  for (let failure = 1; failure <= 11; failure++) {
    await page.clock.runFor(1500)
    await page.waitForFunction(`window.reads===${failure + 1}`)
    assert.equal(await page.evaluate('window.commands.error'), null, 'pending automatic retries do not report a failure')
    assert.equal(await page.evaluate('window.commands.recovering'), true)
    assert.equal(await page.evaluate('window.commands.records[0].id'), 'existing', 'recovery preserves known commands')
  }
  await page.clock.runFor(1500)
  await page.waitForFunction('window.reads===13 && window.commands.recovering')
  assert.equal(await page.evaluate('window.commands.error'), null, 'exceeding eleven retries never exposes the raw network failure')
  assert.equal(await page.evaluate('window.commands.readFailed'), false)
  for (const delay of [3000, 6000, 12_000, 24_000, 30_000]) {
    const reads = await page.evaluate<number>('window.reads')
    await page.clock.runFor(delay - 1)
    assert.equal(await page.evaluate('window.reads'), reads, 'a prolonged outage slows automatic polling')
    await page.clock.runFor(1)
    await page.waitForFunction(`window.reads===${reads + 1}`)
    assert.equal(await page.evaluate('window.commands.error'), null)
    assert.equal(await page.evaluate('window.commands.recovering'), true)
    assert.equal(await page.evaluate('window.commands.records[0].id'), 'existing')
  }
  assert.equal(await page.evaluate('window.starts.length'), 0, 'polling never reruns a command')
  const recoveryReads = await page.evaluate<number>('window.reads')
  await page.evaluate('window.mode="ready";window.holdRead=true;document.dispatchEvent(new Event("visibilitychange"))')
  await page.waitForFunction(`window.reads===${recoveryReads + 1}`)
  await page.evaluate('window.dispatchEvent(new Event("online"));window.dispatchEvent(new Event("mew:remote-reconnected"));document.dispatchEvent(new Event("visibilitychange"))')
  assert.equal(await page.evaluate('window.reads'), recoveryReads + 1, 'foreground recovery opens one read even when recovery events arrive together')
  await page.evaluate('window.holdRead=false;window.finishRead()')
  await page.waitForFunction('!window.commands.error && !window.commands.recovering')
  await page.clock.runFor(1500)
  assert.equal(await page.evaluate('window.reads'), recoveryReads + 2, 'successful synchronization restores the normal polling interval')
  await page.evaluate('window.mode="temporary"')
  await page.clock.runFor(1500)
  await page.waitForFunction('window.commands.recovering')
  const resetReads = await page.evaluate<number>('window.reads')
  await page.clock.runFor(1499)
  assert.equal(await page.evaluate('window.reads'), resetReads)
  await page.clock.runFor(1)
  assert.equal(await page.evaluate('window.reads'), resetReads + 1, 'successful reads reset the fast retry interval')
  await page.evaluate('window.mode="permission";window.dispatchEvent(new Event("online"))')
  await page.waitForFunction('window.commands.error==="Access denied"')
  const deniedReads = await page.evaluate<number>('window.reads')
  await page.evaluate('window.dispatchEvent(new Event("online"));window.dispatchEvent(new Event("mew:remote-reconnected"));document.dispatchEvent(new Event("visibilitychange"))')
  await page.clock.runFor(5000)
  assert.equal(await page.evaluate('window.reads'), deniedReads, 'permission failures stop immediately and recovery events cannot bypass them')
  await page.evaluate('window.mode="malformed";window.commands.retryRefresh()')
  await page.waitForFunction('window.commands.error==="Invalid command response" && window.commands.readFailed && !window.commands.recovering')
  const malformedReads = await page.evaluate<number>('window.reads')
  await page.evaluate('window.dispatchEvent(new Event("online"));window.dispatchEvent(new Event("mew:remote-reconnected"));document.dispatchEvent(new Event("visibilitychange"))')
  await page.clock.runFor(30_000)
  assert.equal(await page.evaluate('window.reads'), malformedReads, 'a malformed response stops automatic reads until explicit retry')
  await page.evaluate('window.mode="ready";window.commands.retryRefresh()')
  await page.waitForFunction('!window.commands.error && !window.commands.recovering')
  await page.evaluate('window.rejectStart=true;window.commands.submit("tab","run once",0)')
  await page.waitForFunction('window.commands.error==="Command rejected"')
  assert.equal(await page.evaluate('window.commands.readFailed'), false, 'a failed operation remains distinct from polling failure')
  await page.clock.runFor(1500)
  assert.equal(await page.evaluate('window.commands.error'), 'Command rejected', 'a successful poll cannot hide an operation failure')
  assert.equal(await page.evaluate('window.starts.length'), 1, 'failed operations require an explicit user retry')
  await page.evaluate('window.rejectStart=false;window.commands.submit("tab","run once",0)')
  await page.waitForFunction('window.commands.records.length===2 && !window.commands.error')
  assert.equal(await page.evaluate('window.starts[0].id===window.starts[1].id'), true, 'an explicit retry reuses the idempotency key')
  const reads = await page.evaluate<number>('window.reads')
  await page.evaluate('window.unmount();window.dispatchEvent(new Event("online"));window.dispatchEvent(new Event("mew:remote-reconnected"));document.dispatchEvent(new Event("visibilitychange"))')
  await page.clock.runFor(60_000)
  assert.equal(await page.evaluate('window.reads'), reads, 'unmount cleans up polling')
  assert.deepEqual(errors, [])
})
