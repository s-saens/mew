import type { IncomingMessage, Server } from 'node:http'
import type { Http2SecureServer } from 'node:http2'
import crypto from 'node:crypto'
import { WebSocket, WebSocketServer } from 'ws'
import { BROWSER_DESKTOP_WS, browserDesktopCommand } from '../shared/browser-desktop.ts'
import { parseLoginDesktopInput, type LoginDesktopInput, type LoginDesktopState } from '../shared/login-desktop.ts'
import { LoginDesktopSession, childProcess, stopChild } from './login-desktop.ts'
import { BrowserDesktopVideo, H264AccessUnits, browserVideoFFmpegArgs, type BrowserVideoMode } from './browser-desktop-video.ts'
import { canUse } from './access-policy.ts'
import { watchSocketAccess } from './access-socket.ts'
import { resolveAuth, type RequestAuth } from './reqAuth.ts'
import { remoteContext } from './remote-access-context.ts'
import { desktopAutoNat, desktopIceServers } from './remote-desktop-host.ts'
import { webSocketOriginAllowed } from './websocket-origin.ts'

export { BROWSER_DESKTOP_WS }
const sessions = new Map<string, BrowserDesktopSession>()
const servers = new Set<Server | Http2SecureServer>()
const GRACE = 60000

export function browserDesktopAllowed(req: IncomingMessage, auth: RequestAuth, account = auth.email) {
  return !!account && auth.email === account && !auth.mustChangePassword && canUse(auth, 'portPreview') && canUse(auth, 'desktop') && (!!req.headers.origin || !!remoteContext(req)) && webSocketOriginAllowed(req)
}

export function browserDesktopTarget(raw: string): string {
  if (raw === 'about:blank') return raw
  if (raw.length > 8192) throw new Error('브라우저 주소가 너무 깁니다.')
  const url = new URL(raw)
  const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80))
  const blocked = new Set([Number(process.env.MEW_TEAM_PORT ?? 5000), 4999])
  for (const server of servers) { const address = server.address(); if (address && typeof address !== 'string') blocked.add(address.port) }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || blocked.has(port)) throw new Error('로그인 정보가 없는 HTTP(S) 주소를 사용해 주세요. Mew 자체 포트는 열 수 없습니다.')
  return url.href
}

/** A private X server and ordinary Chrome; media and input use desktop WebRTC. */
export class BrowserDesktopSession extends LoginDesktopSession {
  private viewer?: WebSocket
  private allowed?: () => boolean
  private video?: BrowserDesktopVideo
  private negotiated?: BrowserVideoMode
  private launchingCapture?: { resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }
  private encoding: Promise<void> = Promise.resolve()
  private restarting = false
  private lastEncoderAt = 0
  private encoderTimer?: ReturnType<typeof setTimeout>
  private captureRevision = 0
  private navigationRevision = 0
  private reconnect?: ReturnType<typeof setTimeout>
  private closeTask?: Promise<void>
  private requestedUrl: string
  private pendingNavigation?: string
  private reconnectCapture?: Promise<void>
  private receivedAt = 0
  private receivedInputs = 0

  constructor(account: string, url: string) {
    super(account, `browser:${crypto.randomUUID()}`, browserDesktopTarget(url), ['portPreview'], 8 * 60 * 60_000)
    this.requestedUrl = url
  }
  protected override profileKey() { return `browser-desktop:${this.account}` }
  protected override browserArguments(profile: string) { return super.browserArguments(profile).filter(argument => argument !== '--start-fullscreen') }
  protected override send(value: LoginDesktopState) { this.emitState(value) }
  private emitState(value: object) {
    if (this.viewer?.readyState !== WebSocket.OPEN) return
    if (!this.allowed?.()) { if (!this.closed) void this.close(); return }
    this.viewer.send(JSON.stringify(value))
  }
  private active() { return !this.closed && !!this.allowed?.() && this.viewer?.readyState === WebSocket.OPEN }

  ownsViewer(viewer: WebSocket) { return !this.closed && this.viewer === viewer }

