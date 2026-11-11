import type { ProjectAction, ProjectActionRun, ProjectActionsState } from '../../shared/project-actions'
import type { WorkspaceClient } from '../api/client'
import { publishMewcatNotice } from '../utils/mewcat-notifications.ts'
import { getUiLocale } from '@mew/ui/i18n-core'
import { projectActionsCopy } from './project-actions-copy.ts'
import { AUTOMATIC_RETRY_LIMIT } from '../utils/recovery-policy.ts'
import { ApiResponseError } from '../api/response.ts'
import { remoteStorageName } from '@mew/ui/browser-storage-scope'

export type ProjectActionsScope = { project: string; directory: string; workspacePath?: string }
type Snapshot = { state: ProjectActionsState | null; loading: boolean; busy: boolean; error: string | null }

const stores = new WeakMap<WorkspaceClient, Map<string, ProjectActionsStore>>()
const noticeStores = new Map<string, { store: ProjectActionsStore; run: ProjectActionRun }>()

/** A running action keeps its immutable scope and completion watcher when its menu closes. */
class ProjectActionsStore {
  snapshot: Snapshot = { state: null, loading: false, busy: false, error: null }
  private listeners = new Set<() => void>()
  private watching = new Set<string>()
  private timer: ReturnType<typeof setTimeout> | null = null
  private pendingRead: Promise<void> | null = null
  private generation = 0
  private failures = 0
  private operationError: string | null = null
  private accountScope = remoteStorageName('mew:project-actions')
  readonly api: WorkspaceClient
  private scope: ProjectActionsScope

  constructor(api: WorkspaceClient, scope: ProjectActionsScope) { this.api = api; this.scope = scope }

  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  getSnapshot = () => this.snapshot
  private update(patch: Partial<Snapshot>) {
    this.snapshot = { ...this.snapshot, ...patch }
    this.listeners.forEach(listener => listener())
  }

  private receive(state: ProjectActionsState) {
    if (!this.isCurrentAccount()) return
    if (!this.api.scope && !this.scope.workspacePath) this.scope = { project: '.workspace', directory: '', workspacePath: state.projectRoot }
    const missing = [...this.watching].some(id => !state.runs.some(run => run.id === id))
    for (const id of this.watching) if (!state.runs.some(run => run.id === id)) this.watching.delete(id)
    for (const run of state.runs) {
      if (run.status === 'running') this.watching.add(run.id)
      else if (this.watching.delete(run.id)) {
        const key = `project-action:${JSON.stringify(state.projectRoot)}:${run.id}`
        noticeStores.set(key, { store: this, run })
        if (noticeStores.size > 30) noticeStores.delete(noticeStores.keys().next().value!)
        publishMewcatNotice({ key, source: run.name, kind: run.status === 'succeeded' ? 'complete' : 'error', level: run.status === 'succeeded' ? 'success' : 'danger' })
      }
    }
    this.failures = 0
    this.update({ state, error: missing ? projectActionsCopy(getUiLocale()).resultUnavailable : this.operationError })
    this.schedule()
  }

  private schedule() {
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = this.watching.size && this.failures <= AUTOMATIC_RETRY_LIMIT ? setTimeout(() => { this.timer = null; void this.load(false) }, 1500 * Math.max(1, this.failures)) : null
  }

  private isCurrentAccount() {
    if (this.accountScope === remoteStorageName('mew:project-actions')) return true
    this.watching.clear()
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
    return false
  }

  load = (retry = true): Promise<void> => {
    if (!this.isCurrentAccount()) return Promise.resolve()
    if (this.snapshot.busy) return Promise.resolve()
    if (this.pendingRead) return this.pendingRead
    if (retry) { this.failures = 0; this.operationError = null }
    const generation = this.generation
    const { project, directory, workspacePath } = this.scope
    this.update({ loading: true })
    this.pendingRead = this.api.fetchProjectActions(project, directory, workspacePath)
      .then(state => { if (generation === this.generation) this.receive(state) })
      .catch(error => {
        if (generation === this.generation) {
          const permanent = error instanceof ApiResponseError && error.status < 500 && error.status !== 408 && error.status !== 429
          this.failures = permanent ? AUTOMATIC_RETRY_LIMIT + 1 : this.failures + 1
          this.update({ error: this.operationError ?? (error instanceof Error ? error.message : String(error)) })
        }
      })
      .finally(() => { this.pendingRead = null; this.update({ loading: false }); this.schedule() })
    return this.pendingRead
  }

  private async mutate<T>(operation: () => Promise<T>, apply: (result: T) => void) {
    if (this.snapshot.busy) throw new Error(projectActionsCopy(getUiLocale()).busy)
    this.generation++
    this.operationError = null
    this.update({ busy: true, error: null })
    try { const result = await operation(); this.operationError = null; apply(result) }
    finally { this.update({ busy: false }); this.schedule() }
  }

  save = async (actions: ProjectAction[]) => {
    const { project, directory, workspacePath } = this.scope
    await this.mutate(() => this.api.saveProjectActions(project, actions, directory, workspacePath), state => this.receive(state))
  }

  discover = async () => {
    const { project, directory, workspacePath } = this.scope
    try {
      await this.mutate(() => this.api.discoverProjectActions(project, directory, workspacePath), state => this.receive(state))
    } catch (error) { this.recordOperationError(error) }
  }

  run = async (id: string) => {
    const { project, directory, workspacePath } = this.scope
    try {
      await this.mutate(() => this.api.runProjectAction(project, id, directory, workspacePath), ({ run }) => {
        this.watching.add(run.id)
        const previous = this.snapshot.state
        if (previous) this.receive({ ...previous, runs: [run, ...previous.runs.filter(item => item.id !== run.id)] })
      })
    } catch (error) { this.recordOperationError(error) }
  }

  private recordOperationError(error: unknown) {
    this.operationError = error instanceof Error ? error.message : String(error)
    this.update({ error: this.operationError })
  }

  artifactUrl = (runId: string, path: string) => {
    const scope = this.scope
    return this.api.projectActionArtifactUrl(scope.project, runId, path, scope.directory, scope.workspacePath)
  }

  archiveUrl = (runId: string) => {
    const scope = this.scope
    return this.api.projectActionArchiveUrl(scope.project, runId, scope.directory, scope.workspacePath)
  }
}

export const projectActionNoticeStore = (key: string) => noticeStores.get(key)

export function projectActionsStore(api: WorkspaceClient, scope: ProjectActionsScope) {
  if (!api.scope && !scope.workspacePath) return new ProjectActionsStore(api, { ...scope })
  const key = JSON.stringify([remoteStorageName('mew:project-actions'), scope.project, scope.directory, scope.workspacePath])
  let byScope = stores.get(api)
  if (!byScope) { byScope = new Map(); stores.set(api, byScope) }
  let store = byScope.get(key)
  if (!store) { store = new ProjectActionsStore(api, { ...scope }); byScope.set(key, store) }
  return store
}

export function recentProjectActionRuns(runs: ProjectActionRun[]) {
  return [...runs].sort((a, b) => (b.finishedAt ?? b.startedAt).localeCompare(a.finishedAt ?? a.startedAt)).slice(0, 10)
}
