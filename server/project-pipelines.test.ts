import './test-isolated-data.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ProjectActionsService } from './project-actions.ts'
import { ProjectPipelinesService, normalizeProjectPipelines } from './project-pipelines.ts'
import type { ProjectPipeline } from '../shared/project-pipelines.ts'
import type { ReleaseConnectionSummary, ReleaseProviderRun } from '../shared/release-providers.ts'

const owner = 'owner@example.test'
const build = { id: 'build', name: 'Build', kind: 'build' as const, command: 'make-preview' }
const deploy = { id: 'deploy', name: 'Deploy', kind: 'deploy' as const, command: 'publish' }
const connection: ReleaseConnectionSummary = { id: 'cloud', provider: 'cloudflare-pages', label: 'My site', connected: true, config: { provider: 'cloudflare-pages', label: 'My site', accountId: 'account', projectName: 'site', branch: 'main' } }
const pipeline: ProjectPipeline = { id: 'publish', name: 'Publish', purpose: 'publish', steps: [{ id: 'build', name: 'Make', type: 'action', actionId: 'build' }, { id: 'deploy', name: 'Publish', type: 'action', actionId: 'deploy' }] }

function fixture(t: test.TestContext) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-pipelines-'))
  const root = path.join(directory, 'project'), dataDir = path.join(directory, 'state')
  fs.mkdirSync(root)
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const write = (file: string, content: unknown) => { fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), typeof content === 'string' ? content : JSON.stringify(content)) }
  return { root, dataDir, write }
}

function providers(connections: ReleaseConnectionSummary[] = []) {
  return {
    state: (_root: string, account: string) => ({ connections: account === owner ? connections : [], runs: [] }),
    start: async (_root: string, _owner: string, id: string, requestId: string): Promise<ReleaseProviderRun> => ({ id: requestId, connectionId: id, provider: 'cloudflare-pages', state: 'running', createdAt: Date.now(), updatedAt: Date.now(), providerRunId: 'external-123', steps: [] }),
    refresh: async (_root: string, _owner: string, id: string): Promise<ReleaseProviderRun> => ({ id, connectionId: 'cloud', provider: 'cloudflare-pages', state: 'succeeded', createdAt: Date.now(), updatedAt: Date.now(), resultUrl: 'https://example.test/', steps: [] }),
  }
}

test('read-only defaults offer real build, publish and connected remote targets without executing or saving', t => {
  const { root, dataDir } = fixture(t)
  const actions = new ProjectActionsService({ runner: async () => { assert.fail('Discovery executed an action') } })
  actions.save(root, [build, deploy])
  const service = new ProjectPipelinesService({ authorize: () => true, actions, providers: providers([connection]), dataDir })
  const state = service.state(root, owner)
  assert.deepEqual(state.pipelines.map(item => item.purpose), ['preview', 'publish', 'publish'])
  assert.ok(Object.values(state.readiness).every(value => value.ready))
  assert.equal(fs.existsSync(path.join(root, '.mew/project-pipelines.json')), false)
  assert.equal(service.state(root, 'other@example.test').pipelines.length, 2)
  assert.equal(fs.existsSync(dataDir), false)
  service.save(root, owner, [])
  assert.deepEqual(service.state(root, owner).pipelines, [])
})

