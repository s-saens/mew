import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { domBrowserExecutable, externalBrowserExecutable } from './browser-dom-executable.ts'

const native = createRequire(new URL('../native/remote-desktop/package.json', import.meta.url))
let available = process.platform === 'linux' && !!domBrowserExecutable() && !!externalBrowserExecutable()
try { native.resolve('node-datachannel') } catch { available = false }
available &&= ['Xvfb', 'ffmpeg', 'python3'].every(command => spawnSync(command, [command === 'Xvfb' ? '-help' : command === 'ffmpeg' ? '-version' : '--version'], { stdio: 'ignore' }).status === 0)

test('login jobs and the general browser use one actual Chrome, profile and H.264 transport', { skip: !available, timeout: 70000 }, t => {
  const fixtureHtml = `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#154734}#motion{width:50px;height:50px;background:#f80}</style><div id="motion"></div><script>const previous=document.cookie;document.cookie='sharedBrowser=retained;max-age=300';const id=crypto.randomUUID();function report(){fetch('/event?path='+encodeURIComponent(location.pathname)+'&query='+encodeURIComponent(location.search)+'&document='+id+'&cookie='+encodeURIComponent(previous)+'&webdriver='+navigator.webdriver)}requestAnimationFrame(()=>requestAnimationFrame(report));for(const type of ['keydown','keyup'])addEventListener(type,event=>{if(event.code==='CapsLock'||event.code==='KeyA')fetch('/key-event?code='+event.code+'&key='+encodeURIComponent(event.key)+'&caps='+event.getModifierState('CapsLock'))});let tick=0;setInterval(()=>{document.querySelector('#motion').style.transform='translateX('+(++tick%100)+'px)'},33)</script>`
  const viewerHtml = `<!doctype html><video autoplay muted playsinline></video><script>
window.errors=[];window.channels={};window.openRemote=(endpoint,url='about:blank')=>{
 if(window.peer)window.peer.close();if(window.socket)window.socket.close();
 const peer=new RTCPeerConnection({iceServers:[]}),socket=new WebSocket('ws://'+location.host+endpoint);window.peer=peer;window.socket=socket;window.channels={};
 let queue=Promise.resolve(),pending=[];const send=value=>{if(socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify(value))};window.send=send;
 peer.onicecandidate=event=>{if(event.candidate)send({type:'candidate',candidate:event.candidate.toJSON()})};
 peer.ontrack=event=>{document.querySelector('video').srcObject=new MediaStream([event.track])};peer.ondatachannel=event=>{window.channels[event.channel.label]=event.channel};
 socket.onopen=()=>send({type:'open',url,width:800,height:600});
 socket.onmessage=event=>{if(window.socket!==socket)return;if(typeof event.data!=='string'){window.errors.push('Unexpected binary signaling frame');return}
  queue=queue.then(async()=>{const message=JSON.parse(event.data);if(message.type==='error')window.errors.push(message.message);
   if(message.type==='offer'){await peer.setRemoteDescription({type:'offer',sdp:message.sdp});for(const candidate of pending)await peer.addIceCandidate(candidate);pending=[];const answer=await peer.createAnswer();await peer.setLocalDescription(answer);send({type:'answer',sdp:answer.sdp,negotiation:message.negotiation??0})}
   if(message.type==='candidate'){if(peer.remoteDescription)await peer.addIceCandidate(message.candidate);else pending.push(message.candidate)}
  }).catch(error=>window.errors.push(error.message));};
};window.frames=async()=>{const report=await window.peer.getStats();return [...report.values()].find(value=>value.type==='inbound-rtp'&&value.kind==='video')?.framesDecoded??0};
</script>`
  const script = `
import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';import {createServer} from 'node:http';import {once} from 'node:events';import {setTimeout as delay} from 'node:timers/promises';import {createRequire} from 'node:module';import {chromium} from 'playwright-core';
const root=await fs.mkdtemp(path.join(os.tmpdir(),'mew-shared-browser-login-'));process.env.MEW_DATA_DIR=root;process.env.MEW_DESKTOP_ICE_SERVERS='[]';process.env.MEW_DESKTOP_AUTO_NAT='0';
const {attachBrowserDesktopWebSocket,closeBrowserDesktops}=await import(${JSON.stringify(new URL('./browser-desktop.ts', import.meta.url).href)});
const {createLoginDesktopAuthSession,closeLoginDesktopJob,closeLoginDesktops}=await import(${JSON.stringify(new URL('./login-desktop.ts', import.meta.url).href)});
const {domBrowserExecutable}=await import(${JSON.stringify(new URL('./browser-dom-executable.ts', import.meta.url).href)});
const requireNative=createRequire(${JSON.stringify(new URL('../native/remote-desktop/package.json', import.meta.url).href)}),rtc=requireNative('node-datachannel');
const account='shared-browser@test',events=[],keys=[],errors=[];let browser,binaryMessages=0;
const fixture=createServer((req,res)=>{const url=new URL(req.url,'http://localhost');if(url.pathname==='/event'){events.push(Object.fromEntries(url.searchParams));res.end('ok');return}if(url.pathname==='/key-event'){keys.push(Object.fromEntries(url.searchParams));res.end('ok');return}res.setHeader('Content-Type','text/html');res.end(${JSON.stringify(fixtureHtml)})});
const app=createServer((_req,res)=>{res.setHeader('Content-Type','text/html');res.end(${JSON.stringify(viewerHtml)})});attachBrowserDesktopWebSocket(app,()=>({email:account,role:'owner',mustChangePassword:false}));
app.on('upgrade',(_req,socket)=>{const write=socket.write.bind(socket);socket.write=(data,...args)=>{if(Buffer.isBuffer(data)&&data[0]===0x82)binaryMessages++;return write(data,...args)}});
const until=async(predicate,label)=>{for(let attempt=0;attempt<400;attempt++){if(predicate())return;await delay(20)}assert.fail(label+' '+JSON.stringify(events))};
const children=async()=>{const ids=(await fs.readFile('/proc/'+process.pid+'/task/'+process.pid+'/children','utf8')).trim().split(/\\s+/).filter(Boolean).map(Number);return await Promise.all(ids.map(async pid=>({pid,args:(await fs.readFile('/proc/'+pid+'/cmdline','utf8').catch(()=>'')).split('\\0')})))};
try{
 fixture.listen(0,'127.0.0.1');app.listen(0,'127.0.0.1');await Promise.all([once(fixture,'listening'),once(app,'listening')]);const target='http://127.0.0.1:'+fixture.address().port,origin='http://127.0.0.1:'+app.address().port;
 const stream1=await createLoginDesktopAuthSession(account,'login-one',target+'/login-one');assert.equal(new URL(stream1,origin).pathname,'/api/browser-desktop/ws');assert.ok(new URL(stream1,origin).searchParams.get('login'));
 browser=await chromium.launch({executablePath:domBrowserExecutable(),chromiumSandbox:true});const page=await browser.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto(origin);
 const open=async(endpoint)=>{await page.evaluate('window.openRemote('+JSON.stringify(endpoint)+',"about:blank")');await page.waitForFunction('window.errors.length||document.querySelector("video").videoWidth>0&&window.channels.control?.readyState==="open"',null,{timeout:15000});assert.deepEqual(await page.evaluate('window.errors'),[]);await page.waitForFunction('window.frames().then(count=>count>3)',null,{timeout:10000})};
 await open(stream1);await until(()=>events.some(event=>event.path==='/login-one'),'job URL overrides client about:blank');const first=events.find(event=>event.path==='/login-one');assert.equal(first.webdriver,'false');
 const profile=path.join(root,'browser','profiles',createHash('sha256').update('browser-desktop:'+account).digest('hex'));await fs.access(profile);await assert.rejects(fs.access(path.join(root,'browser','profiles',createHash('sha256').update(account).digest('hex'))),{code:'ENOENT'});
 const chrome=()=>children().then(list=>list.find(child=>child.args.some(argument=>argument.includes('--user-data-dir='+profile)))?.pid),pid=await chrome();assert.ok(pid,JSON.stringify(await children()));
 await open('/api/browser-desktop/ws');assert.equal(await chrome(),pid,'general browser attaches to the existing ordinary Chrome');assert.equal(events.every(event=>event.document===first.document),true,'general about:blank preserves the login page');
 await closeLoginDesktopJob(account,'login-one');assert.equal(await page.evaluate('window.socket.readyState'),1,'old login completion does not close the general viewer');const before=await page.evaluate('window.frames()');await page.waitForFunction('window.frames().then(count=>count>'+before+')');assert.equal(await chrome(),pid);
 await page.evaluate('window.send({type:"key",key:"CapsLock",code:"CapsLock",down:true});window.send({type:"key",key:"CapsLock",code:"CapsLock",down:false})');await until(()=>keys.some(event=>event.code==='CapsLock'&&event.caps==='true'),'native CapsLock enabled before URL navigation');
 const query='?MixedCase=AbC_09-~&encoded=%ED%95%9C%EA%B8%80&punct=%21%40%23%24%25%5E%26%2A%28%29%2B%3D',stream2=await createLoginDesktopAuthSession(account,'login-two',target+'/login-two'+query);await open(stream2);await until(()=>events.some(event=>event.path==='/login-two'),'second job opens its URL in shared Chrome');const second=events.find(event=>event.path==='/login-two');assert.notEqual(second.document,first.document);assert.match(second.cookie,/sharedBrowser=retained/);assert.equal(await chrome(),pid,'new login job shares the same browser process');assert.equal(second.query,query);const parameters=new URLSearchParams(second.query);assert.equal(parameters.get('MixedCase'),'AbC_09-~');assert.equal(parameters.get('encoded'),'한글');assert.equal(parameters.get('punct'),'!@#$%^&*()+=');
 await page.evaluate('window.send({type:"key",key:"a",code:"KeyA",down:true});window.send({type:"key",key:"a",code:"KeyA",down:false})');await until(()=>keys.some(event=>event.code==='KeyA'&&event.key==='A'&&event.caps==='true'),'URL navigation preserves the user CapsLock state');
 await open('/api/browser-desktop/ws');await closeLoginDesktopJob(account,'login-two');assert.equal(await page.evaluate('window.socket.readyState'),1);assert.equal(await chrome(),pid);assert.equal(events.findLast(event=>event.path==='/login-two').document,second.document);
 await page.evaluate('window.send({type:"close"})');await page.waitForFunction('window.socket.readyState===WebSocket.CLOSED');await closeBrowserDesktops();await assert.rejects(fs.lstat(path.join(profile,'SingletonLock')),{code:'ENOENT'});
 const stream3=await createLoginDesktopAuthSession(account,'login-after-close',target+'/retained');await open(stream3);await until(()=>events.some(event=>event.path==='/retained'),'Chrome reopened after explicit closure');assert.notEqual(await chrome(),pid);assert.match(events.find(event=>event.path==='/retained').cookie,/sharedBrowser=retained/);
 await closeLoginDesktopJob(account,'login-after-close');await page.waitForFunction('window.socket.readyState===WebSocket.CLOSED');await closeBrowserDesktops();await fs.access(profile);await assert.rejects(fs.lstat(path.join(profile,'SingletonLock')),{code:'ENOENT'});
 assert.equal(binaryMessages,0);assert.deepEqual(errors,[]);console.log(JSON.stringify({initialChrome:pid,sharedDocuments:new Set(events.map(event=>event.document)).size,binaryMessages,sharedProfile:true}));
}finally{await closeLoginDesktops();await closeBrowserDesktops();await browser?.close();app.closeAllConnections();fixture.closeAllConnections();await Promise.all([new Promise(resolve=>app.close(resolve)),new Promise(resolve=>fixture.close(resolve))]);rtc.cleanup();await fs.rm(root,{recursive:true,force:true})}
`
  const result = spawnSync(process.execPath, ['--input-type=module'], { input: script, encoding: 'utf8', timeout: 60000, maxBuffer: 512 * 1024 })
  assert.equal(result.status, 0, result.stderr || result.error?.message || result.stdout)
  const summary = JSON.parse(result.stdout.trim().split('\n').at(-1)!)
  assert.equal(summary.sharedProfile, true); assert.equal(summary.sharedDocuments, 3); assert.equal(summary.binaryMessages, 0)
  t.diagnostic(JSON.stringify(summary))
})
