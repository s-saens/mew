import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile, execFileSync, spawnSync } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { EventEmitter } from 'node:events'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { promisify } from 'node:util'
import { chromium } from 'playwright-core'
import { domBrowserExecutable } from './browser-dom-executable.ts'
// @ts-expect-error Native helper JavaScript is outside the server.
import { rustDirect, rustMedia } from '../native/remote-desktop/rust-direct.mjs'
// @ts-expect-error Native helper JavaScript is outside the server.
import { installRustEngine } from '../native/remote-desktop/install-rust-engine.mjs'
// @ts-expect-error Native helper JavaScript is outside the server.
import { windowsVendorSource, prepareRustVendor } from '../native/remote-desktop/rust-vendor.mjs'
import { DEFAULT_VIDEO } from '../native/remote-desktop/video-settings.mjs'
import { rustLibrary } from '../native/remote-desktop/rust-engine.mjs'
import { HELPER_FILES } from '../native/remote-desktop/helper-version.mjs'

test('Windows vendored OpenSSL paths preserve source notices, verify checksums and reject unexpected upstream changes', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-rust-vendor-'))
  try {
    const directory = path.join(root, 'datachannel-sys-0.23.0+0.23.2')
    await fs.mkdir(directory)
    const before = '// MPL-2.0 source notice\ncrypto.join("lib/libcrypto.a");\nssl.join("lib/libssl.a");\n'
    const build = path.join(directory, 'build.rs'), checksum = path.join(directory, '.cargo-checksum.json')
    await fs.writeFile(build, before)
    await fs.writeFile(checksum, JSON.stringify({ package: 'registry-checksum', files: { 'build.rs': createHash('sha256').update(before).digest('hex') } }))
    prepareRustVendor(root, 'linux'); assert.equal(await fs.readFile(build, 'utf8'), before)
    prepareRustVendor(root, 'win32')
    const after = await fs.readFile(build, 'utf8')
    assert.match(after, /^\/\/ MPL-2.0 source notice/); assert.match(after, /libcrypto\.lib/); assert.match(after, /libssl\.lib/)
    assert.equal(windowsVendorSource(after), after)
    const sums = JSON.parse(await fs.readFile(checksum, 'utf8'))
    assert.equal(sums.package, 'registry-checksum'); assert.equal(sums.files['build.rs'], createHash('sha256').update(after).digest('hex'))
    assert.throws(() => windowsVendorSource('changed upstream'), /일치하지/)
    await fs.appendFile(build, 'unexpected change')
    assert.throws(() => prepareRustVendor(root, 'win32'), /체크섬/)
  } finally { await fs.rm(root, { recursive: true, force: true }) }
})

test('Rust install retains locked dependency sources, compiles offline and verifies only ABI without starting capture', () => {
  for (const platform of ['linux', 'darwin', 'win32']) {
    const calls: { command: string; args: string[] }[] = [], published: string[][] = []
    const target = "/fixture/Mew's $(literal) engine"
    const options = { target, platform, log() {}, exists: () => true, mkdir() {}, remove() {}, copy() {}, prepareVendor() {}, rename: (a: string, b: string) => published.push([a, b]),
      run: (command: string, args: string[]) => { calls.push({ command, args }); return { status: 0 } } }
    installRustEngine(options)
    assert.equal(calls[0].command, 'cargo'); assert.ok(calls[0].args.includes('vendor')); assert.ok(calls[0].args.includes('--locked'))
    assert.ok(calls[1].args.includes('--offline')); assert.ok(calls[1].args.includes('--locked'))
    assert.match(calls.at(-1)!.args.join(' '), /mew_engine_abi/)
    assert.doesNotMatch(calls.at(-1)!.args.join(' '), /mew_engine_create/)
    assert.deepEqual(published, [[path.join(target, `${rustLibrary(platform)}.tmp`), path.join(target, rustLibrary(platform))]])
    published.length = 0
    assert.throws(() => installRustEngine({ ...options, run: () => ({ status: 1 }) }), /Rust/)
    assert.equal(published.length, 0)
  }
})

