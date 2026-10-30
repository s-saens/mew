import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'rolldown'
import { chromium } from 'playwright-core'
import { domBrowserExecutable } from './browser-dom-executable.ts'

test('mobile editor keyboard policy isolates panes and restores original hints on replacement, disable, and desktop resize', {
  skip: !domBrowserExecutable(), timeout: 20_000,
}, async t => {
  const hook = new URL('../src/hooks/use-mobile-editor-keyboard.ts', import.meta.url).pathname
  const source = `import React from 'react';import {createRoot} from 'react-dom/client';
import {useMobileEditorKeyboard} from ${JSON.stringify(hook)};
function Pane({id,enabled,version}){const ref=React.useRef(null);const show=useMobileEditorKeyboard(ref,enabled,'scope-'+version);
return <section ref={ref}><div key={version} data-editor={id} className="ProseMirror" contentEditable virtualkeyboardpolicy="auto" inputMode="decimal">Text in {id}</div>
<button data-mobile-editor-keyboard-button onPointerDown={e=>e.preventDefault()} onClick={show}>Open {id}</button></section>}
function Fixture(){const [state,setState]=React.useState({enabled:true,version:0,mounted:true});window.setFixture=values=>setState(old=>({...old,...values}));
return <>{state.mounted&&<><Pane id="first" {...state}/><Pane id="second" {...state}/></>}<button onClick={()=>window.outsideClicks++}>Outside</button></>}
createRoot(document.getElementById('root')).render(<React.StrictMode><Fixture/></React.StrictMode>);`
  const bundle = await build({ input: 'virtual:policy.tsx', write: false, platform: 'browser', output: { format: 'iife' },
    onwarn(warning, warn) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning) },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
    plugins: [{ name: 'fixture', resolveId(id) { if (id === 'virtual:policy.tsx') return id }, load(id) {
      if (id === 'virtual:policy.tsx') return source
      if (id.endsWith('.css')) return { code: '', moduleType: 'js' }
    } }],
  })
  const chunk = bundle.output.find(item => item.type === 'chunk')!
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true })
  page.setDefaultTimeout(3000)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(`window.shows=[];window.hides=0;window.outsideClicks=0;
Object.defineProperty(navigator,'virtualKeyboard',{value:{show(){window.shows.push(document.activeElement.dataset.editor)},hide(){window.hides++}}});`)
  await page.route('http://mew-editor-keyboard-policy.test/**', route => route.fulfill({ contentType: 'text/html',
    body: `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script>${chunk.code}</script>` }))
  await page.goto('http://mew-editor-keyboard-policy.test/')
  const first = page.locator('[data-editor="first"]'), second = page.locator('[data-editor="second"]')
  await first.waitFor()
  assert.equal(await first.getAttribute('inputmode'), 'none')
  await first.tap()
  assert.deepEqual(await page.evaluate('window.shows'), [])
  await page.getByRole('button', { name: 'Open first', exact: true }).tap()
  assert.equal(await first.getAttribute('inputmode'), 'decimal')
  assert.equal(await second.getAttribute('inputmode'), 'none')
  await page.getByRole('button', { name: 'Open second', exact: true }).tap()
  assert.equal(await first.getAttribute('inputmode'), 'none', 'another pane button dismisses the previous keyboard session')
  assert.equal(await second.getAttribute('inputmode'), 'decimal')
  assert.deepEqual(await page.evaluate('window.shows'), ['first', 'second'])
  assert.equal(await page.evaluate('window.hides'), 1)
  await page.getByRole('button', { name: 'Outside', exact: true }).tap()
  assert.equal(await second.getAttribute('inputmode'), 'none')
  assert.equal(await page.evaluate('window.hides'), 2)
  assert.equal(await page.evaluate('window.outsideClicks'), 1)
  const old = await first.elementHandle()
  await page.evaluate('window.setFixture({version:1})')
  await page.waitForFunction('document.querySelector("[data-editor=first]").getAttribute("inputmode") === "none"')
  assert.equal(await old!.getAttribute('virtualkeyboardpolicy'), 'auto', 'replaced editors recover their original policy')
  assert.equal(await old!.getAttribute('inputmode'), 'decimal')
  await old!.dispose()
  await page.evaluate('window.setFixture({enabled:false})')
  await page.waitForFunction('document.querySelector("[data-editor=first]").getAttribute("inputmode") === "decimal"')
  assert.equal(await first.getAttribute('virtualkeyboardpolicy'), 'auto')
  await page.evaluate('window.setFixture({enabled:true})')
  await page.waitForFunction('document.querySelector("[data-editor=first]").getAttribute("inputmode") === "none"')
  await page.setViewportSize({ width: 1280, height: 844 })
  await page.waitForFunction('document.querySelector("[data-editor=first]").getAttribute("inputmode") === "decimal"')
  assert.equal(await first.getAttribute('virtualkeyboardpolicy'), 'auto')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForFunction('document.querySelector("[data-editor=first]").getAttribute("inputmode") === "none"')
  await page.getByRole('button', { name: 'Open first', exact: true }).tap()
  const detached = await first.elementHandle()
  const hides = Number(await page.evaluate('window.hides'))
  await page.evaluate('window.setFixture({mounted:false})')
  await first.waitFor({ state: 'detached' })
  assert.equal(await detached!.getAttribute('inputmode'), 'decimal', 'unmount restores the original hint')
  assert.equal(await detached!.getAttribute('virtualkeyboardpolicy'), 'auto')
  assert.equal(await page.evaluate('window.hides'), hides + 1, 'unmount closes an authorized keyboard session')
  await detached!.dispose()
  assert.deepEqual(errors, [])
})
