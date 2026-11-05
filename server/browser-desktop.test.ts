import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createServer, type IncomingMessage } from 'node:http'
import { EventEmitter, once } from 'node:events'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { WebSocket } from 'ws'
import { browserDesktopCommand } from '../shared/browser-desktop.ts'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-browser-desktop-test-'))
process.env.MEW_DATA_DIR = root
const { BrowserDesktopSession, attachBrowserDesktopWebSocket, browserDesktopAllowed, browserDesktopTarget, closeBrowserDesktops } = await import('./browser-desktop.ts')
const { setFeature } = await import('./access-policy.ts')
const { domBrowserExecutable, externalBrowserExecutable } = await import('./browser-dom-executable.ts')
test.after(async () => { await closeBrowserDesktops(); await fs.rm(root, { recursive: true, force: true }) })

test('browser requests bound URLs, video negotiation and OS input while excluding JPEG acknowledgements', () => {
  assert.deepEqual(browserDesktopCommand(JSON.stringify({ type: 'open', url: 'https://example.test/', width: 901, height: 701 })), { type: 'open', url: 'https://example.test/', width: 900, height: 700 })
  assert.deepEqual(browserDesktopCommand(JSON.stringify({ type: 'navigate', url: 'http://127.0.0.1:30123/app' })), { type: 'navigate', url: 'http://127.0.0.1:30123/app' })
  assert.deepEqual(browserDesktopCommand(JSON.stringify({ type: 'key', code: 'KeyA', key: 'a', down: true })), { type: 'key', code: 'KeyA', key: 'a', down: true })
  assert.deepEqual(browserDesktopCommand(JSON.stringify({ type: 'paste', text: '한글' })), { type: 'paste', text: '한글' })
  assert.equal(browserDesktopCommand(JSON.stringify({ type: 'answer', sdp: 'v=0\r\n', negotiation: 0 })).type, 'answer')
  assert.equal(browserDesktopCommand(JSON.stringify({ type: 'candidate', candidate: { candidate: 'candidate:fixture', sdpMid: 'video' }, negotiation: 1 })).type, 'candidate')
  const invalid = [null, [], { type: 'frame-ack' }, { type: 'open', url: 'https://example.test/', width: Infinity, height: 600 },
    { type: 'navigate', url: 'a'.repeat(8193) }, { type: 'answer', sdp: 'a'.repeat(30 * 1024 + 1) }, { type: 'answer', sdp: 'v=0', negotiation: -1 },
    { type: 'candidate', candidate: { candidate: 'a'.repeat(4097) } }, { type: 'candidate', candidate: { candidate: 'fixture', sdpMid: 'a'.repeat(65) } },
    { type: 'pointer', x: Infinity, y: 0 }, { type: 'paste', text: 'a'.repeat(4097) }, { type: 'key', code: 'eval()', key: 'a', down: true }]
  for (const value of invalid) assert.throws(() => browserDesktopCommand(JSON.stringify(value)))
  assert.throws(() => browserDesktopCommand('{'))
  assert.throws(() => browserDesktopCommand(JSON.stringify({ type: 'paste', text: '한'.repeat(12000) })), /너무 큽니다/)
})

test('browser URLs exclude credentials, non-web schemes and Mew recursion', async () => {
  assert.equal(browserDesktopTarget('about:blank'), 'about:blank')
  assert.equal(browserDesktopTarget('https://example.test/path?q=1'), 'https://example.test/path?q=1')
  assert.equal(browserDesktopTarget('http://127.0.0.1:30123/fixture'), 'http://127.0.0.1:30123/fixture')
  for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,test', 'https://user:password@example.test/', 'http://127.0.0.1:4999/', `http://localhost:${process.env.MEW_TEAM_PORT ?? 5000}/`]) assert.throws(() => browserDesktopTarget(url))
  const server = createServer((_req, res) => res.end('fixture'))
  attachBrowserDesktopWebSocket(server, () => ({ email: 'target@test', role: 'owner', mustChangePassword: false }))
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  try { assert.throws(() => browserDesktopTarget(`http://127.0.0.1:${(server.address() as { port: number }).port}/`)) }
  finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) }
  const session = new BrowserDesktopSession('target@test', 'https://example.test/')
  try { assert.ok(session.expiresAt > Date.now() + 7 * 60 * 60_000) }
  finally { await session.close() }
})

