import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { build } from 'rolldown'
import { chromium } from 'playwright-core'
import { domBrowserExecutable } from './browser-dom-executable.ts'

test('command status reads bound fetch and JSON time, cancel obsolete requests and pause during transport suspension', { skip: !domBrowserExecutable(), timeout: 15_000 }, async t => {
  const root = path.resolve(import.meta.dirname, '..')
  const source = `
import {listAgentCommands} from '${root}/src/api/agent-commands.ts';
window.requests=[];window.mode='ready';window.suspended=false;window.responseStatus=200;
window.fetchCommands=async(path,init)=>{const request={path,signal:init.signal},mode=window.mode,status=window.responseStatus;window.requests.push(request);if(mode==='fetch-hang')return new Promise(resolve=>request.finish=resolve);if(mode==='body-hang')await new Promise(resolve=>setTimeout(resolve,2000));return {ok:status>=200&&status<300,status,json:()=>mode==='malformed'?Promise.reject(new SyntaxError('Invalid command JSON')):['body-hang','status-body-hang'].includes(mode)?new Promise(resolve=>request.finish=resolve):Promise.resolve({commands:[]})}};
window.readAborted=signal=>listAgentCommands({runtime:'codex',cwd:'/workspace',sessionId:'session'},signal);
window.read=()=>{window.controller=new AbortController();window.result=null;window.pending=window.readAborted(window.controller.signal).then(value=>window.result={ok:true,value},error=>window.result={ok:false,name:error.name,...(error.status!==undefined?{status:error.status}:{})});};`
  const bundle = await build({ input: 'virtual:command-read.ts', write: false, platform: 'browser', output: { format: 'iife', codeSplitting: false }, transform: { define: { 'process.env.NODE_ENV': JSON.stringify('test') } }, plugins: [{
    name: 'fixture', resolveId(id, importer) {
      if (id === 'virtual:command-read.ts') return id
      if (id === '../utils/remote-transport.ts' && importer?.endsWith('/api/agent-commands.ts')) return 'virtual:transport'
    }, load(id) {
      if (id === 'virtual:command-read.ts') return source
      if (id === 'virtual:transport') return 'export const mewFetch=(...args)=>window.fetchCommands(...args);export const isMewTransportSuspended=()=>window.suspended'
    },
  }] })
  const code = bundle.output.find(item => item.type === 'chunk')!.code
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  t.after(() => browser.close())
  const page = await browser.newPage(), errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.clock.install({ time: new Date('2030-01-01T00:00:00Z') })
  await page.clock.pauseAt(new Date('2030-01-01T00:00:01Z'))
  await page.route('https://command-read.test/**', route => route.fulfill({ contentType: 'text/html', body: `<meta charset="utf-8"><script>${code}</script>` }))
  await page.goto('https://command-read.test/')
  for (const mode of ['fetch-hang', 'body-hang']) {
    await page.evaluate(mode => { (globalThis as unknown as { mode: string; read(): void }).mode = mode; (globalThis as unknown as { read(): void }).read() }, mode)
    await page.clock.runFor(4999)
    assert.equal(await page.evaluate('window.result'), null, `${mode} retains the full five-second read allowance`)
    await page.clock.runFor(1)
    await page.waitForFunction('window.result?.name==="TimeoutError"')
    assert.equal(await page.evaluate('window.requests.at(-1).signal.aborted'), true, `${mode} aborts the transport as well as bounding an uncooperative promise`)
    await page.evaluate('window.requests.at(-1).finish({ok:true,json:async()=>({commands:[{id:"late"}]})})')
    assert.deepEqual(await page.evaluate('window.result'), { ok: false, name: 'TimeoutError' }, 'a late response cannot turn a timed-out read into success')
  }
  for (const status of [401, 403, 404, 408, 429, 500, 503]) {
    await page.evaluate(status => {
      const state = globalThis as unknown as { mode: string; responseStatus: number; read(): void }
      state.mode = 'status-body-hang'
      state.responseStatus = status
      state.read()
    }, status)
    await page.waitForFunction('!!window.requests.at(-1).finish')
    await page.clock.runFor(4999)
    assert.equal(await page.evaluate('window.result'), null, `HTTP ${status} preserves the bounded diagnostic-body allowance`)
    await page.clock.runFor(1)
    await page.waitForFunction('window.result?.name==="TimeoutError"')
    const expected = status < 500 && status !== 408 && status !== 429
      ? { ok: false, name: 'TimeoutError', status }
      : { ok: false, name: 'TimeoutError' }
    assert.deepEqual(await page.evaluate('window.result'), expected, `HTTP ${status} retains only permanent failure classification when its body hangs`)
    assert.equal(await page.evaluate('window.requests.at(-1).signal.aborted'), true)
    await page.evaluate('window.requests.at(-1).finish({error:"late diagnostic body"})')
    assert.deepEqual(await page.evaluate('window.result'), expected, 'late error diagnostics cannot change a completed timeout')
  }
  await page.evaluate('window.responseStatus=403;window.read()')
  await page.waitForFunction('!!window.requests.at(-1).finish')
  await page.evaluate('window.controller.abort()')
  await page.waitForFunction('window.result?.name==="AbortError"')
  assert.deepEqual(await page.evaluate('window.result'), { ok: false, name: 'AbortError' }, 'explicit caller cancellation is not relabeled as a known permission failure')
  await page.evaluate('window.responseStatus=200;window.mode="malformed";window.read()')
  await page.waitForFunction('window.result?.name==="SyntaxError"')
  assert.deepEqual(await page.evaluate('window.result'), { ok: false, name: 'SyntaxError' }, 'successful malformed JSON retains its permanent parse-error classification')
  await page.evaluate('window.mode="fetch-hang";window.read();window.controller.abort()')
  await page.waitForFunction('window.result?.name==="AbortError"')
  await page.clock.runFor(60_000)
  assert.equal(await page.evaluate('window.result.name'), 'AbortError', 'caller cancellation removes the later deadline')
  const requests = await page.evaluate<number>('window.requests.length')
  await page.evaluate('window.suspended=true;window.read()')
  await page.clock.runFor(60_000)
  assert.equal(await page.evaluate('window.requests.length'), requests + 1, 'suspension preserves one safe read instead of consuming retry attempts')
  assert.equal(await page.evaluate('window.result'), null)
  assert.equal(await page.evaluate('window.requests.at(-1).signal.aborted'), false)
  await page.evaluate('window.suspended=false;window.requests.at(-1).finish({ok:true,json:async()=>({commands:[]})})')
  await page.waitForFunction('window.result?.ok')
  await page.clock.runFor(10_000)
  assert.equal(await page.evaluate('window.requests.at(-1).signal.aborted'), false, 'successful reads clean up their deadline')
  const beforeCanceled = await page.evaluate<number>('window.requests.length')
  assert.equal(await page.evaluate(`(async()=>{const controller=new AbortController();controller.abort();try{await window.readAborted(controller.signal)}catch(error){return error.name}})()`), 'AbortError')
  assert.equal(await page.evaluate('window.requests.length'), beforeCanceled, 'an already canceled read sends no request')
  assert.deepEqual(errors, [])
})
