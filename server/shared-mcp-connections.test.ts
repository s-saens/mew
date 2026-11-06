import './test-isolated-data.ts'
import assert from 'node:assert/strict'
import test from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import { accessChanges } from './access-policy.ts'
import { SharedMcpConnections } from './shared-mcp-connections.ts'
import { sharedMcpConfigIdentity, type SharedMcpConfig } from './shared-mcp.ts'
import { createSharedMcpConnection, sharedMcpAuthStatus } from './shared-mcp-oauth.ts'

async function until(check: () => boolean | Promise<boolean>) {
  for (let i = 0; i < 150; i++) { if (await check()) return; await delay(5) }
  assert.fail('connection job did not settle')
}

function fixture(t: { after(fn: () => Promise<void>): void }, timeout = 5000, shared = false) {
  const configs = new Map<string, SharedMcpConfig>([['alice', { url: 'https://mcp.example.test/mcp', type: 'http' }], ['bob', { url: 'https://mcp.example.test/mcp', type: 'http' }]])
  const versions = new Map([['alice', 1], ['bob', 1]])
  const authorized = new Map([['alice', true], ['bob', true]])
  const saved = new Set<string>(), cleared: string[] = [], closedBrowser: string[][] = [], openedBrowser: string[][] = []
  let options: { redirectUrl: string; onAuthorization(url: URL): Promise<void>; signal: AbortSignal } | undefined
  let checks = 0, closed = 0, oauth = true, factoryWait: Promise<void> | undefined
  const transport = (): Transport & { finishAuth(code: string): Promise<void> } => {
    let started = false
    return {
      start: async () => { if (started) throw new Error('A transport cannot start twice'); started = true }, send: async () => {}, close: async () => { closed++ },
      finishAuth: async code => { assert.equal(code, 'private-authorization-code'); assert.equal(options!.signal.aborted, false) },
    }
  }
  const store = new SharedMcpConnections({
    directory: owner => shared ? 'alice' : owner,
    config: (owner, name) => { if (name !== 'cloudflare' || !configs.has(owner)) throw new Error('missing'); return { ...configs.get(owner)! } },
    identity: sharedMcpConfigIdentity,
    accountVersion: owner => versions.get(owner) ?? null,
    remote: async (_directory, _name, incoming) => { options = incoming; await factoryWait; const current = transport(); return { transport: current, provider: { state: () => 'private-state' }, close: () => current.close() } },
    stdio: () => transport(),
    probe: async (_transport, signal) => {
      await _transport.start()
      checks++
      if (oauth && checks === 1) {
        const url = new URL('https://identity.example.test/authorize?state=private-state&client_secret=private-secret')
        await options!.onAuthorization(url)
        throw new Error('upstream private-secret unauthorized')
      }
      signal.throwIfAborted()
      return { close: () => _transport.close() }
    },
    authStatus: directory => ({ status: saved.has(directory) ? 'connected' : 'disconnected' }),
    connected: directory => { saved.add(directory) },
    clearAuth: directory => { cleared.push(directory); saved.delete(directory) },
    openBrowser: async (...args) => { openedBrowser.push(args); return '/ws/login-desktop?session=opaque-session' },
    closeBrowser: async (...args) => { closedBrowser.push(args) },
    timeout, checkInterval: 5,
  })
  t.after(async () => { await store.close() })
  const start = (owner = 'alice') => store.start(owner, 'cloudflare', () => authorized.get(owner) === true)
  const status = (owner = 'alice') => store.status(owner, 'cloudflare')
  const waiting = () => until(async () => (await status()).status === 'needs_auth' && !!(await status()).streamUrl)
  return { store, start, status, waiting, saved, cleared, configs, versions, authorized, openedBrowser, closedBrowser,
    options: () => options!, checks: () => checks, closed: () => closed,
    publicServer: () => { oauth = false }, factoryWait: (value: Promise<void>) => { factoryWait = value },
  }
}

