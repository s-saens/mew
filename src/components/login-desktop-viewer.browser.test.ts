import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'rolldown'
import { domBrowserExecutable } from '../../server/browser-dom-executable.ts'
import { connectTestBrowser } from '../../server/test-browser.ts'

const offer = 'v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 102\r\na=rtpmap:102 H264/90000\r\n'

test('login delegates to the shared native video panel, renews its job and cleans up the same input path', { skip: !domBrowserExecutable(), timeout: 30_000 }, async t => {
  const result = await build({ input: 'virtual:login-fixture.tsx', logLevel: 'silent', write: false, platform: 'browser', output: { format: 'esm' }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('production') } }, plugins: [{
    name: 'shared-login-panel',
    resolveId(id) {
      if (id.startsWith('virtual:')) return id
      if (id.endsWith('.css')) return 'virtual:style'
      if (id.endsWith('/remote-transport')) return 'virtual:transport'
      if (id.endsWith('/DockWorkspace')) return 'virtual:dock.tsx'
    },
    load(id) {
      if (id === 'virtual:style') return ''
      if (id === 'virtual:dock.tsx') return 'export function DockGrip(){return <span data-test-dock-grip/>}'
      if (id === 'virtual:transport') return 'export function openMewSocket(url){return new window.LoginSocket(url)};export async function mewFetch(){throw new Error("Embedded login must not request the port list")}'
      if (id === 'virtual:login-fixture.tsx') return `
        import React from ${JSON.stringify(import.meta.resolve('react'))};
        import {createRoot} from ${JSON.stringify(import.meta.resolve('react-dom/client'))};
        import {setUiLocale} from ${JSON.stringify(import.meta.resolve('@mew/ui/i18n-core'))};
        import {LoginDesktopViewer} from ${JSON.stringify(new URL('./LoginDesktopViewer.tsx', import.meta.url).pathname)};
        import {FloatingLoginWindow} from ${JSON.stringify(new URL('./FloatingLoginWindow.tsx', import.meta.url).pathname)};
        setUiLocale('ko');window.signals=[];window.inputs=[];window.loginSockets=[];window.peers=[];window.readyCount=0;window.closedCount=0;window.reopenCount=0;
        window.LoginSocket=class {readyState=0;send(value){window.signals.push(JSON.parse(value))}close(){this.readyState=3}constructor(url){this.url=url;window.loginSockets.push(this);queueMicrotask(()=>{this.readyState=1;this.onopen?.()})}receive(value){this.onmessage?.({data:JSON.stringify(value)})}};
        class Channel {readyState='open';bufferedAmount=0;constructor(label){this.label=label}send(value){window.inputs.push({channel:this.label,...JSON.parse(value)})}close(){this.readyState='closed'}};
        window.RTCPeerConnection=class {connectionState='new';remoteDescription=null;localDescription=null;receivers=[];constructor(options){this.options=options;window.peers.push(this)}async setRemoteDescription(value){this.remoteDescription=value;this.ondatachannel?.({channel:new Channel('control')});this.ondatachannel?.({channel:new Channel('motion')});}async addIceCandidate(){}async createAnswer(){return {type:'answer',sdp:${JSON.stringify(offer)}}}async setLocalDescription(value){this.localDescription=value}async getStats(){return new Map()}getReceivers(){return this.receivers}close(){this.connectionState='closed'}play(width=800,height=400){const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');ctx.fillStyle='#123456';ctx.fillRect(0,0,width,height);const stream=canvas.captureStream(30);this.receivers=[{track:stream.getVideoTracks()[0]}];this.ontrack?.({streams:[stream],track:stream.getVideoTracks()[0],receiver:{jitterBufferTarget:50}});setInterval(()=>ctx.fillRect(0,0,width,height),30)}};
        async function reopen(){window.reopenCount++;if(window.failReopen)throw new Error('Fixture renewal failed');if(window.pauseReopen)await new Promise(resolve=>window.resolveReopen=resolve);return '/api/browser-desktop/ws?login=reopened'}
        function Fixture(){const [open,setOpen]=React.useState(true);return <>{open&&<FloatingLoginWindow onClose={()=>{window.closedCount++;setOpen(false)}}><LoginDesktopViewer streamUrl="/api/browser-desktop/ws?login=fixture" reopen={reopen} onReady={()=>window.readyCount++}/></FloatingLoginWindow>}</>}
        createRoot(document.getElementById('root')).render(<Fixture/>);`
    },
  }] })
  const scripts = new Map(result.output.filter(chunk => chunk.type === 'chunk').map(chunk => [`/${chunk.fileName}`, chunk.code]))
  const entry = result.output.find(chunk => chunk.type === 'chunk' && chunk.isEntry)!
  const browser = await connectTestBrowser()
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1100, height: 850 }, permissions: ['clipboard-read', 'clipboard-write'] })
  page.setDefaultTimeout(4000)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('https://login-viewer.test/**', route => {
    const script = scripts.get(new URL(route.request().url()).pathname)
    return route.fulfill(script !== undefined ? { contentType: 'text/javascript', body: script } : { contentType: 'text/html', body: `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}*{box-sizing:border-box}section[role=dialog]{position:absolute;display:flex;flex-direction:column}section[role=dialog]>header{height:36px;flex-shrink:0}section[role=dialog]>div{display:flex;flex-direction:column;flex:1;min-height:0}.relative{position:relative}.absolute{position:absolute}.inset-0{inset:0}.flex{display:flex}.flex-col{flex-direction:column}.flex-1{flex:1}.h-full{height:100%}.w-full{width:100%}.min-h-0{min-height:0}.shrink-0{flex-shrink:0}[data-browser-desktop-panel]>header{height:32px;flex-shrink:0}[data-browser-desktop-panel]>header>span{flex:1}[data-login-desktop]{touch-action:none;overflow:hidden}video{width:100%;height:100%;object-fit:contain;pointer-events:none}textarea{position:absolute;width:1px;height:1px;opacity:0}</style><div id="root"></div><script type="module" src="/${entry.fileName}"></script>` })
  })
  await page.goto('https://login-viewer.test/')
  await page.waitForFunction('window.signals.some(value=>value.type==="open")')
  assert.equal(await page.locator('[data-browser-desktop-panel][data-embedded]').count(), 1, 'login renders the actual BrowserDesktopPanel')
  assert.equal(await page.locator('[data-test-dock-grip],[data-dom-browser-ports],img,iframe').count(), 0)
  assert.equal(await page.evaluate('window.loginSockets[0].url'), 'wss://login-viewer.test/api/browser-desktop/ws?login=fixture')
  assert.equal(await page.evaluate('window.signals.find(value=>value.type==="open").url'), 'about:blank', 'the server supplies the authorization job URL')
  await page.evaluate(`window.loginSockets[0].onmessage({data:new Blob(['legacy JPEG'],{type:'image/jpeg'})});window.loginSockets[0].receive({type:'ready',width:800,height:400})`)
  assert.equal(await page.evaluate('window.readyCount'), 0, 'legacy image frames and signaling state cannot mark video ready')
  const play = async (socket: number, negotiation: number) => {
    await page.evaluate(`window.loginSockets[${socket}].receive({type:'offer',sdp:${JSON.stringify(offer)},negotiation:${negotiation}})`)
    await page.waitForFunction(`window.signals.some(value=>value.type==='answer'&&value.negotiation===${negotiation})`)
    await page.evaluate('window.peers.at(-1).play()')
  }
  await play(0, 0)
  await page.waitForFunction('window.readyCount===1')
  assert.match(await page.evaluate<string>('window.peers[0].remoteDescription.sdp'), /H264/)
  const stage = page.getByRole('application', { name: '로그인 화면', exact: true })
  const bounds = (await stage.boundingBox())!
  await stage.click({ position: { x: bounds.width / 2, y: bounds.height / 2 } })
  const click = await page.evaluate<{ x: number; y: number; channel: string }>('window.inputs.findLast(value=>value.type==="button"&&value.down)')
  assert.ok(Math.abs(click.x - 400) <= 1 && Math.abs(click.y - 200) <= 1)
  assert.equal(click.channel, 'control')
  await stage.press('Escape')
  assert.equal(await page.evaluate('window.closedCount'), 0, 'Escape belongs to native Chrome, not the floating login window')
  assert.equal(await page.evaluate('window.inputs.filter(value=>value.type==="key"&&value.key==="Escape").length'), 2)
  await page.evaluate(`navigator.clipboard.writeText('shared browser clipboard 한글')`)
  await stage.press('Control+V')
  await page.waitForFunction('window.inputs.some(value=>value.type==="paste"&&value.text==="shared browser clipboard 한글")')
  await page.keyboard.down('Shift')
  await page.getByRole('button', { name: '다시 연결', exact: true }).focus()
  assert.equal(await page.evaluate('window.inputs.some(value=>value.type==="key"&&value.code==="ShiftLeft"&&!value.down)'), true)
  await page.keyboard.up('Shift')
  await page.getByRole('button', { name: '키보드 입력', exact: true }).click()
  await page.getByRole('textbox', { name: '로그인 키보드 입력', exact: true }).fill('shared input text')
  assert.equal(await page.evaluate('window.inputs.filter(value=>value.type==="paste"&&value.text==="shared input text").length'), 1)
  const closesBefore = await page.evaluate<number>('window.signals.filter(value=>value.type==="close").length')
  await page.getByRole('button', { name: '다시 연결', exact: true }).click()
  await page.waitForFunction('window.loginSockets.length===2')
  assert.equal(await page.evaluate('window.reopenCount'), 1)
  assert.equal(await page.evaluate('window.loginSockets[1].url'), 'wss://login-viewer.test/api/browser-desktop/ws?login=reopened')
  assert.equal(await page.evaluate('window.signals.filter(value=>value.type==="close").length'), closesBefore, 'job renewal replaces its viewer without shutting down shared Chrome')
  assert.equal(await page.evaluate('window.readyCount'), 1)
  await play(1, 1)
  await page.waitForFunction('window.readyCount===2')
  await page.setViewportSize({ width: 390, height: 850 })
  await page.waitForFunction('(()=>{const bounds=document.querySelector("[role=dialog]").getBoundingClientRect();return bounds.left>=0&&bounds.right<=innerWidth})()')
  await page.waitForFunction('window.signals.some(value=>value.type==="resize"&&value.width<500)')
  await page.evaluate('window.peers.at(-1).play(400,800)')
  await page.waitForFunction('document.querySelector("video").videoWidth===400')
  const mobile = (await stage.boundingBox())!
  await stage.click({ position: { x: mobile.width / 2, y: mobile.height / 2 } })
  const resizedClick = await page.evaluate<{ x: number; y: number }>('window.inputs.findLast(value=>value.type==="button"&&value.down)')
  assert.ok(Math.abs(resizedClick.x - 200) <= 1 && Math.abs(resizedClick.y - 400) <= 1)
  assert.equal(await page.evaluate('window.readyCount'), 2, 'a resized stream does not notify the same connection twice')
  await page.evaluate('window.failReopen=true')
  await page.getByRole('button', { name: '다시 연결', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'Fixture renewal failed' }).waitFor()
  assert.equal(await page.evaluate('window.loginSockets.length'), 2, 'failed job renewal creates no unrelated browser connection')
  await page.evaluate('window.failReopen=false;window.pauseReopen=true')
  await page.getByRole('button', { name: '다시 연결', exact: true }).first().click()
  await page.waitForFunction('typeof window.resolveReopen==="function"')
  await page.getByRole('button', { name: '로그인 창 닫기', exact: true }).click()
  await page.evaluate('window.resolveReopen()')
  await page.waitForTimeout(50)
  assert.equal(await page.evaluate('window.loginSockets.length'), 2, 'a resolved renewal cannot remount a closed login viewer')
  assert.equal(await page.evaluate('window.loginSockets[1].readyState'), 3)
  assert.equal(await page.evaluate('window.peers[1].connectionState'), 'closed')
  assert.equal(await page.evaluate('window.signals.filter(value=>value.type==="close").length'), closesBefore + 1)
  assert.equal(await page.evaluate('window.signals.some(value=>value.type==="frame-ack")'), false)
  assert.equal(await page.evaluate('window.closedCount'), 1)
  assert.deepEqual(errors, [])
})