  private createVideo() {
    const owner = this.viewer
    const current = () => this.viewer === owner && this.video === video && !this.closed
    const video: BrowserDesktopVideo = new BrowserDesktopVideo({
      iceServers: desktopIceServers(), autoNat: desktopAutoNat(),
      emit: value => { if (current()) this.emitState(value) },
      onVideo: mode => { if (!current()) return; this.negotiated = mode; return this.encode(mode, video) },
      keyframe: () => { if (current()) this.requestKeyframe() },
      onBitrate: bitrate => {
        if (!current() || !this.negotiated || bitrate < 350000 || Math.abs(bitrate - this.negotiated.bitrate) < this.negotiated.bitrate * .15) return
        this.negotiated = { ...this.negotiated, bitrate: Math.round(bitrate) }
        this.requestKeyframe()
      },
      onError: () => {
        if (!current()) return
        this.emitState({ type: 'error', message: '브라우저 영상 연결에 실패했습니다. 다시 연결해 주세요.' })
        this.viewer?.close(1011, 'Browser video disconnected')
      },
      input: (value, reliable) => {
        if (!current()) return
        try {
          if (!this.active()) { if (this.viewer && !this.allowed?.()) void this.close(); return }
          const input = parseLoginDesktopInput(value)
          if (!reliable && input.type !== 'pointer') throw new Error('Invalid motion channel input')
          if (['resize', 'close', 'frame-ack'].includes(input.type)) throw new Error('Invalid input channel command')
          this.acceptInput(input)
        } catch { this.fail('브라우저 입력을 처리하지 못했습니다. 다시 연결해 주세요.') }
      },
    })
    return video
  }

  private acceptInput(input: LoginDesktopInput) {
    const now = Date.now()
    if (now - this.receivedAt >= 1000) { this.receivedAt = now; this.receivedInputs = 0 }
    if (++this.receivedInputs > 500) throw new Error('Input limit exceeded')
    this.desktopInput(input)
  }

  attachViewer(viewer: WebSocket, allowed: () => boolean) {
    if (this.closed) { viewer.close(1008); return }
    clearTimeout(this.reconnect); clearTimeout(this.encoderTimer); this.restarting = false
    const previous = this.viewer
    this.viewer = viewer; this.allowed = allowed
    this.desktopInput({ type: 'release' })
    if (previous && previous !== viewer) previous.close(1012, 'Browser viewer replaced')
    // A new viewer needs its own ICE/DTLS session, while the Chrome process stays.
    const oldVideo = this.video
    this.video = this.createVideo()
    void oldVideo?.close()
    if (this.ready) {
      this.ready = false
      this.reconnectCapture = this.startCapture()
      void this.reconnectCapture.catch(() => { if (this.ownsViewer(viewer)) this.fail('브라우저 영상을 다시 연결하지 못했습니다.') })
    } else if (this.launchingCapture) {
      this.video.configure({ width: this.width, height: this.height, fps: 60 })
    }
    viewer.once('close', () => {
      if (this.viewer !== viewer || this.closed) return
      this.viewer = undefined; this.desktopInput({ type: 'release' })
      const capture = this.capture; this.capture = undefined
      void stopChild(capture); void this.video?.close(); this.video = undefined
      if (!allowed()) { void this.close(); return }
      this.reconnect = setTimeout(() => { void this.close() }, GRACE); this.reconnect.unref()
    })
    viewer.on('error', () => {})
  }

  async openDesktop(width: number, height: number, url: string, viewer: WebSocket) {
    const revision = this.navigationRevision
    await this.startDesktop(width, height)
    await this.reconnectCapture
    this.reconnectCapture = undefined
    if (this.ownsViewer(viewer) && revision === this.navigationRevision) await this.navigate(url, false, viewer)
  }

  signal(value: Record<string, unknown>) { this.video?.signal(value) }
  receiveInput(value: LoginDesktopInput) { this.acceptInput(value) }

  override resizeDesktop(width: number, height: number): Promise<void> {
    clearTimeout(this.encoderTimer); this.restarting = false; this.captureRevision++
    return super.resizeDesktop(width, height)
  }

  protected override startCapture(): Promise<void> {
    if (!this.video || this.closed) return Promise.reject(new Error('Browser viewer disconnected'))
    clearTimeout(this.encoderTimer); this.restarting = false; this.captureRevision++
    return new Promise((resolve, reject) => {
      if (this.launchingCapture) { clearTimeout(this.launchingCapture.timer); this.launchingCapture.reject(new Error('Capture replaced')) }
      const timer = setTimeout(() => { this.launchingCapture = undefined; reject(new Error('Browser video negotiation timed out')) }, 20000)
      this.launchingCapture = { resolve, reject, timer }
      this.video!.configure({ width: this.width, height: this.height, fps: 60 })
    })
  }

