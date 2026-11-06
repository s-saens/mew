import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn, type ChildProcess } from 'node:child_process'
import { externalBrowserExecutable } from './browser-dom-executable.ts'
import { DATA_DIR } from './dataDir.ts'
import { LOGIN_DESKTOP_LIMITS as NATIVE_BROWSER_LIMITS, loginDesktopSize as nativeBrowserSize, type LoginDesktopInput as NativeBrowserInput, type LoginDesktopState as NativeBrowserState } from '../shared/login-desktop.ts'

const owned = new Set<ChildProcess>()
const DEFAULT_LIFETIME = 8 * 60 * 60_000
process.once('exit', () => { for (const child of owned) signalChild(child, 'SIGTERM') })

export function signalChild(child: ChildProcess, signal: NodeJS.Signals) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return
  try { process.kill(-child.pid, signal) } catch { try { child.kill(signal) } catch { /* Already exited. */ } }
}

export function childProcess(command: string, args: string[], env: NodeJS.ProcessEnv): ChildProcess {
  const child = spawn(command, args, { env, detached: true, stdio: ['pipe', 'pipe', 'pipe'] })
  owned.add(child)
  child.once('error', () => { owned.delete(child) })
  child.once('exit', () => { owned.delete(child) })
  child.stderr!.resume()
  return child
}

export async function waitForExit(child: ChildProcess, timeout: number): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null || !child.pid) return true
  return new Promise(resolve => {
    const finish = (exited: boolean) => { clearTimeout(timer); child.off('exit', exit); resolve(exited) }
    const exit = () => finish(true)
    const timer = setTimeout(() => finish(false), timeout)
    child.once('exit', exit)
  })
}

export async function stopChild(child: ChildProcess | undefined) {
  if (!child) return
  signalChild(child, 'SIGTERM')
  if (!await waitForExit(child, 1500)) { signalChild(child, 'SIGKILL'); await waitForExit(child, 1500) }
  child.stdin?.destroy(); child.stdout?.destroy()
}

/** Native browser surfaces always use ordinary installed Chrome. */
export function browserDesktopExecutable(env: NodeJS.ProcessEnv = process.env): string {
  const found = externalBrowserExecutable({ env })
  if (!found) throw new Error('호스트 Google Chrome이 없습니다. 일반 Google Chrome을 설치하거나 MEW_CHROME_EXECUTABLE에 실행 파일의 절대 경로를 지정해 주세요.')
  return found
}

/** Owns a private X server and ordinary Chrome, independently of jobs or media transport. */
export abstract class NativeBrowserSession {
  readonly id = crypto.randomBytes(24).toString('base64url')
  readonly expiresAt: number
  readonly account: string
  readonly url: string
  protected width = 0
  protected height = 0
  protected environment?: NodeJS.ProcessEnv
  protected capture?: ChildProcess
  protected ready = false
  protected closed = false
  private timer: ReturnType<typeof setTimeout>
  private starting?: Promise<void>
  private resizing?: Promise<void>
  private requestedSize?: { width: number; height: number }
  private closing?: Promise<void>
  private directory?: string
  private display?: ChildProcess
  private browser?: ChildProcess
  private profileDirectory?: string
  private navigationLaunchers = new Set<ChildProcess>()
  private input?: ChildProcess

  constructor(account: string, url: string, lifetimeMs = DEFAULT_LIFETIME) {
    if (!Number.isSafeInteger(lifetimeMs) || lifetimeMs < 1 || lifetimeMs > 0x7fffffff) throw new Error('가상 화면 유지 시간이 올바르지 않습니다.')
    this.account = account; this.url = url
    this.expiresAt = Date.now() + lifetimeMs
    this.timer = setTimeout(() => { void this.close() }, lifetimeMs); this.timer.unref()
  }

  get isClosed() { return this.closed }
  protected abstract send(state: NativeBrowserState): void
  protected abstract startCapture(): Promise<void>
  protected fail(message: string) { if (this.closed) return; this.send({ type: 'error', message }); void this.close() }
  protected command(value: NativeBrowserInput | { type: 'shutdown' }) {
    const stream = this.input?.stdin
    if (!stream || stream.destroyed || stream.writableLength > 64 * 1024) return
    stream.write(JSON.stringify(value) + '\n')
  }

  startDesktop(width: number, height: number): Promise<void> {
    if (this.closed) return Promise.reject(new Error('가상 화면이 종료됐습니다.'))
    if (this.starting) return this.resizeDesktop(width, height)
    const size = nativeBrowserSize(width, height)
    this.width = size.width; this.height = size.height
    this.starting = this.launch()
    return this.starting
  }

