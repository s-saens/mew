import './test-isolated-data.ts'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import http from 'node:http'
import net from 'node:net'
import test from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import express from 'express'
import { setFeature } from './access-policy.ts'
import type { RequestAuth } from './reqAuth.ts'
import { createDomBrowserPortsRouter, discoverDomBrowserPorts, domBrowserPortParsers } from './dom-browser-ports.ts'

const tcpHeader = '  sl local_address rem_address st tx_queue rx_queue tr tm->when retrnsmt uid timeout inode\n'
const tcp6Header = tcpHeader.replace('rem_address', 'remote_address')
const tcpRow = (address: string, port: string, inode: string, state = '0A') => `  0: ${address}:${port} 00000000:0000 ${state} 00000000:00000000 00:00000000 00000000 1000 0 ${inode} 1\n`

test('global Linux discovery merges both families, sorts unique ports and excludes non-local/non-listening sockets', async () => {
  const files: string[] = []
  const ports = await discoverDomBrowserPorts({ platform: 'linux', readText: async file => {
    files.push(file)
    return file.endsWith('tcp6')
      ? tcp6Header + tcpRow('00000000000000000000000001000000', '0BB8', '11') + tcpRow('00000000000000000000000000000000', '0D05', '12')
      : tcpHeader + tcpRow('0100007F', '1388', '21') + tcpRow('00000000', '0D05', '22') + tcpRow('0201A8C0', '1F90', '23') + tcpRow('0100007F', '1F91', '24', '01')
  } })
  assert.deepEqual(files.sort(), ['/proc/net/tcp', '/proc/net/tcp6'])
  assert.deepEqual(ports, [3000, 3333, 5000])
})

test('Linux discovery accepts a valid empty table or unavailable IPv6 but rejects unreadable and invalid tables', async () => {
  assert.deepEqual(await discoverDomBrowserPorts({ platform: 'linux', readText: async () => tcpHeader }), [])
  assert.deepEqual(await discoverDomBrowserPorts({ platform: 'linux', readText: async file => {
    if (file.endsWith('tcp6')) throw Object.assign(new Error('IPv6 disabled'), { code: 'ENOENT' })
    return tcpHeader + tcpRow('0100007F', '0BB8', '1')
  } }), [3000])
  for (const code of ['ENOENT', 'EACCES']) {
    await assert.rejects(discoverDomBrowserPorts({ platform: 'linux', readText: async () => { throw Object.assign(new Error('cannot read'), { code }) } }))
  }
  for (const output of ['', 'malformed socket table']) {
    await assert.rejects(discoverDomBrowserPorts({ platform: 'linux', readText: async () => output }), /Invalid local socket table/)
  }
})

test('global macOS discovery runs only read-only lsof and parses all local listener owners', async () => {
  const ports = await discoverDomBrowserPorts({ platform: 'darwin', run: async (command, args, signal) => {
    assert.equal(command, '/usr/sbin/lsof')
    assert.deepEqual(args, ['-nP', '-iTCP', '-sTCP:LISTEN', '-Fpn'])
    assert.equal(signal.aborted, false)
    return ['p101', 'n127.0.0.1:5000', 'n*:3333', 'p999', 'n[::1]:3000', 'n[::]:3333', 'n192.168.0.1:8080', 'n127.0.0.1:65536'].join('\n')
  } })
  assert.deepEqual(ports, [3000, 3333, 5000])
  assert.deepEqual(await discoverDomBrowserPorts({ platform: 'darwin', run: async () => '' }), [])
  await assert.rejects(discoverDomBrowserPorts({ platform: 'darwin', run: async () => 'unexpected tool output' }), /Invalid local socket listing/)
  await assert.rejects(discoverDomBrowserPorts({ platform: 'darwin', run: async () => { throw new Error('lsof missing') } }), /lsof missing/)
})

