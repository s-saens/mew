import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import type { OAuthClientProvider, OAuthDiscoveryState } from '@modelcontextprotocol/sdk/client/auth.js'
import type { OAuthClientInformationMixed, OAuthClientMetadata, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js'
import type { FetchLike, Transport, TransportSendOptions } from '@modelcontextprotocol/sdk/shared/transport.js'
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js'
import type { SharedMcpConfig } from './shared-mcp.ts'
import { readSharedMcpConfig, sharedMcpConfigIdentity } from './shared-mcp.ts'

export type AuthStatus = {
  status: 'disconnected' | 'connected' | 'needs_auth' | 'error'
  error?: string
  toolCount?: number
  toolNames?: string[]
  checkedAt?: string
}
export interface SharedMcpToolSummary {
  toolCount?: number
  toolNames?: string[]
}
type SavedTokens = OAuthTokens & { expires_at?: number }
interface Credentials {
  client?: OAuthClientInformationMixed
  tokens?: SavedTokens
  discovery?: OAuthDiscoveryState
  verifier?: string
  redirectUrl?: string
  status?: AuthStatus
}
export interface SharedMcpConnectionOptions {
  redirectUrl?: string
  onAuthorization?: (url: URL) => Promise<void>
  isAuthorized?: () => boolean
  signal?: AbortSignal
  fetch?: FetchLike
}
export class SharedMcpLoginRequiredError extends Error {
  readonly code = 'MCP_LOGIN_REQUIRED'
  constructor() { super('Connect this MCP server in Mew first.') }
}
export class SharedMcpEnvError extends Error {
  readonly code = 'MCP_ENV_MISSING'
  readonly variable?: string
  constructor(message: string, variable?: string) { super(message); this.variable = variable }
}

const SAFE_TOOL_NAME = /^[A-Za-z0-9][A-Za-z0-9_.:/@ -]{0,79}$/
function sanitizeToolSummary(summary?: SharedMcpToolSummary): SharedMcpToolSummary {
  if (!summary) return {}
  const toolCount = typeof summary.toolCount === 'number' && Number.isInteger(summary.toolCount) && summary.toolCount >= 0 && summary.toolCount <= 10_000 ? summary.toolCount : undefined
  const toolNames = Array.isArray(summary.toolNames)
    ? [...new Set(summary.toolNames.filter((name): name is string => typeof name === 'string' && SAFE_TOOL_NAME.test(name)))].slice(0, 24)
    : undefined
  return { ...(toolCount !== undefined ? { toolCount } : {}), ...(toolNames?.length ? { toolNames } : {}) }
}

/** Map upstream/local failures to safe, actionable diagnostics without leaking raw bodies, tokens, or URLs. */
export function classifySharedMcpError(error: unknown, kind: 'remote' | 'stdio' = 'remote'): { status: 'needs_auth' | 'error'; message: string } {
  if (error instanceof SharedMcpLoginRequiredError) return { status: 'needs_auth', message: '인증이 필요합니다. 다시 로그인하세요.' }
  if (error instanceof SharedMcpEnvError) {
    if (error.variable && /^[A-Za-z_][A-Za-z0-9_]*$/.test(error.variable)) {
      return { status: 'error', message: `필요한 환경 변수(${error.variable})가 설정되지 않았습니다.` }
    }
    return { status: 'error', message: 'MCP 환경 변수 설정을 확인하세요.' }
  }
  const err = error as { code?: unknown; status?: unknown; statusCode?: unknown; name?: unknown; message?: unknown; cause?: unknown } | null
  const cause = (err?.cause && typeof err.cause === 'object' ? err.cause : undefined) as { code?: unknown; name?: unknown } | undefined
  const code = typeof err?.code === 'string' ? err.code : typeof cause?.code === 'string' ? cause.code : ''
  const httpStatus = typeof err?.status === 'number' ? err.status : typeof err?.statusCode === 'number' ? err.statusCode : undefined
  const name = typeof err?.name === 'string' ? err.name : ''
  const text = typeof err?.message === 'string' ? err.message : ''

  if (httpStatus === 401 || name === 'UnauthorizedError' || /\b(?:401|unauthorized|invalid_token|invalid_grant)\b/i.test(text)) {
    return { status: 'needs_auth', message: '인증이 만료되었거나 유효하지 않습니다. 다시 로그인하세요.' }
  }
  if (httpStatus === 403 || /\b403\b/.test(text)) {
    return { status: 'error', message: 'MCP 서버 접근이 거부되었습니다(403). 계정 권한이나 토큰 설정을 확인하세요.' }
  }
  if (httpStatus === 404 || /\b404\b/.test(text)) {
    return { status: 'error', message: 'MCP 엔드포인트를 찾을 수 없습니다(404). 서버 URL을 확인하세요.' }
  }
  if ((typeof httpStatus === 'number' && httpStatus >= 500 && httpStatus < 600) || /\b50[0234]\b/.test(text)) {
    return { status: 'error', message: 'MCP 서버에서 오류가 발생했습니다. 잠시 후 다시 시도하세요.' }
  }
  if (kind === 'stdio') {
    if (code === 'ENOENT' || /\bENOENT\b/.test(text)) return { status: 'error', message: '실행 명령을 찾을 수 없습니다(ENOENT). 설치 여부와 경로(PATH)를 확인하세요.' }
    if (code === 'EACCES' || code === 'EPERM' || /\bEACCES\b/.test(text)) return { status: 'error', message: '실행 명령에 대한 실행 권한이 없습니다.' }
  }
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return { status: 'error', message: '서버 주소를 찾을 수 없습니다. URL과 네트워크 연결을 확인하세요.' }
  if (code === 'ECONNREFUSED') return { status: 'error', message: 'MCP 서버에 연결할 수 없습니다. 서버가 실행 중인지 확인하세요.' }
  if (code === 'ETIMEDOUT' || name === 'TimeoutError' || name === 'AbortError' || /\btimed?\s*out\b/i.test(text)) {
    return { status: 'error', message: 'MCP 서버 응답 시간이 초과되었습니다. 네트워크와 서버 상태를 확인하세요.' }
  }
  return { status: 'error', message: 'MCP에 연결하지 못했습니다. 서버 주소, 실행 명령 및 인증 설정을 확인하세요.' }
}

function privateDirectory(directory: string) {
  let ancestor = path.resolve(directory)
  while (ancestor !== path.dirname(ancestor)) {
    try { if (fs.lstatSync(ancestor).isSymbolicLink()) throw new Error('MCP credential storage is unavailable.') }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    ancestor = path.dirname(ancestor)
  }
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
  if (fs.lstatSync(directory).isSymbolicLink()) throw new Error('MCP credential storage is unavailable.')
  fs.chmodSync(directory, 0o700)
}
export function expandSharedMcpValue(value: string, environment: NodeJS.ProcessEnv = process.env): string {
  return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_match, key: string) => {
    const expanded = environment[key]
    if (expanded === undefined) throw new SharedMcpEnvError('A required MCP environment variable is unavailable.', key)
    return expanded
  })
}
export function sharedMcpEnvironment(config: SharedMcpConfig): Record<string, string> {
  const environment = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined))
  const definitions = config.env ?? {}, resolved = new Map<string, string>()
  const resolve = (key: string, trail: string[]): string => {
    if (resolved.has(key)) return resolved.get(key)!
    if (trail.includes(key)) throw new SharedMcpEnvError('MCP environment variables contain a circular reference.')
    if (!Object.hasOwn(definitions, key)) {
      if (process.env[key] === undefined) throw new SharedMcpEnvError('A required MCP environment variable is unavailable.', key)
      return process.env[key]!
    }
    const value = definitions[key].replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_match, reference: string) => {
      if (reference === key && process.env[key] !== undefined) return process.env[key]!
      return resolve(reference, [...trail, key])
    })
    resolved.set(key, value)
    return value
  }
  for (const key of Object.keys(definitions)) Object.defineProperty(environment, key, { value: resolve(key, []), enumerable: true, writable: true, configurable: true })
  return environment
}
function atomic(file: string, value: unknown) {
  const temporary = `${file}.${randomUUID()}.tmp`
  try {
    fs.writeFileSync(temporary, JSON.stringify(value), { flag: 'wx', mode: 0o600 })
    fs.renameSync(temporary, file)
  } finally { fs.rmSync(temporary, { force: true }) }
}
function read<T>(file: string): T | undefined {
  try {
    const stat = fs.lstatSync(file)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 2_000_000) throw new Error()
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw new Error('MCP credential storage is unavailable.')
  }
}
function location(directory: string, name: string) {
  const config = readSharedMcpConfig(directory, name)
  const sourceIdentity = sharedMcpConfigIdentity(config)
  const environment = sharedMcpEnvironment(config)
  const expand = (values: Record<string, string> = {}) => Object.fromEntries(Object.entries(values).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => [key, expandSharedMcpValue(value, environment)]))
  const headers = expand(config.headers), oauth = expand(config.oauth)
  const identity = createHash('sha256').update(sourceIdentity).update(JSON.stringify({ headers, oauth })).digest('hex')
  return { config, identity, headers, oauth, root: path.join(directory, 'auth', identity) }
}
function initializeStorage(root: string) {
  privateDirectory(path.dirname(root)); privateDirectory(root)
  const file = path.join(root, 'epoch.json')
  if (read<string>(file)) return read<string>(file)!
  const temporary = `${file}.${randomUUID()}.tmp`
  try {
    fs.writeFileSync(temporary, JSON.stringify(randomUUID()), { flag: 'wx', mode: 0o600 })
    fs.linkSync(temporary, file)
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error }
  finally { fs.rmSync(temporary, { force: true }) }
  return read<string>(file)!
}
function withStatus(root: string, status: AuthStatus) {
  atomic(path.join(root, 'status.json'), status)
}
function credentials(root: string): Credentials {
  const pair = read<Credentials>(path.join(root, 'credentials.json')) ?? {}
  return { ...pair,
    client: pair.tokens ? pair.client : read<OAuthClientInformationMixed>(path.join(root, 'client.json')) ?? pair.client,
    redirectUrl: pair.tokens ? pair.redirectUrl : read<string>(path.join(root, 'redirect.json')) ?? pair.redirectUrl,
    discovery: read<OAuthDiscoveryState>(path.join(root, 'discovery.json')),
    status: read<AuthStatus>(path.join(root, 'status.json')) }
}
export function sharedMcpAuthStatus(directory: string, name: string): AuthStatus {
  try {
    const { root } = location(directory, name)
    const saved = credentials(root)
    if (saved?.status?.status === 'needs_auth' || saved?.status?.status === 'error') return saved.status
    const metadata = saved?.status ? {
      ...sanitizeToolSummary(saved.status),
      ...(typeof saved.status.checkedAt === 'string' ? { checkedAt: saved.status.checkedAt } : {}),
    } : {}
    if (saved?.tokens?.access_token) {
      if (saved.tokens.expires_at && saved.tokens.expires_at <= Date.now() && !saved.tokens.refresh_token) return { status: 'needs_auth' }
      return { status: 'connected', ...metadata }
    }
    return saved?.status ? { ...saved.status, ...metadata } : { status: 'disconnected' }
  } catch (error) {
    if (error instanceof SharedMcpEnvError) return { status: 'error', error: classifySharedMcpError(error).message }
    return { status: 'error', error: 'MCP connection settings could not be read.' }
  }
}
export function markSharedMcpConnected(directory: string, name: string, summary?: SharedMcpToolSummary) {
  const { root } = location(directory, name)
  initializeStorage(root)
  withStatus(root, { status: 'connected', checkedAt: new Date().toISOString(), ...sanitizeToolSummary(summary) })
}
/** Degrade persisted readiness after a runtime relay failure so subsequent sessions do not keep failing on startup. */
export function recordSharedMcpFailure(directory: string, name: string, status: 'needs_auth' | 'error', error: string) {
  try {
    const { root } = location(directory, name)
    initializeStorage(root)
    withStatus(root, { status, error, checkedAt: new Date().toISOString() })
  } catch { /* Removed, unreadable, or symlink-blocked storage must not break teardown. */ }
}
export function clearSharedMcpAuth(directory: string, name: string) {
  const { root } = location(directory, name)
  initializeStorage(root)
  // The epoch prevents a connection that is still finishing a request from restoring revoked tokens.
  atomic(path.join(root, 'epoch.json'), randomUUID())
  for (const file of ['credentials.json', 'status.json', 'client.json', 'redirect.json', 'discovery.json']) fs.rmSync(path.join(root, file), { force: true })
}

