import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import type { ProjectAction } from '../shared/project-actions.ts'
import type { ProjectPipelineRun, ProjectPipelinesState, ProjectPipelineStepRun, ProjectPipelineStepStatus } from '../shared/project-pipelines.ts'
import type { ReleaseConnectionConfig, ReleaseConnectionSummary, ReleaseProviderRun, ReleaseProvidersState } from '../shared/release-providers.ts'
import { DATA_DIR } from './dataDir.ts'
import { ProjectActionError, ProjectActionsService, projectActionsService } from './project-actions.ts'
import { releaseProvidersService } from './release-providers.ts'
import { defaultPipelines, normalizeProjectPipelines, pipelineRoot, readPipelines, writePipelines } from './project-pipelines-config.ts'
import { PipelineStore, type PipelineRecord } from './project-pipelines-store.ts'
import { getUser } from './auth.ts'
import { canUse } from './access-policy.ts'

export { normalizeProjectPipelines } from './project-pipelines-config.ts'

export interface PipelineProviders {
  state(root: string, owner: string): ReleaseProvidersState
  start(root: string, owner: string, connectionId: string, requestId: string, expectedConfig?: ReleaseConnectionConfig): Promise<ReleaseProviderRun>
  refresh(root: string, owner: string, runId: string): Promise<ReleaseProviderRun>
  findByRequestId?(root: string, owner: string, requestId: string): ReleaseProviderRun | undefined
}

interface Options {
  actions?: ProjectActionsService
  providers?: PipelineProviders
  dataDir?: string
  pollIntervalMs?: number
  pollTimeoutMs?: number
  accountVersion?: (owner: string) => number | null
  authorize?: (owner: string, version: number | null) => boolean
}

function account(value: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 500 || /[\0\r\n]/.test(value)) throw new ProjectActionError('계정 범위가 필요합니다.', 403)
  return value.trim().toLowerCase()
}

function sourceState(root: string): ProjectPipelineRun['source'] {
  try {
    const options = { cwd: root, encoding: 'utf8' as const, timeout: 1_500, maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] as ['ignore', 'pipe', 'ignore'], env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } }
    const commit = execFileSync('git', ['rev-parse', '--verify', 'HEAD'], options).trim()
    const dirty = !!execFileSync('git', ['status', '--porcelain', '--untracked-files=normal', '-z'], options)
    return { commit, dirty }
  } catch { return { dirty: null } }
}

export class ProjectPipelinesService {
  private readonly actions: ProjectActionsService
  private readonly providers: PipelineProviders
  private readonly store: PipelineStore
  private readonly tasks = new Map<string, Promise<ProjectPipelineRun>>()
  private readonly pollIntervalMs: number
  private readonly pollTimeoutMs: number
  private readonly accountVersion: (owner: string) => number | null
  private readonly authorize: (owner: string, version: number | null) => boolean

  constructor(options: Options = {}) {
    this.actions = options.actions ?? projectActionsService
    this.providers = options.providers ?? releaseProvidersService
    this.store = new PipelineStore(options.dataDir ?? path.join(DATA_DIR, 'project-pipelines'))
    this.actions.setRecoveryLoader(root => { this.load(root) })
    this.pollIntervalMs = options.pollIntervalMs ?? 1_500
    this.pollTimeoutMs = options.pollTimeoutMs ?? 20 * 60_000
    this.accountVersion = options.accountVersion ?? (owner => getUser(owner)?.createdAt ?? null)
    this.authorize = options.authorize ?? ((owner, version) => {
      const user = getUser(owner)
      return !!user && user.createdAt === version && !user.mustChangePassword && ['owner', 'manager'].includes(user.role)
        && canUse({ role: user.role, email: owner, mustChangePassword: user.mustChangePassword }, 'terminal')
    })
  }

