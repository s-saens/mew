import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { spawnSync, type ChildProcess } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import type { LoginDesktopInput, LoginDesktopState } from '../shared/login-desktop.ts'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-native-runtime-test-'))
process.env.MEW_DATA_DIR = root
const { NativeBrowserSession, browserDesktopExecutable, childProcess, stopChild, waitForExit } = await import('./browser-native-runtime.ts')
test.after(() => fs.rm(root, { recursive: true, force: true }))

class RuntimeFixture extends NativeBrowserSession {
  captures: Array<{ width: number; height: number }> = []
  states: LoginDesktopState[] = []
  protected override send(state: LoginDesktopState) { this.states.push(state) }
  protected override async startCapture() { this.captures.push({ width: this.width, height: this.height }); this.ready = true }
  args(profile: string) { return this.browserArguments(profile) }
  profile() { return this.profileKey() }
  runtime() {
    return { width: this.width, height: this.height, ready: this.ready, environment: this.environment,
      browser: Reflect.get(this, 'browser') as ChildProcess | undefined, display: Reflect.get(this, 'display') as ChildProcess | undefined,
      input: Reflect.get(this, 'input') as ChildProcess | undefined, directory: Reflect.get(this, 'directory') as string | undefined }
  }
}

test('native Chrome defaults share one account profile and preserve the ordinary browser toolbar', async () => {
  const before = Date.now(), session = new RuntimeFixture('profile@test', 'https://example.test/')
  try {
    assert.equal(session.profile(), 'browser-desktop:profile@test')
    assert.ok(session.expiresAt >= before + 8 * 60 * 60_000 && session.expiresAt <= Date.now() + 8 * 60 * 60_000)
    const args = session.args('/fixture/profile')
    assert.ok(args.includes('--user-data-dir=/fixture/profile'))
    assert.equal(args.at(-1), 'https://example.test/')
    assert.ok(args.includes('--ozone-platform=x11'))
    assert.equal(args.some(argument => /headless|start-fullscreen|remote-debugging|enable-automation/.test(argument)), false)
  } finally { await session.close() }
})

test('native input aliases keep release available during startup and stop input after closure', async () => {
  class Probe extends RuntimeFixture {
    commands: Array<LoginDesktopInput | { type: 'shutdown' }> = []
    protected override command(value: LoginDesktopInput | { type: 'shutdown' }) { this.commands.push(value) }
    enable() { this.ready = true }
  }
  const session = new Probe('input@test', 'about:blank')
  try {
    session.nativeInput({ type: 'pointer', x: 12, y: 34 })
    session.nativeInput({ type: 'release' })
    assert.deepEqual(session.commands, [{ type: 'release' }])
    session.enable()
    session.desktopInput({ type: 'pointer', x: 12, y: 34 })
    assert.deepEqual(session.commands, [{ type: 'release' }, { type: 'pointer', x: 12, y: 34 }])
    await session.close(); const count = session.commands.length
    session.nativeInput({ type: 'release' })
    assert.equal(session.commands.length, count)
    await assert.rejects(session.startDesktop(640, 480), /종료/)
  } finally { await session.close() }
})

test('native runtime lifetimes are bounded and expiry closes an unstarted session', async () => {
  for (const lifetime of [0, -1, Infinity, 0x80000000, 2.5]) assert.throws(() => new RuntimeFixture('invalid@test', 'about:blank', lifetime), /유지 시간/)
  const session = new RuntimeFixture('expiry@test', 'about:blank', 20)
  await delay(50)
  assert.equal(session.isClosed, true)
  assert.deepEqual(session.states, [{ type: 'closed' }])
  await session.close()
})

test('native child cleanup confirms termination and remains safe when repeated', async () => {
  const child = childProcess(process.execPath, ['-e', 'process.stdout.write("ready");setInterval(()=>{},1000)'], process.env)
  try {
    await once(child.stdout!, 'data')
    assert.equal(await waitForExit(child, 10), false)
    await stopChild(child)
    assert.equal(await waitForExit(child, 10), true)
    await stopChild(child)
  } finally { await stopChild(child) }
})

let chrome: string | undefined
try { chrome = browserDesktopExecutable() } catch { /* Ordinary Chrome is optional in test environments. */ }
const dependencies = process.platform === 'linux' && !!chrome && ['Xvfb', 'python3'].every(command => spawnSync(command, [command === 'Xvfb' ? '-help' : '--version'], { stdio: 'ignore' }).status === 0)

