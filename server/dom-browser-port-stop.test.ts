import assert from 'node:assert/strict'
import { once } from 'node:events'
import net from 'node:net'
import test from 'node:test'
import { closeDomBrowserPort, discoverDomBrowserPortOwners, DomBrowserPortCloseError } from './dom-browser-port-stop.ts'
import type { DomBrowserPortCloseOptions, DomBrowserPortOwnerSnapshot } from './dom-browser-port-stop.ts'

const tcpHeader = '  sl local_address rem_address st tx_queue rx_queue tr tm->when retrnsmt uid timeout inode\n'
const tcpRow = (address: string, port: string, inode: string) => `  0: ${address}:${port} 00000000:0000 0A 00000000:00000000 00:00000000 00000000 1000 0 ${inode} 1\n`
const stat = (pid: number, parent: number) => `${pid} (node) S ${parent} ${Array(17).fill('0').join(' ')} ${pid}00`
const ownerSnapshot = (owners = [101]): DomBrowserPortOwnerSnapshot => ({
  listening: owners.length > 0,
  owners: new Set(owners),
  protectedPids: new Set(),
  parents: new Map([[9, 8], [8, 1], ...owners.map(pid => [pid, 1] as const)]),
  identities: new Map(owners.map(pid => [pid, `${pid}00`])),
})
const options = (overrides: Partial<DomBrowserPortCloseOptions> = {}): DomBrowserPortCloseOptions => ({
  allowed: () => true,
  protectedPorts: () => new Set([5000]),
  selfPid: 9,
  snapshot: async () => ownerSnapshot(),
  signalProcess: () => { assert.fail('Unexpected process signal') },
  waitMs: 0,
  ...overrides,
})
const code = (value: string) => (error: unknown) => error instanceof DomBrowserPortCloseError && error.code === value

test('close resolves all current owners, sends SIGTERM only, and confirms listener removal', async () => {
  const signaled: Array<[number, string]> = []
  const live = new Set([101, 102])
  assert.deepEqual(await closeDomBrowserPort(5600, options({
    snapshot: async (port, protectedPorts, signal) => {
      assert.equal(port, 5600)
      assert.deepEqual([...protectedPorts], [5000])
      assert.equal(signal.aborted, false)
      return ownerSnapshot([...live])
    },
    signalProcess: (pid, signal) => { signaled.push([pid, signal]); live.delete(pid) },
  })), { port: 5600, closed: true })
  assert.deepEqual(signaled, [[101, 'SIGTERM'], [102, 'SIGTERM']])
})

test('closing an already absent listener succeeds without signaling', async () => {
  assert.deepEqual(await closeDomBrowserPort(5600, options({ snapshot: async () => ownerSnapshot([]) })), { port: 5600, closed: true })
})

test('invalid ports, denied permission, and protected ports never inspect socket owners', async () => {
  const noScan = async () => { assert.fail('Rejected requests must not inspect host processes'); return ownerSnapshot() }
  for (const port of [0, -1, 65536, NaN, 3.5]) await assert.rejects(closeDomBrowserPort(port, options({ snapshot: noScan })), code('dom-browser-port-invalid'))
  await assert.rejects(closeDomBrowserPort(5600, options({ snapshot: noScan, allowed: () => false })), code('dom-browser-port-close-forbidden'))
  await assert.rejects(closeDomBrowserPort(5000, options({ snapshot: noScan })), code('dom-browser-port-protected'))
})

test('PID 1, Mew itself, its ancestors, and every owner of a protected port are rejected', async () => {
  for (const pid of [1, 9, 8, 101]) {
    const value = ownerSnapshot([101, pid])
    value.parents.set(9, 8); value.parents.set(8, 1)
    if (pid === 101) value.protectedPids.add(pid)
    await assert.rejects(closeDomBrowserPort(5600, options({ snapshot: async () => value })), code('dom-browser-port-protected'))
  }
})

test('unknown owners, process identities, and incomplete or cyclic Mew ancestry fail closed', async () => {
  const unknown = ownerSnapshot([]); unknown.listening = true
  const noIdentity = ownerSnapshot(); noIdentity.identities.clear()
  const noParent = ownerSnapshot(); noParent.parents.delete(8)
  const cyclic = ownerSnapshot(); cyclic.parents.set(8, 9)
  for (const value of [unknown, noIdentity, noParent, cyclic]) await assert.rejects(closeDomBrowserPort(5600, options({ snapshot: async () => value })), code('dom-browser-port-owners-unavailable'))
})