async function locked<T>(root: string, signal: AbortSignal, run: () => Promise<T>): Promise<T> {
  const file = path.join(root, 'refresh.lock')
  const deadline = Date.now() + 35_000
  const nonce = randomUUID()
  let owned = false
  while (!owned) {
    signal.throwIfAborted()
    try {
      fs.mkdirSync(file, { mode: 0o700 }); owned = true
      atomic(path.join(file, 'owner.json'), { pid: process.pid, nonce })
    } catch (error) {
      if (owned) { fs.rmSync(file, { recursive: true, force: true }); throw error }
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      try { if (fs.lstatSync(file).isSymbolicLink()) throw new Error('MCP credential storage is unavailable.') }
      catch (cause) { if ((cause as NodeJS.ErrnoException).code === 'ENOENT') continue; throw cause }
      // Serialize reclamation as well as refresh: two reclaimers must not delete a new owner's lock.
      const recovery = `${file}.recovery`
      let recoveryFd: number | undefined
      try {
        recoveryFd = fs.openSync(recovery, 'wx', 0o600)
        const owner = read<{ pid: number }>(path.join(file, 'owner.json'))
        if (owner && (!Number.isSafeInteger(owner.pid) || owner.pid <= 0)) throw new Error('MCP credential storage is unavailable.')
        if (owner?.pid && owner.pid !== process.pid) {
          try { process.kill(owner.pid, 0) }
          catch (cause) { if ((cause as NodeJS.ErrnoException).code === 'ESRCH') fs.rmSync(file, { recursive: true, force: true }) }
        } else if (!owner && Date.now() - fs.statSync(file).mtimeMs > 35_000) fs.rmSync(file, { recursive: true, force: true })
      } catch (cause) {
        if (!['EEXIST', 'ENOENT'].includes((cause as NodeJS.ErrnoException).code ?? '')) throw cause
      } finally {
        if (recoveryFd !== undefined) { fs.closeSync(recoveryFd); fs.rmSync(recovery, { force: true }) }
      }
      if (Date.now() >= deadline) throw new Error('MCP authentication is busy. Retry shortly.')
      await delay(40, undefined, { signal })
    }
  }
  try { return await run() } finally {
    if (read<{ nonce: string }>(path.join(file, 'owner.json'))?.nonce === nonce) fs.rmSync(file, { recursive: true, force: true })
  }
}