test('browser ownership, feature permission, password state and Origin are all required', () => {
  const req = { headers: { host: 'mew.test', origin: 'http://mew.test' }, socket: { encrypted: false } } as unknown as IncomingMessage
  const owner = { email: 'owner-browser@test', role: 'owner', mustChangePassword: false } as const
  assert.equal(browserDesktopAllowed(req, owner), true)
  assert.equal(browserDesktopAllowed(req, owner, 'another@test'), false)
  assert.equal(browserDesktopAllowed(req, { ...owner, email: null }), false)
  assert.equal(browserDesktopAllowed(req, { ...owner, mustChangePassword: true }), false)
  assert.equal(browserDesktopAllowed(req, { ...owner, role: 'member' }), false)
  assert.equal(browserDesktopAllowed(req, { ...owner, role: 'guest' }), false)
  assert.equal(browserDesktopAllowed({ headers: { host: 'mew.test', origin: 'http://evil.test' } } as IncomingMessage, owner), false)
  assert.equal(browserDesktopAllowed({ headers: { host: 'mew.test' } } as IncomingMessage, owner), false)
  setFeature(owner.email, 'portPreview', false)
  try { assert.equal(browserDesktopAllowed(req, owner), false) }
  finally { setFeature(owner.email, 'portPreview', null) }
  const member = { ...owner, email: 'scoped-browser@test', role: 'member' } as const
  setFeature(member.email, 'portPreview', true)
  try {
    assert.equal(browserDesktopAllowed(req, member), false, 'a localhost-preview grant does not authorize a full native browser')
    setFeature(member.email, 'desktop', true)
    assert.equal(browserDesktopAllowed(req, member), true)
    setFeature(member.email, 'desktop', false)
    assert.equal(browserDesktopAllowed(req, member), false, 'revoking desktop authority revokes the native browser')
  } finally { setFeature(member.email, 'desktop', null); setFeature(member.email, 'portPreview', null) }
})

test('closing an unauthorized OPEN viewer is idempotent and cannot recurse through state delivery', async () => {
  const events = new EventEmitter(), sent: unknown[] = []
  let allowed = true, closed = 0
  const socket = Object.assign(events, {
    readyState: WebSocket.OPEN as number,
    send(message: string) { sent.push(JSON.parse(message)) },
    close() { this.readyState = WebSocket.CLOSED; closed++; queueMicrotask(() => events.emit('close')) },
  })
  const session = new BrowserDesktopSession('revoked-open@test', 'about:blank')
  session.attachViewer(socket as unknown as WebSocket, () => allowed)
  allowed = false
  try {
    await session.close(); await session.close()
    assert.equal(session.isClosed, true)
    assert.equal(closed, 1)
    assert.deepEqual(sent, [], 'revoked viewers receive no state or video')
  } finally { await session.close() }
})

test('WebSocket rejects bad authority, commands before open, invalid framing and live feature revocation', { timeout: 10000 }, async () => {
  let allowed = true
  const account = 'socket-browser@test'
  const server = createServer((_req, res) => res.end('fixture'))
  attachBrowserDesktopWebSocket(server, () => ({ email: account, role: allowed ? 'owner' : 'member', mustChangePassword: false }))
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`, address = origin.replace('http:', 'ws:') + '/api/browser-desktop/ws'
  const sockets: WebSocket[] = []
  const connect = async () => {
    const ws = new WebSocket(address, { origin }); sockets.push(ws); await once(ws, 'open'); return ws
  }
  const forbidden = async (source: string) => {
    const ws = new WebSocket(address, { origin: source }); sockets.push(ws); ws.on('error', () => {})
    const response = await once(ws, 'unexpected-response')
    assert.equal(response[1].statusCode, 403); response[1].resume(); ws.terminate()
  }
  try {
    await forbidden('http://evil.test')
    allowed = false; await forbidden(origin); allowed = true
    for (const message of [JSON.stringify({ type: 'pointer', x: 1, y: 1 }), JSON.stringify({ type: 'open', url: `http://user:password@example.test/`, width: 640, height: 480 }), Buffer.from('binary')]) {
      const ws = await connect(), closed = once(ws, 'close')
      ws.send(message)
      assert.equal((await closed)[0], 1008)
    }
    const oversized = await connect(), limitClosed = once(oversized, 'close')
    oversized.send('a'.repeat(33 * 1024))
    assert.equal((await limitClosed)[0], 1009)
    const live = await connect(), revoked = once(live, 'close')
    setFeature(account, 'portPreview', false)
    await revoked
    setFeature(account, 'portPreview', null)
  } finally {
    setFeature(account, 'portPreview', null)
    for (const ws of sockets) ws.terminate()
    await closeBrowserDesktops(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()))
  }
})

