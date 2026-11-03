import { randomUUID, timingSafeEqual } from 'node:crypto'
import http from 'node:http'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import type { SharedMcpConnectionStatus } from '../shared/shared-mcp.ts'
import { accessChanges } from './access-policy.ts'
import { getUser } from './auth.ts'
import { closeLoginDesktopJob, createLoginDesktopAuthSession } from './login-desktop.ts'
import { readSharedMcpConfig, sharedMcpConfigIdentity, sharedMcpDirectory, type SharedMcpConfig } from './shared-mcp.ts'
import { clearSharedMcpAuth, createSharedMcpConnection, markSharedMcpConnected, sharedMcpAuthStatus } from './shared-mcp-oauth.ts'
import { createSharedMcpLocalTransport } from './shared-mcp-stdio.ts'

export class SharedMcpConnectionError extends Error {
  readonly status: number
  constructor(message: string, status = 400) { super(message); this.status = status }
}

interface RemoteConnection {
  transport: Transport & { finishAuth(code: string): Promise<void> }
  provider: { state?: () => string | Promise<string> }
  close(): Promise<void>
}

interface Dependencies {
  directory(owner: string): string
  config(directory: string, name: string): SharedMcpConfig
  identity(config: SharedMcpConfig): string
  accountVersion(owner: string): number | null
  remote(directory: string, name: string, options: { redirectUrl: string; onAuthorization: (url: URL) => Promise<void>; signal: AbortSignal; isAuthorized: () => boolean }): Promise<RemoteConnection> | RemoteConnection
  probe(transport: Transport, signal: AbortSignal): Promise<{ close(): Promise<void> }>
  stdio(config: SharedMcpConfig): Transport
  authStatus(directory: string, name: string): Promise<{ status: 'disconnected' | 'connected' | 'needs_auth' | 'error'; error?: string }> | { status: 'disconnected' | 'connected' | 'needs_auth' | 'error'; error?: string }
  clearAuth(directory: string, name: string): void | Promise<void>
  connected(directory: string, name: string): void | Promise<void>
  openBrowser(owner: string, job: string, url: string): Promise<string>
  closeBrowser(owner: string, job: string): Promise<void>
  timeout: number
  checkInterval: number
}

const defaults: Dependencies = {
  directory: () => sharedMcpDirectory(),
  config: readSharedMcpConfig,
  identity: sharedMcpConfigIdentity,
  accountVersion: owner => getUser(owner)?.createdAt ?? null,
  remote: createSharedMcpConnection,
  probe: async (transport, signal) => {
    const client = new Client({ name: 'mew-connection-check', version: '1.0.0' })
    const abort = () => { void client.close().catch(() => {}) }
    signal.addEventListener('abort', abort, { once: true })
    try {
      if (signal.aborted) throw new Error('cancelled')
      await client.connect(transport)
      return { close: async () => { signal.removeEventListener('abort', abort); await client.close() } }
    } catch (error) {
      signal.removeEventListener('abort', abort)
      // A failed HTTP initialization must remain available for finishAuth().
      if (signal.aborted) await client.close().catch(() => {})
      throw error
    }
  },
  stdio: createSharedMcpLocalTransport,
  authStatus: sharedMcpAuthStatus,
  clearAuth: clearSharedMcpAuth,
  connected: markSharedMcpConnected,
  openBrowser: createLoginDesktopAuthSession,
  closeBrowser: closeLoginDesktopJob,
  timeout: 10 * 60_000,
  checkInterval: 1000,
}

interface Job {
  id: string
  owner: string
  name: string
  directory: string
  identity: string
  accountVersion: number | null
  authorized: () => boolean
  state: SharedMcpConnectionStatus
  controller: AbortController
  deadline?: NodeJS.Timeout
  watcher?: NodeJS.Timeout
  accessCheck?: () => void
  listener?: http.Server
  transport?: Transport
  connection?: RemoteConnection
  client?: { close(): Promise<void> }
  expectedState?: string
  callbackCode?: string
  callbackResolve?: (code: string) => void
  callbackReject?: (error: Error) => void
  active: boolean
  cleanup?: Promise<void>
}

