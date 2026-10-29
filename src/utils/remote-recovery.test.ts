import test, { type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { remoteDeadline, remotePresence, remoteRecoveryDelay, remoteRecoveryMessage } from './remote-recovery.ts'

const origin = 'https://app.example.test'
const never = <T>() => new Promise<T>(() => {})
const flush = () => new Promise<void>(resolve => setImmediate(resolve))

function deadlineTimers(t: TestContext) {
  t.mock.timers.enable({ apis: ['setTimeout'] })
}

test('ordinary recovery retries immediately once and increases its capped delay afterward', () => {
  assert.equal(remoteRecoveryDelay(0, false, 0), 0)
  assert.equal(remoteRecoveryDelay(0, false, 1), 0)
  assert.deepEqual([1, 2, 3, 4, 5].map(failures => remoteRecoveryDelay(failures, false, 0.5)), [250, 500, 1000, 2000, 4000])
  assert.equal(remoteRecoveryDelay(100, false, 0.5), 30_000)
})

test('offline recovery starts slowly and stops increasing after thirty seconds', () => {
  assert.deepEqual([0, 1, 2, 3, 100].map(failures => remoteRecoveryDelay(failures, true, 0.5)), [2000, 5000, 10_000, 30_000, 30_000])
})

test('jitter spreads retry times while enforcing the thirty second maximum', () => {
  assert.equal(remoteRecoveryDelay(1, false, 0), 188)
  assert.equal(remoteRecoveryDelay(1, false, 1), 313)
  assert.equal(remoteRecoveryDelay(0, true, 0), 1500)
  assert.equal(remoteRecoveryDelay(0, true, 1), 2500)
  for (const offline of [false, true]) {
    assert.equal(remoteRecoveryDelay(100, offline, 0), 22_500)
    assert.equal(remoteRecoveryDelay(100, offline, 1), 30_000)
    assert.equal(remoteRecoveryDelay(100, offline, 10), 30_000)
  }
})

test('recovery messages distinguish waiting for the host, network, authentication, and rate limits', () => {
  assert.match(remoteRecoveryMessage('offline'), /호스트.*오프라인/)
  assert.match(remoteRecoveryMessage('network-offline'), /인터넷/)
  assert.match(remoteRecoveryMessage('authentication-timeout'), /로그인/)
  assert.match(remoteRecoveryMessage('rate-limited'), /요청이 많/)
  assert.equal(remoteRecoveryMessage('unknown', 'fixture diagnostic'), 'fixture diagnostic')
  assert.equal(remoteRecoveryMessage(), '연결 복구 중')
})

test('the response deadline bounds work that ignores its abort signal', async t => {
  deadlineTimers(t)
  let request: AbortSignal | undefined
  const pending = remoteDeadline(signal => { request = signal; return never<string>() })
  const rejected = assert.rejects(pending, error => {
    assert.equal((error as Error & { code: string }).code, 'response-timeout')
    return true
  })
  await flush()
  t.mock.timers.tick(9999)
  assert.equal(request?.aborted, false)
  t.mock.timers.tick(1)
  await rejected
  assert.equal(request?.aborted, true)
})

test('the response deadline includes body consumption after response headers arrive', async t => {
  deadlineTimers(t)
  let request: AbortSignal | undefined, bodyStarted = false
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
    request = init?.signal ?? undefined
    return { ok: true, status: 200, json: () => { bodyStarted = true; return never() } } as Response
  })
  const rejected = assert.rejects(remotePresence(origin, 'fixture'), error => {
    assert.equal((error as Error & { code: string }).code, 'response-timeout')
    return true
  })
  await flush()
  assert.equal(bodyStarted, true)
  t.mock.timers.tick(10_000)
  await rejected
  assert.equal(request?.aborted, true)
})

test('caller cancellation rejects ignored aborts immediately and cannot resolve late', async t => {
  deadlineTimers(t)
  const caller = new AbortController(), reason = new Error('fixture cancelled')
  let request: AbortSignal | undefined, finish!: (value: string) => void
  const pending = remoteDeadline(signal => { request = signal; return new Promise<string>(resolve => { finish = resolve }) }, caller.signal)
  const rejected = assert.rejects(pending, error => error === reason)
  await flush()
  caller.abort(reason)
  await rejected
  assert.equal(request?.reason, reason)
  finish('late success')
  t.mock.timers.tick(10_000)
  await assert.rejects(pending, error => error === reason)
})