const native = createRequire(new URL('../native/remote-desktop/package.json', import.meta.url))
let dependencies = process.platform === 'linux' && !!externalBrowserExecutable() && !!domBrowserExecutable()
try { native.resolve('node-datachannel') } catch { dependencies = false }
dependencies &&= ['Xvfb', 'ffmpeg', 'python3'].every(command => spawnSync(command, [command === 'ffmpeg' ? '-version' : command === 'Xvfb' ? '-help' : '--version'], { stdio: 'ignore' }).status === 0)

test('isolated ordinary Chrome sends real H.264 to a browser and keeps native input, resize, reconnect and ownership', { skip: !dependencies, timeout: 90000 }, t => {
  const fixtureHtml = `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#154734}button{position:absolute;left:30px;top:30px;width:240px;height:60px}input{position:absolute;left:30px;top:120px;width:240px;height:50px}#motion{position:absolute;left:300px;top:30px;width:60px;height:60px;background:#ff0}</style><button onclick="document.body.style.background='#1446dc';fetch('/event?kind=click')">Native click</button><input oninput="fetch('/event?kind=text&text='+encodeURIComponent(this.value))"><div id="motion"></div><script>const retained=document.cookie;document.cookie='browserFixture=retained;max-age=300';const documentId=crypto.randomUUID();function report(){fetch('/event?kind=loaded&document='+documentId+'&width='+innerWidth+'&height='+innerHeight+'&webdriver='+navigator.webdriver+'&cookie='+encodeURIComponent(retained))}addEventListener('resize',report);report();let frame=0;setInterval(()=>{document.querySelector('#motion').style.transform='translateX('+(++frame%30)+'px)'},33)</script>`
  const script = `
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {createRequire} from 'node:module';
import {chromium} from 'playwright-core';
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'mew-browser-desktop-native-'));
process.env.MEW_DATA_DIR=temp;
process.env.MEW_DESKTOP_ICE_SERVERS='[]';process.env.MEW_DESKTOP_AUTO_NAT='0';
const {attachBrowserDesktopWebSocket,closeBrowserDesktops}=await import(${JSON.stringify(new URL('./browser-desktop.ts', import.meta.url).href)});
const {domBrowserExecutable}=await import(${JSON.stringify(new URL('./browser-dom-executable.ts', import.meta.url).href)});
const {setFeature}=await import(${JSON.stringify(new URL('./access-policy.ts', import.meta.url).href)});
const requireNative=createRequire(${JSON.stringify(new URL('../native/remote-desktop/package.json', import.meta.url).href)});
const rtc=requireNative('node-datachannel');
const account='native-browser@test',events=[],errors=[];
let allowed=true,browser,binaryMessages=0;
const childPids=async()=>{const raw=await fs.readFile('/proc/'+process.pid+'/task/'+process.pid+'/children','utf8');return raw.trim().split(/\\s+/).filter(Boolean).map(Number)};
const running=pid=>{try{process.kill(pid,0);return true}catch{return false}};
const fixture=createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/event'){events.push(Object.fromEntries(url.searchParams));res.end('ok');return}
 res.setHeader('Content-Type','text/html');
 res.end(${JSON.stringify(fixtureHtml)});
});
const viewerHtml=String.raw\`<!doctype html><video autoplay muted playsinline></video><script>
window.errors=[];window.states=[];window.channels={};window.connections=0;window.pauseNegotiation=false;
window.openRemote=(url,width=800,height=600)=>{
 if(window.peer)window.peer.close();if(window.socket)window.socket.close();
 const peer=new RTCPeerConnection({iceServers:[]});window.peer=peer;window.channels={};window.connections++;
 const socket=new WebSocket('ws://'+location.host+'/api/browser-desktop/ws');window.socket=socket;
 let queue=Promise.resolve(),pending=[];const send=value=>{if(socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify(value))};
 window.send=send;
 peer.onicecandidate=event=>{if(event.candidate)send({type:'candidate',candidate:event.candidate.toJSON()})};
 peer.ontrack=event=>{document.querySelector('video').srcObject=new MediaStream([event.track])};
 peer.ondatachannel=event=>{window.channels[event.channel.label]=event.channel};
 socket.onopen=()=>send({type:'open',url,width,height});
 socket.onmessage=event=>{if(window.socket!==socket)return;if(typeof event.data!=='string'){window.errors.push('unexpected image frame');return}
 queue=queue.then(async()=>{const message=JSON.parse(event.data);window.states.push(message);
 if(message.type==='error')window.errors.push(message.message);
 if(message.type==='offer'){if(window.pauseNegotiation){window.pausedOffer=message;return}await peer.setRemoteDescription({type:'offer',sdp:message.sdp});for(const candidate of pending)await peer.addIceCandidate(candidate);pending=[];const answer=await peer.createAnswer();await peer.setLocalDescription(answer);send({type:'answer',sdp:answer.sdp,negotiation:message.negotiation??0})}
 if(message.type==='candidate'){if(peer.remoteDescription)await peer.addIceCandidate(message.candidate);else pending.push(message.candidate)}
 }).catch(error=>window.errors.push(error.message))};
 socket.onerror=()=>window.errors.push('socket error');
};
window.nativeInput=value=>window.channels.control.send(JSON.stringify(value));
window.frames=async()=>{const stats=await window.peer.getStats();return [...stats.values()].find(value=>value.type==='inbound-rtp'&&value.kind==='video')?.framesDecoded??0};
window.videoPixel=()=>{const video=document.querySelector('video'),canvas=document.createElement('canvas');canvas.width=1;canvas.height=1;const context=canvas.getContext('2d');context.drawImage(video,video.videoWidth-30,video.videoHeight-30,1,1,0,0,1,1);return [...context.getImageData(0,0,1,1).data]};
window.disconnected=()=>new Promise(resolve=>{const ws=window.socket;ws.onclose=resolve;window.peer.close();ws.close()});
</script>\`;
const app=createServer((_req,res)=>{res.setHeader('Content-Type','text/html');res.end(viewerHtml)});
attachBrowserDesktopWebSocket(app,()=>({email:account,role:allowed?'owner':'member',mustChangePassword:false}));
app.on('upgrade',(_req,socket)=>{const write=socket.write.bind(socket);socket.write=(data,...args)=>{if(Buffer.isBuffer(data)&&data[0]===0x82)binaryMessages++;return write(data,...args)}});
const until=async(predicate,label)=>{for(let i=0;i<500;i++){if(predicate())return;await delay(20)}assert.fail(label+' '+JSON.stringify({events,errors}))};
try{
 fixture.listen(0,'127.0.0.1');app.listen(0,'127.0.0.1');await Promise.all([once(fixture,'listening'),once(app,'listening')]);
 const target='http://127.0.0.1:'+fixture.address().port+'/fixture',origin='http://127.0.0.1:'+app.address().port;
 browser=await chromium.launch({executablePath:domBrowserExecutable(),chromiumSandbox:true});
 const viewerPids=await childPids();
 const page=await browser.newPage();page.on('pageerror',error=>errors.push(error.message));
 await page.goto(origin);await page.evaluate('window.pauseNegotiation=true;window.openRemote('+JSON.stringify(target)+')');
 await page.waitForFunction('!!window.pausedOffer',null,{timeout:15000});
 await page.evaluate('window.pauseNegotiation=false;window.openRemote('+JSON.stringify(target)+')');
 const waitVideo=async()=>{await page.waitForFunction('window.errors.length||document.querySelector("video").videoWidth>0&&window.channels.control?.readyState==="open"',null,{timeout:20000});assert.deepEqual(await page.evaluate('window.errors'),[]);await page.waitForFunction(async()=>await window.frames()>3,null,{timeout:10000})};
 await waitVideo();await until(()=>events.some(event=>event.kind==='loaded'),'headed Chrome load');
 const first=events.find(event=>event.kind==='loaded');assert.equal(first.webdriver,'false');assert.ok(Number(first.height)<600,'native browser toolbar is present');
 const measuredAt=performance.now(),measuredStart=await page.evaluate('window.frames()');await delay(1000);const measuredEnd=await page.evaluate('window.frames()'),measuredSeconds=(performance.now()-measuredAt)/1000,decodedFrames=measuredEnd-measuredStart,receivedFps=Math.round(decodedFrames/measuredSeconds);assert.ok(decodedFrames>3,'video continues beyond initial frames');
 const click=async(pageY)=>{const loaded=events.findLast(event=>event.kind==='loaded'),size=await page.evaluate('({width:document.querySelector("video").videoWidth,height:document.querySelector("video").videoHeight})'),y=pageY+size.height-Number(loaded.height);await page.evaluate('window.nativeInput('+JSON.stringify({type:'button',button:0,down:true,x:100,y})+');window.nativeInput('+JSON.stringify({type:'button',button:0,down:false,x:100,y})+')')};
 const inputAt=performance.now();await click(60);await page.waitForFunction('(()=>{const pixel=window.videoPixel();return pixel[2]>140&&pixel[0]<80&&pixel[1]<130})()',null,{timeout:5000});const localInputToVideoMs=Math.round(performance.now()-inputAt);await until(()=>events.some(event=>event.kind==='click'),'WebRTC input reaches native Chrome');
 await click(145);await page.evaluate('window.nativeInput({type:"paste",text:"한글 native"})');await until(()=>events.some(event=>event.kind==='text'&&event.text==='한글 native'),'Unicode input over control data channel');
 const beforeFrames=await page.evaluate('window.frames()');await page.evaluate('window.send({type:"resize",width:1000,height:700})');
 await page.waitForFunction('document.querySelector("video").videoWidth===1000&&document.querySelector("video").videoHeight===700',null,{timeout:15000});
 await page.waitForFunction('window.frames().then(count=>count>'+beforeFrames+')',null,{timeout:10000});
 await until(()=>events.some(event=>event.kind==='loaded'&&Number(event.width)>=998),'native window resized');assert.equal(events.findLast(event=>event.kind==='loaded').document,first.document,'resize keeps Chrome document');
 await page.evaluate('window.disconnected()');await delay(250);await page.evaluate('window.openRemote('+JSON.stringify(target)+',1000,700)');await waitVideo();
 assert.equal(events.filter(event=>event.kind==='loaded').every(event=>event.document===first.document),true,'reconnection reuses Chrome and its page');
 const profile=path.join(temp,'browser','profiles',createHash('sha256').update('browser-desktop:'+account).digest('hex'));await fs.access(profile);
 const ownedPids=(await childPids()).filter(pid=>!viewerPids.includes(pid));assert.ok(ownedPids.length>=4,'session owns display, input, Chrome and encoder processes');
 const ownedCommands=await Promise.all(ownedPids.map(pid=>fs.readFile('/proc/'+pid+'/cmdline','utf8').catch(()=>''))),displayCommand=ownedCommands.map(command=>command.split('\\0')).find(args=>args.some(arg=>arg.includes('Xvfb'))),authority=displayCommand?.[displayCommand.indexOf('-auth')+1];assert.ok(authority,'private Xauthority exists');
 await page.evaluate('window.send({type:"close"});window.openRemote('+JSON.stringify(target)+',800,600)');await waitVideo();await until(()=>events.some(event=>event.kind==='loaded'&&event.document!==first.document),'immediate reopen waits for the previous profile lease');
 await until(()=>ownedPids.every(pid=>!running(pid)),'explicit close releases all session-owned child processes');await assert.rejects(fs.access(path.dirname(authority)),{code:'ENOENT'});
 await fs.access(profile);
 const next=events.findLast(event=>event.kind==='loaded');assert.match(next.cookie,/browserFixture=retained/);
 allowed=false;setFeature(account,'portPreview',false);await page.waitForFunction('window.socket.readyState===WebSocket.CLOSED',null,{timeout:5000});
 await closeBrowserDesktops();await assert.rejects(fs.lstat(path.join(profile,'SingletonLock')),{code:'ENOENT'});assert.equal(binaryMessages,0,'video never enters the signaling WebSocket');assert.deepEqual(errors,[]);
 console.log(JSON.stringify({frames:beforeFrames,decodedFrames,measuredSeconds:Math.round(measuredSeconds*1000)/1000,receivedFps,localInputToVideoMs,nativeClicks:events.filter(event=>event.kind==='click').length,loadedDocuments:new Set(events.filter(event=>event.kind==='loaded').map(event=>event.document)).size,binaryMessages}));
}finally{
 allowed=false;await closeBrowserDesktops();await browser?.close();app.closeAllConnections();fixture.closeAllConnections();await Promise.all([new Promise(resolve=>app.close(resolve)),new Promise(resolve=>fixture.close(resolve))]);rtc.cleanup();await fs.rm(temp,{recursive:true,force:true});
}
`
  const result = spawnSync(process.execPath, ['--input-type=module'], { input: script, encoding: 'utf8', timeout: 80000, maxBuffer: 512 * 1024 })
  assert.equal(result.status, 0, result.stderr || result.error?.message || result.stdout)
  const summary = JSON.parse(result.stdout.trim().split('\n').at(-1)!)
  assert.ok(summary.frames > 3); assert.ok(summary.nativeClicks >= 1); assert.equal(summary.loadedDocuments, 2); assert.equal(summary.binaryMessages, 0)
  t.diagnostic(JSON.stringify(summary))
})
