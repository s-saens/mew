import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { createSharedMcpConnection, clearSharedMcpAuth, markSharedMcpConnected, sharedMcpAuthStatus, SharedMcpLoginRequiredError } from './shared-mcp-oauth.ts'

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-mcp-auth-'))
  const config = { type: 'http', url: 'https://remote.example.test/mcp' }
  const write = (value = config) => fs.writeFileSync(path.join(directory, 'servers.json'), JSON.stringify({ mcpServers: { demo: value } }))
  write()
  return { directory, write, cleanup: () => fs.rmSync(directory, { recursive: true, force: true }) }
}
const initialize = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'fixture', version: '1' } } } as const
const discovery = { authorizationServerUrl: 'https://auth.example.test',
  authorizationServerMetadata: { issuer: 'https://auth.example.test', authorization_endpoint: 'https://auth.example.test/authorize', token_endpoint: 'https://auth.example.test/token', response_types_supported: ['code'], code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: ['none'] },
  resourceMetadata: { resource: 'https://remote.example.test/mcp', authorization_servers: ['https://auth.example.test'], scopes_supported: ['mcp'] } }
async function seed(directory: string) {
  const connection = createSharedMcpConnection(directory, 'demo')
  await connection.provider.saveClientInformation?.({ client_id: 'fixture-client', issuer: 'https://auth.example.test' })
  await connection.provider.saveTokens({ access_token: 'expired-fixture', refresh_token: 'refresh-original', token_type: 'Bearer', expires_in: 3600, issuer: 'https://auth.example.test' })
  await connection.provider.saveDiscoveryState?.(discovery)
  await connection.close()
}

test('OAuth credentials are private, identity scoped, and cannot be recreated after disconnect or config replacement', async () => {
  const f = fixture()
  try {
    assert.equal(sharedMcpAuthStatus(f.directory, 'demo').status, 'disconnected')
    await seed(f.directory)
    assert.equal(sharedMcpAuthStatus(f.directory, 'demo').status, 'connected')
    const root = path.join(f.directory, 'auth', fs.readdirSync(path.join(f.directory, 'auth'))[0])
    if (process.platform !== 'win32') {
      assert.equal(fs.statSync(root).mode & 0o777, 0o700)
      assert.equal(fs.statSync(path.join(root, 'credentials.json')).mode & 0o777, 0o600)
    }
    const revoked = createSharedMcpConnection(f.directory, 'demo')
    clearSharedMcpAuth(f.directory, 'demo')
    assert.equal(sharedMcpAuthStatus(f.directory, 'demo').status, 'disconnected')
    await assert.rejects(async () => revoked.provider.saveTokens({ access_token: 'late', token_type: 'Bearer' }), /changed/)
    await revoked.close()
    const replaced = createSharedMcpConnection(f.directory, 'demo')
    f.write({ type: 'http', url: 'https://other.example.test/mcp' })
    await assert.rejects(async () => replaced.provider.saveTokens({ access_token: 'late', token_type: 'Bearer' }), /changed/)
    assert.equal(sharedMcpAuthStatus(f.directory, 'demo').status, 'disconnected')
    await replaced.close()
    markSharedMcpConnected(f.directory, 'demo')
    assert.equal(sharedMcpAuthStatus(f.directory, 'demo').status, 'connected')
  } finally { f.cleanup() }
})

