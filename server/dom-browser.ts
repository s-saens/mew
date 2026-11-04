import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import type { IncomingMessage, Server } from 'node:http'
import type { Http2SecureServer } from 'node:http2'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core'
import { WebSocket, WebSocketServer } from 'ws'
import { DOM_BROWSER_WS, type DomBrowserCommand, type DomBrowserMessage } from '../shared/dom-browser.ts'
import { resolveAuth, type RequestAuth } from './reqAuth.ts'
import { canUse } from './access-policy.ts'
import { watchSocketAccess } from './access-socket.ts'
import { webSocketOriginAllowed } from './websocket-origin.ts'
import { domBrowserExecutable } from './browser-dom-executable.ts'
import { DOM_BROWSER_COMPAT_SCRIPT } from './dom-browser-compat.ts'

export { DOM_BROWSER_WS }
const sessions = new Set<DomBrowserSession>()
const servers = new Set<Server | Http2SecureServer>()
export function domBrowserMewPorts(): ReadonlySet<number> {
  const ports = new Set<number>()
  for (const server of servers) {
    const address = server.address()
    if (address && typeof address !== 'string') ports.add(address.port)
  }
  return ports
}
export function domBrowserBlockedPorts(): ReadonlySet<number> {
  return new Set([Number(process.env.MEW_TEAM_PORT ?? 5000), 4999, ...domBrowserMewPorts()])
}
const MAX_ASSET = 4 * 1024 * 1024
const MAX_QUEUE = 16 * 1024 * 1024
const EMPTY_IMAGE = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='
type AssetCache = { entries: Map<string, Promise<string>>; bytes: number; baseUrl: string; abort: AbortController }
const assetCache = (baseUrl = 'about:blank'): AssetCache => ({ entries: new Map(), bytes: 0, baseUrl, abort: new AbortController() })
const recordBundle = () => fs.readFileSync(path.join(path.dirname(createRequire(import.meta.url).resolve('@rrweb/record')), 'record.umd.min.cjs'), 'utf8')