  state(directory: string, owner: string): ProjectPipelinesState {
    const root = pipelineRoot(directory), email = account(owner), config = readPipelines(root)
    const warnings = [...config.warnings]
    const records = this.load(root)
    if (this.store.errors.has(root)) warnings.push(this.store.errors.get(root)!)
    const actionState = this.actions.state(root)
    let connections: ReleaseConnectionSummary[] = [], remoteRuns: ReleaseProviderRun[] = []
    try { const providerState = this.providers.state(root, email); connections = providerState.connections; remoteRuns = providerState.runs }
    catch { warnings.push('공개 서비스 연결을 읽을 수 없습니다. 연결 설정을 확인하세요.') }
    let refreshed = false
    for (const record of records.filter(item => item.owner === email && item.ownerVersion === this.accountVersion(email))) {
      for (const step of record.run.steps) {
        let attached = false
        if (step.type === 'provider' && !step.providerRun) {
          try {
            const exact = this.providers.findByRequestId?.(root, email, `${record.run.id}:${step.id}`)
            if (exact) { step.providerRun = exact; refreshed = true; attached = true }
          } catch { if (!warnings.includes('외부 실행 기록을 확인할 수 없습니다. 서비스 연결과 기록 저장 위치를 확인하세요.')) warnings.push('외부 실행 기록을 확인할 수 없습니다. 서비스 연결과 기록 저장 위치를 확인하세요.') }
        }
        const remote = step.providerRun && remoteRuns.find(item => item.id === step.providerRun!.id && item.updatedAt >= step.providerRun!.updatedAt)
        if (!remote || !attached && JSON.stringify(remote) === JSON.stringify(step.providerRun)) continue
        step.providerRun = structuredClone(remote); refreshed = true
        if (record.run.status !== 'running' && ['unknown', 'interrupted'].includes(step.status)) {
          step.status = remote.state === 'succeeded' ? 'succeeded' : remote.state === 'failed' || remote.state === 'cancelled' ? 'failed' : 'unknown'
          if (remote.state === 'succeeded' && remote.resultUrl) record.run.resultUrl = remote.resultUrl
        }
      }
    }
    if (refreshed) { try { this.store.save(root) } catch { warnings.push('서비스의 최신 실행 결과를 저장할 수 없습니다. 기록 저장 위치와 권한을 확인하세요.') } }
    const pipelines = config.saved ? config.pipelines : defaultPipelines(actionState.actions, connections)
    if (!pipelines.length && !config.invalid) warnings.push('미리보기 또는 공개 방법이 아직 준비되지 않았습니다. 작업이나 서비스를 연결하거나 에이전트에게 설정을 요청하세요.')
    const readiness: ProjectPipelinesState['readiness'] = {}
    for (const pipeline of pipelines) {
      const issues: string[] = [], resolvedActions: ProjectAction[] = [], resolvedConnections: ReleaseConnectionConfig[] = []
      let publishes = false
      for (const step of pipeline.steps) {
        if (step.type === 'action') {
          const action = actionState.actions.find(item => item.id === step.actionId)
          if (!action) issues.push(`${step.name}: 실행할 작업이 없습니다.`)
          else {
            resolvedActions.push(action)
            if (action.kind === 'deploy') { publishes = true; if (pipeline.purpose === 'preview') issues.push('미리보기에는 공개 작업을 넣을 수 없습니다.') }
          }
        } else {
          const connection = connections.find(item => item.id === step.connectionId)
          if (!connection?.connected) issues.push(`${step.name}: 이 계정에서 서비스 연결이 필요합니다.`)
          if (connection) resolvedConnections.push(connection.config)
          publishes = true
          if (pipeline.purpose === 'preview') issues.push('외부 공개 서비스는 공개 흐름에서 실행하세요.')
        }
      }
      if (pipeline.purpose === 'publish' && !publishes) issues.push('공개할 작업이나 서비스를 선택하세요.')
      if (this.store.errors.has(root)) issues.push('실행 기록을 먼저 복구하세요.')
      if (this.actions.hasOrphanedProcess(root)) issues.push('이전에 실행한 프로세스가 종료된 뒤 다시 실행하세요.')
      const revision = createHash('sha256').update(JSON.stringify({ pipeline, actions: resolvedActions, connections: resolvedConnections })).digest('hex')
      readiness[pipeline.id] = { ready: !issues.length, issues: [...new Set(issues)], revision }
    }
    return { projectRoot: root, pipelines: structuredClone(pipelines), runs: structuredClone(records.filter(record => record.owner === email && record.ownerVersion === this.accountVersion(email)).map(record => record.run)), readiness, warnings,
      needsAgent: config.invalid || !pipelines.length || Object.values(readiness).some(item => !item.ready) }
  }

