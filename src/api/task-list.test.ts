import test from 'node:test'
import assert from 'node:assert/strict'
import { configureAppRuntime, type AppTransport } from '../runtime/app-runtime.ts'
import { fetchTaskList, patchTaskList } from './task-list.ts'

const task = { id: 'a', text: 'Task', done: false }
const board = { tasks: [task], tags: ['work'], tagColors: {}, canEdit: true }
function transport(fetch: AppTransport['fetch']) {
  configureAppRuntime({ transport: { fetch, socket() { throw new Error('unused') }, close() {} } })
}

test('task requests preserve owner, workspace and change payload through the app transport', async () => {
  const requests: { url: string; init?: RequestInit }[] = []
  transport(async (url, init) => { requests.push({ url: String(url), init }); return Response.json(board) })
  try {
    assert.deepEqual(await fetchTaskList('/space dir', 'a+b@example.com'), board)
    assert.deepEqual(await patchTaskList('/space dir', [], 'a+b@example.com', [], ['work']), board)
    assert.equal(requests[0].url, '/api/task-list?workspace=%2Fspace%20dir')
    assert.equal(new Headers(requests[0].init?.headers).get('X-Mew-Task-Owner'), 'a%2Bb%40example.com')
    assert.equal(requests[1].init?.method, 'PATCH')
    assert.deepEqual(JSON.parse(String(requests[1].init?.body)), { workspace: '/space dir', changes: [], tagColorChanges: [], deletedTags: ['work'] })
    assert.ok(requests.every(request => request.init?.signal instanceof AbortSignal))
  } finally { configureAppRuntime({}) }
})

test('both task reads and writes preserve HTTP errors and malformed error bodies', async () => {
  try {
    for (const status of [400, 403, 409, 500, 503]) {
      for (const malformed of [false, true]) {
        transport(async () => malformed ? new Response('not JSON', { status, statusText: 'Failure' }) : Response.json({ error: 'failed' }, { status }))
        for (const request of [() => fetchTaskList('/workspace', 'owner'), () => patchTaskList('/workspace', [], 'owner')]) {
          await assert.rejects(request, error => error instanceof Error && (error as Error & { status: number }).status === status)
        }
      }
    }
  } finally { configureAppRuntime({}) }
})

test('task requests reject malformed JSON and invalid successful boards as format errors', async () => {
  const invalid: unknown[] = [null, {}, { ...board, canEdit: 'true' }, { ...board, tasks: [task, task] },
    { ...board, tasks: [null] }, { ...board, tasks: [{ ...task, done: 'false' }] },
    { ...board, tasks: [{ ...task, id: '' }] }, { ...board, tasks: [{ ...task, path: 1 }] },
    { ...board, tasks: [{ ...task, date: '2026-02-30' }] },
    { ...board, tasks: [{ ...task, date: '2026-10-01', startDate: '2026-10-02' }] },
    { ...board, tasks: [{ ...task, tags: ['Bad Tag'] }] }, { ...board, tasks: [{ ...task, assignees: [7] }] },
    { ...board, tags: ['Bad Tag'] }, { ...board, tagColors: { work: -1 } }]
  try {
    for (const value of invalid) {
      transport(async () => Response.json(value))
      await assert.rejects(() => fetchTaskList('/workspace', 'owner'), SyntaxError)
      await assert.rejects(() => patchTaskList('/workspace', [], 'owner'), SyntaxError)
    }
    transport(async () => new Response('not JSON'))
    await assert.rejects(() => patchTaskList('/workspace', [], 'owner'), SyntaxError)
  } finally { configureAppRuntime({}) }
})

test('task authentication errors retain the shared session-expired notification', async () => {
  const globals = globalThis as unknown as { window?: EventTarget }
  const previous = globals.window
  globals.window = new EventTarget()
  let notifications = 0
  globals.window.addEventListener('mew:auth-expired', () => notifications++)
  transport(async () => Response.json({ error: 'expired' }, { status: 401 }))
  try {
    for (const request of [() => fetchTaskList('/workspace', 'owner'), () => patchTaskList('/workspace', [], 'owner')]) {
      await assert.rejects(request, error => error instanceof Error && (error as Error & { status: number }).status === 401)
    }
    assert.equal(notifications, 2)
  } finally {
    configureAppRuntime({})
    if (previous === undefined) delete globals.window
    else globals.window = previous
  }
})

test('the task request timeout applies while waiting for headers and the response body', async t => {
  for (const bodyStarted of [false, true]) {
    const controller = new AbortController()
    t.mock.method(AbortSignal, 'timeout', (milliseconds: number) => {
      assert.equal(milliseconds, 30_000)
      return controller.signal
    })
    transport(async (_url, init) => {
      assert.equal(init?.signal, controller.signal)
      if (bodyStarted) {
        return new Response(new ReadableStream({ start(stream) {
          init!.signal!.addEventListener('abort', () => stream.error(init!.signal!.reason), { once: true })
          queueMicrotask(() => controller.abort(new DOMException('Timed out', 'TimeoutError')))
        } }))
      }
      return new Promise((_resolve, reject) => {
        init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason), { once: true })
        queueMicrotask(() => controller.abort(new DOMException('Timed out', 'TimeoutError')))
      })
    })
    try {
      await assert.rejects(() => fetchTaskList('/workspace', 'owner'), error => error instanceof Error && error.name === 'TimeoutError')
    } finally { configureAppRuntime({}); t.mock.restoreAll() }
  }
})
