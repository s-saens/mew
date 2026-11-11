import test from 'node:test'
import assert from 'node:assert/strict'
import type { WorkspaceClient } from '../api/client.ts'
import type { ProjectActionRun, ProjectActionsState } from '../../shared/project-actions.ts'
import { ApiResponseError } from '../api/response.ts'
import { projectActionNoticeStore, projectActionsStore, recentProjectActionRuns } from './ProjectActionsState.ts'
import { setBrowserStorageScope } from '@mew/ui/browser-storage-scope'
import { onMewcatNotice } from '../utils/mewcat-notifications.ts'

const run: ProjectActionRun = { id: 'run', actionId: 'debug', name: 'Debug build', kind: 'build', status: 'running', startedAt: '2026-11-11T00:00:00Z', output: '', artifacts: [] }
const state = (runs: ProjectActionRun[] = []): ProjectActionsState => ({ projectRoot: '/original/apps/mobile', actions: [], runs, warnings: [], needsAgent: false })

test('an unscoped action pins subsequent operations and downloads to its first canonical project root', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const calls: unknown[][] = []
  let activeRoot = '/original/apps/mobile'
  const api = {
    scope: undefined,
    fetchProjectActions: async (...args: unknown[]) => { calls.push(['read', ...args]); return { ...state(), projectRoot: activeRoot } },
    runProjectAction: async (...args: unknown[]) => { calls.push(['run', ...args]); return { run } },
    saveProjectActions: async (...args: unknown[]) => { calls.push(['save', ...args]); return state([run]) },
    projectActionArtifactUrl: (...args: unknown[]) => { calls.push(['download', ...args]); return '/artifact' },
  } as unknown as WorkspaceClient
  const store = projectActionsStore(api, { project: '.workspace', directory: 'apps/mobile' })
  await store.load()
  activeRoot = '/new/apps/mobile'
  const nextStore = projectActionsStore(api, { project: '.workspace', directory: 'apps/mobile' })
  await nextStore.load()
  assert.notEqual(nextStore, store)
  assert.equal(nextStore.getSnapshot().state?.projectRoot, '/new/apps/mobile')
  await store.run('debug')
  await store.save([])
  store.artifactUrl('run', 'app.apk')
  assert.deepEqual(calls, [
    ['read', '.workspace', 'apps/mobile', undefined],
    ['read', '.workspace', 'apps/mobile', undefined],
    ['run', '.workspace', 'debug', '', '/original/apps/mobile'],
    ['save', '.workspace', [], '', '/original/apps/mobile'],
    ['download', '.workspace', 'run', 'app.apk', '', '/original/apps/mobile'],
  ])
})

test('permanent polling failures stop until an explicit retry', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let reads = 0
  const api = {
    scope: { workspacePath: '/original', projectPath: '/original' },
    fetchProjectActions: async () => { if (++reads > 1) throw new ApiResponseError('Permission removed', 403); return state() },
    runProjectAction: async () => ({ run }),
  } as unknown as WorkspaceClient
  const store = projectActionsStore(api, { project: '.workspace', directory: '' })
  await store.load(); await store.run('debug')
  t.mock.timers.tick(1500)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(reads, 2)
  assert.equal(store.getSnapshot().error, 'Permission removed')
  t.mock.timers.tick(60_000)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(reads, 2, 'a permanent failure must not keep polling')
  await store.load()
  assert.equal(reads, 3, 'the user can retry explicitly')
})

test('a missing running result stops its watcher and retains explicit recovery', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let reads = 0
  const api = {
    scope: { workspacePath: '/original', projectPath: '/original' },
    fetchProjectActions: async () => { reads++; return state() },
    runProjectAction: async () => ({ run }),
  } as unknown as WorkspaceClient
  const store = projectActionsStore(api, { project: '.workspace', directory: '' })
  await store.load(); await store.run('debug')
  t.mock.timers.tick(1500)
  await new Promise(resolve => setImmediate(resolve))
  assert.ok(store.getSnapshot().error)
  t.mock.timers.tick(60_000)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(reads, 2)
})