test('sequential execution locks the root and snapshots commands before edits; first failure skips later steps', async t => {
  const { root, dataDir } = fixture(t)
  let finish!: (result: { exitCode: number }) => void
  const commands: string[] = []
  const actions = new ProjectActionsService({ runner: input => { commands.push(input.command); return input.command === build.command ? new Promise(resolve => { finish = resolve }) : Promise.resolve({ exitCode: 9 }) } })
  actions.save(root, [build, deploy, { ...deploy, id: 'after', command: 'must not run' }])
  const service = new ProjectPipelinesService({ authorize: () => true, actions, providers: providers(), dataDir })
  service.save(root, owner, [{ ...pipeline, steps: [...pipeline.steps, { id: 'after', name: 'After', type: 'action', actionId: 'after' }] }])
  const started = service.run(root, owner, 'publish', service.state(root, owner).readiness.publish?.revision)
  await new Promise(resolve => setImmediate(resolve))
  assert.throws(() => service.run(root, owner, 'publish', service.state(root, owner).readiness.publish?.revision), /실행 중/)
  assert.throws(() => service.run(root, 'other@example.test', 'publish', service.state(root, 'other@example.test').readiness.publish?.revision), /실행 중/)
  assert.throws(() => actions.run(root, 'deploy'), /실행 중/)
  actions.save(root, [build, { ...deploy, command: 'edited after start' }])
  finish({ exitCode: 0 })
  const run = await service.wait(root, owner, started.id)
  assert.equal(run.status, 'failed')
  assert.deepEqual(run.steps.map(step => step.status), ['succeeded', 'failed', 'skipped'])
  assert.deepEqual(commands, [build.command, deploy.command])
  assert.equal(service.state(root, 'other@example.test').runs.length, 0)
})

test('malformed or escaping configuration is recoverable and never silently replaced by discovery', t => {
  const { root, dataDir, write } = fixture(t)
  const actions = new ProjectActionsService(); actions.save(root, [build, deploy])
  const service = new ProjectPipelinesService({ authorize: () => true, actions, providers: providers(), dataDir })
  write('.mew/project-pipelines.json', '{broken')
  assert.equal(service.state(root, owner).needsAgent, true)
  assert.deepEqual(service.discover(root, owner).pipelines, [])
  assert.equal(fs.readFileSync(path.join(root, '.mew/project-pipelines.json'), 'utf8'), '{broken')
  assert.throws(() => service.run(root, owner, 'publish', service.state(root, owner).readiness.publish?.revision))
  assert.throws(() => normalizeProjectPipelines([{ ...pipeline, resultUrl: 'javascript:alert(1)' }]))
  assert.throws(() => normalizeProjectPipelines([{ ...pipeline, steps: [{ id: 'one', name: 'Run', type: 'command', command: 'echo unsafe' }] }]))
  assert.throws(() => normalizeProjectPipelines([{ ...pipeline, steps: [{ ...pipeline.steps[0], id: '../escape' }] }]))
  fs.unlinkSync(path.join(root, '.mew/project-pipelines.json'))
  const outside = path.join(dataDir, 'outside.json'); fs.mkdirSync(dataDir); fs.writeFileSync(outside, 'original')
  fs.symlinkSync(outside, path.join(root, '.mew/project-pipelines.json'))
  assert.equal(service.state(root, owner).needsAgent, true)
  assert.throws(() => service.save(root, owner, [pipeline]))
  assert.equal(fs.readFileSync(outside, 'utf8'), 'original')
})

test('restart preserves completed artifacts and marks local execution interrupted without replay', async t => {
  const { root, dataDir, write } = fixture(t)
  write('package.json', { scripts: { build: 'vite build' } })
  const actions = new ProjectActionsService({ runner: async () => { write('dist/index.html', 'hello'); return { exitCode: 0 } } })
  const service = new ProjectPipelinesService({ authorize: () => true, actions, providers: providers(), dataDir })
  const initial = service.state(root, owner).pipelines[0]
  const run = await service.wait(root, owner, service.run(root, owner, initial.id).id)
  const actionId = run.steps[0].actionRun!.id
  const freshActions = new ProjectActionsService({ runner: async () => { assert.fail('Restart replayed an action') } })
  const fresh = new ProjectPipelinesService({ authorize: () => true, actions: freshActions, providers: providers(), dataDir })
  assert.equal(fresh.state(root, owner).runs[0].status, 'succeeded')
  assert.equal(freshActions.artifact(root, actionId, 'dist/index.html'), path.join(root, 'dist/index.html'))
  assert.equal(freshActions.archive(root, actionId).files.length, 1)
  assert.equal(fresh.state(root, 'other@example.test').runs.length, 0)

  const pendingActions = new ProjectActionsService({ runner: async () => new Promise(() => {}) })
  const pending = new ProjectPipelinesService({ authorize: () => true, actions: pendingActions, providers: providers(), dataDir })
  pending.run(root, owner, initial.id)
  await new Promise(resolve => setImmediate(resolve))
  const afterRestart = new ProjectPipelinesService({ authorize: () => true, actions: freshActions, providers: providers(), dataDir })
  const recovered = afterRestart.state(root, owner).runs[0]
  assert.equal(recovered.status, 'interrupted')
  assert.equal(recovered.steps[0].status, 'interrupted')
})

