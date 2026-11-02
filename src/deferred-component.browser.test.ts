import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { build } from 'rolldown'
import { chromium } from 'playwright-core'
import { domBrowserExecutable } from '../server/browser-dom-executable.ts'

test('state-prepared tools render current props before React lazy retries and retain cancellation and error boundaries', { skip: !domBrowserExecutable(), timeout: 20_000 }, async t => {
  const component = path.resolve(import.meta.dirname, 'components/deferred-component.tsx')
  const source = `import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {deferredComponent} from ${JSON.stringify(component)};
let resolve,reject;const pending=new Promise((yes,no)=>{resolve=yes;reject=no});
const load=()=>pending;
const Lazy=deferredComponent(load,<div data-lazy-pending/>);
const Prepared=deferredComponent(load,<div data-preparing/>,{suspend:false});
class Boundary extends React.Component{state={failed:false};static getDerivedStateFromError(){return {failed:true}};render(){return this.state.failed?<div role="alert">Module failed</div>:this.props.children}}
function Fixture(){const [label,setLabel]=useState('first'),[mounted,setMounted]=useState(true);window.changeLabel=setLabel;window.unmountPrepared=()=>setMounted(false);return <Boundary>{mounted?<Prepared side="prepared" label={label}/>:<div data-unmounted/>}</Boundary>}
window.finishModule=()=>resolve({default:({side,label})=><button data-tool={side}>{label}</button>});
window.failModule=()=>reject(new Error('module unavailable'));
if(!location.search)createRoot(document.getElementById('baseline')).render(<Lazy side="baseline" label="baseline"/>);
createRoot(document.getElementById('root')).render(<Fixture/>);`
  const bundle = await build({ input: 'virtual:prepared.tsx', write: false, platform: 'browser', transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': '"production"' } }, output: { format: 'iife', minify: true }, plugins: [{
    name: 'prepared-tool-fixture',
    resolveId(id) { if (id === 'virtual:prepared.tsx') return id; if (id.endsWith('/startup-screen') || id.endsWith('/startup-screen.tsx')) return 'virtual:loading.tsx' },
    load(id) { if (id === 'virtual:prepared.tsx') return source; if (id === 'virtual:loading.tsx') return 'export function PanelLoading(){return <div data-panel-loading/>}' },
  }] })
  const code = bundle.output.find(item => item.type === 'chunk')!.code
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  t.after(() => browser.close())
  async function fixture(query = '') {
    const page = await browser.newPage(), errors: string[] = []
    page.setDefaultTimeout(5000)
    page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(() => {
      const nativeSet = window.setTimeout, nativeClear = window.clearTimeout
      let next = 1_000_000
      const held = new Map<number, { callback: TimerHandler; args: unknown[] }>()
      Object.assign(window, { heldRetries: [] as number[], releaseRetries() { for (const [id, value] of held) { held.delete(id); if (typeof value.callback === 'function') Reflect.apply(value.callback, window, value.args) } } })
      window.setTimeout = (callback: TimerHandler, delay = 0, ...args: unknown[]) => {
        if (typeof callback === 'function' && callback.name.startsWith('bound ') && delay > 10 && delay <= 300) {
          const id = next++; held.set(id, { callback, args }); (window as unknown as { heldRetries: number[] }).heldRetries.push(delay); return id
        }
        return nativeSet(callback, delay, ...args)
      }
      window.clearTimeout = id => { if (!held.delete(Number(id))) nativeClear(id) }
    })
    await page.route('http://mew-prepared.test/**', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><div id="baseline"></div><div id="root"></div><script>${code}</script>` }))
    await page.goto('http://mew-prepared.test/' + query)
    await page.locator('[data-preparing]').waitFor({ state: 'attached' })
    return { page, errors }
  }
  const ready = await fixture()
  try {
    await ready.page.locator('[data-lazy-pending]').waitFor({ state: 'attached' })
    await ready.page.evaluate('window.changeLabel("current");window.finishModule()')
    await ready.page.locator('[data-tool="prepared"]').waitFor()
    assert.equal(await ready.page.locator('[data-tool="prepared"]').innerText(), 'current')
    await ready.page.waitForFunction('window.heldRetries.length>0')
    assert.equal(await ready.page.locator('[data-tool="baseline"]').count(), 0, 'the control still waits for the actual React lazy retry')
    await ready.page.evaluate('window.releaseRetries()')
    await ready.page.locator('[data-tool="baseline"]').waitFor()
    assert.deepEqual(ready.errors, [])
  } finally { await ready.page.close() }
  for (const mode of ['cancel', 'error']) {
    const current = await fixture('?' + mode)
    try {
      if (mode === 'cancel') {
        await current.page.evaluate('window.unmountPrepared()')
        await current.page.locator('[data-unmounted]').waitFor({ state: 'attached' })
        await current.page.evaluate('window.finishModule()')
        assert.equal(await current.page.locator('[data-tool]').count(), 0)
      } else {
        await current.page.evaluate('window.failModule()')
        await current.page.getByRole('alert').waitFor()
      }
      assert.deepEqual(current.errors, [])
    } finally { await current.page.close() }
  }
})