test('authentication requires an explicit job and preserves OAuth state and verifier without logging URLs', async () => {
  const f = fixture()
  try {
    const unattended = createSharedMcpConnection(f.directory, 'demo')
    await assert.rejects(async () => unattended.provider.clientInformation(), SharedMcpLoginRequiredError)
    assert.equal(sharedMcpAuthStatus(f.directory, 'demo').status, 'needs_auth')
    await unattended.close()
    let authorization: URL | undefined
    const interactive = createSharedMcpConnection(f.directory, 'demo', { redirectUrl: 'http://127.0.0.1:32123/callback', onAuthorization: async url => { authorization = url } })
    assert.equal(interactive.provider.redirectUrl, 'http://127.0.0.1:32123/callback')
    assert.equal(await interactive.provider.state?.(), await interactive.provider.state?.())
    await interactive.provider.saveCodeVerifier('private-pkce-fixture')
    assert.equal(await interactive.provider.codeVerifier(), 'private-pkce-fixture')
    await interactive.provider.redirectToAuthorization(new URL('https://auth.example.test/authorize?state=fixture'))
    assert.equal(authorization?.hostname, 'auth.example.test')
    assert.doesNotMatch(JSON.stringify(sharedMcpAuthStatus(f.directory, 'demo')), /private|state|authorize/)
    await interactive.close()
  } finally { f.cleanup() }
})

test('revoked account authorization prevents in-flight credential persistence immediately', async () => {
  const f = fixture()
  try {
    let authorized = true
    const connection = createSharedMcpConnection(f.directory, 'demo', { isAuthorized: () => authorized })
    authorized = false
    await assert.rejects(async () => connection.provider.saveTokens({ access_token: 'late-private-value', token_type: 'Bearer' }), /revoked/)
    assert.equal(sharedMcpAuthStatus(f.directory, 'demo').status, 'disconnected')
    await connection.close()
  } finally { f.cleanup() }
})

test('an unattended authentication attempt cannot replace a pending interactive PKCE verifier', async () => {
  const f = fixture()
  try {
    const interactive = createSharedMcpConnection(f.directory, 'demo', { redirectUrl: 'http://127.0.0.1:32123/callback', onAuthorization: async () => {} })
    await interactive.provider.saveClientInformation?.({ client_id: 'pending-client', issuer: 'https://auth.example.test', redirect_uris: ['http://127.0.0.1:32123/callback'] })
    await interactive.provider.saveDiscoveryState?.(discovery)
    await interactive.provider.saveCodeVerifier('pending-private-pkce-fixture')
    const background = createSharedMcpConnection(f.directory, 'demo', { fetch: async () => new Response('', { status: 401 }) })
    await background.transport.start()
    await assert.rejects(background.transport.send(initialize), SharedMcpLoginRequiredError)
    assert.equal(await interactive.provider.codeVerifier(), 'pending-private-pkce-fixture')
    const root = path.join(f.directory, 'auth', fs.readdirSync(path.join(f.directory, 'auth'))[0])
    assert.doesNotMatch(fs.readdirSync(root).filter(file => file.endsWith('.json')).map(file => fs.readFileSync(path.join(root, file), 'utf8')).join(), /pending-private-pkce-fixture/)
    await interactive.provider.invalidateCredentials?.('verifier')
    await assert.rejects(async () => interactive.provider.codeVerifier(), /expired/)
    await Promise.all([interactive.close(), background.close()])
  } finally { f.cleanup() }
})

test('concurrent aliases retain their own interactive client registration and PKCE verifier', async () => {
  const f = fixture()
  try {
    const first = createSharedMcpConnection(f.directory, 'demo', { redirectUrl: 'http://127.0.0.1:32123/callback', onAuthorization: async () => {} })
    await first.provider.saveClientInformation?.({ client_id: 'first-client' })
    await first.provider.saveCodeVerifier('first-verifier')
    const second = createSharedMcpConnection(f.directory, 'demo', { redirectUrl: 'http://127.0.0.1:32124/callback', onAuthorization: async () => {} })
    await second.provider.saveClientInformation?.({ client_id: 'second-client' })
    await second.provider.saveCodeVerifier('second-verifier')
    assert.equal((await first.provider.clientInformation())?.client_id, 'first-client')
    assert.equal(await first.provider.codeVerifier(), 'first-verifier')
    assert.equal((await second.provider.clientInformation())?.client_id, 'second-client')
    assert.equal(await second.provider.codeVerifier(), 'second-verifier')
    await first.provider.saveTokens({ access_token: 'first-access', token_type: 'Bearer' })
    const background = createSharedMcpConnection(f.directory, 'demo')
    assert.equal((await background.provider.clientInformation())?.client_id, 'first-client')
    assert.equal(background.provider.redirectUrl, 'http://127.0.0.1:32123/callback')
    await second.provider.saveClientInformation?.({ client_id: 'second-client' })
    assert.equal((await background.provider.clientInformation())?.client_id, 'first-client')
    await second.provider.saveTokens({ access_token: 'second-access', token_type: 'Bearer' })
    assert.equal((await background.provider.clientInformation())?.client_id, 'second-client')
    await background.close()
    await Promise.all([first.close(), second.close()])
  } finally { f.cleanup() }
})