test('Rust signaling scopes native events, preserves NAT cleanup and never transfers video to JavaScript', async () => {
  const engine = new EventEmitter() as EventEmitter & { postMessage(value: unknown): void }, commands: Record<string, unknown>[] = []
  engine.postMessage = value => commands.push(value as Record<string, unknown>)
  const emitted: Record<string, unknown>[] = [], inputs: unknown[] = [], errors: Error[] = []
  let closed = 0
  const session = 'a'.repeat(32)
  const direct = rustDirect(engine, { session, iceServers: [], settings: DEFAULT_VIDEO, autoNat: false,
    emit: (value: Record<string, unknown>) => emitted.push(value), input: (value: unknown, reliable: boolean) => inputs.push([value, reliable]),
    fail: (error: Error) => errors.push(error), keyframe() {}, bitrate() {}, video() {}, connectivity: () => ({ close() { closed++; return Promise.resolve() }, connected() {}, candidate() {} }) })
  assert.equal(commands[0].type, 'peer')
  assert.match(String(commands[0].media), /a=sendonly/)
  const event = (type: string, label: string, value: unknown, negotiation = 0) => engine.emit('message', { type, session, negotiation, label, value })
  event('rtc-open', 'motion', null, 99); assert.equal(emitted.length, 0)
  event('rtc-open', 'motion', null); event('rtc-open', 'motion', null); event('rtc-open', 'control', null)
  assert.equal(emitted.filter(value => value.type === 'connected').length, 1)
  event('rtc-message', 'motion', '{"type":"point","x":0.5,"y":0.5}')
  assert.equal(inputs.length, 1)
  event('rtc-message', 'control', 'invalid JSON'); assert.equal(errors.length, 1)
  await direct.close(); assert.equal(closed, 1); assert.equal(engine.listenerCount('message'), 0)
  assert.equal(commands.at(-1)!.type, 'close-peer')
  assert.equal(commands.some(value => value.type === 'frame'), false)
  assert.match(rustMedia(DEFAULT_VIDEO, 123), /a=ssrc:123 cname:mew/)
})

