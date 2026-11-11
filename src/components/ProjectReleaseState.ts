import type { ProjectPipeline, ProjectPipelineRun, ProjectPipelinesState } from '../../shared/project-pipelines.ts'
import type { ReleaseProvidersState, SaveReleaseConnection } from '../../shared/release-providers.ts'
import type { ProjectActionsState } from '../../shared/project-actions.ts'
import type { WorkspaceClient } from '../api/client.ts'
import type { ProjectActionsScope } from './ProjectActionsState.ts'
import { remoteStorageName } from '@mew/ui/browser-storage-scope'
import { publishMewcatNotice } from '../utils/mewcat-notifications.ts'
import { AUTOMATIC_RETRY_LIMIT } from '../utils/recovery-policy.ts'
import { ApiResponseError } from '../api/response.ts'
import { getUiLocale } from '@mew/ui/i18n-core'
import { projectActionsCopy } from './project-actions-copy.ts'

export interface ProjectReleaseSnapshot {
  state: ProjectPipelinesState | null
  providers: ReleaseProvidersState | null
  actions: ProjectActionsState | null
  loading: boolean
  busy: boolean
  error: string | null
}

const stores = new WeakMap<WorkspaceClient, Map<string, ProjectReleaseStore>>()
const notices = new Map<string, { store: ProjectReleaseStore; run: ProjectPipelineRun }>()

/** A delivery keeps its captured workspace and completion watcher after its dialog closes. */
export class ProjectReleaseStore {
  private snapshot: ProjectReleaseSnapshot = { state: null, providers: null, actions: null, loading: false, busy: false, error: null }
  private listeners = new Set<() => void>()
  private watching = new Set<string>()
  private timer: ReturnType<typeof setTimeout> | null = null
  private pending: Promise<void> | null = null
  private generation = 0
  private failures = 0
  private operationError: string | null = null
  private readonly account = remoteStorageName('mew:project-delivery')
  readonly api: WorkspaceClient
  scope: ProjectActionsScope

