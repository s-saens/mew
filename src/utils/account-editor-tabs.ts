import type { StoredTabs } from './editor-tab-state.ts'

export type AccountEditorTabs = Record<string, StoredTabs>
export type AccountEditorTabsSnapshot = { state: AccountEditorTabs | null; revision: number }
type PendingTabs = { state: StoredTabs; version: number; initialize: boolean }

/** One controller owns exactly one account and logical workspace for its lifetime. */
export function createAccountEditorTabsSync(options: {
  read: (signal: AbortSignal) => Promise<AccountEditorTabsSnapshot>
  write: (project: string, state: StoredTabs, initialize: boolean, signal: AbortSignal) => Promise<AccountEditorTabsSnapshot>
  apply: (value: AccountEditorTabs) => void
  onError: (error: unknown) => void
}) {
  const pending = new Map<string, PendingTabs>(), initializedProjects = new Set<string>()
  let serverTabs: AccountEditorTabs = {}, serverRevision = -1, applied = ''
  let hydrated = false, disposed = false, running = false, refreshRequested = false
  let localVersion = 0, refreshVersion = 0, request: AbortController | undefined

  function apply() {
    const next = { ...serverTabs }
    for (const [project, value] of pending) next[project] = value.state
    const serialized = JSON.stringify(next)
    if (serialized !== applied) { applied = serialized; options.apply(next) }
  }
  function accept(snapshot: AccountEditorTabsSnapshot) {
    if (snapshot.revision < serverRevision) return
    serverTabs = snapshot.state ?? {}
    serverRevision = snapshot.revision
    hydrated = true
    apply()
  }
  async function run() {
    if (running || disposed) return
    running = true
    try {
      while (!disposed) {
        const first = pending.entries().next().value
        if (hydrated && first) {
          const [project, value] = first
          request = new AbortController()
          const saved = await options.write(project, value.state, value.initialize, request.signal)
          if (disposed) return
          if (pending.get(project)?.version === value.version) pending.delete(project)
          accept(saved)
          // A different device may have committed after this write's snapshot.
          refreshRequested = true
        } else if (refreshRequested) {
          const version = localVersion, refresh = refreshVersion
          refreshRequested = false
          request = new AbortController()
          const saved = await options.read(request.signal)
          if (disposed) return
          if (version !== localVersion || refresh !== refreshVersion || pending.size) {
            refreshRequested = true
            continue
          }
          accept(saved)
        } else break
      }
    } catch (error) {
      if (!disposed) options.onError(error)
      // Keep explicit unsaved edits; a later signal, reconnect or edit retries them.
    } finally { running = false; request = undefined }
  }
  return {
    refresh() {
      if (disposed) return
      refreshVersion++
      refreshRequested = true
      void run()
    },
    change(project: string, state: StoredTabs) {
      // Initial server hydration must succeed before a browser may migrate its cache.
      if (disposed || !hydrated) return
      const queued = pending.get(project), serialized = JSON.stringify(state)
      if (queued && JSON.stringify(queued.state) === serialized) { void run(); return }
      if (!queued && Object.hasOwn(serverTabs, project) && JSON.stringify(serverTabs[project]) === serialized) return
      const initialize = !Object.hasOwn(serverTabs, project) && !initializedProjects.has(project)
      initializedProjects.add(project)
      pending.set(project, { state, version: ++localVersion, initialize })
      apply()
      void run()
    },
    dispose() { disposed = true; pending.clear(); request?.abort() },
  }
}
