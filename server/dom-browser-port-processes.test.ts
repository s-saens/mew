import assert from 'node:assert/strict'
import test from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { discoverDomBrowserPortProcesses, type DomBrowserPortProcessOptions } from './dom-browser-port-processes.ts'

const row = (port: number, inode: number, address = '0100007F', state = '0A') => `0: ${address}:${port.toString(16).padStart(4, '0')} 00000000:0000 ${state} 0 0 0 0 0 ${inode}\n`
const unavailable = () => { throw Object.assign(new Error('unavailable'), { code: 'EACCES' }) }

test('Linux resolves actual listener socket owners from comm, deduplicates names, and never reads arguments or environments', async () => {
  const reads: string[] = []
  const options: DomBrowserPortProcessOptions = {
    platform: 'linux',
    readText: async file => {
      reads.push(file)
      if (file === '/proc/net/tcp') return row(4444, 100) + row(4445, 101, '00000000') + row(4446, 102, '0101A8C0') + row(4447, 103, '0100007F', '01')
      if (file === '/proc/net/tcp6') return row(4448, 104, '00000000000000000000000001000000')
      if (file === '/proc/10/comm') return 'redis\u0001\n'
      if (file === '/proc/20/comm') return 'node\n'
      if (file === '/proc/30/comm') return 'node\n'
      throw new Error(`Unexpected text read: ${file}`)
    },
    directoryNames: async directory => directory === '/proc' ? ['30', '10', '20', 'not-a-pid', '40'] : ['0', '1', '2', '3', '4'],
    readLink: async file => {
      if (file.endsWith('/fd/0')) return 'socket:[100]'
      if (file.endsWith('/fd/1')) return 'socket:[101]'
      if (file.endsWith('/fd/2')) return 'socket:[102]'
      if (file.endsWith('/fd/3')) return 'socket:[103]'
      return 'socket:[104]'
    },
    run: async () => { throw new Error('Linux must not execute tools') },
  }
  assert.deepEqual(await discoverDomBrowserPortProcesses([4444, 4445, 4446, 4447, 4448, 5432], options), new Map([
    [4444, 'node, redis'], [4445, 'node, redis'], [4448, 'node, redis'],
  ]))
  assert.ok(reads.every(file => /^\/proc\/net\/tcp6?$/.test(file) || /^\/proc\/\d+\/comm$/.test(file)))
  assert.equal(reads.includes('/proc/40/comm'), true, 'a disappearing process is harmless')
})

test('Linux permission denials, missing tables, descriptor failures, and empty process names yield optional metadata only', async () => {
  const base: DomBrowserPortProcessOptions = {
    platform: 'linux',
    readText: async file => file === '/proc/net/tcp' ? row(3333, 10) : unavailable(),
    directoryNames: async directory => directory === '/proc' ? ['10', '20', '30'] : directory === '/proc/10/fd' ? unavailable() : ['1'],
    readLink: async file => file.includes('/20/') ? unavailable() : 'socket:[10]',
  }
  assert.deepEqual(await discoverDomBrowserPortProcesses([3333], base), new Map())
  assert.deepEqual(await discoverDomBrowserPortProcesses([3333], { ...base, readText: async () => unavailable() }), new Map())
  assert.deepEqual(await discoverDomBrowserPortProcesses([3333], { ...base, readText: async file => file === '/proc/net/tcp' ? row(3333, 10) : ' \n\u0000' }), new Map())
})

test('macOS reads lsof command fields and shared loopback/wildcard socket parsing without process arguments', async () => {
  const result = await discoverDomBrowserPortProcesses([3333, 4444, 5555], {
    platform: 'darwin',
    run: async (command, args, signal) => {
      assert.equal(command, '/usr/sbin/lsof')
      assert.deepEqual(args, ['-nP', '-iTCP', '-sTCP:LISTEN', '-Fpcn'])
      assert.equal(signal.aborted, false)
      return ['p20', 'cnode', 'n127.0.0.1:3333', 'p10', 'credis\u0001', 'n*:3333', 'n[::1]:4444', 'n10.0.0.1:5555', 'p30', 'cnode', 'n[::]:3333'].join('\n')
    },
  })
  assert.deepEqual(result, new Map([[3333, 'node, redis'], [4444, 'redis']]))
})