/** Allow HTTP documents while keeping credentials and Mew's ports out of the host browser. */
export function domBrowserTarget(raw: string, blockedPorts: ReadonlySet<number>): URL {
  const url = new URL(raw)
  const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80))
  const authority = raw.trim().replace(/[\t\r\n]/g, '').match(/^[a-z][a-z\d+.-]*:\/\/([^/?#]*)/i)?.[1]
  if (!['http:', 'https:'].includes(url.protocol) || authority?.includes('@') || url.username || url.password || !Number.isInteger(port) || port < 1 || port > 65535 || blockedPorts.has(port)) {
    throw new Error('HTTP(S) 주소만 열 수 있습니다. 로그인 정보가 포함된 주소와 Mew 자체 포트는 열 수 없습니다.')
  }
  return url
}

export function parseDomBrowserCommand(raw: string): DomBrowserCommand {
  const value = JSON.parse(raw) as DomBrowserCommand
  if (!value || typeof value !== 'object') throw new Error('잘못된 브라우저 요청입니다.')
  const generation = () => 'generation' in value && Number.isSafeInteger(value.generation) && value.generation >= 0
  const id = () => 'id' in value && Number.isInteger(value.id) && value.id >= 0 && generation()
  if (value.type === 'navigate' && typeof value.url === 'string' && value.url.length <= 8192) return value
  if (value.type === 'color-scheme' && ['dark', 'light'].includes(value.colorScheme)) return value
  if (value.type === 'resize' && Number.isInteger(value.width) && Number.isInteger(value.height) && value.width >= 240 && value.width <= 3840 && value.height >= 160 && value.height <= 2160) return value
  if ((value.type === 'click' || value.type === 'focus') && id()) return value
  if (value.type === 'input' && id() && typeof value.value === 'string' && value.value.length <= 65536 && (value.checked === undefined || typeof value.checked === 'boolean')) return value
  if (value.type === 'scroll' && id() && Number.isFinite(value.x) && Number.isFinite(value.y) && Math.abs(value.x) <= 1e7 && Math.abs(value.y) <= 1e7 && (!Object.hasOwn(value, 'scrollRevision') || (typeof value.scrollRevision === 'number' && Number.isSafeInteger(value.scrollRevision) && value.scrollRevision > 0))) return value
  if (value.type === 'key' && generation() && typeof value.key === 'string' && /^(Enter|Tab|Backspace|Delete|Escape|Arrow(Up|Down|Left|Right)|Home|End|Page(Up|Down)| |[a-zA-Z0-9])$/.test(value.key) && ['ctrlKey', 'metaKey', 'altKey', 'shiftKey'].every(key => !Object.hasOwn(value, key) || typeof (value as unknown as Record<string, unknown>)[key] === 'boolean')) return value
  if (['back', 'forward', 'reload'].includes(value.type)) return value
  throw new Error('잘못된 브라우저 요청입니다.')
}

class DomBrowserSession {
  readonly account: string
  private socket: WebSocket
  private allowed: () => boolean
  private get blockedPorts(): ReadonlySet<number> { return domBrowserBlockedPorts() }
  private obscuraProcess?: ChildProcess
  private sessionDir?: string
  private browser?: Browser
  private context?: BrowserContext
  private page?: Page
  private upstreamSockets = new Set<WebSocket>()
  private closed = false
  private commands: Promise<void> = Promise.resolve()
  private events: Promise<void> = Promise.resolve()
  private pendingEvents = 0
  private pendingCommands = 0
  private cache = assetCache()
  private generation = 0
  private documentToken?: string
  private retiredTokens = new Set<string>()
  private assetLoads = 0
  private assetWaiters: (() => void)[] = []
  private abort = new AbortController()
  private state = ''
  private loading = false
  private colorScheme: 'dark' | 'light' = 'light'
  private historyEntries: { url: string; docId: number }[] = []
  private historyIndex = -1
  private currentDocId = 0
  private historyTraversal: 'none' | 'back' | 'forward' | 'reload' = 'none'
  private cookieJar = new Map<string, Map<string, string>>()
  private poll?: NodeJS.Timeout
  private lifetime: NodeJS.Timeout
  private starting?: Promise<Page>

  constructor(account: string, socket: WebSocket, allowed: () => boolean) {
    this.account = account; this.socket = socket; this.allowed = allowed
    sessions.add(this)
    this.lifetime = setTimeout(() => { this.send({ type: 'error', message: '브라우저 세션이 만료됐습니다. 다시 열어 주세요.' }); void this.close() }, 30 * 60_000)
    this.lifetime.unref()
    socket.on('message', (raw, binary) => {
      if (!this.active()) return
      if (binary) { this.send({ type: 'error', message: '잘못된 브라우저 요청입니다.' }); return }
      let command: DomBrowserCommand
      try { command = parseDomBrowserCommand(raw.toString()) } catch { this.send({ type: 'error', message: '잘못된 브라우저 요청입니다.' }); return }
      if (++this.pendingCommands > 128) { void this.close(); return }
      this.commands = this.commands.then(async () => {
        if (this.active()) await this.command(command)
      }).catch(error => { this.send({ type: 'error', message: error instanceof Error ? error.message : '브라우저 요청을 처리하지 못했습니다.' }) }).finally(() => { this.pendingCommands-- })
    })
    socket.once('close', () => { void this.close() })
    socket.once('error', () => { void this.close() })
  }

  private active(): boolean {
    if (this.closed) return false
    if (!this.allowed()) { void this.close(); return false }
    return true
  }

  private send(message: DomBrowserMessage) {
    if (!this.active() || this.socket.readyState !== WebSocket.OPEN) return
    const json = JSON.stringify(message)
    if (Buffer.byteLength(json) > MAX_QUEUE || this.socket.bufferedAmount > MAX_QUEUE) { void this.close(); return }
    this.socket.send(json)
  }

  private async start(): Promise<Page> {
    if (this.page) return this.page
    if (this.starting) return this.starting
    this.starting = this.launch()
    return this.starting
  }

  private async launchObscura(executablePath: string): Promise<string> {
    const sessionDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-dom-obscura-'))
    this.sessionDir = sessionDir
    const readyFile = path.join(sessionDir, 'ready.json')
    const storageDir = path.join(sessionDir, 'storage')
    fs.mkdirSync(storageDir, { recursive: true })
    const child = spawn(executablePath, [
      'serve',
      '--host', '127.0.0.1',
      '--port', '0',
      '--allow-private-network',
      '--storage-dir', storageDir,
      '--ready-file', readyFile,
      '--quiet',
    ], { stdio: 'ignore' })
    this.obscuraProcess = child
    const deadline = Date.now() + 10_000
    while (Date.now() < deadline) {
      if (this.closed) throw new Error('브라우저 세션이 닫혔습니다.')
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error('호스트 Obscura 브라우저 프로세스가 시작 중 종료됐습니다.')
      }
      if (fs.existsSync(readyFile)) {
        try {
          const ready = JSON.parse(fs.readFileSync(readyFile, 'utf8')) as { host: string; port: number; websocket_path: string }
          if (ready.host && ready.port && ready.websocket_path) {
            return `ws://${ready.host}:${ready.port}${ready.websocket_path}`
          }
        } catch {}
      }
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    throw new Error('호스트 Obscura 브라우저 시작 시간이 초과됐습니다.')
  }

  private storeCookies(url: URL, headers: Headers) {
    const setCookies = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : []
    if (!setCookies.length) return
    let hostJar = this.cookieJar.get(url.hostname)
    if (!hostJar) { hostJar = new Map(); this.cookieJar.set(url.hostname, hostJar) }
    for (const raw of setCookies) {
      const pair = raw.split(';')[0]?.trim()
      const eq = pair ? pair.indexOf('=') : -1
      if (pair && eq > 0) hostJar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim())
    }
  }

  private cookieHeader(url: URL): string {
    const hostJar = this.cookieJar.get(url.hostname)
    if (!hostJar || !hostJar.size) return ''
    return [...hostJar.entries()].map(([name, value]) => `${name}=${value}`).join('; ')
  }

  private recordHistoryUrl(url: string, replace = false) {
    if (!url || url === 'about:blank') return
    if (this.historyTraversal === 'back' || this.historyTraversal === 'forward') {
      if (this.historyIndex >= 0 && this.historyEntries[this.historyIndex]) {
        this.historyEntries[this.historyIndex]!.url = url
        this.historyEntries[this.historyIndex]!.docId = this.currentDocId
      }
      return
    }
    if (this.historyTraversal === 'reload' || replace) {
      if (this.historyIndex >= 0 && this.historyEntries[this.historyIndex]) {
        this.historyEntries[this.historyIndex] = { url, docId: this.currentDocId }
      } else {
        this.historyEntries.push({ url, docId: this.currentDocId })
        this.historyIndex = 0
      }
      return
    }
    if (this.historyIndex >= 0 && this.historyEntries[this.historyIndex]?.url === url) {
      this.historyEntries[this.historyIndex]!.docId = this.currentDocId
      return
    }
    this.historyEntries.splice(this.historyIndex + 1)
    this.historyEntries.push({ url, docId: this.currentDocId })
    this.historyIndex = this.historyEntries.length - 1
  }

  private async launch(): Promise<Page> {
    const executablePath = domBrowserExecutable()
    if (!executablePath) throw new Error('호스트에 Obscura가 필요합니다. MEW_BROWSER_EXECUTABLE 설정을 확인해 주세요.')
    const wsUrl = await this.launchObscura(executablePath)
    const browser = await chromium.connectOverCDP(wsUrl)
    this.browser = browser
    if (!this.active()) { await browser.close().catch(() => {}); throw new Error('브라우저 세션이 닫혔습니다.') }
    this.context = await browser.newContext({ viewport: { width: 1100, height: 700 }, colorScheme: this.colorScheme, serviceWorkers: 'block', acceptDownloads: false })
    const context = this.context
    await context.route('**/*', async route => {
      if (!this.active()) { await route.abort('blockedbyclient').catch(() => {}); return }
      const request = route.request()
      const isDoc = request.isNavigationRequest() || request.resourceType() === 'document'
      let mainDocument = false
      if (isDoc) {
        try { const frame = request.frame(); mainDocument = frame.page() === this.page && !frame.parentFrame() } catch { /* A popup's first request can precede its frame. */ }
      }
      if (isDoc && !mainDocument) {
        await route.abort('blockedbyclient').catch(() => {})
        return
      }
      try {
        let current = new URL(request.url())
        if (isDoc) domBrowserTarget(current.href, this.blockedPorts)
        else this.assertSubresource(current)
        const method = request.method()
        const body = request.postDataBuffer() ?? undefined
        let redirected = false
        for (let hops = 0; hops < 10; hops++) {
          const reqHeaders: Record<string, string> = { ...request.headers() }
          if (isDoc && !reqHeaders['sec-fetch-dest'] && !reqHeaders['Sec-Fetch-Dest']) {
            reqHeaders['sec-fetch-dest'] = 'document'
          }
          const cookieStr = this.cookieHeader(current)
          if (cookieStr && !reqHeaders.cookie && !reqHeaders.Cookie) {
            reqHeaders.cookie = cookieStr
          }
          const response = await fetch(current, {
            method,
            headers: reqHeaders,
            body: method === 'GET' || method === 'HEAD' ? undefined : body,
            redirect: 'manual',
            signal: AbortSignal.any([this.abort.signal, AbortSignal.timeout(15_000)]),
          })
          this.storeCookies(current, response.headers)
          const location = response.headers.get('location')
          if (response.status >= 300 && response.status < 400 && location) {
            await response.body?.cancel().catch(() => {})
            current = new URL(location, current)
            if (isDoc) domBrowserTarget(current.href, this.blockedPorts)
            else this.assertSubresource(current)
            redirected = true
            continue
          }
          if (isDoc && mainDocument) this.beginDocument(current.href)
          const headers: Record<string, string> = {}
          response.headers.forEach((value, key) => { headers[key] = value })
          let payload = Buffer.from(await response.arrayBuffer())
          if (redirected && isDoc && mainDocument && (headers['content-type'] ?? '').toLowerCase().includes('text/html')) {
            const inject = `<script>try{if(location.href!==${JSON.stringify(current.href)}){window.__mewDomInternalReplace=true;history.replaceState(history.state,"",${JSON.stringify(current.href)});window.__mewDomInternalReplace=false}}catch{}</script>`
            payload = Buffer.concat([Buffer.from(inject), payload])
            delete headers['content-length']
          }
          await route.fulfill({ status: response.status, headers, body: payload }).catch(() => {})
          return
        }
        await route.abort('blockedbyclient').catch(() => {})
      } catch (error) {
        if (isDoc && mainDocument) {
          this.send({ type: 'error', message: error instanceof Error ? error.message : '이 주소로 이동할 수 없습니다. HTTP(S) 주소와 Mew 자체 포트인지 확인해 주세요.' })
        }
        await route.abort('blockedbyclient').catch(() => {})
      }
    })
    await context.routeWebSocket('**/*', ws => {
      try {
        const wsUrl = new URL(ws.url())
        const httpUrl = new URL(ws.url())
        httpUrl.protocol = wsUrl.protocol === 'wss:' ? 'https:' : 'http:'
        this.assertSubresource(httpUrl)
        const upstream = new WebSocket(ws.url())
        this.upstreamSockets.add(upstream)
        const pending: (string | Buffer)[] = []
        ws.onMessage(message => {
          if (upstream.readyState === WebSocket.OPEN) upstream.send(message)
          else if (upstream.readyState === WebSocket.CONNECTING) pending.push(message)
        })
        ws.onClose((code, reason) => {
          this.upstreamSockets.delete(upstream)
          try { upstream.close(code ?? 1000, reason ?? '') } catch { upstream.terminate() }
        })
        upstream.on('open', () => {
          for (const item of pending.splice(0)) upstream.send(item)
        })
        upstream.on('message', (data, isBinary) => {
          if (!this.active()) return
          const buffer = Buffer.isBuffer(data) ? data : Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer)
          ws.send(isBinary ? buffer : buffer.toString('utf8'))
        })
        upstream.on('close', (code, reason) => {
          this.upstreamSockets.delete(upstream)
          void ws.close({ code: code || 1000, reason: reason?.toString() || '' })
        })
        upstream.on('error', () => {
          this.upstreamSockets.delete(upstream)
          void ws.close({ code: 1006, reason: 'WebSocket connection failed' })
        })
      } catch {
        void ws.close()
      }
    })
    const page = await context.newPage()
    this.page = page
    context.on('page', popup => { if (popup !== page) void popup.close().catch(() => {}) })
    page.on('dialog', dialog => { void dialog.dismiss() })
    page.on('download', download => { void download.cancel() })
    page.setDefaultTimeout(5000)
    page.setDefaultNavigationTimeout(20_000)
    await page.exposeBinding('__mewDomOpen', ({ frame }, rawUrl: unknown, mode: unknown) => {
      if (frame !== page.mainFrame() || !this.active() || typeof rawUrl !== 'string' || !rawUrl) return
      let target: URL
      try { target = domBrowserTarget(new URL(rawUrl, this.cache.baseUrl || page.url()).href, this.blockedPorts) }
      catch (error) {
        if (mode === 'navigate') {
          this.send({ type: 'error', message: error instanceof Error ? error.message : '이 주소로 이동할 수 없습니다.' })
        }
        return
      }
      this.commands = this.commands.then(async () => {
        if (!this.active()) return
        this.generation++
        const commandGeneration = this.generation
        this.loading = true; await this.sendState()
        try {
          await page.evaluate('window.__mewDomScrollRevisions?.clear()').catch(() => {})
          await page.goto(target.href, { waitUntil: 'domcontentloaded' })
        } catch (error) {
          this.send({ type: 'error', message: error instanceof Error ? error.message : '이 주소로 이동할 수 없습니다.' })
        } finally {
          this.loading = false
          if (this.generation === commandGeneration) await page.evaluate('window.__mewDomRecord?.takeFullSnapshot?.()').catch(() => {})
          await this.sendState()
        }
      }).catch(() => {})
    })
    await page.exposeBinding('__mewDomHistory', ({ frame }, mode: unknown, rawUrl: unknown) => {
      if (frame !== page.mainFrame() || !this.active() || typeof rawUrl !== 'string' || !rawUrl) return
      this.recordHistoryUrl(rawUrl, mode === 'replace')
      this.cache.baseUrl = rawUrl
      void this.sendState()
    })
    await page.exposeBinding('__mewDomEmit', ({ frame }, token: string, event: unknown) => {
      if (frame !== page.mainFrame() || !this.active()) return
      if (typeof token !== 'string' || this.retiredTokens.has(token)) return
      if (!this.documentToken) this.documentToken = token
      if (this.documentToken !== token) return
      const generation = this.generation, cache = this.cache
      const bytes = Buffer.byteLength(JSON.stringify(event))
      this.pendingEvents += bytes
      if (this.pendingEvents > MAX_QUEUE) { void this.close(); return }
      this.events = this.events.then(async () => {
        if (!this.active() || generation !== this.generation) return
        await this.inlineEvent(event, cache)
        if (generation === this.generation) this.send({ type: 'events', generation, events: [event] })
      }).catch(() => {}).finally(() => { this.pendingEvents -= bytes })
    })
    await page.addInitScript({ content: `${DOM_BROWSER_COMPAT_SCRIPT}; ${recordBundle()}; if (window === window.top) {
      const documentToken = Array.from(crypto.getRandomValues(new Uint32Array(4)), value => value.toString(16).padStart(8, '0')).join('');
      window.__mewDomScrollRevisions = new Map();
      const notifyHistory = mode => { try { void window.__mewDomHistory(mode, window.location.href).catch(() => {}); } catch {} };
      const origPushState = history.pushState;
      history.pushState = function(...args) {
        const prev = window.location.href;
        const res = origPushState.apply(this, args);
        if (!window.__mewDomInternalReplace && window.location.href !== prev) notifyHistory('push');
        return res;
      };
      const origReplaceState = history.replaceState;
      history.replaceState = function(...args) {
        const res = origReplaceState.apply(this, args);
        if (!window.__mewDomInternalReplace) notifyHistory('replace');
        return res;
      };
      window.addEventListener('popstate', () => { if (!window.__mewDomInternalReplace) notifyHistory('pop'); });
      window.addEventListener('hashchange', () => { if (!window.__mewDomInternalReplace) notifyHistory('push'); });
      window.open = url => { if (url) { try { void window.__mewDomOpen(new URL(String(url), document.baseURI).href, 'popup').catch(() => {}); } catch {} } return null; };
      const origFormSubmit = HTMLFormElement.prototype.submit;
      HTMLFormElement.prototype.submit = function() {
        const t = (this.getAttribute('target') || '').trim().toLowerCase();
        if (t && t !== '_self' && t !== '_top' && t !== '_parent') {
          try { if (this.action) void window.__mewDomOpen(new URL(String(this.action), document.baseURI).href, 'popup').catch(() => {}); } catch {}
          return;
        }
        return origFormSubmit.call(this);
      };
      document.addEventListener('click', event => { const anchor = event.target?.closest?.('a[target]'); if (anchor) anchor.target = '_self'; }, true);
      document.addEventListener('submit', event => {
        const form = event.target;
        const t = (form?.getAttribute?.('target') || '').trim().toLowerCase();
        if (t && t !== '_self' && t !== '_top' && t !== '_parent') {
          event.preventDefault();
          try { if (form.action) void window.__mewDomOpen(new URL(String(form.action), document.baseURI).href, 'popup').catch(() => {}); } catch {}
        }
      }, true);
      window.__mewDomRecord = rrwebRecord.record; rrwebRecord.record({ emit: event => { if (event.type === 3 && event.data.source === 3) { const revision = window.__mewDomScrollRevisions.get(event.data.id); if (revision !== undefined) event.data.scrollRevision = revision; } void window.__mewDomEmit(documentToken, event).catch(() => {}); }, inlineStylesheet: true, inlineImages: true, collectFonts: true, recordCanvas: false, maskAllInputs: false, maskInputOptions: { password: false }, sampling: { mousemove: false }, recordCrossOriginIframes: false });
    }` })
    page.on('domcontentloaded', () => { this.loading = false; void this.sendState() })
    page.on('framenavigated', frame => {
      if (frame !== page.mainFrame()) return
      const frameUrl = frame.url()
      if (frameUrl !== 'about:blank') {
        try { domBrowserTarget(frameUrl, this.blockedPorts) }
        catch { this.send({ type: 'error', message: '이 주소로 이동할 수 없습니다. HTTP(S) 주소와 Mew 자체 포트인지 확인해 주세요.' }); void this.close(); return }
      }
      if (frameUrl !== 'about:blank') {
        const currentEntry = this.historyEntries[this.historyIndex]?.url
        let keepReplacedRedirect = false
        if (currentEntry) {
          try {
            const cur = new URL(currentEntry), nav = new URL(frameUrl)
            if (cur.origin === nav.origin && cur.pathname !== nav.pathname) keepReplacedRedirect = true
          } catch {}
        }
        if (!keepReplacedRedirect) this.recordHistoryUrl(frameUrl, true)
        this.cache.baseUrl = this.historyEntries[this.historyIndex]?.url ?? frameUrl
      }
      void this.sendState()
    })
    page.on('close', () => { void this.close() })
    this.poll = setInterval(() => { void this.sendState() }, 300)
    this.poll.unref()
    return page
  }

  private async sendState() {
    const page = this.page
    if (!page || !this.active()) return
    const pageUrl = page.url()
    const currentUrl = this.historyIndex >= 0 ? this.historyEntries[this.historyIndex]!.url : (pageUrl === 'about:blank' ? '' : pageUrl)
    const message = {
      type: 'state' as const,
      generation: this.generation,
      url: currentUrl,
      title: await page.title().catch(() => ''),
      loading: this.loading,
      canGoBack: this.historyIndex > 0,
      canGoForward: this.historyIndex >= 0 && this.historyIndex < this.historyEntries.length - 1,
    }
    const serialized = JSON.stringify(message)
    if (serialized !== this.state) { this.state = serialized; this.send(message) }
  }

  private beginDocument(url: string) {
    this.generation++
    this.currentDocId++
    this.loading = true
    if (this.documentToken) this.retiredTokens.add(this.documentToken)
    this.documentToken = undefined
    this.cache.abort.abort()
    this.cache.entries.clear()
    this.cache = assetCache(url)
    this.recordHistoryUrl(url)
    this.assetWaiters.splice(0).forEach(resolve => resolve())
    void this.sendState()
  }

  private async asset(raw: string, cache: AssetCache): Promise<string> {
    if (/^data:/i.test(raw)) return raw
    let url: URL
    try { url = new URL(raw, cache.baseUrl); this.assertSubresource(url) } catch { return EMPTY_IMAGE }
    if (cache !== this.cache) return EMPTY_IMAGE
    if (cache.entries.has(url.href)) return cache.entries.get(url.href)!
    if (cache.entries.size >= 256 || cache.bytes >= MAX_QUEUE) return EMPTY_IMAGE
    const result = (async () => {
      while (this.assetLoads >= 4 && this.active() && cache === this.cache) await new Promise<void>(resolve => this.assetWaiters.push(resolve))
      if (!this.active() || cache !== this.cache) return EMPTY_IMAGE
      this.assetLoads++
      try {
        const cookieStr = this.cookieHeader(url)
        const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.any([this.abort.signal, cache.abort.signal, AbortSignal.timeout(5000)]), headers: cookieStr ? { Cookie: cookieStr } : undefined })
        try {
          const mime = response.headers.get('content-type')?.split(';')[0] ?? ''
          if (!response.ok || !response.body || !/^(image\/|font\/|application\/(?:font|x-font|vnd\.ms-fontobject)|text\/css)/i.test(mime) || Number(response.headers.get('content-length') ?? 0) > MAX_ASSET) return EMPTY_IMAGE
          const chunks: Uint8Array[] = []
          let size = 0
          for await (const chunk of response.body) {
            size += chunk.length
            if (size > MAX_ASSET || cache.bytes + size > MAX_QUEUE || cache !== this.cache) return EMPTY_IMAGE
            chunks.push(chunk)
          }
          const body = Buffer.concat(chunks)
          cache.bytes += body.length
          return `data:${mime};base64,${body.toString('base64')}`
        } finally { await response.body?.cancel().catch(() => {}) }
      } catch { return EMPTY_IMAGE }
      finally { this.assetLoads--; this.assetWaiters.shift()?.() }
    })()
    cache.entries.set(url.href, result)
    return result
  }

  private assertSubresource(url: URL) {
    const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80))
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || this.blockedPorts.has(port)) throw new Error('이 리소스는 열 수 없습니다.')
  }

  private async css(text: string, cache: AssetCache): Promise<string> {
    const matches = [...text.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]*))\s*\)/gi)]
    const replacements = await Promise.all(matches.map(async match => {
      const raw = match[1] ?? match[2] ?? match[3] ?? ''
      return raw.startsWith('#') ? match[0] : `url("${await this.asset(raw, cache)}")`
    }))
    for (let index = matches.length - 1; index >= 0; index--) {
      const match = matches[index]!
      text = text.slice(0, match.index) + replacements[index]! + text.slice(match.index! + match[0].length)
    }
    return text
  }

  private async inlineEvent(value: unknown, cache: AssetCache, parentTag = ''): Promise<void> {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) { await Promise.all(value.map(item => this.inlineEvent(item, cache, parentTag))); return }
    const node = value as Record<string, unknown>, tag = typeof node.tagName === 'string' ? node.tagName : parentTag
    if (typeof node.property === 'string' && typeof node.value === 'string') node.value = await this.css(node.value, cache)
    if (node.attributes && typeof node.attributes === 'object') {
      const attributes = node.attributes as Record<string, unknown>
      if (tag === 'meta' && String(attributes['http-equiv']).toLowerCase() === 'refresh') { delete attributes['http-equiv']; delete attributes.content }
      if (['iframe', 'frame', 'object', 'embed', 'script'].includes(tag)) { delete attributes.src; delete attributes.srcdoc; delete attributes.data }
      if (tag === 'base') delete attributes.href
    }
    for (const [key, item] of Object.entries(node)) {
      if (typeof item === 'string') {
        if (key === 'src' || key === 'poster' || key === 'xlink:href') node[key] = await this.asset(item, cache)
        else if (key === 'srcset') node[key] = ''
        else if (key === '_cssText' || key === 'style' || key === 'rule' || key === 'replace' || key === 'replaceSync' || key === 'textContent' && tag === 'style') node[key] = await this.css(item, cache)
        else if (key === 'srcdoc' || key === 'http-equiv' || key.toLowerCase().startsWith('on') || key === 'href' && /^javascript:/i.test(item)) node[key] = ''
      } else await this.inlineEvent(item, cache, tag)
    }
  }

  private async command(command: DomBrowserCommand) {
    if (command.type === 'color-scheme') {
      this.colorScheme = command.colorScheme
      await this.page?.emulateMedia({ colorScheme: command.colorScheme })
      return
    }
    if (['click', 'focus', 'input', 'scroll', 'key'].includes(command.type) && 'generation' in command && command.generation !== this.generation) return
    if (command.type === 'navigate') domBrowserTarget(command.url, this.blockedPorts)
    const page = await this.start()
    if (!this.active()) return
    if (command.type === 'resize') {
      await page.setViewportSize({ width: command.width, height: command.height })
      await page.evaluate('window.dispatchEvent(new Event("resize"))').catch(() => {})
      return
    }
    if (command.type === 'navigate' || command.type === 'back' || command.type === 'forward' || command.type === 'reload') {
      if (command.type === 'back' && this.historyIndex <= 0) return
      if (command.type === 'forward' && (this.historyIndex < 0 || this.historyIndex >= this.historyEntries.length - 1)) return
      this.generation++
      const commandGeneration = this.generation
      this.loading = true
      this.historyTraversal = command.type === 'navigate' ? 'none' : command.type
      await this.sendState()
      try {
        await page.evaluate('window.__mewDomScrollRevisions?.clear()').catch(() => {})
        if (command.type === 'navigate') {
          await page.goto(command.url, { waitUntil: 'domcontentloaded' })
        } else if (command.type === 'reload') {
          const current = this.historyEntries[this.historyIndex]?.url ?? page.url()
          await page.goto(current, { waitUntil: 'domcontentloaded' })
        } else {
          const currentEntry = this.historyEntries[this.historyIndex]
          const targetIndex = command.type === 'back' ? this.historyIndex - 1 : this.historyIndex + 1
          const targetEntry = this.historyEntries[targetIndex]!
          this.historyIndex = targetIndex
          if (currentEntry && currentEntry.docId === targetEntry.docId) {
            this.cache.baseUrl = targetEntry.url
            const targetUrlJson = JSON.stringify(targetEntry.url)
            await page.evaluate(`(() => { window.__mewDomInternalReplace = true; history.replaceState(history.state, '', ${targetUrlJson}); window.__mewDomInternalReplace = false; window.dispatchEvent(new PopStateEvent('popstate', { state: history.state })); })()`).catch(() => {})
          } else {
            await page.goto(targetEntry.url, { waitUntil: 'domcontentloaded' })
          }
        }
      } finally {
        this.historyTraversal = 'none'
        this.loading = false
        // New documents record their own snapshot; SPA history needs a fresh generation snapshot.
        if (this.generation === commandGeneration) await page.evaluate('window.__mewDomRecord?.takeFullSnapshot?.()').catch(() => {})
        await this.sendState()
      }
      return
    }
    if (command.type === 'key') {
      const key = [command.ctrlKey && 'Control', command.metaKey && 'Meta', command.altKey && 'Alt', command.shiftKey && 'Shift', command.key === ' ' ? 'Space' : command.key].filter(Boolean).join('+')
      await page.keyboard.press(key); return
    }
    if (command.type === 'focus') {
      await page.evaluate(`window.__mewDomRecord?.mirror.getNode(${command.id})?.focus?.()`)
      return
    }
    if (command.type === 'click') {
      await page.evaluate(`(() => {
        const n = window.__mewDomRecord?.mirror.getNode(${command.id});
        const e = n?.nodeType === 1 ? n : n?.parentElement;
        if (!e) return;
        e.scrollIntoView?.({block:'nearest', inline:'nearest'});
        const target = e.closest?.('a,button,input,select,textarea,summary,label,[role="button"],[role="link"]') ?? e;
        target.focus?.();
        if (typeof target.click === 'function') target.click();
        else target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      })()`)
      return
    }
    if (command.type === 'input') {
      await page.evaluate(`(() => { const c = ${JSON.stringify(command)}; const e = window.__mewDomRecord?.mirror.getNode(c.id); if (!e || e.nodeType !== 1) return; if (e.type === 'file') return; e.focus?.(); if (e.isContentEditable) e.textContent = c.value; else { const proto = e.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : e.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(e, c.value); if (typeof c.checked === 'boolean') Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked')?.set?.call(e, c.checked); } e.dispatchEvent(new Event('input', {bubbles:true})); e.dispatchEvent(new Event('change', {bubbles:true})); })()`)
      return
    }
    if (command.type === 'scroll') await page.evaluate(`(() => { const c = ${JSON.stringify(command)}; const n = window.__mewDomRecord?.mirror.getNode(c.id); const e = n?.nodeType === 9 ? n.scrollingElement : n; if (!e) return; if (c.scrollRevision === undefined) window.__mewDomScrollRevisions.delete(c.id); else window.__mewDomScrollRevisions.set(c.id, c.scrollRevision); e.scrollTo?.({left: c.x, top: c.y, behavior: 'instant'}); })()`)
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    sessions.delete(this)
    clearTimeout(this.lifetime); clearInterval(this.poll)
    this.abort.abort()
    for (const upstream of this.upstreamSockets) {
      try { upstream.terminate() } catch {}
    }
    this.upstreamSockets.clear()
    this.assetWaiters.splice(0).forEach(resolve => resolve())
    this.cache.abort.abort(); this.cache.entries.clear()
    this.socket.close(1000)
    await this.context?.close().catch(() => {})
    await this.browser?.close().catch(() => {})
    const child = this.obscuraProcess
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM')
      await Promise.race([
        new Promise<void>(resolve => child.once('exit', () => resolve())),
        new Promise<void>(resolve => setTimeout(() => { try { child.kill('SIGKILL') } catch {} resolve() }, 1000)),
      ])
    }
    if (this.sessionDir) {
      try { fs.rmSync(this.sessionDir, { recursive: true, force: true }) } catch {}
    }
  }
}

export async function closeDomBrowsers() { await Promise.all([...sessions].map(session => session.close())) }

export function attachDomBrowserWebSocket(server: Server | Http2SecureServer, getAuth: (req: IncomingMessage) => RequestAuth = resolveAuth) {
  servers.add(server)
  const wss = new WebSocketServer({ noServer: true, maxPayload: 96 * 1024, perMessageDeflate: false })
  server.on('upgrade', (req, socket, head) => {
    if (new URL(req.url ?? '', 'http://localhost').pathname !== DOM_BROWSER_WS) return
    const original = getAuth(req)
    const allowed = () => { const auth = getAuth(req); return !!original.email && auth.email === original.email && !auth.mustChangePassword && canUse(auth, 'portPreview') && webSocketOriginAllowed(req) }
    if (!allowed()) { socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return }
    if (sessions.size >= 8 || [...sessions].filter(session => session.account === original.email).length >= 3) { socket.end('HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\n\r\n'); return }
    wss.handleUpgrade(req, socket, head, ws => {
      watchSocketAccess(ws, req, allowed)
      new DomBrowserSession(original.email!, ws, allowed)
    })
  })
  server.once('close', () => { servers.delete(server); wss.close(); void closeDomBrowsers() })
}

