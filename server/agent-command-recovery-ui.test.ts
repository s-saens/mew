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
window.reads=0;window.readRequests=[];window.starts=[];window.mode='ready';window.rejectStart=false;
window.list=async(scope,signal)=>{window.reads++;const request={scope,signal,startedAt:performance.now()};window.readRequests.push(request);if(window.mode==='pending')return new Promise((resolve,reject)=>{request.finish=resolve;request.fail=reject});if(window.mode==='permission')throw Object.assign(new Error('Access denied'),{status:403});if(window.mode==='malformed')throw new SyntaxError('Invalid command response');return {commands:[{id:scope.sessionId==='session'?'existing':'other',startedAt:1}]}};
window.start=async command=>{window.starts.push(command);if(window.rejectStart)throw new Error('Command rejected');return {command:{id:command.id,startedAt:2}}};
function Harness(){const [sessionId,setSessionId]=React.useState('session');window.changeScope=setSessionId;window.commands=useAgentCommands({runtime:'codex',cwd:'/workspace',sessionId},true);return null}
const app=createRoot(document.getElementById('root'));app.render(React.createElement(Harness));window.unmount=()=>app.unmount();`
  const bundle = await build({ input: 'virtual:agent-command-recovery.ts', write: false, platform: 'browser', output: { format: 'iife', codeSplitting: false }, transform: { define: { 'process.env.NODE_ENV': JSON.stringify('test') } }, plugins: [{
    name: 'fixture', resolveId(id, importer) {
      if (id === 'virtual:agent-command-recovery.ts') return id
      if (id === '../utils/remote-transport' && importer?.endsWith('/use-agent-commands.ts')) return 'virtual:transport'
      if (id === '../api/agent-commands' && importer?.endsWith('/use-agent-commands.ts')) return 'virtual:commands'
    }, load(id) {
      if (id === 'virtual:agent-command-recovery.ts') return source
      if (id === 'virtual:transport') return 'export const isMewTransportSuspended=()=>!!window.suspended'
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
  await page.evaluate('window.mode="pending"')
  await page.clock.runFor(1500)
  await page.waitForFunction('window.reads===2')
  const delays = [0, 250, 500, 1000, 2000, ...Array<number>(9).fill(3000)]
  for (const delay of delays) {
    const reads = await page.evaluate<number>('window.reads')
    await page.evaluate('window.readRequests.at(-1).fail(new TypeError("Failed to fetch"))')
    await page.waitForFunction('window.commands.recovering')
    if (delay > 0) {
      await page.clock.runFor(delay - 1)
      assert.equal(await page.evaluate('window.reads'), reads, 'recovery respects its short retry interval')
    }
    await page.clock.runFor(delay > 0 ? 1 : 0)
    await page.waitForFunction(`window.reads===${reads + 1}`)
    assert.equal(await page.evaluate('window.commands.error'), null, 'even prolonged retries never expose raw network failures')
    assert.equal(await page.evaluate('window.commands.readFailed'), false)
    assert.equal(await page.evaluate('window.commands.records[0].id'), 'existing', 'recovery preserves known commands')
  }
  assert.equal(await page.evaluate('window.starts.length'), 0, 'polling never reruns a command')
  const recoveryReads = await page.evaluate<number>('window.reads')
  await page.evaluate('window.dispatchEvent(new Event("online"));window.dispatchEvent(new Event("mew:remote-reconnected"));document.dispatchEvent(new Event("visibilitychange"))')
  assert.equal(await page.evaluate('window.reads'), recoveryReads, 'recovery bursts do not cancel a newly opened read')
  await page.clock.runFor(60_000)
  await page.evaluate('window.obsolete=window.readRequests.at(-1);window.suspended=true;document.dispatchEvent(new Event("visibilitychange"));window.dispatchEvent(new Event("online"))')
  assert.equal(await page.evaluate('window.reads'), recoveryReads, 'intentional transport suspension preserves one waiting read')
  assert.equal(await page.evaluate('window.obsolete.signal.aborted'), false)
  const foregroundAt = await page.evaluate<number>('performance.now()')
  await page.evaluate('window.suspended=false;window.mode="ready";window.dispatchEvent(new Event("mew:remote-reconnected"));window.dispatchEvent(new Event("online"));document.dispatchEvent(new Event("visibilitychange"))')
  await page.waitForFunction(`window.reads===${recoveryReads + 1} && !window.commands.recovering`)
  assert.ok(await page.evaluate<number>('window.readRequests.at(-1).startedAt') - foregroundAt < 250, 'verified recovery immediately replaces a read that was hung for sixty seconds')
  assert.equal(await page.evaluate('window.obsolete.signal.aborted'), true)
  await page.evaluate('window.obsolete.finish({commands:[{id:"stale",startedAt:2}]})')
  assert.deepEqual(await page.evaluate('window.commands.records.map(record=>record.id)'), ['existing'], 'late canceled reads never replace verified records')
  await page.clock.runFor(1500)
  assert.equal(await page.evaluate('window.reads'), recoveryReads + 2, 'successful synchronization restores the normal polling interval')
  await page.evaluate('window.mode="pending"')
  await page.clock.runFor(1500)
  const resetReads = await page.evaluate<number>('window.reads')
  await page.evaluate('window.readRequests.at(-1).fail(new TypeError("Failed to fetch"))')
  await page.clock.runFor(0)
  await page.waitForFunction(`window.reads===${resetReads + 1}`)
  assert.equal(await page.evaluate('window.commands.recovering'), true, 'successful reads reset the immediate first retry')
  await page.evaluate('window.mode="permission";window.readRequests.at(-1).fail(new TypeError("Failed to fetch"))')
  await page.clock.runFor(250)
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
  await page.evaluate('window.mode="pending";window.commands.retryRefresh()')
  await page.waitForFunction('!!window.readRequests.at(-1).finish')
  await page.evaluate('window.previousScope=window.readRequests.at(-1);window.mode="ready";window.changeScope("another-session")')
  await page.waitForFunction('window.commands.records[0]?.id==="other"')
  await page.evaluate('window.changeScope("session")')
  await page.waitForFunction('window.commands.records[0]?.id==="existing" && !window.commands.error && !window.commands.recovering')
  assert.equal(await page.evaluate('window.previousScope.signal.aborted'), true, 'scope changes abort the previous request')
  await page.evaluate('window.previousScope.finish({commands:[{id:"stale-scope",startedAt:3}]})')
  assert.deepEqual(await page.evaluate('window.commands.records.map(record=>record.id)'), ['existing'], 'returning to an old scope cannot admit its obsolete response')
  await page.evaluate('window.rejectStart=true;window.commands.submit("tab","run once",0)')
  await page.waitForFunction('window.commands.error==="Command rejected"')
  assert.equal(await page.evaluate('window.commands.readFailed'), false, 'a failed operation remains distinct from polling failure')
  await page.clock.runFor(1500)
  assert.equal(await page.evaluate('window.commands.error'), 'Command rejected', 'a successful poll cannot hide an operation failure')
  assert.equal(await page.evaluate('window.starts.length'), 1, 'failed operations require an explicit user retry')
  await page.evaluate('window.rejectStart=false;window.commands.submit("tab","run once",0)')
  await page.waitForFunction('window.commands.records.length===2 && !window.commands.error')
  assert.equal(await page.evaluate('window.starts[0].id===window.starts[1].id'), true, 'an explicit retry reuses the idempotency key')
  const beforeHidden = await page.evaluate<number>('window.reads')
  await page.evaluate('window.fixtureHidden=true;Object.defineProperty(document,"visibilityState",{configurable:true,get:()=>window.fixtureHidden?"hidden":"visible"});document.dispatchEvent(new Event("visibilitychange"))')
  await page.clock.runFor(60_000)
  assert.equal(await page.evaluate('window.reads'), beforeHidden, 'hidden documents pause scheduled polling')
  await page.evaluate('window.fixtureHidden=false;window.dispatchEvent(new Event("pageshow"))')
  await page.waitForFunction(`window.reads===${beforeHidden + 1}`)
  const beforeOffline = await page.evaluate<number>('window.reads')
  await page.evaluate('window.fixtureOnline=false;Object.defineProperty(navigator,"onLine",{configurable:true,get:()=>window.fixtureOnline});window.dispatchEvent(new Event("offline"))')
  await page.clock.runFor(60_000)
  await page.evaluate('window.dispatchEvent(new Event("online"));window.dispatchEvent(new Event("pageshow"))')
  assert.equal(await page.evaluate('window.reads'), beforeOffline, 'an offline document neither polls nor treats an event as proof of network access')
  await page.evaluate('window.fixtureOnline=true;window.dispatchEvent(new Event("online"))')
  await page.waitForFunction(`window.reads===${beforeOffline + 1}`)
  await page.evaluate('window.mode="pending"')
  await page.clock.runFor(1500)
  const reads = await page.evaluate<number>('window.reads')
  await page.evaluate('window.unmount();window.dispatchEvent(new Event("online"));window.dispatchEvent(new Event("mew:remote-reconnected"));document.dispatchEvent(new Event("visibilitychange"))')
  await page.clock.runFor(60_000)
  assert.equal(await page.evaluate('window.reads'), reads, 'unmount cleans up polling')
  assert.equal(await page.evaluate('window.readRequests.at(-1).signal.aborted'), true, 'unmount cancels the pending request')
  assert.deepEqual(errors, [])
})