test('neutral X11 runtime drives headed Chrome and retains its document across capture resize', { skip: !dependencies, timeout: 25000 }, async () => {
  const events: Array<{ kind: string; width: number; height: number; document: string; text: string; webdriver: boolean }> = []
  const server = createServer((req, res) => {
    const url = new URL(req.url!, 'http://localhost')
    if (url.pathname === '/event') {
      events.push({ kind: url.searchParams.get('kind')!, width: Number(url.searchParams.get('width')), height: Number(url.searchParams.get('height')), document: url.searchParams.get('document') ?? '', text: url.searchParams.get('text') ?? '', webdriver: url.searchParams.get('webdriver') === 'true' })
      res.end('ok'); return
    }
    res.setHeader('Content-Type', 'text/html')
    res.end('<!doctype html><meta charset="utf-8"><style>body{margin:0}input{position:absolute;left:30px;top:30px;width:240px;height:50px}</style><input onclick="fetch(`/event?kind=clicked`)" oninput="fetch(`/event?kind=text&text=${encodeURIComponent(this.value)}`)"><script>const id=crypto.randomUUID();function report(){fetch(`/event?kind=loaded&width=${innerWidth}&height=${innerHeight}&document=${id}&webdriver=${navigator.webdriver}`)}addEventListener("resize",report);requestAnimationFrame(()=>requestAnimationFrame(report))</script>')
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const session = new RuntimeFixture('native-fixture@test', `http://127.0.0.1:${(server.address() as { port: number }).port}/`)
  const until = async (predicate: () => boolean, label: string) => {
    for (let attempt = 0; attempt < 200; attempt++) { if (predicate()) return; await delay(25) }
    assert.fail(`${label}: ${JSON.stringify(events)}`)
  }
  try {
    await session.startDesktop(641, 481)
    const initial = session.runtime()
    assert.deepEqual({ width: initial.width, height: initial.height }, { width: 640, height: 480 })
    assert.match(initial.environment!.DISPLAY!, /^:\d+$/)
    assert.equal(initial.environment!.DBUS_SESSION_BUS_ADDRESS, 'disabled:')
    assert.equal(initial.environment!.WAYLAND_DISPLAY, undefined)
    assert.ok(initial.environment!.XAUTHORITY!.startsWith(initial.directory! + path.sep))
    const profile = path.join(root, 'browser', 'profiles', createHash('sha256').update('browser-desktop:native-fixture@test').digest('hex'))
    await fs.access(profile)
    await until(() => events.some(event => event.kind === 'loaded'), 'fixture first paint')
    const document = events.find(event => event.kind === 'loaded')!.document
    assert.equal(events.find(event => event.kind === 'loaded')!.webdriver, false)
    assert.ok(events.findLast(event => event.kind === 'loaded')!.height < 480, 'ordinary Chrome toolbar remains visible')
    const click = async () => {
      const count = events.filter(event => event.kind === 'clicked').length
      for (let attempt = 0; attempt < 50; attempt++) {
        const y = 55 + session.runtime().height - events.findLast(event => event.kind === 'loaded')!.height
        session.nativeInput({ type: 'button', button: 0, down: true, x: 100, y }); session.nativeInput({ type: 'button', button: 0, down: false, x: 100, y })
        await delay(80)
        if (events.filter(event => event.kind === 'clicked').length > count) return
      }
      assert.fail(`Native click did not reach its input: ${JSON.stringify(events)}`)
    }
    await click(); session.nativeInput({ type: 'paste', text: '공유 브라우저' })
    await until(() => events.some(event => event.text === '공유 브라우저'), 'Unicode native paste')
    await session.resizeDesktop(901, 701)
    assert.deepEqual(session.captures, [{ width: 640, height: 480 }, { width: 900, height: 700 }])
    await until(() => events.some(event => event.kind === 'loaded' && event.width >= 898), 'window resize')
    assert.equal(events.findLast(event => event.kind === 'loaded')!.document, document)
    await click(); session.nativeInput({ type: 'key', key: 'End', code: 'End', down: true }); session.nativeInput({ type: 'key', key: 'End', code: 'End', down: false })
    session.nativeInput({ type: 'paste', text: ' retained' })
    await until(() => events.some(event => event.text === '공유 브라우저 retained'), 'native input after resize')
    await session.close(); await session.close()
    for (const child of [initial.display, initial.browser, initial.input]) assert.ok(child && (child.exitCode !== null || child.signalCode !== null), 'every owned native child has exited')
    await assert.rejects(fs.access(initial.directory!), { code: 'ENOENT' })
    await fs.access(profile)
    await assert.rejects(fs.lstat(path.join(profile, 'SingletonLock')), { code: 'ENOENT' })
  } finally {
    await session.close()
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()))
  }
})

test('closing during neutral display startup cancels the owned launch', { skip: !dependencies, timeout: 15000 }, async () => {
  const session = new RuntimeFixture('cancel@test', 'about:blank')
  const starting = session.startDesktop(640, 480).catch(() => {})
  const before = Date.now()
  await session.close(); await starting
  assert.equal(session.isClosed, true)
  assert.ok(Date.now() - before < 5000)
  const directory = session.runtime().directory
  if (directory) await assert.rejects(fs.access(directory), { code: 'ENOENT' })
})
