import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter, once } from 'node:events'
import { spawn, type ChildProcess } from 'node:child_process'
import { closeRemotePeer, createRemotePeerPool } from './remote-access-peer-pool.ts'

class Peer extends EventEmitter {
  connected = true
  exitCode: number | null = null
  messages: { type: string }[] = []
  kills = 0
  signals: (NodeJS.Signals | number | undefined)[] = []
  send(value: { type: string }, callback?: (error: Error | null) => void) { this.messages.push(value); callback?.(null); return true }
  kill(signal?: NodeJS.Signals | number) { this.kills++; this.signals.push(signal); return true }
  exit() { this.connected = false; this.exitCode = 0; this.emit('exit', 0) }
}

test('the host reuses exactly one idle process without account credentials and heartbeats each isolated helper', t => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] })
  const peers: Peer[] = []
  const pool = createRemotePeerPool(() => { const peer = new Peer(); peers.push(peer); return peer as unknown as ChildProcess })
  t.after(() => { pool.close(); peers.forEach(peer => peer.exit()) })
  pool.warm(); pool.warm()
  assert.equal(peers.length, 1)
  assert.equal(peers[0].messages.length, 0)
  t.mock.timers.tick(2000)
  assert.deepEqual(peers[0].messages, [{ type: 'ping' }])
  const first = pool.take()
  assert.equal(first, peers[0])
  pool.warm(); pool.warm()
  assert.equal(peers.length, 2)
  assert.equal(pool.take(), peers[1])
  assert.notEqual(first, peers[1], 'connections never share a helper')
  pool.warm()
  pool.clear()
  assert.deepEqual(peers[2].messages, [{ type: 'close' }])
  assert.equal(peers[0].messages.some(value => value.type === 'close'), false)
  assert.equal(peers[1].messages.some(value => value.type === 'close'), false)
})

test('idle process failures retry with a bound, and clearing registration cancels retry and reaps shutdown', t => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] })
  const peers: Peer[] = []
  const pool = createRemotePeerPool(() => { const peer = new Peer(); peers.push(peer); return peer as unknown as ChildProcess })
  t.after(() => { pool.close(); peers.forEach(peer => peer.exit()) })
  pool.warm()
  peers[0].exit()
  pool.warm()
  t.mock.timers.tick(4999)
  assert.equal(peers.length, 1)
  t.mock.timers.tick(1)
  assert.equal(peers.length, 2)
  peers[1].emit('error', new Error('fixture'))
  assert.deepEqual(peers[1].messages.at(-1), { type: 'close' })
  pool.clear()
  t.mock.timers.tick(5000)
  assert.equal(peers.length, 2)
  assert.equal(peers[1].kills, 1)
  assert.deepEqual(peers[1].signals, ['SIGKILL'])
  pool.warm()
  assert.equal(peers.length, 3)
  pool.close()
  assert.deepEqual(peers[2].messages.at(-1), { type: 'close' })
  pool.warm()
  t.mock.timers.tick(5000)
  assert.equal(peers.length, 3)
  assert.equal(peers[2].kills, 1)
  assert.deepEqual(peers[2].signals, ['SIGKILL'])
})

test('retired helpers get a bounded graceful shutdown and release the force-exit listener on either outcome', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const stubborn = new Peer()
  closeRemotePeer(stubborn as unknown as ChildProcess)
  assert.deepEqual(stubborn.messages, [{ type: 'close' }])
  t.mock.timers.tick(3999)
  assert.equal(stubborn.kills, 0)
  assert.equal(stubborn.listenerCount('exit'), 1)
  t.mock.timers.tick(1)
  assert.deepEqual(stubborn.signals, ['SIGKILL'])
  assert.equal(stubborn.listenerCount('exit'), 0, 'force-exit timeout releases its listener even when no exit arrives')
  const graceful = new Peer()
  closeRemotePeer(graceful as unknown as ChildProcess)
  graceful.exit()
  assert.equal(graceful.listenerCount('exit'), 0)
  t.mock.timers.tick(4000)
  assert.equal(graceful.kills, 0, 'an already exited helper cannot be killed later')
})

test('a real isolated helper that ignores SIGTERM cannot survive the shutdown deadline', { timeout: 10_000 }, async t => {
  const peer = spawn(process.execPath, ['-e', "process.on('SIGTERM',()=>{});process.on('message',value=>{if(value.type==='close')process.send({type:'closing'})});setInterval(()=>{},1000);process.send({type:'ready'})"], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] })
  t.after(() => { if (peer.exitCode === null && peer.signalCode === null) peer.kill('SIGKILL') })
  assert.deepEqual((await once(peer, 'message'))[0], { type: 'ready' })
  const exited = once(peer, 'exit')
  closeRemotePeer(peer)
  assert.deepEqual((await once(peer, 'message'))[0], { type: 'closing' })
  assert.deepEqual(await exited, [null, 'SIGKILL'])
})

test('fork failures do not spin and active helper exit never evicts the next idle helper', t => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] })
  let attempts = 0
  const peers: Peer[] = []
  const pool = createRemotePeerPool(() => {
    if (++attempts === 1) throw new Error('fixture-unavailable')
    const peer = new Peer(); peers.push(peer); return peer as unknown as ChildProcess
  })
  t.after(() => { pool.close(); peers.forEach(peer => peer.exit()) })
  pool.warm(); pool.warm()
  assert.equal(attempts, 1)
  t.mock.timers.tick(5000)
  assert.equal(attempts, 2)
  pool.take(); pool.warm()
  peers[0].exit()
  assert.equal(pool.take(), peers[1])
  assert.equal(attempts, 3)
})

test('taking a cold helper cancels an earlier standby failure retry until its owner asks for another', t => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] })
  const peers: Peer[] = []
  const pool = createRemotePeerPool(() => { const peer = new Peer(); peers.push(peer); return peer as unknown as ChildProcess })
  t.after(() => { pool.close(); peers.forEach(peer => peer.exit()) })
  pool.warm()
  peers[0].exit()
  assert.equal(pool.take(), peers[1])
  t.mock.timers.tick(35_000)
  assert.equal(peers.length, 2, 'a full host does not inherit the failed standby request')
  assert.equal(peers[1].messages.some(value => value.type === 'close'), false)
  pool.warm()
  assert.equal(peers.length, 3, 'the host can request a standby when another connection slot opens')
})

test('unused native ICE sockets rotate after thirty seconds and a taken helper keeps its connection lifetime', t => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] })
  const peers: Peer[] = []
  const pool = createRemotePeerPool(() => { const peer = new Peer(); peers.push(peer); return peer as unknown as ChildProcess })
  t.after(() => { pool.close(); peers.forEach(peer => peer.exit()) })
  pool.warm()
  t.mock.timers.tick(29_999)
  assert.equal(peers.length, 1)
  t.mock.timers.tick(1)
  assert.equal(peers.length, 2)
  assert.equal(peers[0].messages.some(value => value.type === 'close'), true)
  const active = pool.take()
  pool.warm()
  t.mock.timers.tick(30_000)
  assert.equal(peers[1].messages.some(value => value.type === 'close'), false)
  assert.equal(peers[2].messages.some(value => value.type === 'close'), true)
  assert.equal(active, peers[1])
  assert.equal(peers.length, 4)
})