test('global Windows discovery uses the shared encoded PowerShell helper and validates its listener JSON', async () => {
  const ports = await discoverDomBrowserPorts({ platform: 'win32', run: async (command, args) => {
    assert.ok(command.endsWith('powershell.exe'))
    assert.ok(args.includes('-NonInteractive'))
    const script = Buffer.from(args.at(-1)!, 'base64').toString('utf16le')
    assert.match(script, /Get-NetTCPConnection -State Listen -ErrorAction Stop/)
    assert.doesNotMatch(script, /Get-CimInstance|Invoke-WebRequest|Test-NetConnection/)
    return '\uFEFF' + JSON.stringify({ listeners: [
      { OwningProcess: 101, LocalAddress: '127.0.0.1', LocalPort: 5000 },
      { OwningProcess: 102, LocalAddress: '::', LocalPort: 3333 },
      { OwningProcess: 103, LocalAddress: '::1', LocalPort: 3000 },
      { OwningProcess: 104, LocalAddress: '0.0.0.0', LocalPort: 3333 },
      { OwningProcess: 101, LocalAddress: '10.1.2.3', LocalPort: 8080 },
      { OwningProcess: 101, LocalAddress: '127.0.0.1', LocalPort: 65536 },
    ] })
  } })
  assert.deepEqual(ports, [3000, 3333, 5000])
  assert.deepEqual(domBrowserPortParsers.windowsPorts('{"listeners":[]}'), [])
  for (const output of ['', '{', 'null', '[]', '{}', '{"listeners":null}']) {
    await assert.rejects(discoverDomBrowserPorts({ platform: 'win32', run: async () => output }))
  }
})

test('discovery times out, respects cancellation, and rejects unsupported hosts', async () => {
  let observed: AbortSignal | undefined
  await assert.rejects(discoverDomBrowserPorts({ platform: 'darwin', timeoutMs: 10, run: async (_command, _args, signal) => {
    observed = signal
    return new Promise<string>(() => {})
  } }), /cancelled/)
  assert.equal(observed?.aborted, true)
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(discoverDomBrowserPorts({ platform: 'linux', signal: controller.signal, readText: async () => tcpHeader }), /cancelled/)
  await assert.rejects(discoverDomBrowserPorts({ platform: 'freebsd' }), /unavailable/)
})

test('port API requires current authenticated preview access and marks only actual Mew listeners', async t => {
  const email = 'dom-browser-ports-api@example.test'
  let auth: RequestAuth = { role: 'owner', email, mustChangePassword: false }
  let calls = 0
  let scan: (signal: AbortSignal) => Promise<number[]> = async () => [5000, 3333, 3000, 3333, 4999, 0, 65536, NaN]
  const app = express()
  app.use((req, _res, next) => { req.auth = auth; next() })
  app.use('/api/dom-browser', createDomBrowserPortsRouter({
    mewPorts: () => new Set([5000, 7000]),
    blockedPorts: () => new Set([4999, 5000, 8000]),
    scan: signal => { calls++; return scan(signal) },
    titles: async ports => ports,
    timeoutMs: 15,
  }))
  const server = http.createServer(app)
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  t.after(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()) }))
  const address = server.address(); assert.ok(address && typeof address !== 'string')
  const get = () => fetch(`http://127.0.0.1:${address.port}/api/dom-browser/ports`)
  let response = await get()
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await response.json(), { ports: [
    { port: 3000, kind: 'app' }, { port: 3333, kind: 'app' }, { port: 4999, kind: 'blocked' }, { port: 5000, kind: 'mew' },
  ] })
  for (const denied of [
    { role: 'guest', email: null, mustChangePassword: false },
    { role: 'owner', email: null, mustChangePassword: false },
    { role: 'owner', email, mustChangePassword: true },
  ] satisfies RequestAuth[]) {
    auth = denied
    const before = calls
    assert.equal((await get()).status, 403)
    assert.equal(calls, before, 'rejected callers never inspect host ports')
  }
  auth = { role: 'manager', email, mustChangePassword: false }
  setFeature(email, 'portPreview', false)
  const before = calls
  assert.equal((await get()).status, 403)
  assert.equal(calls, before)
  setFeature(email, 'portPreview', null)
  response = await get()
  assert.equal(response.status, 200)
  scan = async () => { setFeature(email, 'portPreview', false); return [3000] }
  assert.equal((await get()).status, 403, 'revoked access cannot receive an in-flight scan')
  setFeature(email, 'portPreview', null)
  scan = async () => { throw new Error('private OS diagnostic') }
  response = await get()
  assert.equal(response.status, 503)
  assert.deepEqual(await response.json(), { error: '열린 포트를 불러오지 못했습니다. 다시 시도해 주세요.', code: 'dom-browser-ports-unavailable' })
  scan = async () => new Promise<number[]>(() => {})
  assert.equal((await get()).status, 503, 'a hanging scan remains recoverable')
  scan = async () => []
  response = await get()
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { ports: [] }, 'only a successful scan can report no listeners')
})

