import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { chromium } from 'playwright-core'
import { domBrowserExecutable } from './browser-dom-executable.ts'

const root = path.resolve(import.meta.dirname, '..')
test('Hotview pinch preserves source, selection, undo and the reading anchor', { skip: !domBrowserExecutable(), timeout: 60_000 }, async () => {
  const content = Array.from({ length: 600 }, (_, i) => `Paragraph ${i}: ${'Reading wrapped markdown content. '.repeat(5)}`).join('\n\n')
  const source = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {Editor} from ${JSON.stringify(path.join(root, 'packages/editor/src/Editor.tsx'))};
import {startWorkspacePinchZoom} from ${JSON.stringify(path.join(root, 'src/utils/workspace-pinch-zoom.ts'))};
startWorkspacePinchZoom();
function Fixture(){const [readOnly,setReadOnly]=React.useState(false);window.setReadOnly=setReadOnly;const [value,setValue]=React.useState(${JSON.stringify(content)});window.value=value;return <div style={{height:'100dvh'}}><Editor readOnly={readOnly} value={value} onChange={setValue} api={{}} path="pinch.md"/></div>}
const root=createRoot(document.getElementById('root'));window.unmount=()=>root.unmount();root.render(<Fixture/>);`
  const styles: string[] = []
  const bundle = await build({
    input: 'virtual:windowed-editor.tsx', write: false, platform: 'browser', output: { format: 'esm', codeSplitting: false },
    onwarn(warning,handler){if(warning.code!=='MODULE_LEVEL_DIRECTIVE')handler(warning)},
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('production') } },
    plugins: [{
      name: 'windowed-editor-fixture',
      resolveId(id) { if (id === 'virtual:windowed-editor.tsx') return id },
      async load(id) {
        if (id === 'virtual:windowed-editor.tsx') return source
        if (id.endsWith('.css')) { styles.push(await fs.readFile(id, 'utf8')); return { code: '', moduleType: 'js' } }
      },
    }],
  })
  const chunk = bundle.output.find(item => item.type === 'chunk')!
  const cssSources = await Promise.all(['packages/editor/src/Editor.tsx', 'packages/editor/src/editor/FrontmatterPanel.tsx'].map(file => fs.readFile(path.join(root, file), 'utf8')))
  const compiler = await compile(await fs.readFile(path.join(root, 'src/index.css'), 'utf8'), { base: path.join(root, 'src'), onDependency() {} })
  const css = compiler.build([...new Set((source + cssSources.join('\n')).match(/[A-Za-z0-9_@!:/.[\]()%,-]+/g))]) + styles.join('\n')
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
    await page.route('http://mew-pinch.test/**', route => route.fulfill(route.request().url().endsWith('/app.js')
      ? { contentType: 'text/javascript', body: chunk.code }
      : { contentType: 'text/html', body: `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,viewport-fit=cover,interactive-widget=resizes-content"><style>${css}</style><div id="root"></div><script type="module" src="/app.js"></script>` }))
    await page.goto('http://mew-pinch.test/')
    const editor = page.locator('.ProseMirror'), scroller = page.locator('.editor-root')
    await editor.waitFor()
    const initialDoc = await editor.evaluate(el=>(el as any).editor.state.doc.toJSON())
    await editor.click(); await page.keyboard.press('Control+Home'); await page.keyboard.type('typed ')
    await page.waitForFunction('window.value.startsWith("typed ")')
    await editor.evaluate(el => { const ed=(el as any).editor; ed.commands.setTextSelection({from:2,to:8}) })
    await scroller.evaluate(el => { el.scrollTop=4000 })
    await page.waitForTimeout(120)
    const before = await editor.evaluate(el => { const ed=(el as any).editor; return {doc:ed.state.doc.toJSON(),selection:ed.state.selection.toJSON()} })
    const size = () => editor.evaluate(el => parseFloat(el.ownerDocument.defaultView!.getComputedStyle(el).fontSize))
    const emit = (type:string,distance:number,count=2) => editor.evaluate((el,{type,distance,count}) => {
      const win=el.ownerDocument.defaultView as any
      const touches=Array.from({length:count},(_,i)=>new win.Touch({identifier:i,target:el,clientX:190,clientY:350+(i?1:-1)*distance/2}))
      const event=new win.TouchEvent(type,{bubbles:true,cancelable:true,touches,changedTouches:touches})
      el.dispatchEvent(event); return event.defaultPrevented
    },{type,distance,count})
    const anchor=await editor.evaluate(el=>{ const view=(el as any).editor.view; const pos=view.posAtCoords({left:190,top:350}).pos;return {pos,top:view.coordsAtPos(pos).top} })
    const scale = await editor.evaluate(el=>el.ownerDocument.defaultView!.visualViewport!.scale)
    const cdp = await page.context().newCDPSession(page)
    const points=(distance:number)=>[{x:190,y:350-distance/2,id:1},{x:190,y:350+distance/2,id:2}]
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points(100)})
    for(const distance of [110,125,140,150]) {await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:points(distance)});await page.waitForTimeout(20)}
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
    await page.waitForTimeout(150)
    await emit('touchend',0,0)
    assert.ok(await size()>20,'trusted pinch changes the document font')
    assert.equal(await editor.evaluate(el=>el.ownerDocument.defaultView!.visualViewport!.scale),scale)
    const afterTop=await editor.evaluate((el,pos)=>(el as any).editor.view.coordsAtPos(pos).top,anchor.pos)
    assert.ok(Math.abs(afterTop-anchor.top)<40,`reading anchor drift: ${afterTop-anchor.top}; anchor ${JSON.stringify(anchor)}; scroll ${await scroller.evaluate(el=>el.scrollTop)}`)
    assert.deepEqual(await editor.evaluate(el=>{const ed=(el as any).editor;return {doc:ed.state.doc.toJSON(),selection:ed.state.selection.toJSON()}}),before)
    const panTop=await scroller.evaluate(el=>el.scrollTop)
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:190,y:600,id:1}]})
    for(let i=1;i<=6;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:190,y:600-i*25,id:1}]});await page.waitForTimeout(20)}
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
    await page.waitForFunction(`document.querySelector('.editor-root').scrollTop>${panTop+40}`)
    await scroller.evaluate((el,top)=>{el.scrollTop=top},panTop)
    await page.waitForTimeout(100)
    await emit('touchstart',100);await emit('touchmove',10000);await emit('touchend',0,0)
    assert.equal(await size(),40)
    await emit('touchstart',1000);await emit('touchmove',1);await emit('touchend',0,0)
    assert.equal(await size(),8)
    await emit('touchstart',100)
    assert.equal(await emit('touchend',100,1),true)
    assert.equal(await emit('touchmove',100,1),true)
    await emit('touchend',0,0)
    assert.equal(await emit('touchstart',100,1),false)
    await emit('touchend',0,0)
    await emit('touchstart',100);await emit('touchcancel',0,0)
    const cancelledSize=await size()
    await emit('touchmove',150)
    assert.equal(await size(),cancelledSize)
    await editor.press('Control+z')
    assert.deepEqual(await editor.evaluate(el=>(el as any).editor.state.doc.toJSON()),initialDoc,'zoom never enters undo history')
    await page.evaluate('window.setReadOnly(true)')
    await page.waitForFunction('document.querySelector(".ProseMirror").contentEditable==="false"')
    await emit('touchstart',100);await emit('touchmove',150);await emit('touchend',0,0)
    assert.ok(await size()>8,'read-only Markdown retains custom pinch')
    await editor.evaluate(el=>{const win=el.ownerDocument.defaultView as any;win.detachedEditor=el;win.detachedScroller=el.closest('.editor-root')})
    await page.evaluate('window.unmount()')
    assert.equal(await page.evaluate(`(()=>{const el=window.detachedEditor;const touches=[0,1].map(i=>new Touch({identifier:i,target:el,clientX:190,clientY:300+i*100}));const event=new TouchEvent('touchstart',{bubbles:true,cancelable:true,touches});el.dispatchEvent(event);return event.defaultPrevented})()`),false,'unmount removes pinch listeners')
    assert.equal(await page.evaluate('window.detachedScroller.style.getPropertyValue("--mew-markdown-zoom-size")'),'','cleanup restores local styles')
    await cdp.detach()
  } finally { await browser.close() }
})
