import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import type { IncomingMessage, Server } from 'node:http'
import type { Http2SecureServer } from 'node:http2'
import { chromium, type Browser, type BrowserContext, type Page, type CDPSession } from 'playwright-core'
import { WebSocket, WebSocketServer } from 'ws'
import { DOM_BROWSER_WS, type DomBrowserCommand, type DomBrowserMessage } from '../shared/dom-browser.ts'
import { resolveAuth, type RequestAuth } from './reqAuth.ts'
import { canUse } from './access-policy.ts'
import { watchSocketAccess } from './access-socket.ts'
import { webSocketOriginAllowed } from './websocket-origin.ts'
import { domBrowserExecutable, externalBrowserExecutable, domBrowserEngine } from './browser-dom-executable.ts'
import { DomBrowserHistory } from './browser-dom-history.ts'

export { DOM_BROWSER_WS }
type BrowserEngine = ReturnType<typeof domBrowserEngine>
type NavigationRequest = { method: string; postData?: string; headers: Record<string, string> }
type QueuedNavigation = { url: string; historyIndex?: number; request?: NavigationRequest }
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

export class DomBrowserSession {
  readonly account: string
  private socket: WebSocket
  private allowed: () => boolean
  private get blockedPorts(): ReadonlySet<number> { return domBrowserBlockedPorts() }
  private browser?: Browser
  private context?: BrowserContext
  private page?: Page
  private cdp?: CDPSession
  private closed = false
  private commands: Promise<void> = Promise.resolve()
  private events: Promise<void> = Promise.resolve()
  private pendingEvents = 0
  private pendingCommands = 0
  private cache = assetCache()
  private generation = 0
  private documentToken?: string
  private retiredTokens = new Set<string>()
  private navigatingDocument = false
  private assetLoads = 0
  private assetWaiters: (() => void)[] = []
  private abort = new AbortController()
  private state = ''
  private loading = false
  private colorScheme: 'dark' | 'light' = 'light'
  private poll?: NodeJS.Timeout
  private lifetime: NodeJS.Timeout
  private starting?: Promise<Page>
  private engine?: BrowserEngine
  private runtimeId = 0
  private history = new DomBrowserHistory()
  private historyIndex?: number
  private nativeHistoryIndices = new Map<number, number>()
  private historyRecording: Promise<void> = Promise.resolve()
  private queuedNavigation?: QueuedNavigation
  private engineRedirects = 0
  private navigationRequest?: QueuedNavigation
  private viewport = { width: 1100, height: 700 }
  private storageStates = new Map<BrowserEngine, Awaited<ReturnType<BrowserContext['storageState']>>>()

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

  private async start(url?: string): Promise<Page> {
    const engine = url ? domBrowserEngine(url) : this.engine ?? 'chromium'
    if (this.page && engine === this.engine) return this.page
    if (this.starting) return this.starting
    const executablePath = engine === 'chrome' ? externalBrowserExecutable() : domBrowserExecutable()
    if (!executablePath) throw new Error(engine === 'chrome'
      ? '외부 사이트에는 일반 Google Chrome이 필요합니다. Chrome을 설치하거나 MEW_CHROME_EXECUTABLE을 확인해 주세요.'
      : 'localhost에는 Chromium이 필요합니다. Playwright Chromium을 설치하거나 MEW_CHROMIUM_EXECUTABLE을 확인해 주세요.')
    this.starting = (async () => {
      if (this.page) {
        await this.releaseBrowser(true)
        this.beginDocument(url!)
      }
      this.engine = engine
      this.runtimeId++
      try { return await this.launch(executablePath) }
      catch (error) { await this.releaseBrowser(); throw error }
    })()
    try { return await this.starting }
    finally { this.starting = undefined }
  }

  private async releaseBrowser(saveState = false) {
    const context = this.context, browser = this.browser
    if (saveState && context && this.engine) this.storageStates.set(this.engine, await context.storageState())
    this.page = undefined; this.context = undefined; this.browser = undefined; this.cdp = undefined
    clearInterval(this.poll)
    this.nativeHistoryIndices.clear()
    await context?.close().catch(() => {})
    await browser?.close().catch(() => {})
  }

  private queueNavigation(url: string, request: NavigationRequest) {
    if (++this.engineRedirects > 10) throw new Error('브라우저 전환 리다이렉트가 너무 많습니다. 주소를 확인해 주세요.')
    const pending: QueuedNavigation = { url, historyIndex: this.historyIndex, request }
    this.queuedNavigation = pending
    this.commands = this.commands.then(async () => {
      if (!this.active() || this.queuedNavigation !== pending) return
      this.queuedNavigation = undefined
      await this.navigateTo(pending.url, pending.historyIndex, undefined, pending.request)
    }).catch(error => {
      if (this.active()) this.send({ type: 'error', message: error instanceof Error ? error.message : '브라우저를 전환하지 못했습니다.' })
    })
  }

