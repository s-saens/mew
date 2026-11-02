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

type AuthStatus = { status: 'disconnected' | 'connected' | 'needs_auth' | 'error'; error?: string }
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
    if (expanded === undefined) throw new Error('A required MCP environment variable is unavailable.')
    return expanded
  })
}
export function sharedMcpEnvironment(config: SharedMcpConfig): Record<string, string> {
  const environment = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined))
  const definitions = config.env ?? {}, resolved = new Map<string, string>()
  const resolve = (key: string, trail: string[]): string => {
    if (resolved.has(key)) return resolved.get(key)!
    if (trail.includes(key)) throw new Error('MCP environment variables contain a circular reference.')
    if (!Object.hasOwn(definitions, key)) {
      if (process.env[key] === undefined) throw new Error('A required MCP environment variable is unavailable.')
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
    if (saved?.tokens?.access_token) {
      if (saved.tokens.expires_at && saved.tokens.expires_at <= Date.now() && !saved.tokens.refresh_token) return { status: 'needs_auth' }
      return { status: 'connected' }
    }
    return saved?.status ?? { status: 'disconnected' }
  } catch { return { status: 'error', error: 'MCP connection settings could not be read.' } }
}
export function markSharedMcpConnected(directory: string, name: string) {
  const { root } = location(directory, name)
  initializeStorage(root)
  withStatus(root, { status: 'connected' })
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
      if ('method' in message && message.method === 'initialize') update({ status: { status: 'connected' } })
    } catch (error) {
      if (!(error instanceof SharedMcpLoginRequiredError)) {
        try { if (load().status?.status !== 'needs_auth') update({ status: { status: 'error', error: 'MCP connection failed. Try connecting again.' } }) } catch { /* Changed or revoked configurations stay invalid. */ }
      }
      throw error
    }
  }
  const closeTransport = transport.close.bind(transport)
  const abort = () => { void closeTransport().catch(() => {}) }
  signal.addEventListener('abort', abort, { once: true })
  return { transport, provider, close: async () => { signal.removeEventListener('abort', abort); codeVerifier = undefined; interactiveClient = undefined; controller.abort(); await closeTransport() } }
}
