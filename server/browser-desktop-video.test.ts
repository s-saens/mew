import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { BrowserDesktopVideo, H264AccessUnits, browserVideoFFmpegArgs } from './browser-desktop-video.ts'

const nal = (type: number, data = [1, 2], short = false) => Buffer.from([...(short ? [0, 0, 1] : [0, 0, 0, 1]), type, ...data])
const picture = (key = false) => Buffer.concat([nal(9, [0xf0]), ...(key ? [nal(0x67), nal(0x68)] : []), nal(key ? 0x65 : 0x41, [11, 12, 13])])

test('Annex B pictures survive every stdout split, including split AUD headers', () => {
  const first = picture(true), second = picture(), third = Buffer.concat([nal(9, [0xf0], true), nal(0x41, [77], true)])
  const stream = Buffer.concat([first, second, third])
  for (let split = 1; split < stream.length; split++) {
    const frames: Buffer[] = [], parser = new H264AccessUnits(frame => frames.push(frame))
    parser.push(stream.subarray(0, split)); parser.push(stream.subarray(split)); parser.flush()
    assert.deepEqual(frames, [first, second, third], `split ${split}`)
  }
})

test('multiple pictures in a large chunk remain bounded per picture', () => {
  const frames: Buffer[] = [], parser = new H264AccessUnits(frame => frames.push(frame), { maxBytes: 64 })
  const expected = picture()
  parser.push(Buffer.concat(Array.from({ length: 10000 }, () => expected))); parser.flush()
  assert.equal(frames.length, 10000)
  assert.ok(frames.every(frame => frame.equals(expected)))
})

test('an unterminated or oversized picture cannot grow the capture buffer indefinitely', () => {
  const frames: Buffer[] = [], parser = new H264AccessUnits(frame => frames.push(frame), { maxBytes: 64 })
  parser.push(nal(9))
  assert.throws(() => parser.push(Buffer.alloc(65, 0xff)), /bounded video buffer/)
  parser.push(picture(true)); parser.flush()
  assert.deepEqual(frames, [picture(true)])
  assert.throws(() => new H264AccessUnits(() => {}, { maxBytes: 4 }), /limit/)
})

test('flush ignores delimiter-only tails and reset separates encoder generations', () => {
  const frames: Buffer[] = [], parser = new H264AccessUnits(frame => frames.push(frame))
  parser.push(picture()); parser.reset(); parser.push(nal(9)); parser.flush()
  assert.deepEqual(frames, [])
  parser.push(picture(true)); parser.flush()
  assert.deepEqual(frames, [picture(true)])
})

test('FFmpeg capture is local X11 and disables reordering and lookahead', () => {
  const args = browserVideoFFmpegArgs({ display: ':131.0', width: 383, height: 801, fps: 60, bitrate: 3000000 })
  const value = (key: string) => args[args.indexOf(key) + 1]
  assert.equal(value('-f'), 'x11grab')
  assert.equal(value('-i'), ':131.0')
  assert.equal(value('-video_size'), '382x800')
  assert.equal(value('-profile:v'), 'baseline')
  assert.equal(value('-tune'), 'zerolatency')
  assert.equal(value('-bf'), '0')
  assert.match(value('-x264-params'), /repeat-headers=1:aud=1/)
  assert.match(value('-x264-params'), /rc-lookahead=0:sync-lookahead=0/)
  assert.equal(args.at(-1), 'pipe:1')
  for (const override of [{ display: 'host.example:0' }, { fps: 120 }, { bitrate: Infinity }, { level: 31, width: 1920, height: 1080, fps: 60 }]) {
    assert.throws(() => browserVideoFFmpegArgs({ display: ':131', width: 1280, height: 720, fps: 60, bitrate: 3000000, ...override }))
  }
})

test('closed video sessions cannot restart capture or accept frames', async () => {
  const messages: unknown[] = []
  const video = new BrowserDesktopVideo({ emit: value => messages.push(value), onVideo: () => assert.fail('closed capture restarted'), onError: error => { throw error }, keyframe() {} })
  assert.throws(() => video.configure({ width: 0, height: 800, fps: 60 }), /size/)
  await video.close(); video.configure({ width: 800, height: 600, fps: 60 }); video.signal({ type: 'answer', sdp: '' })
  let completed = 0
  video.frame(Buffer.alloc(0), 0, () => completed++)
  assert.equal(completed, 1); assert.deepEqual(messages, [])
})

const native = createRequire(new URL('../native/remote-desktop/package.json', import.meta.url))
let nativeAvailable = false
try { nativeAvailable = !!native.resolve('node-datachannel') } catch { /* Native runtime is optional. */ }
const ffmpegAvailable = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0