  save(directory: string, owner: string, input: unknown): ProjectPipelinesState {
    const root = pipelineRoot(directory)
    account(owner)
    writePipelines(root, normalizeProjectPipelines(input))
    return this.state(root, owner)
  }

  discover(directory: string, owner: string): ProjectPipelinesState {
    const root = pipelineRoot(directory), email = account(owner), config = readPipelines(root)
    if (config.invalid) return this.state(root, email)
    const defaults = defaultPipelines(this.actions.state(root).actions, this.providers.state(root, email).connections)
    const pipelines = config.saved ? [...config.pipelines, ...defaults.filter(candidate => !config.pipelines.some(item => item.id === candidate.id))] : defaults
    if (pipelines.length) writePipelines(root, normalizeProjectPipelines(pipelines))
    return this.state(root, email)
  }

  run(directory: string, owner: string, id: unknown, expectedRevision?: unknown): ProjectPipelineRun {
    const root = pipelineRoot(directory), email = account(owner), state = this.state(root, email)
    const pipeline = typeof id === 'string' ? state.pipelines.find(item => item.id === id) : undefined
    if (!pipeline) throw new ProjectActionError('실행할 미리보기나 공개 방법을 찾을 수 없습니다.', 404)
    const records = this.store.histories.get(root)!
    if (records.some(record => record.run.status === 'running')) throw new ProjectActionError('프로젝트에서 이미 실행 중인 작업이 있습니다.', 409)
    const ready = state.readiness[pipeline.id]
    if (!ready.ready) throw new ProjectActionError(ready.issues.join('\n'), 409)
    if ((pipeline.purpose === 'publish' || expectedRevision !== undefined) && (typeof expectedRevision !== 'string' || expectedRevision !== ready.revision)) throw new ProjectActionError('확인한 실행 설정이 변경되었습니다. 현재 내용을 확인한 뒤 다시 실행하세요.', 409)
    const currentActions = this.actions.state(root).actions, connections = this.providers.state(root, email).connections
    const resolvedActions = pipeline.steps.flatMap(step => step.type === 'action' ? [currentActions.find(item => item.id === step.actionId)] : [])
    const resolvedConnections = pipeline.steps.flatMap(step => step.type === 'provider' ? [connections.find(item => item.id === step.connectionId)?.config] : [])
    const snapshotRevision = createHash('sha256').update(JSON.stringify({ pipeline, actions: resolvedActions, connections: resolvedConnections })).digest('hex')
    if (snapshotRevision !== ready.revision) throw new ProjectActionError('실행 설정이 변경되었습니다. 현재 내용을 확인한 뒤 다시 실행하세요.', 409)
    const run: ProjectPipelineRun = { id: randomUUID(), pipelineId: pipeline.id, name: pipeline.name, purpose: pipeline.purpose, status: 'running', startedAt: new Date().toISOString(), source: sourceState(root), steps: pipeline.steps.map(step => ({ ...step, status: 'pending' })) }
    const record: PipelineRecord = { owner: email, ownerVersion: this.accountVersion(email), run, actions: {}, connections: {}, actionRecords: {}, ...(pipeline.resultUrl ? { resultUrl: pipeline.resultUrl } : {}) }
    for (const step of pipeline.steps) {
      if (step.type === 'action') record.actions[step.id] = structuredClone(currentActions.find(item => item.id === step.actionId)!)
      else record.connections[step.id] = structuredClone(connections.find(item => item.id === step.connectionId)!.config)
    }
    if (!this.canContinue(record)) throw new ProjectActionError('계정이나 실행 권한을 확인하세요.', 403)
    this.actions.reserve(root, run.id)
    records.unshift(record)
    try { this.store.save(root) }
    catch (error) { records.splice(records.indexOf(record), 1); this.actions.release(root, run.id); throw error }
    const task = Promise.resolve().then(() => this.execute(root, record))
    this.tasks.set(run.id, task)
    void task.finally(() => this.tasks.delete(run.id))
    return structuredClone(run)
  }