test('port API enriches app titles, rechecks live port policy and denies access revoked during title lookup', async t => {
  const owner: RequestAuth = { role: 'owner', email: 'port-titles-api@example.test', mustChangePassword: false }
  const auth = owner
  let mode: 'normal' | 'mew' | 'revoked' = 'normal'
  const mew = new Set([5000])
  const app = express()
  app.use((req, _res, next) => { req.auth = auth; next() })
  app.use('/api/dom-browser', createDomBrowserPortsRouter({
    mewPorts: () => mew,
    blockedPorts: () => new Set([4999]),
    scan: async () => [3000, 4999, 5000],
    titles: async (ports, options) => {
      assert.equal(options.signal?.aborted, false)
      assert.equal(options.allowedPort(3000), true)
      assert.equal(options.allowedPort(4999), false)
      assert.equal(options.allowedPort(5000), false)
      if (mode === 'mew') mew.add(3000)
      if (mode === 'revoked') auth.mustChangePassword = true
      if (mode !== 'normal') assert.equal(options.allowedPort(3000), false)
      return ports.map(entry => entry.kind === 'app' ? { ...entry, title: 'Along & Workspace' } : entry)
    },
  }))
  const server = http.createServer(app)
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  t.after(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()) }))
  const address = server.address(); assert.ok(address && typeof address !== 'string')
  const get = () => fetch(`http://127.0.0.1:${address.port}/api/dom-browser/ports`)
  assert.deepEqual(await (await get()).json(), { ports: [
    { port: 3000, kind: 'app', title: 'Along & Workspace' }, { port: 4999, kind: 'blocked' }, { port: 5000, kind: 'mew' },
  ] })
  mode = 'mew'
  assert.deepEqual(await (await get()).json(), { ports: [
    { port: 3000, kind: 'mew' }, { port: 4999, kind: 'blocked' }, { port: 5000, kind: 'mew' },
  ] })
  mew.delete(3000); mode = 'revoked'
  assert.equal((await get()).status, 403)
})

test('host discovery detects an unrelated live fixture and removes its closed listener', { skip: process.platform !== 'linux', timeout: 15_000 }, async t => {
  const fixture = net.createServer()
  fixture.listen(0, '127.0.0.1'); await once(fixture, 'listening')
  t.after(() => { if (fixture.listening) fixture.close() })
  const address = fixture.address(); assert.ok(address && typeof address !== 'string')
  assert.ok((await discoverDomBrowserPorts()).includes(address.port), 'all host listeners are detected without any command pane')
  await new Promise<void>(resolve => fixture.close(() => resolve()))
  let visible = true
  for (let attempt = 0; attempt < 20 && visible; attempt++) {
    visible = (await discoverDomBrowserPorts()).includes(address.port)
    if (visible) await delay(25)
  }
  assert.equal(visible, false, 'closed ports disappear when the kernel removes their LISTEN rows')
})