test('real native WebRTC carries FFmpeg H.264 over RTP without a desktop or HTTP server', { skip: !nativeAvailable || !ffmpegAvailable, timeout: 25000 }, () => {
  const script = `
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {BrowserDesktopVideo,H264AccessUnits,browserVideoFFmpegArgs} from ${JSON.stringify(new URL('./browser-desktop-video.ts', import.meta.url).href)};
const requireNative=createRequire(${JSON.stringify(new URL('../native/remote-desktop/package.json', import.meta.url).href)});
const rtc=requireNative('node-datachannel');
const receiver=new rtc.PeerConnection('browser-video-synthetic',{iceServers:[],disableAutoNegotiation:true});
const channels=[];let packets=0,marked=0,inputs=0,mode,remote=false,video,closed=false,offers=0,queuedSignals=0;const pending=[],errors=[],sample=[];
// Production signaling crosses a WebSocket. Do not reenter another native peer
// from a native callback or add candidates before its local ICE transport exists.
let signaling=Promise.resolve();
const enqueue=action=>{if(closed)return;if(queuedSignals>=128){errors.push('Synthetic signaling queue overflow');return}queuedSignals++;
 signaling=signaling.then(()=>new Promise(resolve=>setImmediate(resolve))).then(()=>{queuedSignals--;if(!closed)action()}).catch(error=>{if(!closed)errors.push(error.message)})};
receiver.onTrack(track=>{if(closed)return;channels.push(track);track.onMessage(packet=>{if(closed||packet[1]>=192&&packet[1]<=223)return;packets++;if(packet[1]&128)marked++;if(sample.length<3)sample.push(Buffer.from(packet).subarray(0,16).toString('hex'))})});
receiver.onDataChannel(channel=>{if(closed)return;channels.push(channel);channel.onOpen(()=>{if(!closed)channel.sendMessage(JSON.stringify({type:'synthetic-input'}))})});
receiver.onLocalDescription((sdp,type)=>{if(type==='answer')enqueue(()=>{remote=true;video.signal({type,sdp});for(const c of pending)receiver.addRemoteCandidate(c.candidate,c.sdpMid);pending.length=0})});
receiver.onLocalCandidate((candidate,sdpMid)=>enqueue(()=>video.signal({type:'candidate',candidate:{candidate,sdpMid}})));
video=new BrowserDesktopVideo({
 emit(value){if(value.type==='offer')enqueue(()=>{offers++;receiver.setRemoteDescription(value.sdp,'offer');receiver.setLocalDescription('answer')});
  else if(value.type==='candidate')enqueue(()=>{const c=value.candidate;if(remote)receiver.addRemoteCandidate(c.candidate,c.sdpMid);else pending.push(c)})},
 onVideo(value){mode=value},keyframe(){},onError(error){if(!closed)errors.push(error.message)},input(){inputs++}
});
try {
 video.configure({width:382,height:802,fps:60});
 for(let i=0;i<300&&!mode;i++)await delay(10);
 assert.ok(mode,errors.join(';'));assert.equal(mode.profile,'baseline');assert.equal(mode.width,382);assert.equal(mode.height,802);
 for(let i=0;i<300&&inputs<2;i++)await delay(10);
 assert.equal(inputs,2,errors.join(';'));
 const all=browserVideoFFmpegArgs({display:':131',...mode}),codec=all.slice(all.indexOf('-an'));
 const encoded=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size='+mode.width+'x'+mode.height+':rate='+mode.fps,'-frames:v','60',...codec],{maxBuffer:8*1024*1024});
 assert.equal(encoded.status,0,encoded.stderr.toString());
 let count=0;const frames=[];const parser=new H264AccessUnits(data=>frames.push(data));
 for(let offset=0;offset<encoded.stdout.length;offset+=137)parser.push(encoded.stdout.subarray(offset,offset+137));parser.flush();
 assert.equal(frames.length,60);
 for(const data of frames){await new Promise(resolve=>video.frame(data,Math.round(count++*1000000/mode.fps),resolve));await delay(1000/mode.fps)}
 for(let i=0;i<100&&marked<5;i++)await delay(10);
 assert.ok(packets>0,'No H.264 RTP packets arrived');assert.ok(marked>=5,'No complete H.264 pictures arrived: '+JSON.stringify({packets,marked,sample,errors}));
 video.configure({width:1920,height:1080,fps:30});await delay(0);assert.equal(offers,1);assert.equal(mode.fps,30);
 assert.equal(errors.length,0,errors.join(';'));
 console.log(JSON.stringify({packets,marked,inputs,frames:frames.length}));
}finally{closed=true;await signaling;await video.close();receiver.close();await delay(0);rtc.cleanup()}
`
  const result = spawnSync(process.execPath, ['--input-type=module'], { input: script, encoding: 'utf8', timeout: 20000, maxBuffer: 262144 })
  assert.equal(result.status, 0, result.stderr || result.error?.message || result.stdout)
  const summary = JSON.parse(result.stdout.trim())
  assert.ok(summary.packets > 0); assert.ok(summary.marked >= 5); assert.equal(summary.inputs, 2); assert.equal(summary.frames, 60)
})