test('access and port protection are rechecked after discovery, before signals', async () => {
  let allowed = true
  await assert.rejects(closeDomBrowserPort(5600, options({
    allowed: () => allowed,
    snapshot: async () => { allowed = false; return ownerSnapshot() },
  })), code('dom-browser-port-close-forbidden'))
  const protectedPorts = new Set([5000])
  await assert.rejects(closeDomBrowserPort(5600, options({
    protectedPorts: () => protectedPorts,
    snapshot: async () => { protectedPorts.add(5600); return ownerSnapshot() },
  })), code('dom-browser-port-protected'))
})

test('fresh ownership rejects PID replacement and newly protected processes without sending a signal', async () => {
  for (const mode of ['new-pid', 'reused-pid', 'protected']) {
    let scans = 0
    await assert.rejects(closeDomBrowserPort(5600, options({ snapshot: async () => {
      const value = ownerSnapshot(mode === 'new-pid' && scans ? [102] : [101])
      if (scans++ && mode === 'reused-pid') value.identities.set(101, 'new-process')
      if (scans > 1 && mode === 'protected') value.protectedPids.add(101)
      return value
    } })), code(mode === 'protected' ? 'dom-browser-port-protected' : 'dom-browser-port-owners-unavailable'))
  }
})

test('signal errors are sanitized, ESRCH is tolerated, and a remaining port never triggers forced kill', async () => {
  await assert.rejects(closeDomBrowserPort(5600, options({ signalProcess: () => { throw Object.assign(new Error('private diagnostic'), { code: 'EPERM' }) } })), code('dom-browser-port-close-failed'))
  let scans = 0, calls = 0
  const result = await closeDomBrowserPort(5600, options({
    snapshot: async () => ownerSnapshot(scans++ < 2 ? [101] : []),
    signalProcess: () => { throw Object.assign(new Error('gone'), { code: 'ESRCH' }) },
  }))
  assert.deepEqual(result, { port: 5600, closed: true })
  await assert.rejects(closeDomBrowserPort(5600, options({ signalProcess: (_pid, signal) => { calls++; assert.equal(signal, 'SIGTERM') } })), code('dom-browser-port-still-open'))
  assert.equal(calls, 1)
})

test('cancellation and deadlines prevent late snapshots from signaling processes', async () => {
  const cancellation = new AbortController()
  cancellation.abort()
  await assert.rejects(closeDomBrowserPort(5600, options({ signal: cancellation.signal })), code('dom-browser-port-close-unavailable'))
  let resolve: (value: DomBrowserPortOwnerSnapshot) => void = () => {}
  let signal: AbortSignal | undefined
  await assert.rejects(closeDomBrowserPort(5600, options({ timeoutMs: 10, snapshot: async (_port, _protected, observed) => {
    signal = observed
    return new Promise<DomBrowserPortOwnerSnapshot>(done => { resolve = done })
  } })), code('dom-browser-port-close-unavailable'))
  assert.equal(signal?.aborted, true)
  resolve(ownerSnapshot())
  await new Promise<void>(done => setImmediate(done))
})

test('Linux owner discovery joins sockets to every process and protects non-loopback reserved listeners', async () => {
  const value = await discoverDomBrowserPortOwners(5600, new Set([5000]), new AbortController().signal, {
    platform: 'linux',
    readText: async file => file.endsWith('/stat') ? stat(Number(file.split('/')[2]), 1)
      : file.endsWith('tcp6') ? tcpHeader : tcpHeader + tcpRow('0100007F', '15E0', '100') + tcpRow('0201A8C0', '1388', '200'),
    directoryNames: async directory => directory === '/proc' ? ['101', '102'] : ['0', '1'],
    readLink: async file => file.endsWith('/1') ? 'socket:[200]' : 'socket:[100]',
  })
  assert.equal(value.listening, true)
  assert.deepEqual([...value.owners].sort(), [101, 102])
  assert.deepEqual([...value.protectedPids].sort(), [101, 102])
  assert.equal(value.identities.get(101), '10100')
})

