import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:net'
import { test, type TestContext } from 'node:test'
import { commandPortParsers as parsers, commandSessionPorts } from './command-ports.ts'

const tcpRow = (address: string, port: string, inode: string, state = '0A') => `  0: ${address}:${port} 00000000:0000 ${state} 00000000:00000000 00:00000000 00000000 1000 0 ${inode} 1`

test('Linux stat parser handles spaces and closing parentheses in process names', () => {
  assert.deepEqual(parsers.linuxProcessStat('123 (npm run dev) worker)) S 100 0 0 0'), { pid: 123, parent: 100 })
  assert.deepEqual(parsers.linuxProcessStat('1 (init) S 0 0'), { pid: 1, parent: 0 })
  for (const input of ['', '123 npm S 100', '123 (npm) S nope', '0 (npm) S 1', '123 (npm) S -1', '123 (npm) S 4294967296']) assert.equal(parsers.linuxProcessStat(input), undefined)
})

test('Linux TCP parser accepts only live loopback/wildcard listeners with valid ports and inodes', () => {
  const table = [
    'sl local_address rem_address st tx_queue rx_queue tr tm->when retrnsmt uid timeout inode',
    tcpRow('0100007F', '0D05', '101'),
    tcpRow('00000000', '15B3', '102'),
    tcpRow('00000000000000000000000001000000', '0BB8', '103'),
    tcpRow('00000000000000000000000000000000', 'FFFF', '104'),
    tcpRow('0201A8C0', '1F90', '105'),
    tcpRow('0200007F', '1F91', '106'),
    tcpRow('0100007F', '1F92', '107', '01'),
    tcpRow('0100007F', '0000', '108'),
    tcpRow('0100007F', 'ZZZZ', '109'),
    tcpRow('0100007F', '0D05', '0'),
    tcpRow('0100007F', '0D05', 'not-an-inode'),
    'malformed',
  ].join('\n')
  assert.deepEqual([...parsers.linuxTcpListeners(table, 'LE')], [['101', 3333], ['102', 5555], ['103', 3000], ['104', 65535]])
  assert.equal(parsers.linuxTcpListeners('').size, 0)
  assert.deepEqual([...parsers.linuxTcpListeners([
    tcpRow('7F000001', '0D05', '201'),
    tcpRow('00000000000000000000000000000001', '15B3', '202'),
    tcpRow('0100007F', '0D05', '203'),
  ].join('\n'), 'BE')], [['201', 3333], ['202', 5555]])
})

test('macOS ps/lsof parsers keep PID ownership and exclude non-local, malformed and duplicate endpoints', () => {
  assert.deepEqual([...parsers.posixProcessParents('  1 0\n 101 1\n102 101\n103 bad\n0 1\n104 -1\n105 1 args\n')], [[1, 0], [101, 1], [102, 101]])
  const sockets = [
    'n127.0.0.1:9999',
    'p101', 'f20', 'n127.0.0.1:3333', 'n*:5555', 'n127.0.0.1:3333',
    'n192.168.1.5:4000', 'nlocalhost:4001', 'n127.0.0.1:0', 'n127.0.0.1:65536',
    'n127.0.0.1:9999->127.0.0.1:5555',
    'p102', 'n[::1]:3000', 'n[::]:3001', 'n[0:0:0:0:0:0:0:1]:3002', 'n[2001:db8::1]:4002',
    'pbad', 'n127.0.0.1:7777', 'p0', 'n127.0.0.1:7778',
  ].join('\n')
  assert.deepEqual([...parsers.lsofTcpListeners(sockets)].map(([pid, ports]) => [pid, [...ports]]), [[101, [3333, 5555]], [102, [3000, 3001, 3002]]])
})