test('reauthorization registers a client for its new callback while ordinary connections retain shared credentials', async () => {
  const f = fixture()
  try {
    const first = createSharedMcpConnection(f.directory, 'demo', { redirectUrl: 'http://127.0.0.1:32123/callback', onAuthorization: async () => {} })
    await first.provider.saveClientInformation?.({ client_id: 'old-client', redirect_uris: ['http://127.0.0.1:32123/callback'] })
    await first.provider.saveTokens({ access_token: 'old-access', token_type: 'Bearer' })
    await first.close()
    const ordinary = createSharedMcpConnection(f.directory, 'demo')
    assert.equal((await ordinary.provider.clientInformation())?.client_id, 'old-client')
    await ordinary.close()
    const next = createSharedMcpConnection(f.directory, 'demo', { redirectUrl: 'http://127.0.0.1:32124/callback', onAuthorization: async () => {} })
    assert.equal((await next.provider.tokens())?.access_token, 'old-access')
    assert.equal(await next.provider.clientInformation(), undefined)
    assert.equal(await next.provider.tokens(), undefined)
    await next.close()
    const preserved = createSharedMcpConnection(f.directory, 'demo')
    assert.equal((await preserved.provider.clientInformation())?.client_id, 'old-client')
    assert.equal((await preserved.provider.tokens())?.access_token, 'old-access')
    await preserved.close()
  } finally { f.cleanup() }
})

test('switching OAuth clients never attaches an old client refresh token to the new grant', async () => {
  const f = fixture()
  try {
    await seed(f.directory)
    const interactive = createSharedMcpConnection(f.directory, 'demo', { redirectUrl: 'http://127.0.0.1:32123/callback', onAuthorization: async () => {} })
    await interactive.provider.saveClientInformation?.({ client_id: 'different-client' })
    assert.equal(await interactive.provider.tokens(), undefined)
    await interactive.provider.invalidateCredentials?.('all')
    const preserved = createSharedMcpConnection(f.directory, 'demo')
    assert.equal((await preserved.provider.clientInformation())?.client_id, 'fixture-client')
    assert.equal((await preserved.provider.tokens())?.access_token, 'expired-fixture')
    await preserved.close()
    await interactive.provider.saveClientInformation?.({ client_id: 'different-client' })
    await interactive.provider.saveTokens({ access_token: 'different-client-access', token_type: 'Bearer' })
    assert.equal((await interactive.provider.tokens())?.refresh_token, undefined)
    await interactive.close()
  } finally { f.cleanup() }
})