function sameState(received: string | null, expected: string | undefined): boolean {
  if (!received || !expected) return false
  const a = Buffer.from(received), b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Shared connection checks retain initiator-owned browser access and authorization. */
export class SharedMcpConnections {
  private readonly deps: Dependencies
  private readonly jobs = new Map<string, Job>()
  constructor(dependencies: Partial<Dependencies> = {}) { this.deps = { ...defaults, ...dependencies } }
  private key(owner: string, name: string) { return JSON.stringify([this.deps.directory(owner), name]) }
  private state(job: Job, owner: string): SharedMcpConnectionStatus {
    const state = { ...job.state, ownsJob: job.owner === owner }
    if (job.owner !== owner) delete state.streamUrl
    return state
  }
  private name(value: unknown): string {
    if (typeof value !== 'string' || !value.trim() || value.length > 256 || /[\0\r\n]/.test(value)) throw new SharedMcpConnectionError('MCP 이름을 확인하세요.')
    return value
  }
  private config(owner: string, name: string) {
    if (!owner) throw new SharedMcpConnectionError('로그인이 필요합니다.', 403)
    const directory = this.deps.directory(owner)
    try { return { directory, config: this.deps.config(directory, name) } } catch { throw new SharedMcpConnectionError('Mew 공통 MCP 설정을 찾을 수 없습니다.', 404) }
  }
  async status(owner: string, value: unknown): Promise<SharedMcpConnectionStatus> {
    const name = this.name(value), { directory, config } = this.config(owner, name)
    let job = this.jobs.get(this.key(owner, name))
    if (job && this.deps.accountVersion(job.owner) !== job.accountVersion) {
      await this.finish(job, { name, status: 'disconnected' })
      if (this.jobs.get(this.key(owner, name)) === job) this.jobs.delete(this.key(owner, name))
      job = undefined
    }
    if (job) {
      if (job.active) this.valid(job)
      if (job.active) return this.state(job, owner)
    }
    if (config.enabled === false) return { name, status: 'disconnected' }
    const status = await this.deps.authStatus(directory, name)
    if (job?.state.status === 'error' && status.status !== 'connected' && this.deps.identity(config) === job.identity) return this.state(job, owner)
    return { name, ...status }
  }
  start(owner: string, value: unknown, authorized: () => boolean): SharedMcpConnectionStatus {
    const name = this.name(value), { directory, config } = this.config(owner, name)
    if (config.enabled === false) throw new SharedMcpConnectionError('이 MCP를 활성화한 뒤 연결하세요.', 409)
    if (!authorized()) throw new SharedMcpConnectionError('에이전트 접근 권한이 없습니다.', 403)
    const existing = this.jobs.get(this.key(owner, name))
    if (existing?.active && this.valid(existing)) return this.state(existing, owner)
    const job: Job = { id: `mcp-${randomUUID()}`, owner, name, directory, identity: this.deps.identity(config), accountVersion: this.deps.accountVersion(owner), authorized, state: { name, status: 'connecting' }, controller: new AbortController(), active: true }
    this.jobs.set(this.key(owner, name), job)
    job.deadline = setTimeout(() => { void this.finish(job, { name, status: 'error', error: '연결 시간이 만료되었습니다. 다시 연결하세요.' }) }, this.deps.timeout)
    job.deadline.unref()
    job.accessCheck = () => { this.valid(job) }
    accessChanges.on('change', job.accessCheck)
    job.watcher = setInterval(job.accessCheck, this.deps.checkInterval); job.watcher.unref()
    void this.begin(job, config)
    return this.state(job, owner)
  }
  async cancel(owner: string, value: unknown): Promise<SharedMcpConnectionStatus> {
    const name = this.name(value)
    const job = this.jobs.get(this.key(owner, name))
    if (job?.active) await this.finish(job, { name, status: 'disconnected' })
    this.jobs.delete(this.key(owner, name))
    return this.status(owner, name)
  }
  async disconnect(owner: string, value: unknown): Promise<SharedMcpConnectionStatus> {
    const name = this.name(value), { directory } = this.config(owner, name)
    const job = this.jobs.get(this.key(owner, name))
    if (job) await this.finish(job, { name, status: 'disconnected' })
    this.jobs.delete(this.key(owner, name))
    await this.deps.clearAuth(directory, name)
    return { name, status: 'disconnected' }
  }
  async close() { await Promise.all([...this.jobs.values()].map(job => this.finish(job, { name: job.name, status: 'disconnected' }))); this.jobs.clear() }
  private valid(job: Job): boolean {
    if (!job.active || this.jobs.get(this.key(job.owner, job.name)) !== job) return false
    let valid = false
    try {
      const config = this.deps.config(job.directory, job.name)
      valid = job.authorized() && this.deps.accountVersion(job.owner) === job.accountVersion && config.enabled !== false && this.deps.identity(config) === job.identity
    } catch { /* Removed configuration and revoked accounts invalidate pending authorization. */ }
    if (!valid) void this.finish(job, { name: job.name, status: 'disconnected' })
    return valid
  }
  private assertActive(job: Job) { if (!this.valid(job)) throw new Error('cancelled') }
  private async begin(job: Job, config: SharedMcpConfig) {
    try {
      this.assertActive(job)
      if (config.command) {
        job.transport = this.deps.stdio(config)
        job.client = await this.deps.probe(job.transport, job.controller.signal)
      } else {
        const redirectUrl = await this.listen(job)
        this.assertActive(job)
        job.connection = await this.deps.remote(job.directory, job.name, { redirectUrl, signal: job.controller.signal, isAuthorized: () => this.valid(job), onAuthorization: async url => {
          this.assertActive(job)
          const expected = await job.connection!.provider.state?.()
          if (!sameState(url.searchParams.get('state'), expected)) throw new Error('invalid-oauth-state')
          job.expectedState = expected
          job.state = { name: job.name, status: 'needs_auth' }
          try {
            const streamUrl = await this.deps.openBrowser(job.owner, job.id, url.href)
            this.assertActive(job)
            job.state = { name: job.name, status: 'needs_auth', streamUrl }
          } catch {
            if (job.active) throw new SharedMcpConnectionError('로그인 화면을 준비하지 못했습니다. Linux/WSL 호스트의 Chrome 및 로그인 화면 구성을 확인하세요.', 503)
            throw new Error('cancelled')
          }
        } })
        job.transport = job.connection.transport
        this.assertActive(job)
        try { job.client = await this.deps.probe(job.transport, job.controller.signal) } catch (error) {
          if (!job.expectedState || !job.active) throw error
          const code = job.callbackCode ?? await new Promise<string>((resolve, reject) => { job.callbackResolve = resolve; job.callbackReject = reject })
          this.assertActive(job)
          job.state = { name: job.name, status: 'connecting' }
          await job.connection.transport.finishAuth(code)
          this.assertActive(job)
          // SDK HTTP transports cannot be started twice, even after close().
          await job.connection.close()
          this.assertActive(job)
          job.connection = await this.deps.remote(job.directory, job.name, { redirectUrl, signal: job.controller.signal, isAuthorized: () => this.valid(job), onAuthorization: async () => { throw new SharedMcpConnectionError('승인이 완료되지 않았습니다. 다시 연결하세요.', 401) } })
          job.transport = job.connection.transport
          this.assertActive(job)
          job.client = await this.deps.probe(job.transport, job.controller.signal)
        }
      }
      this.assertActive(job)
      await this.deps.connected(job.directory, job.name)
      this.assertActive(job)
      await this.finish(job, { name: job.name, status: 'connected' })
    } catch (error) {
      if (job.active) await this.finish(job, { name: job.name, status: 'error', error: error instanceof SharedMcpConnectionError ? error.message : 'MCP에 연결하지 못했습니다. 서버 주소, 실행 명령 및 인증 설정을 확인하세요.' })
    } finally {
      // Resources can arrive after cancellation while a connection factory is settling.
      if (!job.active) await Promise.allSettled([job.client?.close(), job.connection?.close() ?? job.transport?.close()])
    }
  }
  private async listen(job: Job): Promise<string> {
    const callbackPath = `/mcp/callback/${randomUUID()}`
    const server = http.createServer((req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      res.setHeader('Referrer-Policy', 'no-referrer')
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      if (req.method !== 'GET' || url.pathname !== callbackPath) { res.writeHead(404).end('Not found'); return }
      if (!this.valid(job) || !sameState(url.searchParams.get('state'), job.expectedState) || job.callbackCode) { res.writeHead(403).end('Authorization request is no longer valid.'); return }
      const code = url.searchParams.get('code')
      if (url.searchParams.has('error') || !code || code.length > 8192) {
        res.writeHead(400).end('Authorization was not completed.')
        void this.finish(job, { name: job.name, status: 'error', error: '로그인이 취소되었거나 승인에 실패했습니다. 다시 연결하세요.' })
        return
      }
      job.callbackCode = code
      job.callbackResolve?.(code)
      job.callbackResolve = undefined; job.callbackReject = undefined
      res.writeHead(200).end('Authorization received. You can close this window.')
    })
    server.requestTimeout = 5000; server.headersTimeout = 5000; server.maxConnections = 8
    job.listener = server
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve() })
    })
    if (!job.active) { server.close(); server.closeAllConnections(); throw new Error('cancelled') }
    server.on('error', () => { if (job.active) void this.finish(job, { name: job.name, status: 'error', error: '로그인 응답을 받지 못했습니다. 다시 연결하세요.' }) })
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('callback-unavailable')
    return `http://127.0.0.1:${address.port}${callbackPath}`
  }
  private async finish(job: Job, state: SharedMcpConnectionStatus): Promise<void> {
    if (job.cleanup) return job.cleanup
    job.active = false; job.state = state
    clearTimeout(job.deadline); clearInterval(job.watcher)
    if (job.accessCheck) accessChanges.off('change', job.accessCheck)
    job.controller.abort()
    job.callbackReject?.(new Error('cancelled')); job.callbackReject = undefined; job.callbackResolve = undefined; job.callbackCode = undefined; job.expectedState = undefined
    job.cleanup = (async () => {
      const server = job.listener
      if (server) { server.close(); server.closeAllConnections() }
      await Promise.allSettled([job.client?.close(), job.connection?.close() ?? job.transport?.close(), this.deps.closeBrowser(job.owner, job.id)])
    })()
    return job.cleanup
  }
}