test('Windows snapshot parser validates process/socket rows and fails closed for invalid JSON', () => {
  const snapshot = parsers.windowsSnapshot('\uFEFF' + JSON.stringify({
    processes: [{ ProcessId: 101, ParentProcessId: 1 }, { ProcessId: 102, ParentProcessId: 101 }, { ProcessId: '103', ParentProcessId: 1 }, null, { ProcessId: 0, ParentProcessId: 1 }],
    listeners: [
      { OwningProcess: 102, LocalAddress: '127.0.0.1', LocalPort: 5555 },
      { OwningProcess: 102, LocalAddress: '::', LocalPort: 3333 },
      { OwningProcess: 102, LocalAddress: '0.0.0.0', LocalPort: 5555 },
      { OwningProcess: 101, LocalAddress: '::1', LocalPort: 3000 },
      { OwningProcess: 102, LocalAddress: '10.0.0.5', LocalPort: 7777 },
      { OwningProcess: 102, LocalAddress: '127.0.0.1', LocalPort: '7778' },
      { OwningProcess: 0, LocalAddress: '127.0.0.1', LocalPort: 7779 },
      { OwningProcess: 102, LocalAddress: '127.0.0.1', LocalPort: 65536 }, null,
    ],
  }))
  assert.deepEqual([...snapshot.parents], [[101, 1], [102, 101]])
  assert.deepEqual([...snapshot.ports].map(([pid, ports]) => [pid, [...ports]]), [[102, [5555, 3333]], [101, [3000]]])
  for (const input of ['', '{', 'null', '[]', '{}', '{"processes":null,"listeners":[]}', '{"processes":[],"listeners":{}}']) {
    const invalid = parsers.windowsSnapshot(input)
    assert.equal(invalid.parents.size, 0)
    assert.equal(invalid.ports.size, 0)
  }
})

const listenerScript = `
import { createServer as tcpServer } from 'node:net';
import { createServer as httpServer } from 'node:http';
const listeners = new Map(), ports = {}, unavailable = [];
for (const [id, host] of [['http', '127.0.0.1'], ['wildcard', '0.0.0.0'], ['ipv6', '::1'], ['ipv6Wildcard', '::']]) {
  const server = id === 'http' ? httpServer((_request, response) => response.end('fixture')) : tcpServer(socket => socket.end());
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen({ host, port: 0, ipv6Only: host.includes(':') }, resolve); });
    listeners.set(id, server); ports[id] = server.address().port;
  } catch (error) {
    if (!host.includes(':')) throw error;
    unavailable.push(id + ':' + error.code);
  }
}
process.send({ type: 'ready', pid: process.pid, ports, unavailable });
async function close(id) {
  const server = listeners.get(id); if (!server) return;
  await new Promise(resolve => server.close(resolve)); listeners.delete(id);
}
process.on('message', async message => {
  if (message.type === 'close') { await close(message.id); process.send({ type: 'closed', id: message.id }); }
  if (message.type === 'closeAll' || message.type === 'stop') {
    for (const id of [...listeners.keys()]) await close(id);
    if (message.type === 'stop') process.exit(0);
    process.send({ type: 'closedAll' });
  }
});
process.on('disconnect', () => process.exit(0));
`

const rootScript = `
import { spawn } from 'node:child_process';
const child = spawn(process.execPath, ['--input-type=module', '-e', ${JSON.stringify(listenerScript)}], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
child.on('message', message => process.send(message));
child.on('error', error => { console.error(error); process.exit(1); });
child.on('exit', code => process.exit(code ?? 1));
process.on('message', message => child.send(message));
process.on('disconnect', () => { child.kill(); process.exit(0); });
`

type Ready = { type: 'ready'; pid: number; ports: Record<string, number>; unavailable: string[] }

async function fixture(t: TestContext): Promise<{ root: ChildProcess; ready: Ready }> {
  const root = spawn(process.execPath, ['--input-type=module', '-e', rootScript], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] })
  let stderr = ''
  root.stderr?.on('data', chunk => { stderr += chunk.toString() })
  t.after(async () => {
    if (root.exitCode !== null || root.signalCode !== null) return
    const exited = once(root, 'exit', { signal: AbortSignal.timeout(3_000) })
    root.send({ type: 'stop' })
    try { await exited } catch { root.kill(); await once(root, 'exit') }
  })
  try {
    const [message] = await once(root, 'message', { signal: AbortSignal.timeout(8_000) })
    assert.equal(message.type, 'ready')
    return { root, ready: message as Ready }
  } catch (error) { throw new Error(`port fixture did not start: ${stderr}`, { cause: error }) }
}