  private async launch(executablePath: string): Promise<Page> {
    const launchOptions = { executablePath, chromiumSandbox: true, headless: true, args: ['--disable-dev-shm-usage'] }
    const contextOptions = { viewport: this.viewport, colorScheme: this.colorScheme, serviceWorkers: 'block' as const, acceptDownloads: false }
    const browser = await chromium.launch(launchOptions)
    this.browser = browser
    if (!this.active()) { await browser.close(); throw new Error('브라우저 세션이 닫혔습니다.') }
    this.context = await browser.newContext({ ...contextOptions, storageState: this.storageStates.get(this.engine!) })
    const context = this.context
    await context.route('**/*', async route => {
      const request = route.request()
      let mainDocument = false
      if (request.isNavigationRequest()) {
        try { const frame = request.frame(); mainDocument = frame.page() === this.page && !frame.parentFrame() } catch { /* A popup's first request can precede its frame. */ }
      }
      if (request.isNavigationRequest() && !mainDocument) {
        await route.abort('blockedbyclient').catch(() => {})
        return
      }
      await route.continue().catch(() => {})
    })
    await context.routeWebSocket('**/*', ws => {
      try { const url = new URL(ws.url()); url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:'; this.assertSubresource(url); ws.connectToServer() }
      catch { ws.close() }
    })
    const page = await context.newPage()
    this.page = page
    this.cdp = await context.newCDPSession(page)
    const cdp = this.cdp
    await cdp.send('Page.enable')
    const mainFrame = (await cdp.send('Page.getFrameTree')).frameTree.frame.id
    cdp.on('Page.frameNavigated', ({ frame }) => {
      if (frame.parentId || this.cdp !== cdp) return
      if (!this.navigatingDocument) this.beginDocument(frame.url)
      this.cache.baseUrl = frame.url
      this.navigatingDocument = false
    })
    // Fetch interception sees every redirect hop; Playwright routing only sees the first.
    cdp.on('Fetch.requestPaused', request => {
      if (this.cdp !== cdp) return
      let allowed = this.active()
      let override: NavigationRequest | undefined
      const mainDocument = request.resourceType === 'Document' && request.frameId === mainFrame
      try {
        const url = new URL(request.request.url)
        if (request.request.urlFragment) url.hash = request.request.urlFragment
        if (request.resourceType === 'Document') domBrowserTarget(url.href, this.blockedPorts)
        else this.assertSubresource(url)
        if (allowed && mainDocument && domBrowserEngine(url.href) !== this.engine) {
          if (request.request.hasPostData && request.request.postData === undefined) throw new Error('브라우저를 전환하는 파일 전송은 지원하지 않습니다. 대상 사이트를 먼저 열어 주세요.')
          const headers = Object.fromEntries(Object.entries(request.request.headers).filter(([name]) => ['content-type', 'origin', 'referer'].includes(name.toLowerCase())))
          this.queueNavigation(url.href, { method: request.request.method, postData: request.request.postData, headers })
          void cdp.send('Fetch.failRequest', { requestId: request.requestId, errorReason: 'Aborted' }).catch(() => {})
          return
        }
        if (allowed && mainDocument) {
          if (this.navigationRequest?.url === url.href) {
            override = this.navigationRequest.request
            this.navigationRequest = undefined
          }
          this.beginDocument(url.href)
        }
      } catch (error) {
        allowed = false
        if (mainDocument && error instanceof Error && /파일 전송|전환 리다이렉트/.test(error.message)) this.send({ type: 'error', message: error.message })
      }
      const overrides = override ? {
        method: override.method,
        ...(override.postData === undefined ? {} : { postData: Buffer.from(override.postData).toString('base64') }),
        headers: [...Object.entries(request.request.headers).filter(([name]) => !Object.keys(override.headers).some(key => key.toLowerCase() === name.toLowerCase())), ...Object.entries(override.headers)].map(([name, value]) => ({ name, value })),
      } : {}
      void cdp.send(allowed ? 'Fetch.continueRequest' : 'Fetch.failRequest', allowed ? { requestId: request.requestId, ...overrides } : { requestId: request.requestId, errorReason: 'BlockedByClient' }).catch(() => {})
    })
    await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] })
    context.on('page', popup => { if (popup !== page) void popup.close() })
    page.on('dialog', dialog => { void dialog.dismiss() })
    page.on('download', download => { void download.cancel() })
    page.setDefaultTimeout(5000)
    page.setDefaultNavigationTimeout(20_000)
    await page.exposeBinding('__mewDomEmit', ({ frame }, token: string, event: unknown) => {
      if (frame !== page.mainFrame() || this.page !== page || !this.active()) return
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
    await page.addInitScript({ content: `${recordBundle()}; if (window === window.top) {
      const documentToken = Array.from(crypto.getRandomValues(new Uint32Array(4)), value => value.toString(16).padStart(8, '0')).join('');
      window.__mewDomScrollRevisions = new Map();
      window.open = url => { if (url) window.location.assign(String(url)); return null; };
      document.addEventListener('click', event => { const anchor = event.target?.closest?.('a[target]'); if (anchor) anchor.target = '_self'; }, true);
      document.addEventListener('submit', event => { if (event.target?.target) event.target.target = '_self'; }, true);
      window.__mewDomRecord = rrwebRecord.record; rrwebRecord.record({ emit: event => { if (event.type === 3 && event.data.source === 3) { const revision = window.__mewDomScrollRevisions.get(event.data.id); if (revision !== undefined) event.data.scrollRevision = revision; } void window.__mewDomEmit(documentToken, event).catch(() => {}); }, inlineStylesheet: true, inlineImages: true, collectFonts: true, recordCanvas: false, maskAllInputs: false, maskInputOptions: { password: false }, sampling: { mousemove: false }, recordCrossOriginIframes: false });
    }` })
    page.on('domcontentloaded', () => { this.loading = false; void this.sendState() })
    page.on('framenavigated', frame => {
      if (frame !== page.mainFrame() || this.page !== page) return
      try { domBrowserTarget(frame.url(), this.blockedPorts) }
      catch { this.send({ type: 'error', message: '이 주소로 이동할 수 없습니다. HTTP(S) 주소와 Mew 자체 포트인지 확인해 주세요.' }); void this.close(); return }
      this.historyRecording = this.recordNavigation(page, cdp, this.runtimeId, this.historyIndex)
      void this.historyRecording.then(() => this.sendState()).catch(() => {
        this.send({ type: 'error', message: '브라우저 탐색 기록을 갱신하지 못했습니다. 다시 연결해 주세요.' })
      })
    })
    page.on('close', () => { if (this.page === page) void this.close() })
    this.poll = setInterval(() => { void this.sendState() }, 300)
    this.poll.unref()
    return page
  }

  private async recordNavigation(page: Page, cdp: CDPSession, runtimeId: number, historyIndex?: number) {
    const url = page.url()
    const native = await cdp.send('Page.getNavigationHistory').catch(() => undefined)
    if (this.page !== page || this.runtimeId !== runtimeId || page.url() !== url) return
    if (!native) { this.history.record(url, runtimeId, historyIndex); return }
    let replaceIndex = historyIndex
    for (const entry of native.entries.slice(0, native.currentIndex + 1)) {
      if (entry.url === 'about:blank' || this.nativeHistoryIndices.has(entry.id)) continue
      this.history.record(entry.url, runtimeId, replaceIndex, true)
      this.nativeHistoryIndices.set(entry.id, this.history.currentIndex)
      replaceIndex = undefined
    }
    const current = native.entries[native.currentIndex]
    if (current) this.history.record(url, runtimeId, this.nativeHistoryIndices.get(current.id) ?? historyIndex)
    const validIds = new Set(native.entries.map(entry => entry.id))
    for (const id of this.nativeHistoryIndices.keys()) if (!validIds.has(id)) this.nativeHistoryIndices.delete(id)
  }

  private async sendState() {
    const page = this.page
    if (!page || !this.active()) return
    const message = { type: 'state' as const, generation: this.generation, url: page.url() === 'about:blank' ? '' : page.url(), title: await page.title().catch(() => ''), loading: this.loading, canGoBack: this.history.canGoBack, canGoForward: this.history.canGoForward }
    const serialized = JSON.stringify(message)
    if (serialized !== this.state) { this.state = serialized; this.send(message) }
  }

  private beginDocument(url: string) {
    this.generation++
    this.loading = true
    this.navigatingDocument = true
    if (this.documentToken) this.retiredTokens.add(this.documentToken)
    this.documentToken = undefined
    this.cache.abort.abort()
    this.cache.entries.clear()
    this.cache = assetCache(url)
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
        const cookies = await this.context!.cookies(url.href)
        const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.any([this.abort.signal, cache.abort.signal, AbortSignal.timeout(5000)]), headers: { Cookie: cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ') } })
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

  private async navigateTo(url: string, historyIndex?: number, action?: 'back' | 'forward' | 'reload', request?: NavigationRequest) {
    domBrowserTarget(url, this.blockedPorts)
    this.loading = true
    try {
      const page = await this.start(url)
      if (!this.active()) return
      this.generation++
      this.historyIndex = historyIndex
      const commandGeneration = this.generation
      this.navigationRequest = request ? { url, request } : undefined
      await this.sendState()
      try {
        await page.evaluate('window.__mewDomScrollRevisions?.clear()').catch(() => {})
        if (action === 'back') await page.goBack({ waitUntil: 'domcontentloaded' })
        else if (action === 'forward') await page.goForward({ waitUntil: 'domcontentloaded' })
        else if (action === 'reload') await page.reload({ waitUntil: 'domcontentloaded' })
        else await page.goto(url, { waitUntil: 'domcontentloaded' })
        if (!this.queuedNavigation) this.engineRedirects = 0
      } catch (error) {
        if (!this.queuedNavigation) throw error
      } finally {
        await this.historyRecording
        if (!this.queuedNavigation && this.generation === commandGeneration) await page.evaluate('window.__mewDomRecord?.takeFullSnapshot?.()').catch(() => {})
      }
    } finally {
      this.navigationRequest = undefined
      this.historyIndex = undefined
      this.loading = !!this.queuedNavigation
      await this.sendState()
    }
  }

  private async command(command: DomBrowserCommand) {
    if (command.type === 'color-scheme') {
      this.colorScheme = command.colorScheme
      await this.page?.emulateMedia({ colorScheme: this.colorScheme })
      return
    }
    if (command.type === 'resize') {
      this.viewport = { width: command.width, height: command.height }
      await this.page?.setViewportSize(this.viewport)
      return
    }
    if (['click', 'focus', 'input', 'scroll', 'key'].includes(command.type) && 'generation' in command && command.generation !== this.generation) return
    if (command.type === 'navigate') { this.engineRedirects = 0; this.queuedNavigation = undefined; await this.navigateTo(command.url); return }
    if (command.type === 'back' || command.type === 'forward') {
      this.engineRedirects = 0
      const target = this.history.target(command.type)
      if (target) {
        const native = await this.cdp?.send('Page.getNavigationHistory').catch(() => undefined)
        const adjacent = native?.entries[native.currentIndex + (command.type === 'back' ? -1 : 1)]
        const nativeAction = target.entry.runtimeId === this.runtimeId && adjacent?.url === target.entry.url ? command.type : undefined
        await this.navigateTo(target.entry.url, target.index, nativeAction)
      }
      return
    }
    if (command.type === 'reload') {
      this.engineRedirects = 0
      const current = this.history.current
      if (current) await this.navigateTo(current.url, this.history.currentIndex, 'reload')
      return
    }
    const page = await this.start()
    if (!this.active()) return
    if (command.type === 'key') {
      this.engineRedirects = 0
      const key = [command.ctrlKey && 'Control', command.metaKey && 'Meta', command.altKey && 'Alt', command.shiftKey && 'Shift', command.key === ' ' ? 'Space' : command.key].filter(Boolean).join('+')
      await page.keyboard.press(key); return
    }
    if (command.type === 'focus') {
      await page.evaluate(`window.__mewDomRecord?.mirror.getNode(${command.id})?.focus?.()`)
      return
    }
    if (command.type === 'click') {
      this.engineRedirects = 0
      const point = await page.evaluate(`(() => { const n = window.__mewDomRecord?.mirror.getNode(${command.id}); const e = n?.nodeType === 1 ? n : n?.parentElement; if (!e) return null; e.scrollIntoView({block:'nearest', inline:'nearest'}); const r = e.getBoundingClientRect(); return {x: r.x + r.width / 2, y: r.y + r.height / 2}; })()`) as { x: number; y: number } | null
      if (point) await page.mouse.click(point.x, point.y)
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
    this.assetWaiters.splice(0).forEach(resolve => resolve())
    this.cache.abort.abort(); this.cache.entries.clear()
    this.socket.close(1000)
    await this.releaseBrowser()
    this.storageStates.clear()
  }
}

export async function closeDomBrowsers() { await Promise.all([...sessions].map(session => session.close())) }

export function attachDomBrowserWebSocket(server: Server | Http2SecureServer, getAuth: (req: IncomingMessage) => RequestAuth = resolveAuth) {
  servers.add(server)
  const wss = new WebSocketServer({ noServer: true, maxPayload: 96 * 1024, perMessageDeflate: false })
  server.on('upgrade', (req, socket, head) => {
    if (new URL(req.url ?? '', 'http://localhost').pathname !== DOM_BROWSER_WS) return
    const original = getAuth(req)
    const allowed = () => { const auth = getAuth(req); return !!original.email && auth.email === original.email && !auth.mustChangePassword && canUse(auth, 'nativeBrowser') && webSocketOriginAllowed(req) }
    if (!allowed()) { socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return }
    if (sessions.size >= 8 || [...sessions].filter(session => session.account === original.email).length >= 3) { socket.end('HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\n\r\n'); return }
    wss.handleUpgrade(req, socket, head, ws => {
      watchSocketAccess(ws, req, allowed)
      new DomBrowserSession(original.email!, ws, allowed)
    })
  })
  server.once('close', () => { servers.delete(server); wss.close(); void closeDomBrowsers() })
}