  async wait(directory: string, owner: string, id: string): Promise<ProjectPipelineRun> {
    const root = pipelineRoot(directory), email = account(owner)
    const record = this.load(root).find(record => record.owner === email && record.ownerVersion === this.accountVersion(email) && record.run.id === id)
    if (!record) throw new ProjectActionError('해당 실행 기록을 찾을 수 없습니다.', 404)
    return structuredClone(await (this.tasks.get(id) ?? Promise.resolve(record.run)))
  }

  private load(root: string): PipelineRecord[] {
    const { records, fresh } = this.store.load(root)
    if (fresh) {
      let recovered = false
      for (const record of records) {
        if (record.run.status === 'running') {
          record.run.status = 'interrupted'; record.run.finishedAt = new Date().toISOString()
          record.run.error = 'Mew가 다시 시작되어 실행을 이어가지 않았습니다. 외부 작업은 서비스에서 상태를 확인하세요. 자동으로 다시 실행하지 않습니다.'
          for (const step of record.run.steps) {
            if (step.status === 'running') { step.status = step.type === 'provider' ? 'unknown' : 'interrupted'; step.finishedAt = record.run.finishedAt }
            if (step.status === 'pending') step.status = 'skipped'
          }
          recovered = true
        }
        for (const action of Object.values(record.actionRecords)) this.actions.restoreRun(root, action)
      }
      if (recovered) { try { this.store.save(root) } catch { this.store.errors.set(root, '중단된 실행 기록을 저장할 수 없습니다. 기록 저장 위치와 권한을 확인하세요.') } }
    }
    return records
  }

  private async execute(root: string, record: PipelineRecord): Promise<ProjectPipelineRun> {
    const run = record.run
    try {
      for (const step of run.steps) {
        if (!this.canContinue(record)) throw new ProjectActionError('계정이나 실행 권한이 변경되어 다음 단계를 실행하지 않았습니다.', 403)
        step.status = 'running'; step.startedAt = new Date().toISOString(); this.store.save(root)
        if (step.type === 'action') await this.executeAction(root, record, step)
        else await this.executeProvider(root, record, step)
        step.finishedAt = new Date().toISOString(); this.store.save(root)
        const status = step.status as ProjectPipelineStepStatus
        if (status !== 'succeeded') {
          run.status = status === 'unknown' ? 'unknown' : 'failed'
          run.error = step.error ?? '실행을 완료하지 못했습니다. 해당 단계의 결과를 확인하세요.'
          break
        }
      }
      if (run.status === 'running') {
        run.status = 'succeeded'
        const result = [...run.steps].reverse().find(step => step.providerRun?.resultUrl || step.actionRun?.previewUrl)
        run.resultUrl = result?.providerRun?.resultUrl ?? record.resultUrl ?? result?.actionRun?.previewUrl
      }
    } catch (error) {
      const active = run.steps.find(step => step.status === 'running')
      const uncertain = active?.type === 'provider'
      run.status = uncertain ? 'unknown' : 'failed'
      run.error = error instanceof ProjectActionError ? error.message : '실행 결과를 확인할 수 없습니다. 단계별 기록을 확인하세요.'
      if (active) { active.status = uncertain ? 'unknown' : 'failed'; active.error = run.error; active.finishedAt = new Date().toISOString() }
    } finally {
      for (const step of run.steps) if (step.status === 'pending') step.status = 'skipped'
      run.finishedAt = new Date().toISOString()
      try { this.store.save(root) }
      catch { run.status = 'unknown'; run.error = '최종 실행 기록을 저장할 수 없습니다. 결과를 확인한 뒤 기록 저장 위치와 권한을 복구하세요.'; this.store.errors.set(root, run.error) }
      this.actions.release(root, run.id)
    }
    return structuredClone(run)
  }