  private encode(mode: BrowserVideoMode, expectedVideo = this.video, recoveryRevision?: number): Promise<void> {
    const obsolete = () => recoveryRevision !== undefined && recoveryRevision !== this.captureRevision
    this.encoding = this.encoding.catch(() => {}).then(async () => {
      if (this.closed || !this.environment || !this.video || this.video !== expectedVideo || obsolete() || !this.viewer) return
      const old = this.capture; this.capture = undefined
      await stopChild(old)
      if (this.closed || !this.environment || !this.video || this.video !== expectedVideo || obsolete()) return
      this.lastEncoderAt = Date.now()
      this.width = mode.width; this.height = mode.height
      this.command({ type: 'resize', width: this.width, height: this.height })
      this.emitState({ type: 'size', width: this.width, height: this.height })
      const capture = childProcess('ffmpeg', browserVideoFFmpegArgs({ ...mode, display: this.environment.DISPLAY! }), this.environment)
      this.capture = capture
      const video = this.video
      const pending: Buffer[] = []
      let sending = false, pendingBytes = 0, overflow = false
      const drain = () => {
        if (this.closed || this.capture !== capture || this.video !== video || overflow) { pending.length = 0; return }
        if (sending) return
        const frame = pending.shift()
        if (!frame) { capture.stdout!.resume(); return }
        pendingBytes -= frame.length; sending = true
        video.frame(frame, Math.round(performance.now() * 1000), () => { sending = false; drain() })
      }
      const parser = new H264AccessUnits(frame => {
        if (this.closed || this.capture !== capture || this.video !== video || !this.active() || overflow) return
        if (pending.length >= 12 || pendingBytes + frame.length > 8 * 1024 * 1024) { overflow = true; pending.length = 0; this.requestKeyframe(); return }
        pending.push(frame); pendingBytes += frame.length
        if (!this.ready) {
          this.ready = true; this.emitState({ type: 'ready', width: this.width, height: this.height })
          if (this.pendingNavigation) { const url = this.pendingNavigation; this.pendingNavigation = undefined; void this.navigate(url) }
        }
        if (this.launchingCapture) { clearTimeout(this.launchingCapture.timer); this.launchingCapture.resolve(); this.launchingCapture = undefined }
      })
      capture.stdout!.on('data', (chunk: Buffer) => {
        if (this.closed || this.capture !== capture) return
        capture.stdout!.pause()
        try { parser.push(chunk); drain() } catch { this.fail('브라우저 영상 프레임이 한도를 넘었습니다.') }
      })
      const failed = () => { if (!this.closed && this.capture === capture) this.fail('브라우저 인코더가 종료됐습니다. FFmpeg의 X11·libx264 지원을 확인해 주세요.') }
      capture.once('error', failed); capture.once('exit', failed)
    })
    return this.encoding
  }

  private requestKeyframe() {
    if (this.restarting || !this.negotiated || !this.capture || this.closed) return
    this.restarting = true
    const delay = Math.max(0, 700 - (Date.now() - this.lastEncoderAt))
    const video = this.video, revision = this.captureRevision
    this.encoderTimer = setTimeout(() => {
      if (this.negotiated && this.ready && this.capture && !this.closed && this.video === video && this.captureRevision === revision) {
        void this.encode(this.negotiated, video, revision)
          .catch(() => { if (!this.closed && this.video === video && this.captureRevision === revision) this.fail('브라우저 인코더를 다시 시작하지 못했습니다.') })
          .finally(() => { if (this.video === video && this.captureRevision === revision) this.restarting = false })
      }
      else this.restarting = false
    }, delay)
    this.encoderTimer.unref()
  }

  async navigate(raw: string, force = true, viewer = this.viewer) {
    if (viewer !== this.viewer || this.closed) return
    if (force) this.navigationRevision++
    const url = browserDesktopTarget(raw)
    if (!force && url === this.requestedUrl) return
    this.requestedUrl = url
    if (!this.ready) { this.pendingNavigation = url; return }
    this.command({ type: 'release' })
    this.command({ type: 'key', key: 'Control', code: 'ControlLeft', down: true })
    this.command({ type: 'key', key: 'l', code: 'KeyL', down: true })
    this.command({ type: 'key', key: 'l', code: 'KeyL', down: false })
    this.command({ type: 'key', key: 'Control', code: 'ControlLeft', down: false })
    this.command({ type: 'paste', text: url })
    this.command({ type: 'key', key: 'Enter', code: 'Enter', down: true })
    this.command({ type: 'key', key: 'Enter', code: 'Enter', down: false })
  }

