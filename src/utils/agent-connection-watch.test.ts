import test, { type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { AgentConnectionWatch, AGENT_CONNECTION_HANDSHAKE_TIMEOUT, AGENT_CONNECTION_IDLE_INTERVAL, AGENT_CONNECTION_PROBE_TIMEOUT } from './agent-connection-watch.ts'

function fixture(t: TestContext, remote = false, monotonic = 1000) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_900_000_000_000 })
  let now = monotonic
  t.mock.method(performance, 'now', () => now)
  const state = { available: true, reconnects: 0, sends: [] as { type: string; id: string }[], connectionStartedAt: undefined as number | undefined }
  const socket = { readyState: 0, bufferedAmount: 0, send(raw: string) { state.sends.push(JSON.parse(raw)) } }
  if (remote) Object.defineProperty(socket, 'connectionStartedAt', { get: () => state.connectionStartedAt })
  const watch = new AgentConnectionWatch(socket, { available: () => state.available, reconnect: () => { state.reconnects++ } })
  const ready = (connectionProbe = true) => {
    socket.readyState = 1
    watch.receive({ type: 'ready', cwd: '/workspace', connectionProbe })
  }
  t.after(() => watch.dispose())
  return { watch, state, socket, ready, tick: (ms: number) => { now += ms; t.mock.timers.tick(ms) } }
}

test('a CONNECTING socket or open socket without a relay packet has a bounded handshake', t => {
  const { state, socket, tick } = fixture(t)
  tick(AGENT_CONNECTION_HANDSHAKE_TIMEOUT - 1)
  assert.equal(state.reconnects, 0)
  socket.readyState = 1
  tick(1)
  assert.equal(state.reconnects, 1)
  tick(60_000)
  assert.equal(state.reconnects, 1, 'an obsolete watch cannot reopen repeatedly')
})

test('relay readiness is independent of slow provider startup and busy task progress', t => {
  const { watch, state, ready, tick } = fixture(t)
  ready()
  for (let elapsed = 0; elapsed < 60_000; elapsed += 1000) {
    tick(1000)
    watch.receive({ type: 'auth' })
  }
  assert.equal(state.reconnects, 0)
  assert.deepEqual(state.sends, [], 'ordinary incoming activity avoids redundant idle probes')
})

test('foreground bursts use one fresh probe; unrelated buffered packets and wrong pongs cannot satisfy it', t => {
  const { watch, state, ready, tick } = fixture(t)
  ready()
  watch.resume(); watch.resume(); watch.resume()
  assert.equal(state.sends.length, 1)
  watch.receive({ type: 'meta' })
  watch.receive({ type: 'pong', id: 'obsolete' })
  tick(AGENT_CONNECTION_PROBE_TIMEOUT - 1)
  assert.equal(state.reconnects, 0)
  tick(1)
  assert.equal(state.reconnects, 1)
})

test('a matching pong keeps a healthy peer and measures a conservative slow-network deadline', t => {
  const { watch, state, ready, tick } = fixture(t)
  ready()
  watch.resume()
  tick(400)
  watch.receive({ type: 'pong', id: state.sends.at(-1)!.id })
  tick(1000)
  assert.equal(state.reconnects, 0)
  watch.resume()
  tick(1299)
  assert.equal(state.reconnects, 0, '3 × measured RTT + 100ms avoids premature reconnection')
  tick(1)
  assert.equal(state.reconnects, 1)
})

test('visible idle sockets are checked without waiting for a native browser TCP timeout', t => {
  const { watch, state, ready, tick } = fixture(t)
  ready()
  tick(AGENT_CONNECTION_IDLE_INTERVAL)
  assert.equal(state.sends.length, 1)
  tick(AGENT_CONNECTION_PROBE_TIMEOUT)
  assert.equal(state.reconnects, 1)
  watch.receive({ type: 'pong', id: state.sends[0].id })
  assert.equal(state.reconnects, 1)
})

