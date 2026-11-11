import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'rolldown'
import path from 'node:path'
import { connectTestBrowser } from './test-browser.ts'

const root = path.resolve(import.meta.dirname, '..')

test('stationary Mewpet bubbles stop measuring and still follow movement, content and viewport changes', { timeout: 30_000 }, async t => {
  const source = `
import React,{useRef} from '${root}/node_modules/react/index.js';
import {createRoot} from '${root}/node_modules/react-dom/client.js';
import {useMewcatBubble} from '${root}/src/hooks/use-mewcat-bubble.ts';
window.reads=0;
function Fixture(){
 const anchor=useRef(null), bubble=useMewcatBubble(anchor,true,260);
 return <><div id="cat" ref={anchor} style={{position:'fixed',width:64,height:64,transform:'translate(400px, 500px)'}}/>
 <aside id="bubble" ref={bubble} style={{position:'fixed'}}><div id="content" style={{height:80}}>Notice</div></aside></>;
}
const original=Element.prototype.getBoundingClientRect;
Element.prototype.getBoundingClientRect=function(){if(this.id==='cat')window.reads++;return original.call(this)};
createRoot(document.getElementById('root')).render(<Fixture/>);`
  const bundle = await build({ input: 'virtual:rendering.tsx', write: false, platform: 'browser', output: { format: 'iife', codeSplitting: false }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } }, plugins: [{ name: 'fixture', resolveId(id) { if (id === 'virtual:rendering.tsx') return id }, load(id) { if (id === 'virtual:rendering.tsx') return source } }] })
  const chunk = bundle.output.find(item => item.type === 'chunk')!
  const browser = await connectTestBrowser()
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } })
  await page.route('http://rendering.test/**', route => route.fulfill({ contentType: 'text/html', body: `<div id="root"></div><script>${chunk.code}</script>` }))
  await page.goto('http://rendering.test/')
  await page.waitForFunction("document.querySelector('#bubble')?.style.visibility === 'visible'")
  await page.waitForTimeout(100)
  await page.evaluate('window.reads=0')
  await page.waitForTimeout(200)
  assert.equal(await page.evaluate('window.reads'), 0, 'idle frames perform no anchor geometry reads')
  const before = await page.locator('#bubble').boundingBox()
  await page.locator('#cat').evaluate(el => { el.setAttribute('style', 'position:fixed;width:64px;height:64px;transform:translate(500px, 500px)') })
  await page.waitForFunction(`document.querySelector('#bubble').style.left === '${before!.x + 100}px'`)
  const top = await page.locator('#bubble').evaluate(el => el.getBoundingClientRect().top)
  await page.locator('#content').evaluate(el => { el.setAttribute('style', 'height:160px') })
  await page.waitForFunction(`document.querySelector('#bubble').getBoundingClientRect().top < ${top - 50}`)
  await page.setViewportSize({ width: 400, height: 700 })
  await page.waitForFunction('document.querySelector("#bubble").getBoundingClientRect().right <= 388')
  await page.evaluate('window.reads=0')
  await page.waitForTimeout(100)
  await page.evaluate('window.reads=0')
  await page.waitForTimeout(200)
  assert.equal(await page.evaluate('window.reads'), 0, 'resize settles without a measurement loop')
})