// A separately compiled test-only GPU ABI returns a synthetic H.264 image.
// No desktop capture, OS input, helper installation, or app server is started.
test('Rust native pipeline delivers H.264 while Node is blocked, stops, reconnects and independently expires its lease', {
  skip: process.platform !== 'linux' || !process.env.MEW_DESKTOP_TEST_RUST_LIBRARY || !domBrowserExecutable() || spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status !== 0,
  timeout: 60_000,
}, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-rust-engine-'))
  const koffi = createRequire(new URL('../native/remote-desktop/package.json', import.meta.url))('koffi')
  // Importing the bridge does not load a native library or start an engine.
  const { rustEngine } = await import('../native/remote-desktop/rust-engine.mjs')
  let engine: ReturnType<typeof rustEngine> | undefined, lease: ReturnType<typeof setInterval> | undefined
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  try {
    const image = path.join(root, 'pattern.h264')
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=1920x1080:r=60', '-frames:v', '1', '-c:v', 'libx264', '-profile:v', 'baseline', '-level:v', '4.2', '-x264-params', 'repeat-headers=1:keyint=1:bframes=0', '-f', 'h264', image])
    const bytes = await fs.readFile(image)
    await fs.writeFile(path.join(root, 'mock.c'), `
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
typedef struct { int32_t id,x,y,width,height,reserved; } Screen;
typedef struct { int32_t length,width,height,key; int64_t timestamp; } Frame;
typedef struct { int active; int64_t at,last; } Host;
static unsigned char image[]={${[...bytes].join(',')}};
static int64_t now(void) { struct timespec t; clock_gettime(CLOCK_MONOTONIC,&t);return (int64_t)t.tv_sec*1000000+t.tv_nsec/1000; }
int mew_gpu_abi(void) { return 2; }
void *mew_gpu_create(void) { return calloc(1,sizeof(Host)); }
int mew_gpu_screens(void *p,Screen *s,int capacity) { (void)p;if(capacity<1)return -1;*s=(Screen){0,0,0,1280,720,0};return 1; }
int mew_gpu_current(void *p,Screen *s) { return mew_gpu_screens(p,s,1)==1?0:-1; }
int mew_gpu_source(void *p,int x,int y,int w,int h) { (void)p;(void)x;(void)y;(void)w;(void)h;return 0; }
int mew_gpu_start(void *p,int id,int w,int h,int fps,int rate,int fd,uint32_t node,int profile,int level) { (void)id;(void)w;(void)h;(void)fps;(void)rate;(void)fd;(void)node;if(profile!=66||level<42)return -1;Host *v=p;v->active=1;v->at=now();v->last=0;return 0; }
int mew_gpu_poll(void *p,unsigned char *out,int capacity,Frame *meta) { Host *v=p;int64_t t=now();if(!v->active||t-v->last<16000)return 0;if(capacity<(int)sizeof(image))return -1;memcpy(out,image,sizeof(image));*meta=(Frame){sizeof(image),1920,1080,1,t-v->at};v->last=t;return sizeof(image); }
void mew_gpu_keyframe(void *p) { (void)p; }
void mew_gpu_bitrate(void *p,int rate) { (void)p;(void)rate; }
int mew_gpu_stop(void *p) { ((Host*)p)->active=0;return 0; }
void mew_gpu_destroy(void *p) { free(p); }
`)
    execFileSync('cc', ['-shared', '-fPIC', '-O2', '-Wall', '-Wextra', '-Werror', path.join(root, 'mock.c'), '-o', path.join(root, 'gpu-linux.so')])
    await fs.copyFile(process.env.MEW_DESKTOP_TEST_RUST_LIBRARY!, path.join(root, rustLibrary()))
    engine = rustEngine(koffi, root)
    const events: Record<string, unknown>[] = []
    engine.on('message', (value: Record<string, unknown>) => events.push(value))
    engine.on('error', (error: Error) => assert.fail(error.message))
    const wait = async (predicate: () => boolean, timeout = 5000) => {
      const deadline = Date.now() + timeout
      while (!predicate()) { assert.ok(Date.now() < deadline, JSON.stringify(events.filter(e => e.type === 'error'))); await delay(10) }
    }
    await wait(() => events.some(e => e.type === 'ready'))
    for (let round = 0; round < 2; round++) {
      const session = String(round).repeat(32), page = await browser.newPage(), failures: string[] = []
      let direct: ReturnType<typeof rustDirect>
      let requestedModes: unknown
      await page.exposeFunction('signal', (value: unknown) => direct.signal(value))
      await page.setContent('<video autoplay muted playsinline></video>')
      await page.evaluate(`window.pc=new RTCPeerConnection({iceServers:[]});window.pc.onicecandidate=e=>{if(e.candidate)window.signal({type:'candidate',candidate:e.candidate.toJSON()})};window.pc.ontrack=e=>document.querySelector('video').srcObject=new MediaStream([e.track]);window.pc.ondatachannel=e=>{e.channel.onopen=()=>{if(e.channel.label==='control')e.channel.send(JSON.stringify({type:'viewer-ready'}))}}`)
      direct = rustDirect(engine, { session, iceServers: [], autoNat: false, settings: { ...DEFAULT_VIDEO, quality: 'high' },
        emit: (value: { type: string; sdp?: string; candidate?: unknown }) => {
          if (value.type === 'offer') void page.evaluate(`(async()=>{await window.pc.setRemoteDescription({type:'offer',sdp:${JSON.stringify(value.sdp)}});const answer=await window.pc.createAnswer();answer.sdp=answer.sdp.replace(/(profile-level-id=[0-9a-f]{4})[0-9a-f]{2}/gi,(_,prefix)=>prefix+'2a');await window.pc.setLocalDescription(answer);window.signal({type:'answer',sdp:window.pc.localDescription.sdp})})()`).catch(e => failures.push(e.message))
          else if (value.type === 'candidate') void page.evaluate(`window.pc.addIceCandidate(${JSON.stringify(value.candidate)})`).catch(e => failures.push(e.message))
        },
        input() {}, keyframe: () => engine!.postMessage({ type: 'keyframe', session }), bitrate: (value: number) => engine!.postMessage({ type: 'bitrate', session, value }),
        fail: (error: Error) => failures.push(error.message),
        video: (modes: unknown, negotiation: number) => { requestedModes = modes; engine!.postMessage({ type: 'start', session, negotiation, id: 'gpu:0', modes }) },
      })
      const started = (value: { type: string; session: string; video: unknown }) => { if (value.type === 'started' && value.session === session) direct.configure(value.video) }
      engine.on('message', started)
      lease = setInterval(() => engine!.postMessage({ type: 'lease', session }), 200)
      await page.waitForFunction(`document.querySelector('video').videoWidth===1920`, null, { timeout: 10_000 }).catch(() => assert.fail(JSON.stringify({ failures, requestedModes, errors: events.filter(e => e.type === 'error') })))
      if (round === 0) {
        const count = () => page.evaluate<number>(`window.pc.getStats().then(s=>[...s.values()].find(v=>v.type==='inbound-rtp'&&v.kind==='video')?.framesDecoded||0)`)
        const before = await count()
        // Only this test process's Node thread is paused. Chromium and the Rust
        // video thread keep running; this checks removal of the event-loop dependency.
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400)
        const after = await count()
        assert.ok(after - before >= 8, `Native progress during blocked JS: ${before} -> ${after}`)
        await direct.close(); engine.postMessage({ type: 'stop', session })
        await wait(() => events.some(e => e.type === 'stopped' && e.session === session))
      } else {
        clearInterval(lease); lease = undefined
        await wait(() => events.some(e => e.type === 'error' && e.session === session && String(e.message).includes('만료')), 9500)
        await direct.close()
      }
      clearInterval(lease); lease = undefined; engine.removeListener('message', started)
      await page.close()
    }
    await engine.terminate(); engine = undefined
    const helperSource = path.resolve(import.meta.dirname, '../native/remote-desktop')
    for (const file of HELPER_FILES) {
      await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true })
      await fs.copyFile(path.join(helperSource, file), path.join(root, file))
    }
    await fs.symlink(path.join(helperSource, 'node_modules'), path.join(root, 'node_modules'), 'dir')
    // Exercise the unchanged OS permission/input owner and resident host with
    // a private Xvfb/D-Bus; all injected keys stay in the synthetic desktop.
    const fixtureEnv: NodeJS.ProcessEnv = { ...process.env, MEW_DESKTOP_ENGINE: 'rust', MEW_DESKTOP_TEST_LINUX_HELPER: root, MEW_DESKTOP_TEST_LINUX_ISOLATED: '1' }
    delete fixtureEnv.NODE_TEST_CONTEXT
    const isolated = await promisify(execFile)('dbus-run-session', ['--', 'xvfb-run', '-a', '-s', '-screen 0 1280x720x24 -nolisten tcp', process.execPath, '--test', path.resolve(import.meta.dirname, 'remote-desktop-linux.test.ts')], {
      env: fixtureEnv, timeout: 40_000, maxBuffer: 2 * 1024 * 1024,
    })
    assert.match(isolated.stdout, /# pass 1\b/)
    assert.match(isolated.stdout, /# skipped 0\b/)
  } finally {
    clearInterval(lease)
    await engine?.terminate()
    await browser.close()
    await fs.rm(root, { recursive: true, force: true })
  }
})