test('a long build completed most recently remains visible above newer starts', () => {
  const completed = { ...run, status: 'succeeded' as const, finishedAt: '2026-11-11T20:00:00Z' }
  const newerStarts = Array.from({ length: 12 }, (_, index) => ({ ...run, id: `new-${index}`, startedAt: `2026-11-11T10:${String(index).padStart(2, '0')}:00Z` }))
  assert.equal(recentProjectActionRuns([completed, ...newerStarts])[0].id, completed.id)
})

test('automatic status reads retain a failed mutation until explicit recovery', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const api = {
    scope: { workspacePath: '/original', projectPath: '/original' },
    fetchProjectActions: async () => state([run]),
    discoverProjectActions: async () => { throw new Error('Discovery failed') },
  } as unknown as WorkspaceClient
  const store = projectActionsStore(api, { project: '.workspace', directory: '' })
  await store.load(); await store.discover()
  t.mock.timers.tick(1500)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(store.getSnapshot().error, 'Discovery failed')
  await store.load()
  assert.equal(store.getSnapshot().error, null)
})

test('background status reads wait for an action edit to finish', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let reads = 0, finishSave!: (value: ProjectActionsState) => void
  const saving = new Promise<ProjectActionsState>(resolve => { finishSave = resolve })
  const api = {
    scope: { workspacePath: '/original', projectPath: '/original' },
    fetchProjectActions: async () => { reads++; return state([run]) },
    saveProjectActions: async () => saving,
  } as unknown as WorkspaceClient
  const store = projectActionsStore(api, { project: '.workspace', directory: '' })
  await store.load()
  const write = store.save([{ id: 'release', name: 'Release', kind: 'build', command: 'npm run build' }])
  t.mock.timers.tick(1500)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(reads, 1, 'a background read cannot race the pending save')
  finishSave({ ...state([run]), actions: [{ id: 'release', name: 'Release', kind: 'build', command: 'npm run build' }] })
  await write
  assert.equal(store.getSnapshot().state?.actions[0].id, 'release')
})

test('an account switch retires old completion watchers and creates a fresh action store', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  t.after(() => setBrowserStorageScope())
  setBrowserStorageScope('first@example.test', 'instance')
  let reads = 0
  const api = {
    scope: { workspacePath: '/original', projectPath: '/original' },
    fetchProjectActions: async () => { reads++; return state([run]) },
  } as unknown as WorkspaceClient
  const scope = { project: '.workspace', directory: '', workspacePath: '/original' }
  const original = projectActionsStore(api, scope)
  await original.load()
  setBrowserStorageScope('second@example.test', 'instance')
  t.mock.timers.tick(1500)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(reads, 1)
  const next = projectActionsStore(api, scope)
  assert.notEqual(next, original)
  assert.equal(next.getSnapshot().state, null)
})

test('completion after a root switch retains the original result and download scope', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let activeRoot = '/original/apps/mobile', complete = false
  const notices: string[] = [], downloads: unknown[][] = []
  t.after(onMewcatNotice(notice => { notices.push(notice.key) }))
  const api = {
    fetchProjectActions: async (_project: string, _directory: string, workspacePath?: string) => ({ ...state(workspacePath === '/original/apps/mobile' && complete ? [{ ...run, status: 'succeeded', finishedAt: '2026-11-11T20:00:00Z' }] : []), projectRoot: workspacePath ?? activeRoot }),
    runProjectAction: async () => ({ run }),
    projectActionArtifactUrl: (...args: unknown[]) => { downloads.push(args); return '/download' },
  } as unknown as WorkspaceClient
  const original = projectActionsStore(api, { project: '.workspace', directory: 'apps/mobile' })
  await original.load(); await original.run('debug')
  activeRoot = '/new/apps/mobile'
  const next = projectActionsStore(api, { project: '.workspace', directory: 'apps/mobile' })
  await next.load()
  complete = true
  t.mock.timers.tick(1500)
  await new Promise(resolve => setImmediate(resolve))
  const key = `project-action:${JSON.stringify('/original/apps/mobile')}:run`
  assert.deepEqual(notices, [key])
  assert.equal(next.getSnapshot().state?.projectRoot, '/new/apps/mobile')
  const retained = projectActionNoticeStore(key)
  assert.equal(retained?.run.status, 'succeeded')
  retained?.store.artifactUrl('run', 'app.apk')
  assert.deepEqual(downloads, [['.workspace', 'run', 'app.apk', '', '/original/apps/mobile']])
})