async function control(root: ChildProcess, message: { type: string; id?: string }, expected: string) {
  const pending = once(root, 'message', { signal: AbortSignal.timeout(3_000) })
  root.send(message)
  assert.equal((await pending)[0].type, expected)
}

test('actual process trees expose only their own active TCP ports and remove closed listeners', { skip: !['linux', 'darwin', 'win32'].includes(process.platform), timeout: 40_000 }, async t => {
  const first = await fixture(t), second = await fixture(t)
  const unrelated = createServer()
  unrelated.listen(0, '127.0.0.1')
  await once(unrelated, 'listening')
  t.after(() => new Promise<void>(resolve => unrelated.close(() => resolve())))
  const address = unrelated.address(); assert.ok(address && typeof address !== 'string')
  const sorted = (ports: Record<string, number>) => [...new Set(Object.values(ports))].sort((a, b) => a - b)
  const firstPorts = sorted(first.ready.ports), secondPorts = sorted(second.ready.ports)
  for (const unavailable of [...first.ready.unavailable, ...second.ready.unavailable]) t.diagnostic(`IPv6 fixture unavailable: ${unavailable}`)
  const panes = [
    { session: 'first', pid: first.root.pid! },
    { session: 'first', pid: first.root.pid! },
    { session: 'leaf', pid: first.ready.pid },
    { session: 'second', pid: second.root.pid! },
    { session: 'combined', pid: first.root.pid! },
    { session: 'combined', pid: second.root.pid! },
    { session: 'missing', pid: 0x7fff_ffff },
  ]
  const detected = await commandSessionPorts(panes)
  assert.deepEqual(detected.get('first'), firstPorts)
  assert.deepEqual(detected.get('leaf'), firstPorts)
  assert.deepEqual(detected.get('second'), secondPorts)
  assert.deepEqual(detected.get('combined'), [...new Set([...firstPorts, ...secondPorts])].sort((a, b) => a - b))
  assert.deepEqual(detected.get('missing'), [])
  assert.ok(!detected.get('first')!.includes(address.port), 'a listener outside the command tree is not attributed to the button')
  const response = await fetch(`http://127.0.0.1:${first.ready.ports.http}`, { headers: { Connection: 'close' } })
  assert.equal(await response.text(), 'fixture')
  await control(first.root, { type: 'close', id: 'http' }, 'closed')
  assert.deepEqual((await commandSessionPorts(panes)).get('first'), firstPorts.filter(port => port !== first.ready.ports.http))
  await control(first.root, { type: 'closeAll' }, 'closedAll')
  const closed = await commandSessionPorts(panes)
  assert.deepEqual(closed.get('first'), [])
  assert.deepEqual(closed.get('second'), secondPorts, 'one command closing ports does not remove another command\'s ports')
})

test('empty, invalid, and exited pane PIDs return empty port lists without throwing', async () => {
  assert.deepEqual(await commandSessionPorts([]), new Map())
  assert.deepEqual(await commandSessionPorts([
    { session: 'zero', pid: 0 }, { session: 'negative', pid: -1 },
    { session: 'fraction', pid: 1.5 }, { session: 'nan', pid: NaN }, { session: 'oversized', pid: 2 ** 32 },
  ]), new Map(['zero', 'negative', 'fraction', 'nan', 'oversized'].map(session => [session, []])))
  assert.deepEqual((await commandSessionPorts([{ session: 'exited', pid: 0x7fff_ffff }])).get('exited'), [])
})

test('a slow port inspection expires with empty results and leaves command lookup usable', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const pending = commandSessionPorts([{ session: 'slow', pid: process.pid }])
  t.mock.timers.tick(5_000)
  assert.deepEqual(await pending, new Map([['slow', []]]))
  t.mock.timers.reset()
  assert.deepEqual(await commandSessionPorts([{ session: 'next', pid: 0 }]), new Map([['next', []]]))
})