  override close(): Promise<void> {
    if (this.closeTask) return this.closeTask
    this.closed = true
    clearTimeout(this.reconnect); clearTimeout(this.encoderTimer)
    if (this.launchingCapture) { clearTimeout(this.launchingCapture.timer); this.launchingCapture.reject(new Error('Browser closed')); this.launchingCapture = undefined }
    const video = this.video; this.video = undefined
    this.emitState({ type: 'closed' }); this.viewer?.close(1000); this.viewer = undefined
    this.closeTask = (async () => { await Promise.all([super.close(), video?.close()]); await this.encoding.catch(() => {}); if (sessions.get(this.account) === this) sessions.delete(this.account) })()
    return this.closeTask
  }
}

export async function closeBrowserDesktops() { await Promise.all([...sessions.values()].map(session => session.close())) }

export function attachBrowserDesktopWebSocket(server: Server | Http2SecureServer, getAuth = resolveAuth) {
  servers.add(server)
  const wss = new WebSocketServer({ noServer: true, maxPayload: 32 * 1024, perMessageDeflate: false })
  server.on('upgrade', (req, socket, head) => {
    if (new URL(req.url ?? '', 'http://localhost').pathname !== BROWSER_DESKTOP_WS) return
    const auth = getAuth(req), account = auth.email ?? ''
    const allowed = () => browserDesktopAllowed(req, getAuth(req), account)
    if (!allowed()) { socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return }
    wss.handleUpgrade(req, socket, head, ws => {
      watchSocketAccess(ws, req, allowed)
      let session: BrowserDesktopSession | undefined, initialized = false, alive = true, received = 0, receivedAt = Date.now()
      const initialDeadline = setTimeout(() => ws.close(1008, 'Browser initialization timed out'), 15000); initialDeadline.unref()
      const heartbeat = setInterval(() => { if (session && !session.ownsViewer(ws)) { ws.close(1012); return }; if (!alive || !allowed()) { ws.terminate(); void session?.close(); return }; alive = false; ws.ping() }, 5000); heartbeat.unref()
      ws.on('pong', () => { alive = true })
      ws.on('message', (raw, binary) => {
        if (session && !session.ownsViewer(ws)) { ws.close(1012, 'Browser viewer replaced'); return }
        if (Date.now() - receivedAt >= 1000) { receivedAt = Date.now(); received = 0 }
        if (++received > 500) { ws.close(1008, 'Browser message limit exceeded'); void session?.close(); return }
        if (!allowed()) { ws.terminate(); void session?.close(); return }
        try {
          if (binary) throw new Error('Invalid browser input')
          const value = browserDesktopCommand(raw.toString())
          if (value.type === 'open') {
            if (initialized) throw new Error('Browser already initialized')
            const url = browserDesktopTarget(value.url)
            initialized = true; clearTimeout(initialDeadline)
            void (async () => {
              let acquired = sessions.get(account)
              while (acquired?.isClosed) { await acquired.close(); acquired = sessions.get(account) }
              if (!allowed() || ws.readyState !== WebSocket.OPEN) return
              if (!acquired) { acquired = new BrowserDesktopSession(account, url); sessions.set(account, acquired) }
              session = acquired
              session.attachViewer(ws, allowed)
              await session.openDesktop(value.width, value.height, url, ws)
            })().catch(() => {
              if (!session?.ownsViewer(ws)) return
              if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'error', message: '가상 Chrome 화면을 시작하지 못했습니다. Chrome·Xvfb·FFmpeg·Python과 WebRTC 런타임을 확인해 주세요.' }))
              void session.close()
            })
          } else {
            if (!session || !initialized) throw new Error('Browser not initialized')
            if (value.type === 'answer' || value.type === 'candidate') session.signal(value)
            else if (value.type === 'navigate') { browserDesktopTarget(value.url); void session.navigate(value.url, true, ws).catch(() => { if (session?.ownsViewer(ws)) { ws.close(1008); void session.close() } }) }
            else if (value.type === 'resize') void session.resizeDesktop(value.width, value.height)
            else if (value.type === 'close') void session.close()
            else session.receiveInput(value)
          }
        } catch { ws.close(1008, 'Invalid browser command'); void session?.close() }
      })
      ws.once('close', () => { clearTimeout(heartbeat); clearTimeout(initialDeadline) })
      ws.on('error', () => {})
    })
  })
  server.once('close', () => { servers.delete(server); wss.close(); void closeBrowserDesktops() })
}
