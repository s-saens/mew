import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'rolldown'
import { domBrowserExecutable } from '../../server/browser-dom-executable.ts'
import { connectTestBrowser } from '../../server/test-browser.ts'

test('native browser video negotiates, maps input, releases keys, resizes and requires explicit reconnect', { skip: !domBrowserExecutable(), timeout: 35_000 }, async t => {
  const result = await build({ input: 'virtual:browser-desktop-fixture.tsx', logLevel: 'silent', write: false, platform: 'browser', output: { format: 'esm' }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('production') } }, plugins: [{
    name: 'isolated-browser-desktop',
    resolveId(id) {
      if (id.startsWith('virtual:')) return id
      if (id.endsWith('/remote-transport')) return 'virtual:transport'
      if (id.endsWith('/DockWorkspace')) return 'virtual:dock.tsx'
      if (id.endsWith('.css')) return 'virtual:style'
    },
    load(id) {
      if (id === 'virtual:style') return ''
      if (id === 'virtual:dock.tsx') return 'export function DockGrip(){return <span/>}'
      if (id === 'virtual:transport') return 'export function openMewSocket(url){return new window.BrowserSocket(url)};export async function mewFetch(){return new Response(JSON.stringify({ports:[{port:3333,kind:"app",title:"Fixture app"},{port:5000,kind:"mew"}]}),{headers:{"content-type":"application/json"}})}'
      if (id === 'virtual:browser-desktop-fixture.tsx') return `
        import React from ${JSON.stringify(import.meta.resolve('react'))};
        import {createRoot} from ${JSON.stringify(import.meta.resolve('react-dom/client'))};
        import {setUiLocale} from ${JSON.stringify(import.meta.resolve('@mew/ui/i18n-core'))};
        import {BrowserDesktopPanel} from ${JSON.stringify(new URL('./BrowserDesktopPanel.tsx', import.meta.url).pathname)};
        setUiLocale('en');
        window.signals=[];window.inputs=[];window.sockets=[];window.peers=[];window.localRequests=[];window.answers=[];
        window.addEventListener('mew:open-local-browser',event=>window.localRequests.push(event.detail.url));
        window.BrowserSocket=class {readyState=0;send(value){window.signals.push(JSON.parse(value))}close(){this.readyState=3}constructor(url){this.url=url;window.sockets.push(this);queueMicrotask(()=>{this.readyState=1;this.onopen?.()})}receive(value){this.onmessage?.({data:JSON.stringify(value)})}};
        class Channel {readyState='open';bufferedAmount=0;constructor(label){this.label=label;if(label==='control')window.latestControl=this}send(value){window.inputs.push({channel:this.label,...JSON.parse(value)})}close(){this.readyState='closed'}};
        window.RTCPeerConnection=class {connectionState='new';remoteDescription=null;localDescription=null;receivers=[];constructor(options){this.options=options;window.peers.push(this)}async setRemoteDescription(value){this.remoteDescription=value;window.answers.push('remote');this.ondatachannel?.({channel:new Channel('control')});this.ondatachannel?.({channel:new Channel('motion')});}async addIceCandidate(value){window.answers.push(value.candidate)}async createAnswer(){return {type:'answer',sdp:'fixture-answer'}}async setLocalDescription(value){this.localDescription=value}async getStats(){return new Map()}getReceivers(){return this.receivers}close(){this.connectionState='closed'}play(){const canvas=document.createElement('canvas');canvas.width=800;canvas.height=400;const ctx=canvas.getContext('2d');ctx.fillStyle='#345678';ctx.fillRect(0,0,800,400);const stream=canvas.captureStream(30);this.receivers=[{track:stream.getVideoTracks()[0]}];window.lastReceiver={jitterBufferTarget:50};this.ontrack?.({streams:[stream],track:stream.getVideoTracks()[0],receiver:window.lastReceiver});window.activeCanvas=canvas;window.canvasFrame=setInterval(()=>{ctx.fillRect(0,0,800,400)},30)}};
        function Fixture(){const [open,setOpen]=React.useState(true),[nativeAllowed,setNativeAllowed]=React.useState(false);window.setNativeAllowed=setNativeAllowed;return <div style={{height:'100vh',width:'100vw'}}>{open&&<BrowserDesktopPanel url="" nativeAllowed={nativeAllowed} onClose={()=>setOpen(false)}/>}</div>}
        createRoot(document.getElementById('root')).render(<Fixture/>);`
    },
  }] })
  const scripts = new Map(result.output.filter(chunk => chunk.type === 'chunk').map(chunk => [`/${chunk.fileName}`, chunk.code]))
  const entry = result.output.find(chunk => chunk.type === 'chunk' && chunk.isEntry)!
  const browser = await connectTestBrowser()
  t.after(() => browser.close())
  const context = await browser.newContext({ viewport: { width: 1100, height: 820 }, hasTouch: true })
  const page = await context.newPage()
  page.setDefaultTimeout(4000)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => { localStorage.setItem('mew:locale', 'en') })
  await page.route('https://browser-desktop.test/**', route => {
    const script = scripts.get(new URL(route.request().url()).pathname)
    return route.fulfill(script !== undefined ? { contentType: 'text/javascript', body: script } : { contentType: 'text/html', body: `<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0}*{box-sizing:border-box}.flex{display:flex}.flex-col{flex-direction:column}.flex-1{flex:1}.h-full{height:100%}.w-full{width:100%}.min-h-0{min-height:0}.shrink-0{flex-shrink:0}.relative{position:relative}.absolute{position:absolute}.inset-0{inset:0}.object-contain{object-fit:contain}header{height:32px;gap:4px}header button{width:28px;height:28px}form{display:flex;height:40px}video{pointer-events:none;width:100%;height:100%}textarea{position:absolute;left:0;bottom:0;width:1px;height:1px;opacity:0}[data-browser-desktop]{background:black;overflow:hidden;touch-action:none}span.flex-1{flex:1}</style><div id="root"></div><script type="module" src="/${entry.fileName}"></script></html>` })
  })
  await page.goto('https://browser-desktop.test/')
  await page.getByRole('button', { name: /Fixture app.*3333/ }).waitFor()
  assert.equal(await page.evaluate('window.sockets.length'), 0, 'the port list does not start a native display')
  await page.getByRole('button', { name: /Fixture app.*3333/ }).click()
  assert.deepEqual(await page.evaluate('window.localRequests'), ['http://localhost:3333/'])
  assert.equal(await page.evaluate('window.sockets.length'), 0, 'local ports use the existing new-tab route')
  await page.getByRole('textbox', { name: 'Browser address', exact: true }).fill('https://example.test/')
  await page.getByRole('button', { name: 'Go', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'Permission denied' }).waitFor()
  assert.equal(await page.evaluate('window.sockets.length'), 0, 'localhost preview permission does not create native Chrome authority')
  await page.evaluate('window.setNativeAllowed(true)')
  await page.getByRole('button', { name: 'Go', exact: true }).click()
  await page.waitForFunction('window.signals.some(value=>value.type==="open")')
  assert.equal(await page.evaluate('window.sockets[0].url'), 'wss://browser-desktop.test/api/browser-desktop/ws')
  assert.equal(await page.evaluate('window.signals.find(value=>value.type==="open").url'), 'https://example.test/')
  await page.evaluate(`window.sockets[0].receive({type:'ready',width:800,height:400});window.sockets[0].receive({type:'candidate',negotiation:4,candidate:{candidate:'early-ice'}});window.sockets[0].receive({type:'offer',negotiation:4,sdp:'fixture-offer'})`)
  await page.waitForFunction('window.signals.some(value=>value.type==="answer")')
  assert.deepEqual(await page.evaluate('window.answers'), ['remote', 'early-ice'])
  assert.equal(await page.evaluate('window.signals.find(value=>value.type==="answer").negotiation'), 4)
  const stage = page.getByRole('application', { name: 'Browser', exact: true })
  const bounds = (await stage.boundingBox())!
  await stage.click({ position: { x: bounds.width / 2, y: bounds.height / 2 } })
  assert.equal(await page.evaluate('window.inputs.filter(value=>value.type==="button").length'), 0, 'signaling ready does not enable input before a decoded frame')
  await page.evaluate('window.peers[0].play()')
  await page.waitForFunction('window.inputs.some(value=>value.type==="viewer-ready")')
  assert.equal(await page.evaluate('window.lastReceiver.jitterBufferTarget'), 0)
  await stage.click({ position: { x: bounds.width / 2, y: bounds.height / 2 } })
  const click = await page.evaluate<{ x: number; y: number; channel: string }>('window.inputs.findLast(value=>value.type==="button"&&value.down)')
  assert.ok(Math.abs(click.x - 400) <= 1 && Math.abs(click.y - 200) <= 1)
  assert.equal(click.channel, 'control')
  await stage.press('Escape')
  assert.equal(await page.locator('[data-browser-desktop-panel]').count(), 1, 'Escape remains a remote Chrome key')
  assert.equal(await page.evaluate('window.inputs.filter(value=>value.type==="key"&&value.key==="Escape").length'), 2)
  await page.keyboard.down('Shift')
  await page.getByRole('button', { name: 'Keyboard input', exact: true }).focus()
  assert.equal(await page.evaluate('window.inputs.some(value=>value.type==="key"&&value.code==="ShiftLeft"&&!value.down)'), true)
  await page.keyboard.up('Shift')
  await page.getByRole('button', { name: 'Keyboard input', exact: true }).click()
  await page.getByRole('textbox', { name: 'Keyboard input', exact: true }).fill('native text 한글')
  assert.equal(await page.evaluate('window.inputs.filter(value=>value.type==="paste"&&value.text==="native text 한글").length'), 1)
  const keySession = await context.newCDPSession(page)
  const softKeysStart = await page.evaluate<number>('window.inputs.length')
  for (const key of ['Backspace', 'Enter', 'Tab', 'Escape', 'Delete']) {
    await keySession.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: '' })
    await keySession.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: '' })
    if (key === 'Backspace') await page.evaluate(`document.querySelector('textarea').dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'deleteContentBackward'}))`)
  }
  const softKeys = await page.evaluate<Array<{ type: string; key: string; code: string; down: boolean }>>(`window.inputs.slice(${softKeysStart}).filter(value=>value.type==='key')`)
  for (const key of ['Backspace', 'Enter', 'Tab', 'Escape', 'Delete']) {
    assert.deepEqual(softKeys.filter(value => value.key === key).map(value => ({ code: value.code, down: value.down })), [{ code: key, down: true }, { code: key, down: false }], `soft keyboard ${key} is delivered exactly once without a physical code`)
  }
  const inputOnlyStart = await page.evaluate<number>('window.inputs.length')
  await page.evaluate(`(()=>{const field=document.querySelector('textarea');field.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:''}));for(const inputType of ['deleteContentBackward','deleteContentForward','insertLineBreak','insertParagraph']){field.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType}));field.dispatchEvent(new InputEvent('input',{bubbles:true,inputType}));}})()`)
  const inputOnly = await page.evaluate<Array<{ type: string; key: string; down: boolean }>>(`window.inputs.slice(${inputOnlyStart}).filter(value=>value.type==='key'&&value.down)`)
  assert.deepEqual(inputOnly.map(value => value.key), ['Backspace', 'Delete', 'Enter', 'Enter'], 'input-only edit events work without duplicate beforeinput/input delivery')
  await keySession.detach()
  await page.setViewportSize({ width: 390, height: 820 })
  await page.waitForFunction('window.signals.some(value=>value.type==="resize"&&value.width<500)')
  const mobileBounds = (await stage.boundingBox())!, touch = await context.newCDPSession(page)
  const touchX = mobileBounds.x + mobileBounds.width / 2, touchY = mobileBounds.y + mobileBounds.height / 2
  const touchStart = await page.evaluate<number>('window.inputs.length')
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: touchX, y: touchY }] })
  await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: touchX, y: touchY - 60 }] })
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await page.waitForFunction(`window.inputs.slice(${touchStart}).some(value=>value.type==='wheel'&&value.deltaY>0)`)
  assert.equal(await page.evaluate(`window.inputs.slice(${touchStart}).some(value=>value.type==='button')`), false, 'mobile swipes scroll without clicking')
  assert.equal(await page.evaluate('document.activeElement.tagName'), 'DIV', 'touch scrolling does not open the virtual keyboard')
  await touch.detach()
  const closesBeforeReconnect = await page.evaluate<number>('window.signals.filter(value=>value.type==="close").length')
  await page.getByRole('button', { name: 'Reconnect', exact: true }).first().click()
  await page.waitForFunction('window.sockets.length===2')
  assert.equal(await page.evaluate('window.signals.filter(value=>value.type==="close").length'), closesBeforeReconnect, 'healthy reconnect replaces the viewer without closing Chrome')
  const resumeVideo = async (socket: number, negotiation: number) => {
    await page.evaluate(`window.sockets[${socket}].receive({type:'offer',negotiation:${negotiation},sdp:'resumed-offer'})`)
    await page.waitForFunction(`window.signals.some(value=>value.type==='answer'&&value.negotiation===${negotiation})`)
    const readyBefore = await page.evaluate<number>('window.inputs.filter(value=>value.type==="viewer-ready").length')
    await page.evaluate('window.peers.at(-1).play()')
    await page.waitForFunction(`window.inputs.filter(value=>value.type==='viewer-ready').length>${readyBefore}`)
  }
  await resumeVideo(1, 5)
  await page.evaluate('window.latestControl.bufferedAmount=65537')
  await stage.press('Escape')
  await page.getByRole('alert').waitFor()
  assert.equal(await page.evaluate('window.sockets[1].readyState'), 3, 'reliable input congestion closes the connection instead of silently dropping key-up or release')
  assert.equal(await page.evaluate('window.peers[1].connectionState'), 'closed')
  await page.getByRole('button', { name: 'Reconnect', exact: true }).first().click()
  await page.waitForFunction('window.sockets.length===3')
  await resumeVideo(2, 6)
  await page.evaluate('window.setNativeAllowed(false)')
  await page.getByRole('textbox', { name: 'Browser address', exact: true }).waitFor()
  assert.equal(await page.evaluate('window.sockets[2].readyState'), 3, 'native permission revocation closes the existing display')
  await page.evaluate('window.setNativeAllowed(true)')
  await page.waitForFunction('window.sockets.length===4')
  await page.evaluate(`window.sockets[3].onclose()`)
  await page.waitForTimeout(250)
  assert.equal(await page.evaluate('window.sockets.length'), 4, 'connection loss does not start an automatic retry loop')
  assert.equal(await page.evaluate('window.peers[0].connectionState'), 'closed')
  await page.getByRole('button', { name: 'Reconnect', exact: true }).first().click()
  await page.waitForFunction('window.sockets.length===5')
  assert.equal(await page.evaluate('window.signals.filter(value=>value.type==="open").length'), 5)
  await page.getByRole('button', { name: 'Close browser', exact: true }).click()
  assert.equal(await page.evaluate('window.sockets[4].readyState'), 3)
  assert.equal(await page.evaluate('window.signals.some(value=>value.type==="frame-ack")'), false)
  assert.equal(await page.locator('img,iframe').count(), 0, 'the viewer has no screenshot or DOM reconstruction path')
  assert.deepEqual(errors, [])
})