test('external execution is dispatched once, follows its exact run and exposes only confirmed result URLs', async t => {
  const { root, dataDir } = fixture(t)
  const remote = providers([connection]), starts: string[] = [], polls: string[] = []
  const start = remote.start
  remote.start = async (...args) => { starts.push(args[3]); return start(...args) }
  const refresh = remote.refresh
  remote.refresh = async (...args) => { polls.push(args[2]); return refresh(...args) }
  const service = new ProjectPipelinesService({ authorize: () => true, actions: new ProjectActionsService(), providers: remote, dataDir, pollIntervalMs: 1 })
  const choice = service.state(root, owner).pipelines.find(item => item.purpose === 'publish')!
  const run = await service.wait(root, owner, service.run(root, owner, choice.id, service.state(root, owner).readiness[choice.id].revision).id)
  assert.equal(run.status, 'succeeded')
  assert.equal(run.resultUrl, 'https://example.test/')
  assert.equal(starts.length, 1)
  assert.deepEqual(polls, starts)
  assert.equal(run.steps[0].providerRun?.state, 'succeeded')
})

test('uncertain external dispatch and repeated polling failures never replay or run downstream steps', async t => {
  const { root, dataDir } = fixture(t)
  let calls = 0
  const remote = providers([connection])
  remote.start = async (_root, _owner, id, requestId) => { calls++; return { id: requestId, connectionId: id, provider: 'cloudflare-pages', state: 'unknown', createdAt: Date.now(), updatedAt: Date.now(), error: 'Could not confirm execution', steps: [] } }
  const actions = new ProjectActionsService({ runner: async () => { assert.fail('Ran downstream after uncertain dispatch') } }); actions.save(root, [deploy])
  const service = new ProjectPipelinesService({ authorize: () => true, actions, providers: remote, dataDir, pollIntervalMs: 1 })
  service.save(root, owner, [{ ...pipeline, steps: [{ id: 'remote', name: 'Remote', type: 'provider', connectionId: 'cloud' }, pipeline.steps[1]] }])
  const run = await service.wait(root, owner, service.run(root, owner, 'publish', service.state(root, owner).readiness.publish?.revision).id)
  assert.equal(run.status, 'unknown'); assert.equal(run.steps[1].status, 'skipped'); assert.equal(calls, 1)
  remote.start = providers([connection]).start
  let polls = 0
  remote.refresh = async () => { polls++; throw new Error('network failure') }
  const failed = await service.wait(root, owner, service.run(root, owner, 'publish', service.state(root, owner).readiness.publish?.revision).id)
  assert.equal(failed.status, 'unknown'); assert.equal(polls, 3)
})

test('execution cannot start when durable history cannot be written; readiness rejects missing or unsafe targets', t => {
  const { root, dataDir } = fixture(t)
  fs.writeFileSync(dataDir, 'not a directory')
  const actions = new ProjectActionsService({ runner: async () => { assert.fail('Started without durable intent') } }); actions.save(root, [build, deploy])
  const service = new ProjectPipelinesService({ authorize: () => true, actions, providers: providers(), dataDir })
  service.save(root, owner, [pipeline])
  assert.throws(() => service.run(root, owner, pipeline.id, service.state(root, owner).readiness[pipeline.id]?.revision), /기록|저장/)
  service.save(root, owner, [{ ...pipeline, purpose: 'preview' }])
  assert.equal(service.state(root, owner).readiness.publish.ready, false)
})