export function createSharedMcpConnection(directory: string, name: string, options: SharedMcpConnectionOptions = {}) {
  const { config, identity, root, headers: remoteHeaders, oauth: remoteOAuth } = location(directory, name)
  if (!config.url || config.command) throw new Error('Select a remote MCP server.')
  const endpoint = new URL(config.url)
  const epoch = initializeStorage(root)
  const file = path.join(root, 'credentials.json')
  const controller = new AbortController()
  const signal = options.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal
  const state = randomBytes(32).toString('base64url')
  const returnedTokens = new Set<string>()
  let rejectedAccessToken: string | undefined
  let interactiveClient: OAuthClientInformationMixed | undefined
  let codeVerifier: string | undefined
  let registeringClient = false
  const assertCurrent = () => {
    signal.throwIfAborted()
    if (options.isAuthorized && !options.isAuthorized()) throw new Error('MCP connection access was revoked.')
    if (location(directory, name).identity !== identity || read<string>(path.join(root, 'epoch.json')) !== epoch) throw new Error('MCP connection settings changed. Reconnect the server.')
  }
  const load = () => { assertCurrent(); return credentials(root) }
  const update = (patch: Pick<Credentials, 'client' | 'redirectUrl' | 'discovery' | 'status'>) => {
    assertCurrent()
    const fields = { client: 'client.json', redirectUrl: 'redirect.json', discovery: 'discovery.json', status: 'status.json' } as const
    for (const key of Object.keys(patch) as (keyof typeof fields)[]) {
      if (patch[key] === undefined) fs.rmSync(path.join(root, fields[key]), { force: true })
      else atomic(path.join(root, fields[key]), patch[key])
    }
  }
  const previousRedirect = load().redirectUrl
  if (options.redirectUrl) update({ redirectUrl: options.redirectUrl })
  const redirectUrl = options.redirectUrl ?? load().redirectUrl ?? 'http://127.0.0.1:1/oauth/callback'
  const needsAuth = () => { update({ status: { status: 'needs_auth' } }); throw new SharedMcpLoginRequiredError() }
  const persistTokens = (tokens: OAuthTokens) => {
    const saved = load()
    const current = interactiveClient && saved.client?.client_id !== interactiveClient.client_id ? undefined : saved.tokens
    if (returnedTokens.has(tokens.access_token) && current && current.access_token !== tokens.access_token) return
    const expires_at = current?.access_token === tokens.access_token ? current.expires_at : typeof tokens.expires_in === 'number' ? Date.now() + tokens.expires_in * 1000 : undefined
    const pairedClient = interactiveClient ?? saved.client
    atomic(file, { client: pairedClient, redirectUrl: interactiveClient ? redirectUrl : saved.redirectUrl,
      tokens: { ...tokens, ...(tokens.refresh_token ?? current?.refresh_token ? { refresh_token: tokens.refresh_token ?? current?.refresh_token } : {}), ...(expires_at ? { expires_at } : {}) } })
    update({ status: { status: 'connected' } })
    registeringClient = false
  }
  const provider: OAuthClientProvider = {
    redirectUrl,
    clientMetadata: {
      client_name: 'Mew', redirect_uris: [redirectUrl], grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'], token_endpoint_auth_method: remoteOAuth.client_secret ? 'client_secret_post' : 'none',
      ...(remoteOAuth.scope ? { scope: remoteOAuth.scope } : {}),
    } satisfies OAuthClientMetadata,
    state: () => state,
    clientInformation: () => {
      const saved = load().client
      if (options.onAuthorization && interactiveClient) return interactiveClient
      if (saved) {
        const redirects = 'redirect_uris' in saved && Array.isArray(saved.redirect_uris) ? saved.redirect_uris : undefined
        const changedRedirect = options.redirectUrl && options.onAuthorization && !remoteOAuth.client_id
          && (redirects ? !redirects.includes(options.redirectUrl) : previousRedirect && previousRedirect !== options.redirectUrl)
        if (!changedRedirect) { if (options.onAuthorization) interactiveClient = saved; return saved }
        codeVerifier = undefined
        registeringClient = true
      }
      if (remoteOAuth.client_id) return { client_id: remoteOAuth.client_id, ...(remoteOAuth.client_secret ? { client_secret: remoteOAuth.client_secret } : {}) }
      if (!options.onAuthorization) return needsAuth()
      return undefined
    },
    saveClientInformation: client => {
      const current = load()
      if (options.onAuthorization) interactiveClient = client
      if (current.tokens && current.client?.client_id !== client.client_id) return
      update({ client })
    },
    tokens: () => {
      const current = load()
      return options.onAuthorization && (registeringClient || interactiveClient && current.client?.client_id !== interactiveClient.client_id) ? undefined : current.tokens
    },
    saveTokens: tokens => locked(root, signal, async () => { persistTokens(tokens) }),
    redirectToAuthorization: async url => {
      update({ status: { status: 'needs_auth' } })
      if (!options.onAuthorization) return needsAuth()
      await options.onAuthorization(url)
    },
    saveCodeVerifier: verifier => {
      assertCurrent()
      if (!options.onAuthorization) return needsAuth()
      codeVerifier = verifier
    },
    codeVerifier: () => { assertCurrent(); if (!codeVerifier) throw new Error('MCP authorization expired. Connect again.'); return codeVerifier },
    discoveryState: () => load().discovery,
    saveDiscoveryState: discovery => update({ discovery }),
    invalidateCredentials: scope => locked(root, signal, async () => {
      const saved = load()
      const preserveActivePair = !!saved.tokens && !!options.onAuthorization
        && (registeringClient || interactiveClient && saved.client?.client_id !== interactiveClient.client_id)
      if (scope === 'all' || scope === 'client') {
        if (!preserveActivePair) { fs.rmSync(file, { force: true }); update({ client: undefined }) }
        interactiveClient = undefined; registeringClient = false
      } else if (scope === 'tokens' && !preserveActivePair) {
        update({ client: saved.client, redirectUrl: saved.redirectUrl })
        fs.rmSync(file, { force: true })
      }
      if (scope === 'all' || scope === 'verifier') codeVerifier = undefined
      if (scope === 'all' || scope === 'discovery') update({ discovery: undefined })
    }),
  }
  const baseFetch = options.fetch ?? fetch
  const guardedFetch: FetchLike = async (input, init) => {
    assertCurrent()
    const url = new URL(String(input))
    const headers = new Headers(init?.headers)
    const body = typeof init?.body === 'string' ? init.body : init?.body instanceof URLSearchParams ? init.body.toString() : ''
    const params = new URLSearchParams(body)
    const refresh = params.get('grant_type') === 'refresh_token' ? params.get('refresh_token') : null
    let jsonRpc = false
    if (body.trimStart().startsWith('{')) { try { jsonRpc = JSON.parse(body).jsonrpc === '2.0' } catch { /* OAuth forms are not JSON-RPC. */ } }
    const isMcp = jsonRpc || headers.get('accept')?.includes('text/event-stream') || init?.method === 'DELETE'
    // MCP credentials must not accompany OAuth discovery/registration requests at another endpoint.
    if (url.origin === endpoint.origin && isMcp) for (const [key, value] of Object.entries(remoteHeaders)) headers.set(key, value)
    const request = { ...init, headers, signal: init?.signal ? AbortSignal.any([signal, init.signal]) : signal }
    if (!refresh) {
      const response = await baseFetch(input, request)
      if (isMcp && response.status === 401) rejectedAccessToken = headers.get('authorization')?.replace(/^Bearer /i, '')
      return response
    }
    return locked(root, signal, async () => {
      const current = load().tokens
      if (current?.refresh_token && (current.refresh_token !== refresh || rejectedAccessToken && current.access_token !== rejectedAccessToken)) {
        returnedTokens.add(current.access_token)
        return Response.json(current)
      }
      const response = await baseFetch(input, { ...request, signal: AbortSignal.any([request.signal, AbortSignal.timeout(30_000)]) })
      if (response.ok) {
        const value = await response.clone().json() as Partial<OAuthTokens>
        if (typeof value.access_token === 'string' && typeof value.token_type === 'string') {
          const tokens = { ...current, ...value, refresh_token: value.refresh_token ?? refresh,
            ...(typeof value.expires_in === 'number' ? { expires_at: Date.now() + value.expires_in * 1000 } : {}) } as SavedTokens
          persistTokens(tokens)
          returnedTokens.add(tokens.access_token)
        }
      }
      return response
    })
  }
  const transport = config.type === 'sse'
    ? new SSEClientTransport(endpoint, { authProvider: provider, fetch: guardedFetch })
    : new StreamableHTTPClientTransport(endpoint, { authProvider: provider, fetch: guardedFetch })
  const send: Transport['send'] = transport.send.bind(transport)
  transport.send = async (message: JSONRPCMessage, sendOptions?: TransportSendOptions) => {
    try {
      await send(message, sendOptions)
      if ('method' in message && message.method === 'initialize') {
        const previous = load().status
        update({ status: { status: 'connected', checkedAt: new Date().toISOString(), ...sanitizeToolSummary(previous) } })
      }
    } catch (error) {
      if (!(error instanceof SharedMcpLoginRequiredError)) {
        try {
          if (load().status?.status !== 'needs_auth') {
            const classified = classifySharedMcpError(error, 'remote')
            update({ status: { status: classified.status, error: classified.message, checkedAt: new Date().toISOString() } })
          }
        } catch { /* Changed or revoked configurations stay invalid. */ }
      }
      throw error
    }
  }
  const closeTransport = transport.close.bind(transport)
  const abort = () => { void closeTransport().catch(() => {}) }
  signal.addEventListener('abort', abort, { once: true })
  return { transport, provider, close: async () => { signal.removeEventListener('abort', abort); codeVerifier = undefined; interactiveClient = undefined; controller.abort(); await closeTransport() } }
}
