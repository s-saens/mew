import assert from 'node:assert/strict'
import test from 'node:test'
import { FEATURES } from '../../shared/access-policy.ts'
import { DemoWorkspaceStore } from './workspace-store.ts'
import { demoFetch } from './transport.ts'

const write = (method: string, body: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
async function data(store: DemoWorkspaceStore, route: string, init?: RequestInit) {
  const response = await demoFetch(store, route, init)
  assert.equal(response.status, 200, `${route}: ${await response.clone().text()}`)
  return response.json()
}

test('every capability is visible and host fixtures have useful data', async t => {
  const store = new DemoWorkspaceStore(); t.after(() => store.close())
  const auth = await data(store, '/api/auth/me')
  for (const feature of FEATURES) assert.equal(auth.capabilities[feature], true, feature)
  const stats = await data(store, '/api/system-stats')
  assert.match(stats.cpu.model, /Demo/); assert.ok(stats.cpu.usage > 0 && stats.cpu.usage < 100)
  assert.equal(stats.memory.used + stats.memory.available, stats.memory.total)
  assert.ok(stats.gpus.length && stats.processes.length)
  assert.equal((await data(store, '/api/mew-update/status')).available, true)
  assert.equal((await data(store, '/api/updates/status')).items.length, 3)
})

test('schedule edits, run logs and updates are tab-local and resettable', async t => {
  const store = new DemoWorkspaceStore(), other = new DemoWorkspaceStore()
  t.after(() => { store.close(); other.close() })
  const { jobs } = await data(store, '/api/schedules')
  jobs[0].name = '내 예약 작업'
  await data(store, '/api/schedules', write('PUT', { jobs }))
  const { session } = await data(store, '/api/schedules/run', write('POST', { id: jobs[0].id }))
  assert.match(store.getState(`tmux-session-output:${session}`, ''), /시뮬레이션/)
  assert.ok((await data(store, '/api/schedules')).jobs[0].lastRun)
  assert.notEqual((await data(other, '/api/schedules')).jobs[0].name, jobs[0].name)
  await data(store, '/api/updates/run', write('POST', { ids: ['demo-desktop'] }))
  assert.equal((await data(store, '/api/updates/status')).items.find((item: { id: string }) => item.id === 'demo-desktop').available, false)
  await data(store, '/api/mew-actions/update/run', { method: 'POST' })
  assert.equal((await data(store, '/api/mew-update/status')).available, false)
  const scope = { runtime: 'codex', tab: 'demo-agent', cwd: store.workspacePath }
  const { job } = await data(store, '/api/agent/scheduled-prompts', write('POST', { ...scope, text: '나중에 검토', at: '2030-01-01T00:00:00Z' }))
  const params = new URLSearchParams(scope)
  assert.equal((await data(store, `/api/agent/scheduled-prompts?${params}`)).jobs.length, 1)
  await data(store, `/api/agent/scheduled-prompts/${job.id}?${params}`, { method: 'DELETE' })
  assert.deepEqual((await data(store, `/api/agent/scheduled-prompts?${params}`)).jobs, [])
  store.reset()
  assert.equal((await data(store, '/api/mew-update/status')).available, true)
  assert.equal((await data(store, '/api/schedules')).jobs[0].lastRun, null)
  assert.equal(store.gitWorkingTree().files.length, 0)
})

test('retired Android routes and capability are absent from the demo', async t => {
  const store = new DemoWorkspaceStore(); t.after(() => store.close())
  const auth = await data(store, '/api/auth/me')
  assert.equal(Object.hasOwn(auth.capabilities, 'android'), false)
  for (const [route, method] of [
    ['/api/android/status', 'GET'],
    ['/api/android-url?url=http://localhost:8080', 'GET'],
    ['/api/android/commands/emulator/run', 'POST'],
  ]) {
    const response = await demoFetch(store, route, { method })
    assert.equal(response.status, 501, route)
  }
  assert.deepEqual(store.getState('tmux-sessions', []), [])
})

test('administrator actions and debugger stepping change only mock state', async t => {
  const store = new DemoWorkspaceStore(); t.after(() => store.close())
  await data(store, '/api/admin/users', write('POST', { email: 'new@example.test', role: 'member' }))
  const settings = await data(store, '/api/admin/access/feature', write('PUT', { subject: 'new@example.test', feature: 'desktop', enabled: true }))
  assert.equal(settings.rows.find((row: { subject: string }) => row.subject === 'new@example.test').capabilities.desktop, true)
  assert.ok((await data(store, '/api/admin/access/path?project=.workspace&path=src')).entries.length)
  await data(store, '/api/admin/mewlink/requests/demo-request/approve', write('POST', {}))
  assert.equal((await data(store, '/api/admin/mewlink')).links.length, 1)
  const initial = await data(store, '/api/debugger')
  await data(store, '/api/debugger/command', write('POST', { command: 'next', arguments: {} }))
  const next = await data(store, '/api/debugger')
  assert.equal(next.session.stopRevision, initial.session.stopRevision + 1)
  const evaluated = await data(store, '/api/debugger/command', write('POST', { command: 'evaluate', arguments: { expression: 'step' } }))
  assert.equal(evaluated.result, '2')
  assert.equal(store.gitWorkingTree().files.length, 0)
})

test('administrator account deletion protects the current owner and clears only that account access', async t => {
  const store = new DemoWorkspaceStore(), other = new DemoWorkspaceStore()
  t.after(() => { store.close(); other.close() })
  const current = store.authStatus().email!
  assert.equal((await demoFetch(store, `/api/admin/users/${encodeURIComponent(current)}`, { method: 'DELETE' })).status, 400)
  await data(store, '/api/admin/users', write('POST', { email: 'other-owner@example.test', role: 'owner' }))
  const self = await demoFetch(store, `/api/admin/users/${encodeURIComponent(current)}`, { method: 'DELETE' })
  assert.equal(self.status, 400)
  assert.match((await self.json() as { error: string }).error, /현재 로그인한 계정/)
  const subject = 'member@example.test'
  await data(store, '/api/admin/access/feature', write('PUT', { subject, feature: 'terminal', enabled: true }))
  await data(store, '/api/admin/access/path', write('PUT', { subject, project: '.workspace', path: 'src', access: 'deny' }))
  await data(store, `/api/admin/users/${encodeURIComponent(subject)}`, { method: 'DELETE' })
  assert.ok((await data(store, '/api/admin/users')).every((user: { email: string }) => user.email !== subject))
  assert.ok((await data(other, '/api/admin/users')).some((user: { email: string }) => user.email === subject))
  await data(store, '/api/admin/users', write('POST', { email: subject, role: 'member' }))
  const settings = await data(store, '/api/admin/access')
  assert.equal(settings.rows.find((row: { subject: string }) => row.subject === subject).capabilities.terminal, false)
  const permission = (await data(store, '/api/admin/access/path?project=.workspace&path=src')).permissions.find((row: { subject: string }) => row.subject === subject)
  assert.equal(permission.explicit, null)
  assert.equal((await demoFetch(store, '/api/admin/users/missing', { method: 'DELETE' })).status, 404)
  assert.equal(store.gitWorkingTree().files.length, 0)
})