test('Windows joins ProcessName to actual listeners, excludes remote binds, and never queries command lines', async () => {
  const result = await discoverDomBrowserPortProcesses([3333, 4444, 5555], {
    platform: 'win32',
    run: async (command, args) => {
      assert.ok(command.endsWith('powershell.exe'))
      const script = Buffer.from(args.at(-1)!, 'base64').toString('utf16le')
      assert.match(script, /Get-NetTCPConnection -State Listen/)
      assert.match(script, /Get-Process -ErrorAction SilentlyContinue \| Select-Object Id,ProcessName/)
      assert.doesNotMatch(script, /CimInstance|CommandLine|Environment|Invoke-WebRequest/)
      return '\uFEFF' + JSON.stringify({
        processes: [{ Id: 20, ProcessName: 'node' }, { Id: 10, ProcessName: 'postgres' }, { Id: 30, ProcessName: 'node' }, { Id: -1, ProcessName: 'invalid' }],
        listeners: [
          { OwningProcess: 20, LocalAddress: '127.0.0.1', LocalPort: 3333 },
          { OwningProcess: 10, LocalAddress: '::', LocalPort: 3333 },
          { OwningProcess: 30, LocalAddress: '::1', LocalPort: 4444 },
          { OwningProcess: 10, LocalAddress: '10.0.0.1', LocalPort: 5555 },
          { OwningProcess: 99, LocalAddress: '127.0.0.1', LocalPort: 5555 },
        ],
      })
    },
  })
  assert.deepEqual(result, new Map([[3333, 'node, postgres'], [4444, 'node']]))
})

test('invalid, unavailable, oversized platform output and unsupported platforms never fail the caller', async () => {
  for (const platform of ['darwin', 'win32', 'freebsd'] as const) {
    for (const output of ['', '{', 'null', '{}', 'x'.repeat(2 * 1024 * 1024 + 1)]) {
      assert.deepEqual(await discoverDomBrowserPortProcesses([3333], { platform, run: async () => output }), new Map())
    }
    assert.deepEqual(await discoverDomBrowserPortProcesses([3333], { platform, run: async () => unavailable() }), new Map())
  }
  let invoked = false
  assert.deepEqual(await discoverDomBrowserPortProcesses([0, 65536, NaN], { run: async () => { invoked = true; return '' } }), new Map())
  assert.equal(invoked, false)
})

test('names strip controls, cap Unicode codepoints, and use deterministic deduplicated ordering', async () => {
  const result = await discoverDomBrowserPortProcesses([3333, 4444], {
    platform: 'darwin',
    run: async () => ['p1', `c${'🦊'.repeat(100)}\u0000`, 'n*:3333', 'p2', 'czeta', 'n*:4444', 'p3', 'calpha\u200b', 'n*:4444', 'p4', 'calpha', 'n*:4444'].join('\n'),
  })
  assert.equal(Array.from(result.get(3333)!).length, 80)
  assert.equal(result.get(4444), 'alpha, zeta')
})

test('Linux bounds PID/descriptor reads, global link work, and concurrent filesystem workers', async () => {
  let active = 0, peak = 0, linkReads = 0, fdDirectories = 0
  const result = await discoverDomBrowserPortProcesses([3333], {
    platform: 'linux', timeoutMs: 2000,
    readText: async file => file.startsWith('/proc/net/') ? row(3333, 10) : 'node',
    directoryNames: async (directory, limit) => {
      if (directory === '/proc') { assert.equal(limit, 4096); return Array.from({ length: 5000 }, (_, index) => String(index + 1)) }
      assert.equal(limit, 512)
      fdDirectories++
      return Array.from({ length: 1000 }, (_, index) => String(index))
    },
    readLink: async () => {
      linkReads++; active++; peak = Math.max(peak, active)
      await Promise.resolve()
      active--
      return 'socket:[10]'
    },
  })
  assert.deepEqual(result, new Map([[3333, 'node']]))
  assert.equal(linkReads, 32768)
  assert.ok(fdDirectories <= 72)
  assert.equal(peak, 8)
})

test('deadlines and cancellation return partial names and abort hooks without waiting for stalled filesystem work', async () => {
  let observed: AbortSignal | undefined
  const options: DomBrowserPortProcessOptions = {
    platform: 'linux', timeoutMs: 30,
    readText: async file => file.startsWith('/proc/net/') ? row(3333, 10) + row(4444, 20) : 'ready',
    directoryNames: async directory => {
      if (directory === '/proc') return ['1', '2']
      return ['0']
    },
    readLink: async (file, signal) => {
      observed = signal
      if (file.includes('/1/')) return 'socket:[10]'
      return new Promise<string>(() => {})
    },
  }
  const started = performance.now()
  assert.deepEqual(await discoverDomBrowserPortProcesses([3333, 4444], options), new Map([[3333, 'ready']]))
  assert.ok(performance.now() - started < 300)
  assert.equal(observed?.aborted, true)
  const cancellation = new AbortController()
  let pendingSignal: AbortSignal | undefined
  const pending = discoverDomBrowserPortProcesses([3333], { platform: 'darwin', signal: cancellation.signal, run: async (_command, _args, signal) => { pendingSignal = signal; return new Promise<string>(() => {}) } })
  await delay(5)
  cancellation.abort()
  assert.deepEqual(await pending, new Map())
  assert.equal(pendingSignal?.aborted, true)
  let calls = 0
  assert.deepEqual(await discoverDomBrowserPortProcesses([3333], { platform: 'darwin', signal: cancellation.signal, run: async () => { calls++; return '' } }), new Map())
  assert.equal(calls, 0)
})