test('publishing rejects a changed reviewed action or target and never dispatches stale confirmation', t => {
  const { root, dataDir } = fixture(t)
  const actions = new ProjectActionsService({ runner: async () => { assert.fail('Stale confirmation started a process') } }); actions.save(root, [build, deploy])
  const service = new ProjectPipelinesService({ authorize: () => true, actions, providers: providers(), dataDir })
  service.save(root, owner, [pipeline])
  const revision = service.state(root, owner).readiness.publish.revision
  assert.throws(() => service.run(root, owner, 'publish'), /변경|확인/)
  actions.save(root, [build, { ...deploy, command: 'new publish destination' }])
  assert.throws(() => service.run(root, owner, 'publish', revision), /변경|확인/)
  assert.equal(service.state(root, owner).runs.length, 0)
})

test('restart blocks new work while the persisted owned process group remains alive', async t => {
  const { root, dataDir } = fixture(t)
  const actions = new ProjectActionsService({ timeoutMs: 250 })
  actions.save(root, [{ ...build, command: `${JSON.stringify(process.execPath)} -e "setInterval(()=>{},1000)"` }])
  const service = new ProjectPipelinesService({ authorize: () => true, actions, providers: providers(), dataDir })
  const id = service.state(root, owner).pipelines[0].id
  const started = service.run(root, owner, id)
  await new Promise(resolve => setTimeout(resolve, 40))
  const restoredActions = new ProjectActionsService()
  const restarted = new ProjectPipelinesService({ authorize: () => true, actions: restoredActions, providers: providers(), dataDir })
  assert.throws(() => restoredActions.run(root, 'build'), /실행 중/, 'legacy actions must check recovered processes even before opening pipeline state')
  const state = restarted.state(root, owner)
  assert.equal(state.runs[0].status, 'interrupted')
  assert.equal(restoredActions.hasOrphanedProcess(root), true)
  assert.throws(() => restarted.run(root, owner, id), /프로세스|실행/)
  assert.throws(() => restoredActions.run(root, 'build'), /실행 중/)
  await service.wait(root, owner, started.id)
})

test('manual remote refresh updates interrupted results without running skipped downstream steps', async t => {
  const { root, dataDir } = fixture(t)
  const remote = providers([connection])
  let entered!: () => void
  const entering = new Promise<void>(resolve => { entered = resolve })
  remote.refresh = async () => { entered(); return new Promise(() => {}) }
  const service = new ProjectPipelinesService({ authorize: () => true, actions: new ProjectActionsService(), providers: remote, dataDir, pollIntervalMs: 1 })
  const choice = service.state(root, owner).pipelines[0]
  const started = service.run(root, owner, choice.id, service.state(root, owner).readiness[choice.id].revision)
  await entering
  const latest = await providers().refresh(root, owner, `${started.id}:publish`)
  const updatedProviders = { ...providers([connection]), state: () => ({ connections: [connection], runs: [latest] }) }
  const restarted = new ProjectPipelinesService({ authorize: () => true, actions: new ProjectActionsService(), providers: updatedProviders, dataDir })
  const recovered = restarted.state(root, owner).runs[0]
  assert.equal(recovered.status, 'interrupted')
  assert.equal(recovered.steps[0].providerRun?.state, 'succeeded')
  assert.equal(recovered.resultUrl, 'https://example.test/')
})