test('accounts share a single connection job and credentials without sharing the initiating login screen', async t => {
  const f = fixture(t, 5000, true)
  f.start(); await f.waiting()
  assert.equal(f.start('bob').status, 'needs_auth')
  assert.equal(f.start('bob').streamUrl, undefined)
  assert.equal(f.start('bob').ownsJob, false)
  assert.equal((await f.status()).ownsJob, true)
  assert.equal((await f.status('bob')).streamUrl, undefined)
  assert.ok((await f.status()).streamUrl)
  assert.equal(f.openedBrowser.length, 1)
  const callback = new URL(f.options().redirectUrl)
  callback.search = '?state=private-state&code=private-authorization-code'
  assert.equal((await fetch(callback)).status, 200)
  await until(async () => (await f.status('bob')).status === 'connected')
  assert.equal((await f.status()).status, 'connected')
  await f.store.disconnect('bob', 'cloudflare')
  assert.equal((await f.status()).status, 'disconnected')
  assert.deepEqual(f.cleared, ['alice'])
})

test('shared pending authorization is invalidated by its initiating account, not the observing account', async t => {
  const f = fixture(t, 5000, true)
  f.versions.set('bob', 2)
  f.start(); await f.waiting()
  assert.equal((await f.status('bob')).status, 'needs_auth')
  f.versions.set('alice', 3)
  assert.equal((await f.status('bob')).status, 'disconnected')
  assert.equal(f.saved.size, 0)
})

test('stdio checks close the child transport and keep fixture registries separate', async t => {
  const f = fixture(t); f.publicServer(); f.configs.set('alice', { command: 'fixture-private-command', args: ['fixture-private-arg'] })
  assert.equal((await f.status()).status, 'disconnected')
  assert.equal(f.start().status, 'connecting')
  await until(async () => (await f.status()).status === 'connected')
  assert.ok(f.closed() > 0)
  assert.equal((await f.status('bob')).status, 'disconnected')
  assert.deepEqual(f.openedBrowser, [])
  assert.equal(JSON.stringify(await f.status()).includes('private'), false)
})

test('OAuth callback is loopback-only, validates state and returns a safe stream URL', async t => {
  const f = fixture(t)
  f.start(); await f.waiting()
  const callback = new URL(f.options().redirectUrl)
  assert.equal(callback.hostname, '127.0.0.1')
  assert.match(callback.pathname, /^\/mcp\/callback\/[a-f\d-]+$/)
  const wrong = new URL(callback); wrong.search = '?state=wrong&code=private-authorization-code'
  assert.equal((await fetch(wrong)).status, 403)
  assert.equal(f.saved.size, 0)
  const state = await f.status()
  assert.equal(state.streamUrl, '/ws/login-desktop?session=opaque-session')
  assert.equal(JSON.stringify(state).includes('private'), false)
  assert.equal(JSON.stringify(state).includes('authorize'), false)
  callback.search = '?state=private-state&code=private-authorization-code'
  const response = await fetch(callback)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal((await response.text()).includes('private'), false)
  await until(async () => (await f.status()).status === 'connected')
  assert.equal(f.checks(), 2)
  assert.deepEqual([...f.saved], ['alice'])
  assert.equal(f.closedBrowser[0][0], 'alice')
})

test("separate registry fixtures cannot cancel, disconnect or view each other's pending connection", async t => {
  const f = fixture(t)
  f.start(); await f.waiting()
  assert.equal((await f.status('bob')).status, 'disconnected')
  assert.equal((await f.store.cancel('bob', 'cloudflare')).status, 'disconnected')
  await f.store.disconnect('bob', 'cloudflare')
  assert.deepEqual(f.cleared, ['bob'])
  assert.equal((await f.status()).status, 'needs_auth')
  assert.equal(f.closedBrowser.length, 0)
})

test('cancelling closes callback and browser without revoking previously stored credentials', async t => {
  const f = fixture(t)
  f.saved.add('alice')
  f.start(); await f.waiting()
  const callback = new URL(f.options().redirectUrl)
  callback.search = '?state=private-state&code=private-authorization-code'
  const result = await f.store.cancel('alice', 'cloudflare')
  assert.equal(result.status, 'connected')
  assert.equal(f.options().signal.aborted, true)
  assert.deepEqual(f.cleared, [])
  assert.equal(f.closedBrowser.length, 1)
  assert.ok(f.closed() > 0)
  await assert.rejects(fetch(callback))
  await delay(10)
  assert.deepEqual([...f.saved], ['alice'])
})