test('already cancelled callers never start a request', async () => {
  const caller = new AbortController(), reason = new Error('fixture cancelled')
  caller.abort(reason)
  let calls = 0
  await assert.rejects(remoteDeadline(async () => { calls++; return true }, caller.signal), error => error === reason)
  assert.equal(calls, 0)
})

test('cancelling before the request microtask prevents it from starting', async () => {
  const caller = new AbortController(), reason = new Error('fixture immediate cancellation')
  let calls = 0
  const pending = remoteDeadline(async () => { calls++; return true }, caller.signal)
  caller.abort(reason)
  await assert.rejects(pending, error => error === reason)
  assert.equal(calls, 0)
})

test('completed requests remove their timeout and caller cancellation listener', async t => {
  deadlineTimers(t)
  const caller = new AbortController()
  let request: AbortSignal | undefined
  assert.equal(await remoteDeadline(async signal => { request = signal; return 'ready' }, caller.signal), 'ready')
  caller.abort(new Error('later cancellation'))
  t.mock.timers.tick(10_000)
  assert.equal(request?.aborted, false)
})

for (const online of [false, true]) test(`presence returns ${online} without credentials or cached state`, async t => {
  t.mock.method(globalThis, 'fetch', async (input: unknown, init?: RequestInit) => {
    assert.equal(String(input), `${origin}/central/presence?instance=fixture%2Fdevice`)
    assert.equal(init?.credentials, 'omit')
    assert.equal(init?.cache, 'no-store')
    assert.ok(init?.signal instanceof AbortSignal)
    return Response.json({ online })
  })
  assert.equal(await remotePresence(`${origin}/another/path`, 'fixture/device'), online)
})

test('an explicit instance-not-found response remains a terminal error', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ code: 'instance-not-found', error: 'fixture missing device' }, { status: 404 }))
  await assert.rejects(remotePresence(origin, 'fixture'), error => {
    const failure = error as Error & { status: number; code: string }
    assert.equal(failure.status, 404)
    assert.equal(failure.code, 'instance-not-found')
    assert.equal(failure.message, 'fixture missing device')
    return true
  })
})

for (const body of ['{"error":"Not found"}', '<html>Not found</html>', 'null']) test(`legacy 404 presence responses allow compatibility fallback: ${body}`, async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(body, { status: 404 }))
  assert.equal(await remotePresence(origin, 'fixture'), undefined)
})

for (const [header, expected] of [[undefined, 30_000], ['0', 0], ['2', 2000], ['300', 60_000], ['-10', 30_000], ['invalid', 30_000]] as const) {
  test(`presence rate limits use a bounded Retry-After: ${header ?? 'absent'}`, async t => {
    t.mock.method(globalThis, 'fetch', async () => Response.json({}, { status: 429, headers: header === undefined ? undefined : { 'Retry-After': header } }))
    await assert.rejects(remotePresence(origin, 'fixture'), error => {
      const failure = error as Error & { status: number; code: string; retryAfter: number }
      assert.equal(failure.status, 429)
      assert.equal(failure.code, 'rate-limited')
      assert.equal(failure.retryAfter, expected)
      return true
    })
  })
}

for (const status of [403, 429]) test(`HTML presence errors preserve their HTTP status: ${status}`, async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('<html>Try later</html>', { status, headers: { 'Retry-After': '2' } }))
  await assert.rejects(remotePresence(origin, 'fixture'), error => {
    const failure = error as Error & { status: number; code: string; retryAfter: number }
    assert.equal(failure.status, status)
    assert.equal(failure.code, status === 429 ? 'rate-limited' : 'central-unavailable')
    assert.equal(failure.retryAfter, status === 429 ? 2000 : 0)
    return true
  })
})

for (const value of [{}, { online: 'true' }, null]) test(`malformed presence bodies are rejected: ${JSON.stringify(value)}`, async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json(value))
  await assert.rejects(remotePresence(origin, 'fixture'), /연결 상태/)
})

test('a stalled presence request times out even when fetch ignores cancellation', async t => {
  deadlineTimers(t)
  t.mock.method(globalThis, 'fetch', () => never<Response>())
  const rejected = assert.rejects(remotePresence(origin, 'fixture'), error => {
    assert.equal((error as Error & { code: string }).code, 'response-timeout')
    return true
  })
  await flush()
  t.mock.timers.tick(10_000)
  await rejected
})