test('repairing corrupt private history allows an explicit retry without overwriting the corrupt file', async t => {
  const { root, dataDir } = fixture(t)
  const actions = new ProjectActionsService({ runner: async () => ({ exitCode: 0 }) }); actions.save(root, [build])
  const initial = new ProjectPipelinesService({ authorize: () => true, actions, providers: providers(), dataDir })
  const choice = initial.state(root, owner).pipelines[0]
  await initial.wait(root, owner, initial.run(root, owner, choice.id).id)
  const file = path.join(dataDir, fs.readdirSync(dataDir)[0]), valid = fs.readFileSync(file, 'utf8')
  fs.writeFileSync(file, '{broken')
  const restarted = new ProjectPipelinesService({ authorize: () => true, actions, providers: providers(), dataDir })
  assert.equal(restarted.state(root, owner).readiness[choice.id].ready, false)
  assert.throws(() => restarted.run(root, owner, choice.id))
  assert.equal(fs.readFileSync(file, 'utf8'), '{broken')
  const malformed = JSON.parse(valid)
  malformed.records[0].run.steps = [null]
  fs.writeFileSync(file, JSON.stringify(malformed))
  assert.equal(restarted.state(root, owner).readiness[choice.id].ready, false)
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).records[0].run.steps, [null])
  fs.writeFileSync(file, valid)
  assert.equal(restarted.state(root, owner).readiness[choice.id].ready, true)
  assert.equal((await restarted.wait(root, owner, restarted.run(root, owner, choice.id).id)).status, 'succeeded')
})

test('account recreation hides previous history and stops a pending downstream execution', async t => {
  const { root, dataDir } = fixture(t)
  let version = 1, finish!: (value: { exitCode: number }) => void
  const commands: string[] = []
  const actions = new ProjectActionsService({ runner: input => { commands.push(input.command); return new Promise(resolve => { finish = resolve }) } }); actions.save(root, [build, deploy])
  const service = new ProjectPipelinesService({ authorize: () => true, actions, providers: providers(), dataDir, accountVersion: () => version })
  service.save(root, owner, [pipeline])
  const started = service.run(root, owner, pipeline.id, service.state(root, owner).readiness[pipeline.id].revision)
  await new Promise(resolve => setImmediate(resolve))
  version = 2
  assert.equal(service.state(root, owner).runs.length, 0)
  await assert.rejects(service.wait(root, owner, started.id))
  finish({ exitCode: 0 })
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(commands, [build.command])
  version = 1
  const run = await service.wait(root, owner, started.id)
  assert.equal(run.status, 'failed')
  assert.equal(run.steps[1].status, 'skipped')
})

test('revoking execution permission during a build prevents the following external publication', async t => {
  const { root, dataDir } = fixture(t)
  let allowed = true, dispatches = 0, finish!: (value: { exitCode: number }) => void
  const remote = providers([connection])
  remote.start = async () => { dispatches++; assert.fail('Published after permission revocation') }
  const actions = new ProjectActionsService({ runner: async () => new Promise(resolve => { finish = resolve }) }); actions.save(root, [build])
  const service = new ProjectPipelinesService({ authorize: () => allowed, actions, providers: remote, dataDir })
  service.save(root, owner, [{ ...pipeline, steps: [pipeline.steps[0], { id: 'remote', name: 'Publish', type: 'provider', connectionId: 'cloud' }] }])
  const started = service.run(root, owner, 'publish', service.state(root, owner).readiness.publish.revision)
  await new Promise(resolve => setImmediate(resolve))
  allowed = false; finish({ exitCode: 0 })
  const completed = await service.wait(root, owner, started.id)
  assert.equal(completed.status, 'failed')
  assert.equal(completed.steps[1].status, 'skipped')
  assert.equal(dispatches, 0)
})