test('disconnect clears only the selected fixture registry and prevents a late callback', async t => {
  const f = fixture(t)
  f.saved.add('alice'); f.saved.add('bob')
  f.start(); await f.waiting()
  await f.store.disconnect('alice', 'cloudflare')
  assert.equal((await f.status()).status, 'disconnected')
  assert.deepEqual([...f.saved], ['bob'])
  assert.equal(f.options().signal.aborted, true)
  assert.equal(f.closedBrowser.length, 1)
})

test('changed connection identity invalidates pending authorization', async t => {
  const f = fixture(t)
  f.start(); await f.waiting()
  f.configs.set('alice', { ...f.configs.get('alice')!, url: 'https://different.example.test/mcp' })
  await until(async () => (await f.status()).status === 'disconnected')
  assert.equal(f.options().signal.aborted, true)
  assert.equal(f.saved.size, 0)
  assert.equal(f.closedBrowser.length, 1)
})

test('usage changes preserve pending approval and saved authentication', async t => {
  const f = fixture(t)
  f.start(); await f.waiting()
  f.configs.set('alice', { ...f.configs.get('alice')!, enabled: false })
  await delay(20)
  assert.equal((await f.status()).status, 'needs_auth')
  assert.equal(f.options().signal.aborted, false)
  const callback = new URL(f.options().redirectUrl)
  callback.search = '?state=private-state&code=private-authorization-code'
  assert.equal((await fetch(callback)).status, 200)
  await until(async () => (await f.status()).status === 'connected')
  assert.equal(f.saved.size, 1)
  assert.deepEqual(f.cleared, [])
})

test('logout, access revocation and account replacement cancel pending authorization', async t => {
  for (const revoke of ['logout', 'capability', 'account']) {
    const f = fixture(t)
    f.start(); await f.waiting()
    if (revoke === 'account') f.versions.set('alice', 2)
    else f.authorized.set('alice', false)
    if (revoke === 'capability') accessChanges.emit('change')
    await until(async () => (await f.status()).status === 'disconnected')
    assert.equal(f.saved.size, 0)
    assert.equal(f.options().signal.aborted, true)
    assert.equal(f.closedBrowser.length, 1)
  }
})

test('authorization denial and deadline expiry clean up and expose only safe errors', async t => {
  const f = fixture(t)
  f.start(); await f.waiting()
  const callback = new URL(f.options().redirectUrl)
  callback.search = '?state=private-state&error=access_denied&error_description=private-secret'
  assert.equal((await fetch(callback)).status, 400)
  await until(async () => (await f.status()).status === 'error')
  assert.equal(JSON.stringify(await f.status()).includes('private'), false)
  assert.equal(f.closedBrowser.length, 1)
  const expiring = fixture(t, 30)
  expiring.start(); await expiring.waiting()
  await until(async () => (await expiring.status()).status === 'error')
  assert.match((await expiring.status()).error!, /만료/)
  assert.equal(expiring.options().signal.aborted, true)
  assert.equal(expiring.closedBrowser.length, 1)
})

test('a connection factory completing after cancellation cannot leave a transport open', async t => {
  const f = fixture(t)
  let release!: () => void
  f.factoryWait(new Promise<void>(resolve => { release = resolve }))
  f.start()
  await until(() => !!f.options())
  await f.store.cancel('alice', 'cloudflare')
  assert.equal(f.closed(), 0)
  release()
  await until(() => f.closed() > 0)
  assert.equal(f.saved.size, 0)
  assert.equal((await f.status()).status, 'disconnected')
})

test('invalid names and missing access fail before a process or browser is started', async t => {
  const f = fixture(t)
  for (const name of [undefined, {}, [], '', '\u0000', 'x'.repeat(257)]) assert.throws(() => f.store.start('alice', name, () => true))
  assert.throws(() => f.store.start('', 'cloudflare', () => true))
  assert.throws(() => f.store.start('alice', 'cloudflare', () => false), /권한/)
  assert.equal(f.checks(), 0)
  assert.deepEqual(f.openedBrowser, [])
})

