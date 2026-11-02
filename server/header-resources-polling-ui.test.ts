import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { build } from 'rolldown'
import { chromium, type Page } from 'playwright-core'
import { domBrowserExecutable } from './browser-dom-executable.ts'

const root = path.resolve(import.meta.dirname, '..')

type SampleRequest = { url: string; completed: boolean; aborted: boolean }

test('resource summaries limit header polling while retaining away notifications and request cancellation', { skip: !domBrowserExecutable(), timeout: 60_000 }, async t => {
  // In-memory browser fixture only: no application server or dist changes.
  const source = `
import React from '${root}/node_modules/react/index.js';
import {createRoot} from '${root}/node_modules/react-dom/client.js';
import {flushSync} from '${root}/node_modules/react-dom/index.js';
import {I18nProvider} from '${root}/src/i18n.tsx';
import {HeaderResources} from '${root}/src/components/header-resources.tsx';
import {useMewcatNotifications} from '${root}/src/hooks/use-mewcat-notifications.ts';
import {fetchSystemStats} from '${root}/src/api/client.ts';
import {configureAppRuntime} from '${root}/src/runtime/app-runtime.ts';
const requests=[],timeouts=[],releases=[];
let hold=false,hidden=false;
const element=document.getElementById('root');
Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>hidden?'hidden':'visible'});
// Drive timeout cancellation with the same controllable browser clock as polling.
AbortSignal.timeout=ms=>{timeouts.push(ms);const controller=new AbortController();setTimeout(()=>controller.abort(new DOMException('Timed out','TimeoutError')),ms);return controller.signal;};
const stats={cpu:{usage:12,cores:8,model:'Fixture CPU',temperature:null,loadavg:[0,0,0]},memory:{used:1000,total:2000,available:1000},gpus:[],processes:[],hostname:'polling-fixture',uptime:60};
configureAppRuntime({transport:{close(){},socket(){throw Error('Unexpected socket')},fetch(input,init){
  const request={url:String(input),completed:false,aborted:false};
  requests.push(request);element.dataset.requests=String(requests.length);
  return new Promise((resolve,reject)=>{
    const signal=init?.signal;
    const abort=()=>{if(request.completed)return;request.aborted=true;request.completed=true;reject(signal.reason);};
    const complete=()=>{if(request.completed)return;request.completed=true;signal?.removeEventListener('abort',abort);resolve(new Response(JSON.stringify(stats),{headers:{'Content-Type':'application/json'}}));};
    signal?.addEventListener('abort',abort,{once:true});
    if(signal?.aborted)abort();else if(hold)releases.push(complete);else complete();
  });
}}});
function Notifications(){useMewcatNotifications(true,'fixture-owner');return <span data-notifications/>;}
const app=createRoot(element);
window.fixture={requests,timeouts,
  mount(mode){flushSync(()=>app.render(<I18nProvider>{mode==='header'?<HeaderResources onOpen={()=>{}}/>:<Notifications/>}</I18nProvider>));},
  unmount(){flushSync(()=>app.render(null));},
  hold(value){hold=value;},
  release(){releases.splice(0).forEach(complete=>complete());},
  visibility(value){hidden=value;document.dispatchEvent(new Event('visibilitychange'));},
  query(options){return fetchSystemStats(undefined,options);}
};`
  const bundle = await build({
    input: 'virtual:resource-polling.tsx', write: false, platform: 'browser',
    output: { format: 'iife', codeSplitting: false },
    onLog(level, log, handler) { if (log.code !== 'MODULE_LEVEL_DIRECTIVE') handler(level, log) },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
    plugins: [{
      name: 'resource-polling-fixture',
      resolveId(id) { if (id === 'virtual:resource-polling.tsx') return id; if (id.endsWith('.css')) return 'virtual:style' },
      load(id) { if (id === 'virtual:resource-polling.tsx') return source; if (id === 'virtual:style') return '' },
    }],
  })
  const chunk = bundle.output.find(item => item.type === 'chunk')
  assert.ok(chunk && chunk.type === 'chunk')
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  const errors: string[] = []
  const pages: Page[] = []
  const open = async () => {
    const page = await browser.newPage()
    pages.push(page)
    page.setDefaultTimeout(5000)
    page.on('pageerror', error => errors.push(error.message))
    await page.route('http://resource-polling.test/**', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><div id="root" data-requests="0"></div><script>${chunk.code}</script>` }))
    await page.clock.install()
    await page.clock.pauseAt(new Date(Date.now() + 1000))
    await page.goto('http://resource-polling.test/')
    return page
  }
  const requests = async (page: Page) => await page.evaluate('window.fixture.requests') as SampleRequest[]
  const waitForCount = async (page: Page, count: number) => { await page.locator(`#root[data-requests="${count}"]`).waitFor({ state: 'attached' }) }
  try {
    await t.test('only an explicit summary request omits processes', async () => {
      const page = await open()
      await page.evaluate('window.fixture.query()')
      await page.evaluate('window.fixture.query({})')
      await page.evaluate('window.fixture.query({processes:true})')
      await page.evaluate('window.fixture.query({processes:false})')
      assert.deepEqual((await requests(page)).map(request => request.url), ['/api/system-stats', '/api/system-stats', '/api/system-stats', '/api/system-stats?processes=0'])
    })
    await t.test('header polls every two seconds and refreshes immediately after returning to a visible document', async () => {
      const page = await open()
      await page.evaluate("window.fixture.mount('header')")
      await page.locator('button[data-tip*="CPU 12%"]').waitFor()
      await page.clock.runFor(1999)
      assert.equal((await requests(page)).length, 1)
      await page.clock.runFor(1)
      await waitForCount(page, 2)
      await page.evaluate('window.fixture.visibility(true)')
      await page.clock.runFor(10_000)
      assert.equal((await requests(page)).length, 2, 'hidden headers issue no new requests')
      await page.evaluate('window.fixture.visibility(false)')
      await waitForCount(page, 3)
      assert.ok((await requests(page)).every(request => request.url === '/api/system-stats?processes=0'))
      await page.evaluate('window.fixture.unmount()')
      await page.clock.runFor(4000)
      await page.evaluate('window.fixture.visibility(false)')
      assert.equal((await requests(page)).length, 3, 'unmount removes the timer and visibility listener')
    })
    await t.test('a hidden initial header waits until visible', async () => {
      const page = await open()
      await page.evaluate("window.fixture.visibility(true);window.fixture.mount('header')")
      await page.clock.runFor(6000)
      assert.equal((await requests(page)).length, 0)
      await page.evaluate('window.fixture.visibility(false)')
      await waitForCount(page, 1)
    })
    await t.test('header requests cannot overlap and abort on timeout or unmount', async () => {
      const page = await open()
      await page.evaluate("window.fixture.hold(true);window.fixture.mount('header')")
      await waitForCount(page, 1)
      await page.clock.runFor(6000)
      await page.evaluate('window.fixture.visibility(true);window.fixture.visibility(false)')
      assert.equal((await requests(page)).length, 1, 'interval and visibility events cannot overlap an existing request')
      await page.clock.runFor(4000)
      assert.equal((await requests(page))[0]!.aborted, true, 'a stalled request is canceled at ten seconds')
      await page.clock.runFor(2000)
      await waitForCount(page, 2)
      assert.deepEqual(await page.evaluate('window.fixture.timeouts'), [10_000, 10_000])
      await page.evaluate('window.fixture.unmount()')
      assert.equal((await requests(page))[1]!.aborted, true, 'unmount aborts the active request')
      await page.clock.runFor(6000)
      assert.equal((await requests(page)).length, 2)
    })
    await t.test('away notifications use summaries fifteen seconds after completion and abort on cleanup', async () => {
      const page = await open()
      await page.evaluate("window.fixture.visibility(true);window.fixture.hold(true);window.fixture.mount('notifications')")
      await waitForCount(page, 1)
      await page.clock.runFor(5000)
      assert.equal((await requests(page)).length, 1)
      await page.evaluate('window.fixture.release()')
      await page.clock.runFor(14_999)
      assert.equal((await requests(page)).length, 1, 'notification cadence starts after the previous sample finishes')
      await page.clock.runFor(1)
      await waitForCount(page, 2)
      assert.ok((await requests(page)).every(request => request.url === '/api/system-stats?processes=0'))
      await page.evaluate('window.fixture.unmount()')
      assert.equal((await requests(page))[1]!.aborted, true)
      await page.clock.runFor(30_000)
      assert.equal((await requests(page)).length, 2)
    })
    assert.deepEqual(errors, [])
  } finally {
    await Promise.all(pages.map(page => page.close()))
    await browser.close()
  }
})