test('Linux owner discovery refuses unresolved socket owners and descriptor limit exhaustion', async () => {
  const base = {
    platform: 'linux' as const,
    readText: async (file: string) => file.endsWith('/stat') ? stat(101, 1) : tcpHeader + tcpRow('0100007F', '15E0', '100'),
    directoryNames: async (directory: string) => directory === '/proc' ? ['101'] : ['0'],
    readLink: async () => 'socket:[999]',
  }
  await assert.rejects(discoverDomBrowserPortOwners(5600, new Set(), new AbortController().signal, base), code('dom-browser-port-owners-unavailable'))
  await assert.rejects(discoverDomBrowserPortOwners(5600, new Set(), new AbortController().signal, {
    ...base, directoryNames: async directory => directory === '/proc' ? ['101'] : Array(16_385).fill('0'),
  }), code('dom-browser-port-owners-unavailable'))
  await assert.rejects(discoverDomBrowserPortOwners(5600, new Set(), new AbortController().signal, {
    ...base, readText: async () => 'malformed table',
  }), code('dom-browser-port-owners-unavailable'))
})

test('macOS owner discovery uses execFile arguments, process identity and shared local socket parser', async () => {
  const commands: string[] = []
  const value = await discoverDomBrowserPortOwners(5600, new Set([5000]), new AbortController().signal, {
    platform: 'darwin', run: async (command, args) => {
      commands.push(command)
      if (command === '/bin/ps') { assert.deepEqual(args, ['-axo', 'pid=,ppid=,lstart=']); return ' 101 1 Sat Nov 7 01:00:00 2026\n' }
      assert.deepEqual(args, ['-nP', '-iTCP', '-sTCP:LISTEN', '-Fpn'])
      return 'p101\nn127.0.0.1:5600\nn192.168.0.2:5000\np102\nn192.168.0.2:5600\n'
    },
  })
  assert.deepEqual(commands.sort(), ['/bin/ps', '/usr/sbin/lsof'])
  assert.deepEqual([...value.owners], [101], 'LAN-only owners of the target port are not signaled')
  assert.deepEqual([...value.protectedPids], [101])
  assert.equal(value.identities.get(101), 'Sat Nov 7 01:00:00 2026')
})

test('Windows owner discovery uses encoded PowerShell and protects reserved ports on every interface', async () => {
  const value = await discoverDomBrowserPortOwners(5600, new Set([5000]), new AbortController().signal, {
    platform: 'win32', run: async (command, args) => {
      assert.ok(command.endsWith('powershell.exe'))
      assert.ok(args.includes('-NonInteractive'))
      const script = Buffer.from(args.at(-1)!, 'base64').toString('utf16le')
      assert.match(script, /Get-CimInstance Win32_Process -ErrorAction Stop/)
      assert.match(script, /Get-NetTCPConnection -State Listen -ErrorAction Stop/)
      assert.doesNotMatch(script, /Stop-Process|taskkill|5600/)
      return JSON.stringify({ processes: [{ ProcessId: 101, ParentProcessId: 1, CreationDate: '2026-11-07' }], listeners: [
        { OwningProcess: 101, LocalAddress: '::', LocalPort: 5600 },
        { OwningProcess: 101, LocalAddress: '192.168.0.2', LocalPort: 5000 },
      ] })
    },
  })
  assert.deepEqual([...value.owners], [101])
  assert.deepEqual([...value.protectedPids], [101])
  assert.equal(value.identities.get(101), '2026-11-07')
  await assert.rejects(discoverDomBrowserPortOwners(5600, new Set(), new AbortController().signal, { platform: 'win32', run: async () => '{}' }), code('dom-browser-port-owners-unavailable'))
  await assert.rejects(discoverDomBrowserPortOwners(5600, new Set(), new AbortController().signal, { platform: 'freebsd' }), code('dom-browser-port-owners-unavailable'))
})

test('Linux live socket ownership identifies this fixture process and refuses to signal itself', { skip: process.platform !== 'linux', timeout: 15_000 }, async t => {
  const fixture = net.createServer()
  fixture.listen(0, '127.0.0.1'); await once(fixture, 'listening')
  t.after(() => new Promise<void>(resolve => fixture.close(() => resolve())))
  const address = fixture.address(); assert.ok(address && typeof address !== 'string')
  const snapshot = await discoverDomBrowserPortOwners(address.port, new Set(), new AbortController().signal)
  assert.equal(snapshot.listening, true)
  assert.equal(snapshot.owners.has(process.pid), true)
  assert.ok(snapshot.identities.get(process.pid))
  await assert.rejects(closeDomBrowserPort(address.port, {
    allowed: () => true,
    protectedPorts: () => new Set(),
    snapshot: async () => snapshot,
    signalProcess: () => { assert.fail('Live fixture must never receive a real or injected signal') },
  }), code('dom-browser-port-protected'))
  assert.equal(fixture.listening, true)
})