test('OAuth needing a browser reports the browser permission denial without waiting for a callback', async t => {
  const { upsertUser, removeUser } = await import('./auth.ts')
  const { setFeature } = await import('./access-policy.ts')
  const { browserLoginJobs } = await import('./browser-login-jobs.ts')
  const owner = 'mcp-browser-permission@test'
  upsertUser(owner, { role: 'owner', hash: '', mustChangePassword: false, createdAt: 1, passwordChangedAt: 0 })
  setFeature(owner, 'nativeBrowser', false)
  let authorize!: (url: URL) => Promise<void>, closed = 0
  const transport = { start: async () => {}, send: async () => {}, close: async () => { closed++ }, finishAuth: async () => { assert.fail('denied browsing cannot complete authorization') } }
  const store = new SharedMcpConnections({
    directory: () => 'browser-permission-fixture',
    config: () => ({ type: 'http', url: 'https://mcp.example.test/mcp' }),
    identity: sharedMcpConfigIdentity, accountVersion: () => 1,
    authStatus: () => ({ status: 'disconnected' }),
    remote: (_directory, _name, options) => { authorize = options.onAuthorization; return { transport, provider: { state: () => 'fixture-state' }, close: () => transport.close() } },
    probe: async () => { await authorize(new URL('https://identity.example.test/authorize?state=fixture-state')); throw new Error('authorization required') },
    closeBrowser: async () => {}, timeout: 5000,
  })
  t.after(async () => { await store.close(); setFeature(owner, 'nativeBrowser', null); removeUser(owner) })
  store.start(owner, 'cloud', () => true)
  await until(async () => (await store.status(owner, 'cloud')).status === 'error')
  const state = await store.status(owner, 'cloud')
  assert.match(state.error!, /브라우저.*권한/)
  assert.equal(state.streamUrl, undefined)
  assert.equal(browserLoginJobs(owner).length, 0, 'no browser login token is issued for denied access')
  assert.ok(closed > 0, 'the temporary authorization transport is cleaned up instead of waiting for a callback')
})

test('owners can prepare authentication while a server is off by default', async t => {
  const f = fixture(t)
  f.configs.set('alice', { command: 'fixture-only', enabled: false })
  f.publicServer()
  f.start()
  await until(async () => (await f.status()).status === 'connected')
  assert.equal(f.checks(), 1)
  assert.deepEqual(f.openedBrowser, [])
})

