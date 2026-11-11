import test from 'node:test'
import assert from 'node:assert/strict'
import type { WorkspaceClient } from '../api/client.ts'
import type { ProjectPipelineRun, ProjectPipelinesState } from '../../shared/project-pipelines.ts'
import { ApiResponseError } from '../api/response.ts'
import { projectReleaseStore, projectReleaseNoticeStore } from './ProjectReleaseState.ts'
import { setBrowserStorageScope } from '@mew/ui/browser-storage-scope'
import { onMewcatNotice } from '../utils/mewcat-notifications.ts'

const run: ProjectPipelineRun = { id: 'pipeline-run', pipelineId: 'preview', name: 'Preview', purpose: 'preview', status: 'running', startedAt: '2026-11-11T00:00:00Z', source: { dirty: null }, steps: [] }
const state = (runs: ProjectPipelineRun[] = []): ProjectPipelinesState => ({ projectRoot: '/original/app', pipelines: [], runs, readiness: {}, warnings: [], needsAgent: false })
const tick = () => new Promise(resolve => setImmediate(resolve))
const fixture = (patch: Record<string, unknown> = {}) => ({
  scope: { workspacePath: '/original', projectPath: '/original' },
  fetchProjectPipelines: async () => state(),
  fetchReleaseProviders: async () => ({ connections: [], runs: [] }),
  fetchProjectActions: async () => ({ projectRoot: '/original/app', actions: [], runs: [], warnings: [], needsAgent: false }),
  discoverProjectPipelines: async () => state(),
  runProjectPipeline: async () => ({ run }),
  ...patch,
}) as unknown as WorkspaceClient

test('delivery pins every later request and download to the first canonical root', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const calls: unknown[][] = []
  const api = fixture({ scope: undefined,
    runProjectPipeline: async (...args: unknown[]) => { calls.push(args); return { run } },
    projectActionArchiveUrl: (...args: unknown[]) => { calls.push(args); return '/zip' },
  })
  const store = projectReleaseStore(api, { project: '.workspace', directory: 'app' })
  await store.load()
  await store.run('preview', 'reviewed-revision')
  store.archiveUrl('action-run')
  assert.deepEqual(calls, [
    ['.workspace', 'preview', '', '/original/app', 'reviewed-revision'],
    ['.workspace', 'action-run', '', '/original/app'],
  ])
})

test('a failed external connection read preserves usable local pipelines and recovery', async () => {
  const api = fixture({ fetchReleaseProviders: async () => { throw new Error('Connection storage unavailable') } })
  const store = projectReleaseStore(api, { project: '.workspace', directory: '' })
  await store.load()
  assert.equal(store.getSnapshot().state?.projectRoot, '/original/app')
  assert.match(store.getSnapshot().error ?? '', /Connection storage unavailable/)
  assert.ok(store.getSnapshot().actions)
})

test('delivery stops polling after access revocation and never retries dispatch automatically', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let reads = 0, starts = 0
  const store = projectReleaseStore(fixture({
    fetchProjectPipelines: async () => { if (++reads > 1) throw new ApiResponseError('Access revoked', 403); return state([run]) },
    runProjectPipeline: async () => { starts++; throw new Error('Dispatch outcome unknown') },
  }), { project: '.workspace', directory: '' })
  await store.load(); await store.run('preview')
  t.mock.timers.tick(2000); await tick()
  const stopped = reads
  t.mock.timers.tick(60_000); await tick()
  assert.equal(reads, stopped)
  assert.equal(starts, 1)
  assert.equal(store.getSnapshot().error, 'Dispatch outcome unknown')
})

test('closed delivery dialogs retain scoped completion notices and account changes retire the store', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  t.after(() => setBrowserStorageScope())
  setBrowserStorageScope('delivery-first@example.test', 'instance')
  let complete = false, reads = 0
  const notices: string[] = []
  t.after(onMewcatNotice(notice => { notices.push(notice.key) }))
  const api = fixture({ fetchProjectPipelines: async () => { reads++; return state([{ ...run, status: complete ? 'succeeded' : 'running' }]) } })
  const scope = { project: '.workspace', directory: '', workspacePath: '/original/app' }
  const store = projectReleaseStore(api, scope)
  await store.load()
  complete = true
  t.mock.timers.tick(2000); await tick()
  assert.equal(notices.length, 1)
  assert.equal(projectReleaseNoticeStore(notices[0])?.store, store)
  assert.equal(store.getSnapshot().state?.runs[0].status, 'succeeded')
  setBrowserStorageScope('delivery-second@example.test', 'instance')
  const before = reads
  await store.load(); await store.run('preview')
  assert.equal(reads, before)
  assert.equal(projectReleaseNoticeStore(notices[0]), undefined)
  assert.notEqual(projectReleaseStore(api, scope), store)
})

test('a successful connection save remains successful when the following status refresh fails', async () => {
  let saved = 0, reads = 0
  const store = projectReleaseStore(fixture({
    fetchProjectPipelines: async () => { if (++reads > 1) throw new Error('Status unavailable'); return state() },
    saveReleaseConnection: async () => { saved++; return { connections: [], runs: [] } },
  }), { project: '.workspace', directory: '' })
  await store.load()
  await assert.doesNotReject(store.saveConnection({ config: { provider: 'cloudflare-pages', label: 'Site', accountId: 'account', projectName: 'site', branch: 'main' }, token: 'fixture' }))
  assert.equal(saved, 1)
  assert.equal(store.getSnapshot().error, 'Status unavailable')
})

test('connecting offers a publishing flow without dispatching it', async () => {
  const calls: string[] = []
  const store = projectReleaseStore(fixture({
    saveReleaseConnection: async () => { calls.push('save'); return { connections: [], runs: [] } },
    discoverProjectPipelines: async () => { calls.push('discover'); return state() },
    runProjectPipeline: async () => { calls.push('run'); return { run } },
  }), { project: '.workspace', directory: '' })
  await store.load()
  await store.saveConnection({ config: { provider: 'github-actions', label: 'Website', owner: 'example', repo: 'site', workflow: 'publish.yml', ref: 'main' }, token: 'fixture' })
  assert.deepEqual(calls, ['save', 'discover'])
})

test('a delayed status response cannot replace a saved pipeline definition', async () => {
  let release!: (value: ProjectPipelinesState) => void, reads = 0
  const stale = new Promise<ProjectPipelinesState>(resolve => { release = resolve })
  const saved = { ...state(), pipelines: [{ id: 'new', name: 'New', purpose: 'preview', steps: [] }] } as ProjectPipelinesState
  const store = projectReleaseStore(fixture({
    fetchProjectPipelines: async () => ++reads === 2 ? stale : reads > 2 ? saved : state(),
    saveProjectPipelines: async () => saved,
  }), { project: '.workspace', directory: '', workspacePath: '/original/app' })
  await store.load()
  const loading = store.load()
  await tick()
  await store.save(saved.pipelines)
  release(state()); await loading
  assert.equal(store.getSnapshot().state?.pipelines[0].id, 'new')
})