  resizeDesktop(width: number, height: number): Promise<void> {
    if (this.closed) return Promise.resolve()
    if (!this.starting) return this.startDesktop(width, height)
    this.requestedSize = nativeBrowserSize(width, height)
    return this.resize()
  }

  /** Permission, input validation and rate limiting belong to the owning transport. */
  nativeInput(input: NativeBrowserInput) {
    if (this.closed) return
    if (input.type === 'release') this.command(input)
    else if (input.type === 'close') void this.close()
    else if (input.type === 'resize') void this.resizeDesktop(input.width, input.height).catch(() => this.fail('브라우저 화면을 시작하지 못했습니다. Linux/WSL의 Chrome·Xvfb·FFmpeg·Python3·libXtst 설치를 확인해 주세요.'))
    else if (this.ready) this.command(input)
  }

  desktopInput(input: NativeBrowserInput) { this.nativeInput(input) }

  protected profileKey() { return `browser-desktop:${this.account}` }
  protected async openNativeUrl(url: string) {
    if (this.closed || !this.environment || !this.profileDirectory || !this.browser || this.browser.exitCode !== null) return
    // Chrome forwards this URL through its profile's SingleInstance IPC to the
    // running browser. Native address-bar paste/typing can race page focus.
    const launcher = childProcess(browserDesktopExecutable(), [`--user-data-dir=${this.profileDirectory}`, '--no-first-run', '--no-default-browser-check', '--ozone-platform=x11', url], this.environment)
    this.navigationLaunchers.add(launcher)
    launcher.stdout!.resume()
    try {
      const exited = await waitForExit(launcher, 10000)
      if (!this.closed && (!exited || launcher.exitCode !== 0)) throw new Error('Browser navigation failed')
    } finally {
      await stopChild(launcher)
      this.navigationLaunchers.delete(launcher)
    }
  }
  protected browserArguments(profile: string): string[] {
    return [`--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--ozone-platform=x11', '--new-window', `--window-size=${this.width},${this.height}`, '--window-position=0,0', this.url]
  }

  private resize(): Promise<void> {
    if (this.resizing || this.closed) return this.resizing ?? Promise.resolve()
    this.resizing = (async () => {
      await this.starting
      while (this.requestedSize && !this.closed) {
        const size = this.requestedSize; this.requestedSize = undefined
        if (size.width === this.width && size.height === this.height) continue
        this.ready = false; this.command({ type: 'release' })
        const previous = this.capture; this.capture = undefined
        await stopChild(previous)
        if (this.closed) return
        this.width = size.width; this.height = size.height
        const input = this.input!
        await new Promise<void>((resolve, reject) => {
          let output = ''
          const timer = setTimeout(() => finish(new Error('resize-timeout')), 3000)
          const receive = (data: Buffer) => { output += data.toString(); if (output.includes('"resized"')) finish(); else if (output.length > 1024) finish(new Error('resize-output')) }
          const failed = () => finish(new Error('input-ended'))
          function finish(error?: Error) { clearTimeout(timer); input.stdout!.off('data', receive); input.off('exit', failed); if (error) reject(error); else resolve() }
          input.stdout!.on('data', receive); input.once('exit', failed)
          this.command({ type: 'resize', ...size })
        })
        if (!this.closed) await this.startCapture()
      }
    })().catch(() => { this.fail('브라우저 화면 크기를 변경하지 못했습니다. 화면을 닫고 다시 열어 주세요.') }).finally(() => { this.resizing = undefined; if (this.requestedSize && !this.closed) this.resize() })
    return this.resizing
  }

  private async launch() {
    if (process.platform !== 'linux') throw new Error('브라우저 가상 화면은 현재 Linux/WSL에서 지원합니다.')
    const chrome = browserDesktopExecutable()
    this.directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-browser-native-'))
    const authority = path.join(this.directory, 'authority')
    const field = (value: Buffer) => { const length = Buffer.alloc(2); length.writeUInt16BE(value.length); return Buffer.concat([length, value]) }
    fs.writeFileSync(authority, Buffer.concat([Buffer.from([0xff, 0xff]), field(Buffer.alloc(0)), field(Buffer.alloc(0)), field(Buffer.from('MIT-MAGIC-COOKIE-1')), field(crypto.randomBytes(16))]), { mode: 0o600 })
    const runtime = path.join(this.directory, 'runtime'); fs.mkdirSync(runtime, { mode: 0o700 })
    const baseEnv = { ...process.env, XAUTHORITY: authority, XDG_RUNTIME_DIR: runtime, XDG_SESSION_TYPE: 'x11', WAYLAND_DISPLAY: undefined, DBUS_SESSION_BUS_ADDRESS: 'disabled:', GTK_USE_PORTAL: '0', NODE_OPTIONS: undefined }
    // Keep a fixed private framebuffer; resize only native windows and the capture crop.
    this.display = spawn('Xvfb', [`:${crypto.randomInt(10000, 60000)}`, '-displayfd', '3', '-screen', '0', `${NATIVE_BROWSER_LIMITS.maxWidth}x${NATIVE_BROWSER_LIMITS.maxHeight}x24`, '-nolisten', 'tcp', '-nolisten', 'unix', '-auth', authority], { detached: true, env: baseEnv, stdio: ['ignore', 'ignore', 'ignore', 'pipe'] })
    const display = this.display
    owned.add(display); display.once('exit', () => owned.delete(display)); display.once('error', () => owned.delete(display))
    const name = await new Promise<string>((resolve, reject) => {
      let output = ''
      const timer = setTimeout(() => finish(new Error('display-timeout')), 10_000)
      const receive = (value: Buffer) => { output += value.toString(); if (/^\d+\n$/.test(output)) finish(undefined, ':' + output.trim()); else if (output.length > 32) finish(new Error('display-output')) }
      const failed = () => finish(new Error('display-start'))
      function finish(error?: Error, value?: string) { clearTimeout(timer); display.off('error', failed); display.off('exit', failed); display.stdio[3]?.off('data', receive); if (error) reject(error); else resolve(value!) }
      display.once('error', failed); display.once('exit', failed); display.stdio[3]?.on('data', receive)
    })
    if (this.closed) return
    const env = { ...baseEnv, DISPLAY: name }
    this.environment = env
    this.input = childProcess('python3', ['-u', fileURLToPath(new URL('./login-desktop-x11.py', import.meta.url)), String(this.width), String(this.height)], env)
    const input = this.input
    input.stdin!.on('error', () => { if (!this.closed) this.fail('브라우저 화면의 입력 연결이 종료됐습니다.') })
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => finish(new Error('input-timeout')), 10_000)
      const receive = (value: Buffer) => { if (value.toString().includes('"ready"')) finish() }
      const failed = () => finish(new Error('input-start'))
      function finish(error?: Error) { clearTimeout(timer); input.off('error', failed); input.off('exit', failed); input.stdout!.off('data', receive); if (error) reject(error); else resolve() }
      input.once('error', failed); input.once('exit', failed); input.stdout!.on('data', receive)
    })
    input.stdout!.resume()
    if (this.closed) return
    const profile = path.join(DATA_DIR, 'browser', 'profiles', crypto.createHash('sha256').update(this.profileKey()).digest('hex'))
    this.profileDirectory = profile
    fs.mkdirSync(profile, { recursive: true, mode: 0o700 })
    this.browser = childProcess(chrome, this.browserArguments(profile), env)
    this.browser.stdout!.resume()
    this.browser.once('error', () => { this.fail('호스트 Chrome을 실행하지 못했습니다.') })
    this.browser.once('exit', () => { if (!this.closed) void this.close() })
    input.once('exit', () => { if (!this.closed) this.fail('브라우저 화면의 입력 처리가 종료됐습니다.') })
    display.once('exit', () => { if (!this.closed) this.fail('브라우저 가상 화면이 종료됐습니다.') })
    await this.startCapture()
  }

  close(): Promise<void> {
    if (this.closing) return this.closing
    this.closed = true; clearTimeout(this.timer)
    this.send({ type: 'closed' })
    this.closing = (async () => {
      await Promise.all([...this.navigationLaunchers].map(child => stopChild(child)))
      if (!this.ready) await Promise.all([stopChild(this.capture), stopChild(this.input), stopChild(this.display)])
      await this.starting?.catch(() => {})
      await this.resizing?.catch(() => {})
      await stopChild(this.capture)
      this.command({ type: 'shutdown' })
      if (this.browser && !await waitForExit(this.browser, 1500)) await stopChild(this.browser)
      await stopChild(this.input); await stopChild(this.display)
      if (this.directory) fs.rmSync(this.directory, { recursive: true, force: true })
    })()
    return this.closing
  }
}