for (const revokeOnExchange of [false, true]) test(revokeOnExchange ? 'real SDK rejects credentials returned after logout during the token exchange' : 'real SDK completes PKCE authorization and reconnects with a fresh transport', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-mcp-connect-sdk-'))
  t.after(async () => { fs.rmSync(directory, { recursive: true, force: true }) })
  fs.writeFileSync(path.join(directory, 'servers.json'), JSON.stringify({ mcpServers: { fixture: { type: 'http', url: 'https://remote.example.test/mcp', oauth: { client_id: 'fixture-client' } } } }))
  const seed = createSharedMcpConnection(directory, 'fixture')
  await seed.provider.saveDiscoveryState?.({ authorizationServerUrl: 'https://auth.example.test',
    authorizationServerMetadata: { issuer: 'https://auth.example.test', authorization_endpoint: 'https://auth.example.test/authorize', token_endpoint: 'https://auth.example.test/token', response_types_supported: ['code'], code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: ['none'] },
    resourceMetadata: { resource: 'https://remote.example.test/mcp', authorization_servers: ['https://auth.example.test'], scopes_supported: ['mcp'] } })
  await seed.close()
  let redirect = '', authorization = '', exchanges = 0, transports = 0, authorized = true
  let jobSignal: AbortSignal | undefined
  const mockFetch: typeof fetch = async (input, init) => {
    const url = new URL(String(input))
    if (url.hostname === 'auth.example.test') {
      assert.equal(url.pathname, '/token')
      const params = new URLSearchParams(String(init?.body))
      assert.equal(params.get('code'), 'private-authorization-code')
      assert.equal(params.get('redirect_uri'), redirect)
      assert.ok(params.get('code_verifier')!.length >= 43)
      exchanges++
      if (revokeOnExchange) authorized = false
      return Response.json({ access_token: 'private-issued-token', refresh_token: 'private-refresh-token', token_type: 'Bearer', expires_in: 3600 })
    }
    if (new Headers(init?.headers).get('authorization') !== 'Bearer private-issued-token') return new Response('', { status: 401 })
    if (init?.method === 'GET') return new Response('', { status: 405 })
    const message = JSON.parse(String(init?.body))
    if (message.method === 'notifications/initialized') return new Response(null, { status: 202 })
    assert.equal(message.method, 'initialize')
    return Response.json({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: message.params.protocolVersion, capabilities: {}, serverInfo: { name: 'fixture', version: '1' } } })
  }
  const store = new SharedMcpConnections({ directory: () => directory, remote: (_directory, name, options) => { redirect = options.redirectUrl; jobSignal = options.signal; transports++; return createSharedMcpConnection(directory, name, { ...options, fetch: mockFetch }) },
    openBrowser: async (_owner, _job, url) => { authorization = url; return '/ws/login-desktop?session=fixture' }, closeBrowser: async () => {}, timeout: 5000 })
  t.after(async () => { await store.close() })
  store.start('alice', 'fixture', () => authorized)
  await until(async () => (await store.status('alice', 'fixture')).status === 'needs_auth' && !!authorization)
  const authUrl = new URL(authorization)
  assert.equal(authUrl.searchParams.get('code_challenge_method'), 'S256')
  const callback = new URL(redirect)
  callback.searchParams.set('state', authUrl.searchParams.get('state')!)
  callback.searchParams.set('code', 'private-authorization-code')
  assert.equal((await fetch(callback)).status, 200)
  if (revokeOnExchange) {
    await until(() => exchanges === 1 && jobSignal!.aborted)
    assert.notEqual(sharedMcpAuthStatus(directory, 'fixture').status, 'connected')
    const authRoot = path.join(directory, 'auth')
    const disk = fs.readdirSync(authRoot).flatMap(identity => {
      const directory = path.join(authRoot, identity)
      return fs.readdirSync(directory).filter(file => file.endsWith('.json')).map(file => fs.readFileSync(path.join(directory, file), 'utf8'))
    }).join('')
    assert.equal(disk.includes('private-issued-token'), false)
    assert.equal(transports, 1)
    return
  }
  await until(async () => (await store.status('alice', 'fixture')).status === 'connected')
  assert.equal(exchanges, 1)
  assert.equal(transports, 2)
  assert.equal(sharedMcpAuthStatus(directory, 'fixture').status, 'connected')
  assert.equal(JSON.stringify(await store.status('alice', 'fixture')).includes('private'), false)
})

test('real SDK probes a local JSON-RPC fixture and records readiness only after initialize', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-mcp-connect-stdio-'))
  t.after(async () => { fs.rmSync(directory, { recursive: true, force: true }) })
  const script = `import readline from 'node:readline';const input=readline.createInterface({input:process.stdin});input.on('line',line=>{const message=JSON.parse(line);if(message.method==='initialize')process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:message.id,result:{protocolVersion:message.params.protocolVersion,capabilities:{},serverInfo:{name:'fixture',version:'1'}}})+'\\n')});`
  fs.writeFileSync(path.join(directory, 'servers.json'), JSON.stringify({ mcpServers: { fixture: { command: process.execPath, args: ['--input-type=module', '-e', script] } } }))
  const store = new SharedMcpConnections({ directory: () => directory, closeBrowser: async () => {}, timeout: 5000 })
  t.after(async () => { await store.close() })
  assert.equal((await store.status('alice', 'fixture')).status, 'disconnected')
  store.start('alice', 'fixture', () => true)
  await until(async () => (await store.status('alice', 'fixture')).status === 'connected')
  assert.equal(sharedMcpAuthStatus(directory, 'fixture').status, 'connected')
})