test('parallel connections refresh a rotating token once and never send MCP headers to OAuth endpoints', async () => {
  const f = fixture()
  try {
    f.write({ type: 'http', url: 'https://remote.example.test/mcp', headers: { 'X-Private-Fixture': 'header-secret' } } as never)
    await seed(f.directory)
    let refreshes = 0
    const mockFetch: typeof fetch = async (input, init) => {
      const url = new URL(String(input)), headers = new Headers(init?.headers)
      if (url.hostname === 'auth.example.test') {
        assert.equal(headers.has('X-Private-Fixture'), false)
        assert.equal(new URLSearchParams(String(init?.body)).get('refresh_token'), 'refresh-original')
        refreshes++
        await delay(60)
        return Response.json({ access_token: 'access-rotated', refresh_token: 'refresh-rotated', token_type: 'Bearer', expires_in: 3600 })
      }
      assert.equal(headers.get('X-Private-Fixture'), 'header-secret')
      if (headers.get('authorization') !== 'Bearer access-rotated') return new Response('', { status: 401 })
      return Response.json({ jsonrpc: '2.0', id: 1, result: { protocolVersion: '2025-11-25', capabilities: {}, serverInfo: { name: 'fixture', version: '1' } } })
    }
    const first = createSharedMcpConnection(f.directory, 'demo', { fetch: mockFetch })
    const second = createSharedMcpConnection(f.directory, 'demo', { fetch: mockFetch })
    await Promise.all([first.transport.start(), second.transport.start()])
    await Promise.all([first.transport.send(initialize), second.transport.send(initialize)])
    assert.equal(refreshes, 1)
    assert.equal((await first.provider.tokens())?.refresh_token, 'refresh-rotated')
    assert.equal(sharedMcpAuthStatus(f.directory, 'demo').status, 'connected')
    await Promise.all([first.close(), second.close()])
  } finally { f.cleanup() }
})

test('refresh responses without a replacement refresh token retain the shared refresh credential', async () => {
  const f = fixture()
  try {
    await seed(f.directory)
    const connection = createSharedMcpConnection(f.directory, 'demo', { fetch: async (input, init) => {
      if (new URL(String(input)).hostname === 'auth.example.test') return Response.json({ access_token: 'access-renewed', token_type: 'Bearer', expires_in: 3600 })
      if (new Headers(init?.headers).get('authorization') !== 'Bearer access-renewed') return new Response('', { status: 401 })
      return Response.json({ jsonrpc: '2.0', id: 1, result: {} })
    } })
    await connection.transport.start()
    await connection.transport.send(initialize)
    assert.equal((await connection.provider.tokens())?.refresh_token, 'refresh-original')
    await connection.close()
  } finally { f.cleanup() }
})

test('metadata publication cannot restore a token pair superseded by another runtime process', async () => {
  const f = fixture(), rename = fs.renameSync
  try {
    await seed(f.directory)
    const connection = createSharedMcpConnection(f.directory, 'demo')
    const module = new URL('./shared-mcp-oauth.ts', import.meta.url).href
    const script = `import {createSharedMcpConnection} from ${JSON.stringify(module)};const connection=createSharedMcpConnection(process.argv[1],'demo');await connection.provider.saveTokens({access_token:'new-access-fixture',refresh_token:'new-refresh-fixture',token_type:'Bearer',issuer:'https://auth.example.test'});await connection.close()`
    let publicationPaused = false
    fs.renameSync = (...args) => {
      if (!publicationPaused) {
        publicationPaused = true
        const child = spawnSync(process.execPath, ['--input-type=module', '-e', script, f.directory], { encoding: 'utf8', timeout: 5000 })
        assert.equal(child.status, 0, child.stderr)
      }
      return rename(...args)
    }
    // Pause the metadata writer immediately before publication; another process rotates the pair.
    await connection.provider.saveDiscoveryState?.({ ...discovery, resourceMetadataUrl: 'https://remote.example.test/metadata' })
    fs.renameSync = rename
    assert.equal(publicationPaused, true)
    assert.equal((await connection.provider.tokens())?.refresh_token, 'new-refresh-fixture')
    assert.equal((await connection.provider.discoveryState?.())?.resourceMetadataUrl, 'https://remote.example.test/metadata')
    await connection.close()
  } finally { fs.renameSync = rename; f.cleanup() }
})