  private canContinue(record: PipelineRecord): boolean {
    if (record.ownerVersion !== this.accountVersion(record.owner)) return false
    return this.authorize(record.owner, record.ownerVersion)
  }

  private async executeAction(root: string, record: PipelineRecord, step: ProjectPipelineStepRun): Promise<void> {
    let lastSaved = 0, persistenceError: unknown
    const started = this.actions.runSnapshot(root, record.actions[step.id], record.run.id, update => {
      step.actionRun = update
      record.actionRecords[step.id] = this.actions.exportRun(root, update.id)
      if (Date.now() - lastSaved > 500) {
        try { this.store.save(root); lastSaved = Date.now() } catch (error) { persistenceError = error }
      }
    })
    step.actionRun = started
    try { this.store.save(root) } catch (error) { persistenceError = error }
    const completed = await this.actions.wait(root, started.id)
    step.actionRun = completed
    record.actionRecords[step.id] = this.actions.exportRun(root, completed.id)
    step.status = completed.status
    if (persistenceError) throw persistenceError
    if (step.status === 'failed') step.error = '작업을 완료하지 못했습니다. 실행 기록을 확인하세요.'
  }

  private async executeProvider(root: string, record: PipelineRecord, step: ProjectPipelineStepRun): Promise<void> {
    if (step.type !== 'provider') return
    const expectedConfig = record.connections[step.id]
    const connection = this.providers.state(root, record.owner).connections.find(item => item.id === step.connectionId)
    if (!connection?.connected || JSON.stringify(connection.config) !== JSON.stringify(expectedConfig)) {
      step.status = 'failed'; step.error = '서비스 연결이나 공개 대상이 변경되었습니다. 현재 설정을 확인하고 다시 실행하세요.'; return
    }
    if (!this.canContinue(record)) { step.status = 'failed'; step.error = '계정이나 실행 권한이 변경되어 공개 요청을 보내지 않았습니다.'; return }
    let current = await this.providers.start(root, record.owner, step.connectionId, `${record.run.id}:${step.id}`, expectedConfig)
    step.providerRun = current; this.store.save(root)
    const deadline = Date.now() + this.pollTimeoutMs
    let failures = 0
    while (current.state === 'queued' || current.state === 'running') {
      if (!this.canContinue(record)) { step.status = 'unknown'; step.error = '계정이나 실행 권한이 변경되어 상태 확인을 중단했습니다. 외부 서비스에서 상태를 확인하세요.'; return }
      if (Date.now() >= deadline) { step.status = 'unknown'; step.error = '아직 완료를 확인하지 못했습니다. 서비스에서 실행 상태를 확인하세요. 자동으로 다시 실행하지 않습니다.'; return }
      await delay(this.pollIntervalMs)
      try { current = await this.providers.refresh(root, record.owner, current.id); failures = 0 }
      catch {
        if (++failures >= 3) { step.status = 'unknown'; step.error = '서비스 실행 결과를 확인할 수 없습니다. 서비스에서 상태를 확인하세요. 자동으로 다시 실행하지 않습니다.'; return }
        continue
      }
      step.providerRun = current; this.store.save(root)
    }
    step.status = current.state === 'succeeded' ? 'succeeded' : current.state === 'unknown' ? 'unknown' : 'failed'
    if (step.status !== 'succeeded') step.error = current.error ?? '서비스에서 작업을 완료하지 못했습니다. 실행 결과를 확인하세요.'
  }
}

export const projectPipelinesService = new ProjectPipelinesService()