test('each matching idle pong starts the next fifteen-second interval without polling phase delay', t => {
  const { watch, state, ready, tick } = fixture(t)
  ready()
  tick(15_000)
  assert.equal(state.sends.length, 1)
  tick(1)
  watch.receive({ type: 'pong', id: state.sends[0].id })
  tick(14_999)
  assert.equal(state.sends.length, 1)
  tick(1)
  assert.equal(state.sends.length, 2, 'the second probe starts at30,001ms rather than45,000ms')
})

test('ordinary body traffic renews the idle deadline to fifteen seconds after its last packet', t => {
  const { watch, state, ready, tick } = fixture(t)
  ready()
  tick(10_000)
  watch.receive({ type: 'update' })
  tick(5000)
  assert.deepEqual(state.sends, [])
  tick(9999)
  assert.deepEqual(state.sends, [])
  tick(1)
  assert.equal(state.sends.length, 1)
})

test('a pending idle proof owns one response deadline without scheduling idle rechecks', t => {
  const { watch, state, ready, tick } = fixture(t)
  ready()
  const schedule = t.mock.method(globalThis, 'setTimeout')
  tick(15_000)
  assert.equal(state.sends.length, 1)
  assert.equal(schedule.mock.callCount(), 1)
  watch.receive({ type: 'meta' })
  watch.receive({ type: 'pong', id: 'unrelated' })
  assert.equal(schedule.mock.callCount(), 1, 'unrelated traffic cannot create idle timers while a fresh proof is pending')
  tick(AGENT_CONNECTION_PROBE_TIMEOUT)
  assert.equal(state.reconnects, 1)
  assert.equal(schedule.mock.callCount(), 1)
})

test('an overdue idle check waits one second for local backpressure rather than busy-looping', t => {
  const { state, socket, ready, tick } = fixture(t)
  ready()
  socket.bufferedAmount = 1
  const schedule = t.mock.method(globalThis, 'setTimeout')
  tick(15_000)
  assert.deepEqual(state.sends, [])
  assert.equal(schedule.mock.callCount(), 1)
  assert.equal(schedule.mock.calls[0].arguments[1], 1000)
  tick(999)
  assert.equal(schedule.mock.callCount(), 1)
  socket.bufferedAmount = 0
  tick(1)
  assert.equal(state.sends.length, 1)
  assert.equal(state.reconnects, 0)
})

test('legacy relay compatibility replaces only stale sockets on foreground return', t => {
  const { watch, state, ready, tick } = fixture(t)
  ready(false)
  watch.resume()
  assert.deepEqual(state.sends, [], 'a legacy server never receives an unsupported probe')
  tick(AGENT_CONNECTION_IDLE_INTERVAL)
  assert.equal(state.reconnects, 0, 'legacy sockets are not cycled by an idle heartbeat')
  watch.resume()
  assert.equal(state.reconnects, 1)
})

test('hidden, offline, and suspended waits pause the handshake budget and discard old probe deadlines', t => {
  const { watch, state, ready, tick } = fixture(t)
  tick(500)
  state.available = false
  watch.resume()
  tick(10 * 60_000)
  assert.equal(state.reconnects, 0)
  state.available = true
  watch.resume()
  tick(2499)
  assert.equal(state.reconnects, 0)
  ready()
  watch.resume()
  state.available = false
  watch.resume()
  tick(60_000)
  assert.equal(state.reconnects, 0)
  state.available = true
  watch.resume()
  assert.equal(state.sends.length, 2, 'resumption creates a new proof instead of expiring the paused probe')
  watch.receive({ type: 'pong', id: state.sends.at(-1)!.id })
  tick(1000)
  assert.equal(state.reconnects, 0)
})

test('local backpressure postpones liveness checks and disposal clears every pending timer', t => {
  const { watch, state, socket, ready, tick } = fixture(t)
  ready()
  socket.bufferedAmount = 1
  watch.resume()
  tick(AGENT_CONNECTION_IDLE_INTERVAL)
  assert.deepEqual(state.sends, [])
  assert.equal(state.reconnects, 0)
  socket.bufferedAmount = 0
  watch.resume()
  assert.equal(state.sends.length, 1)
  watch.dispose()
  tick(60_000)
  assert.equal(state.reconnects, 0)
})