test('replacing a project directory at the same path never inherits history or artifact authority', async t => {
  const { root, dataDir, write } = fixture(t)
  write('package.json', { scripts: { build: 'vite build' } })
  const actions = new ProjectActionsService({ runner: async () => { write('dist/index.html', 'original output'); return { exitCode: 0 } } })
  const service = new ProjectPipelinesService({ authorize: () => true, actions, providers: providers(), dataDir })
  const choice = service.state(root, owner).pipelines[0]
  const run = await service.wait(root, owner, service.run(root, owner, choice.id).id)
  fs.renameSync(root, `${root}.previous`); fs.mkdirSync(root)
  write('package.json', { scripts: { build: 'vite build' } }); write('dist/index.html', 'replacement output')
  assert.deepEqual(service.state(root, owner).runs, [])
  assert.throws(() => actions.artifact(root, run.steps[0].actionRun!.id, 'dist/index.html'))
  assert.throws(() => actions.archive(root, run.steps[0].actionRun!.id))
  const afterRestart = new ProjectPipelinesService({ authorize: () => true, actions: new ProjectActionsService(), providers: providers(), dataDir })
  assert.deepEqual(afterRestart.state(root, owner).runs, [])
})

test('restart recovers a dispatched external run by exact request ID when the pipeline snapshot was not saved', async t => {
  const { root, dataDir } = fixture(t)
  let entered!: () => void
  const entering = new Promise<void>(resolve => { entered = resolve })
  const remote = providers([connection])
  remote.refresh = async () => { entered(); return new Promise(() => {}) }
  const service = new ProjectPipelinesService({ authorize: () => true, actions: new ProjectActionsService(), providers: remote, dataDir, pollIntervalMs: 1 })
  const choice = service.state(root, owner).pipelines[0]
  const started = service.run(root, owner, choice.id, service.state(root, owner).readiness[choice.id].revision)
  await entering
  const file = path.join(dataDir, fs.readdirSync(dataDir)[0]), saved = JSON.parse(fs.readFileSync(file, 'utf8'))
  delete saved.records[0].run.steps[0].providerRun
  fs.writeFileSync(file, JSON.stringify(saved))
  const exact = { ...await providers().refresh(root, owner, `${started.id}:publish`), providerRunId: 'confirmed-external', url: 'https://provider.test/confirmed-external' }
  const requests: string[] = []
  const recoveredProviders = { ...providers([connection]), state: () => ({ connections: [connection], runs: [exact] }), findByRequestId: (_root: string, _owner: string, requestId: string) => { requests.push(requestId); return requestId === `${started.id}:publish` ? exact : undefined } }
  const restarted = new ProjectPipelinesService({ authorize: () => true, actions: new ProjectActionsService(), providers: recoveredProviders, dataDir })
  const run = restarted.state(root, owner).runs[0]
  assert.deepEqual(requests, [`${started.id}:publish`])
  assert.equal(run.status, 'interrupted')
  assert.equal(run.steps[0].providerRun?.providerRunId, 'confirmed-external')
  assert.equal(run.resultUrl, 'https://example.test/')
})

test('deleting or replacing a running project settles its waiter and releases the lock without unhandled rejection', async t => {
  const rejected: unknown[] = []
  const observe = (error: unknown) => rejected.push(error)
  process.on('unhandledRejection', observe)
  t.after(() => process.off('unhandledRejection', observe))
  for (const change of ['delete', 'replace'] as const) {
    const { root, dataDir } = fixture(t)
    let finish!: (result: { exitCode: number }) => void
    const actions = new ProjectActionsService({ runner: async () => new Promise(resolve => { finish = resolve }) })
    actions.save(root, [build])
    const service = new ProjectPipelinesService({ authorize: () => true, actions, providers: providers(), dataDir })
    const choice = service.state(root, owner).pipelines[0]
    const started = service.run(root, owner, choice.id)
    const waiting = service.wait(root, owner, started.id)
    await new Promise(resolve => setImmediate(resolve))
    if (change === 'delete') fs.rmSync(root, { recursive: true })
    else { fs.renameSync(root, `${root}.previous`); fs.mkdirSync(root) }
    finish({ exitCode: 0 })
    const completed = await waiting
    assert.ok(['failed', 'unknown'].includes(completed.status))
    assert.ok(completed.finishedAt)
    if (change === 'delete') fs.mkdirSync(root)
    assert.doesNotThrow(() => actions.reserve(root, 'subsequent-work'))
    actions.release(root, 'subsequent-work')
  }
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(rejected, [])
})