test('changing an effective environment credential isolates OAuth state without exposing its value', async () => {
  const f = fixture(), previous = process.env.MEW_MCP_AUTH_FIXTURE
  try {
    process.env.MEW_MCP_AUTH_FIXTURE = 'first-private-value'
    f.write({ type: 'http', url: 'https://remote.example.test/mcp', headers: { Authorization: 'Bearer ${MEW_MCP_AUTH_FIXTURE}' } } as never)
    await seed(f.directory)
    const first = createSharedMcpConnection(f.directory, 'demo')
    process.env.MEW_MCP_AUTH_FIXTURE = 'second-private-value'
    assert.equal(sharedMcpAuthStatus(f.directory, 'demo').status, 'disconnected')
    await assert.rejects(async () => first.provider.saveTokens({ access_token: 'late', token_type: 'Bearer' }), /changed/)
    const next = createSharedMcpConnection(f.directory, 'demo')
    assert.equal(await next.provider.tokens(), undefined)
    assert.doesNotMatch(fs.readdirSync(path.join(f.directory, 'auth')).join(), /private-value/)
    await Promise.all([first.close(), next.close()])
  } finally { if (previous === undefined) delete process.env.MEW_MCP_AUTH_FIXTURE; else process.env.MEW_MCP_AUTH_FIXTURE = previous; f.cleanup() }
})

test('independent runtime processes share a refresh lock rather than replaying a rotated refresh token', { timeout: 15_000 }, async () => {
  const f = fixture()
  try {
    await seed(f.directory)
    const module = new URL('./shared-mcp-oauth.ts', import.meta.url).href
    const script = `import fs from 'node:fs';import path from 'node:path';import {setTimeout as delay} from 'node:timers/promises';import {createSharedMcpConnection} from ${JSON.stringify(module)};
const directory=process.argv[1],id=process.argv[2];
const connection=createSharedMcpConnection(directory,'demo',{fetch:async(input,init)=>{
 const url=new URL(String(input));
 if(url.hostname==='auth.example.test'){fs.appendFileSync(path.join(directory,'refresh-count'),'refresh\\n');await delay(100);return Response.json({access_token:'cross-process-access',refresh_token:'cross-process-refresh',token_type:'Bearer',expires_in:3600})}
 if(new Headers(init?.headers).get('authorization')!=='Bearer cross-process-access')return new Response('',{status:401});
 return Response.json({jsonrpc:'2.0',id:1,result:{}})
}});
await connection.transport.start();fs.writeFileSync(path.join(directory,'ready-'+id),'');
while(!fs.existsSync(path.join(directory,'go')))await delay(10);
await connection.transport.send(${JSON.stringify(initialize)});await connection.close();`
    const children = ['a', 'b'].map(id => spawn(process.execPath, ['--input-type=module', '-e', script, f.directory, id], { stdio: ['ignore', 'pipe', 'pipe'] }))
    const results = children.map(child => new Promise<void>((resolve, reject) => {
      let errors = ''; child.stderr.on('data', data => { errors += data })
      child.on('error', reject); child.on('close', code => code ? reject(new Error(errors || 'Fixture process failed')) : resolve())
    }))
    try {
      const deadline = Date.now() + 5000
      while (!['a', 'b'].every(id => fs.existsSync(path.join(f.directory, 'ready-' + id)))) {
        if (Date.now() > deadline) throw new Error('Fixture processes did not initialize')
        await delay(10)
      }
      fs.writeFileSync(path.join(f.directory, 'go'), '')
      await Promise.all(results)
      assert.equal(fs.readFileSync(path.join(f.directory, 'refresh-count'), 'utf8'), 'refresh\n')
    } finally { for (const child of children) if (child.exitCode === null) child.kill() }
  } finally { f.cleanup() }
})

test('credential storage refuses symbolic links', async () => {
  const f = fixture(), outside = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-mcp-outside-'))
  try {
    fs.symlinkSync(outside, path.join(f.directory, 'auth'), 'dir')
    assert.throws(() => createSharedMcpConnection(f.directory, 'demo'), /storage/)
    assert.deepEqual(fs.readdirSync(outside), [])
  } finally { f.cleanup(); fs.rmSync(outside, { recursive: true, force: true }) }
})