  constructor(api: WorkspaceClient, scope: ProjectActionsScope) { this.api = api; this.scope = { ...scope } }
  get active() { return this.current() }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  getSnapshot = () => this.snapshot
  private update(patch: Partial<ProjectReleaseSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch }
    this.listeners.forEach(listener => listener())
  }
  private current() {
    if (this.account === remoteStorageName('mew:project-delivery')) return true
    this.watching.clear()
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    return false
  }
  private schedule() {
    if (this.timer) clearTimeout(this.timer)
    this.timer = this.current() && this.watching.size && this.failures <= AUTOMATIC_RETRY_LIMIT
      ? setTimeout(() => { this.timer = null; void this.load(false) }, 2000 * Math.max(1, this.failures)) : null
  }
  private receive(state: ProjectPipelinesState) {
    let missing = false
    for (const id of this.watching) if (!state.runs.some(run => run.id === id)) { this.watching.delete(id); missing = true }
    for (const run of state.runs) {
      if (run.status === 'running') this.watching.add(run.id)
      else if (this.watching.delete(run.id)) {
        const key = `project-pipeline:${JSON.stringify(state.projectRoot)}:${run.id}`
        notices.set(key, { store: this, run })
        if (notices.size > 30) notices.delete(notices.keys().next().value!)
        publishMewcatNotice({ key, source: run.name, kind: run.status === 'succeeded' ? 'complete' : 'error', level: run.status === 'succeeded' ? 'success' : 'danger' })
      }
    }
    this.update({ state, error: this.operationError ?? (missing ? projectActionsCopy(getUiLocale()).resultUnavailable : null) })
  }
  private async read(generation: number) {
    const { project, directory, workspacePath } = this.scope
    const state = await this.api.fetchProjectPipelines(project, directory, workspacePath)
    if (!this.current() || generation !== this.generation) return
    if (!this.api.scope && !this.scope.workspacePath) this.scope = { project: '.workspace', directory: '', workspacePath: state.projectRoot }
    this.receive(state)
    const pinned = this.scope
    const [providers, actions] = await Promise.allSettled([
      this.api.fetchReleaseProviders(pinned.project, pinned.directory, pinned.workspacePath),
      this.api.fetchProjectActions(pinned.project, pinned.directory, pinned.workspacePath),
    ])
    if (!this.current() || generation !== this.generation) return
    const errors: string[] = []
    if (providers.status === 'fulfilled') this.update({ providers: providers.value })
    else errors.push(providers.reason instanceof Error ? providers.reason.message : String(providers.reason))
    if (actions.status === 'fulfilled') this.update({ actions: actions.value })
    else errors.push(actions.reason instanceof Error ? actions.reason.message : String(actions.reason))
    if (errors.length && !this.operationError) this.update({ error: errors.join(' · ') })
    this.failures = 0
  }
  private readFailure(error: unknown, generation: number) {
    if (!this.current() || generation !== this.generation) return
    const permanent = error instanceof ApiResponseError && error.status < 500 && error.status !== 408 && error.status !== 429
    this.failures = permanent ? AUTOMATIC_RETRY_LIMIT + 1 : this.failures + 1
    this.update({ error: this.operationError ?? (error instanceof Error ? error.message : String(error)) })
  }
  load = (retry = true): Promise<void> => {
    if (!this.current() || this.snapshot.busy) return Promise.resolve()
    if (this.pending) return this.pending
    if (retry) { this.failures = 0; this.operationError = null }
    this.update({ loading: true })
    const generation = this.generation
    this.pending = this.read(generation).catch(error => this.readFailure(error, generation))
      .finally(() => { this.pending = null; this.update({ loading: false }); this.schedule() })
    return this.pending
  }
  private async mutate(operation: () => Promise<unknown>, applied?: (value: unknown) => void) {
    if (!this.current()) return
    if (this.snapshot.busy) throw new Error(projectActionsCopy(getUiLocale()).busy)
    const generation = ++this.generation
    this.operationError = null
    this.update({ busy: true, error: null })
    try {
      const result = await operation()
      if (!this.current()) return
      applied?.(result)
      // A saved connection or dispatched run remains accepted if the subsequent status read fails.
      await this.read(generation).catch(error => this.readFailure(error, generation))
    } catch (error) {
      if (this.current()) {
        this.operationError = error instanceof Error ? error.message : String(error)
        this.update({ error: this.operationError })
      }
      throw error
    } finally { this.update({ busy: false }); this.schedule() }
  }
  run = async (id: string, expectedRevision?: string) => {
    const { project, directory, workspacePath } = this.scope
    try {
      await this.mutate(() => this.api.runProjectPipeline(project, id, directory, workspacePath, expectedRevision), value => {
        const { run } = value as { run: ProjectPipelineRun }
        this.watching.add(run.id)
        if (this.snapshot.state) this.receive({ ...this.snapshot.state, runs: [run, ...this.snapshot.state.runs.filter(item => item.id !== run.id)] })
      })
    } catch { /* The recoverable operation error is retained in the snapshot; dispatch is never retried. */ }
  }
  save = async (pipelines: ProjectPipeline[]) => {
    const { project, directory, workspacePath } = this.scope
    await this.mutate(() => this.api.saveProjectPipelines(project, pipelines, directory, workspacePath), value => this.receive(value as ProjectPipelinesState))
  }
  saveConnection = async (input: SaveReleaseConnection) => {
    const { project, directory, workspacePath } = this.scope
    await this.mutate(async () => {
      const providers = await this.api.saveReleaseConnection(project, input, directory, workspacePath)
      if (!this.current()) return
      this.update({ providers })
      // Connecting is an explicit setup action: offer its new publishing flow without running it.
      try { this.receive(await this.api.discoverProjectPipelines(project, directory, workspacePath)) }
      catch (error) { this.readFailure(error, this.generation) }
    })
  }
  removeConnection = async (id: string) => {
    const { project, directory, workspacePath } = this.scope
    await this.mutate(() => this.api.removeReleaseConnection(project, id, directory, workspacePath), value => this.update({ providers: value as ReleaseProvidersState }))
  }
  refreshProvider = async (runId: string) => {
    const { project, directory, workspacePath } = this.scope
    try { await this.mutate(() => this.api.refreshReleaseProvider(project, runId, directory, workspacePath)) }
    catch { /* Only an existing remote execution was queried; keep recovery available. */ }
  }
  artifactUrl = (runId: string, file: string) => this.api.projectActionArtifactUrl(this.scope.project, runId, file, this.scope.directory, this.scope.workspacePath)
  archiveUrl = (runId: string) => this.api.projectActionArchiveUrl(this.scope.project, runId, this.scope.directory, this.scope.workspacePath)
}

export const projectReleaseNoticeStore = (key: string) => { const result = notices.get(key); return result?.store.active ? result : undefined }
export function projectReleaseStore(api: WorkspaceClient, scope: ProjectActionsScope) {
  if (!api.scope && !scope.workspacePath) return new ProjectReleaseStore(api, scope)
  let scoped = stores.get(api)
  if (!scoped) { scoped = new Map(); stores.set(api, scoped) }
  const key = JSON.stringify([remoteStorageName('mew:project-delivery'), scope.project, scope.directory, scope.workspacePath])
  let store = scoped.get(key)
  if (!store) { store = new ProjectReleaseStore(api, scope); scoped.set(key, store) }
  return store
}