test('wall-clock rollback cannot suppress fresh foreground probes or their response deadline', t => {
  const { watch, state, ready, tick } = fixture(t)
  ready()
  watch.resume()
  watch.receive({ type: 'pong', id: state.sends[0].id })
  tick(250)
  t.mock.method(Date, 'now', () => 1_900_000_000_000 - 60 * 60_000)
  watch.resume()
  assert.equal(state.sends.length, 2)
  tick(AGENT_CONNECTION_PROBE_TIMEOUT - 1)
  assert.equal(state.reconnects, 0)
  tick(1)
  assert.equal(state.reconnects, 1)
})

test('idle probes and legacy staleness follow monotonic elapsed time through wall-clock changes', t => {
  const { watch, state, ready, tick } = fixture(t)
  ready()
  const wallClock = t.mock.method(Date, 'now', () => 1_900_000_000_000 - 60 * 60_000)
  tick(AGENT_CONNECTION_IDLE_INTERVAL)
  assert.equal(state.sends.length, 1, 'a wall-clock rollback cannot delay the idle probe')
  watch.receive({ type: 'pong', id: state.sends[0].id })
  watch.receive({ type: 'ready', cwd: '/workspace', connectionProbe: false })
  wallClock.mock.mockImplementation(() => 1_900_000_000_000 + 24 * 60 * 60_000)
  watch.resume()
  assert.equal(state.reconnects, 0, 'a clock jump cannot make a fresh legacy relay stale')
  tick(AGENT_CONNECTION_IDLE_INTERVAL)
  watch.resume()
  assert.equal(state.reconnects, 1)
})

test('a remote socket waits for actual connection transmission before consuming its handshake budget', t => {
  const { state, tick } = fixture(t, true)
  for (let interval = 0; interval < 10; interval++) tick(3000)
  assert.equal(state.reconnects, 0, 'local stream quota cannot trigger repeated socket replacements')
  state.connectionStartedAt = performance.now()
  tick(2999)
  assert.equal(state.reconnects, 0)
  tick(1)
  assert.equal(state.reconnects, 1)
})

test('a remote transmission at monotonic zero is distinct from unsent admission', t => {
  const { state, tick } = fixture(t, true, 0)
  state.connectionStartedAt = 0
  tick(2999)
  assert.equal(state.reconnects, 0)
  tick(1)
  assert.equal(state.reconnects, 1)
})

test('queued remote time does not inflate a fresh relay probe allowance', t => {
  const { watch, state, ready, tick } = fixture(t, true)
  tick(30_000)
  state.connectionStartedAt = performance.now()
  tick(10)
  ready()
  watch.resume()
  tick(AGENT_CONNECTION_PROBE_TIMEOUT)
  assert.equal(state.reconnects, 1, 'only the transmitted handshake contributes to the measured allowance')
})

test('a remote transmission during a pause receives its visible handshake budget on return', t => {
  const { watch, state, tick } = fixture(t, true)
  tick(500)
  state.available = false
  watch.resume()
  tick(1000)
  state.connectionStartedAt = performance.now()
  tick(10_000)
  state.available = true
  watch.resume()
  tick(2999)
  assert.equal(state.reconnects, 0)
  tick(1)
  assert.equal(state.reconnects, 1)
})

test('a timer observing unavailability records a pause even without a foreground event', t => {
  const { watch, state, tick } = fixture(t)
  state.available = false
  tick(1000)
  tick(2000)
  tick(60_000)
  assert.equal(state.reconnects, 0)
  state.available = true
  watch.resume()
  assert.equal(state.reconnects, 1, 'the already spent active budget expires without counting the unavailable remainder')
})

test('disposing an unsent remote socket watch cancels admission polling without late replacement', t => {
  const { watch, state, tick } = fixture(t, true)
  tick(3000)
  watch.dispose()
  state.connectionStartedAt = performance.now()
  tick(60_000)
  watch.resume()
  assert.equal(state.reconnects, 0)
  assert.deepEqual(state.sends, [])
})
