import { mergeAgentTabs, type AgentTabsState } from '../../shared/agent-tabs.ts'

export type AgentTabsWrite = AgentTabsState & { base?: AgentTabsState; initialize?: boolean }

/** Serialize account saves and rebase unsaved edits over other devices' tab changes. */
export function createAgentTabsSync(initial: AgentTabsState, options: {
  read: () => Promise<AgentTabsState | null>
  write: (value: AgentTabsWrite) => Promise<AgentTabsState>
  apply: (value: AgentTabsState, initial: boolean) => void
  ready: () => void
  onError: (error: unknown) => void
}) {
  let value = initial, base: AgentTabsState | null = null
  let version = 0, dirty = false, requested = false, disposed = false, restored = false
  let running: Promise<void> | null = null
  const equal = (a: AgentTabsState, b: AgentTabsState) => JSON.stringify(a) === JSON.stringify(b)
  const apply = (next: AgentTabsState) => {
    value = next
    options.apply(next, !restored)
    restored = true
  }
  const reconcile = (saved: AgentTabsState, previous: AgentTabsState, revision: number) => {
    base = saved
    if (version === revision) { dirty = false; apply(saved) }
    else { apply(mergeAgentTabs(saved, previous, value)); requested = true }
  }
  async function drain() {
    while (requested && !disposed) {
      requested = false
      const revision = version
      try {
        if (dirty && base) {
          const submitted = value
          const saved = await options.write({ ...submitted, base })
          if (disposed) return
          reconcile(saved, submitted, revision)
          requested = true
        } else {
          const previous = base ?? initial
          let saved = await options.read()
          if (disposed) return
          if (saved === null) {
            const submitted = value, submittedVersion = version
            saved = await options.write({ ...submitted, initialize: true })
            if (disposed) return
            reconcile(saved, submitted, submittedVersion)
          } else if (dirty || version !== revision) {
            base = saved
            apply(mergeAgentTabs(saved, previous, value))
            requested = true
          } else reconcile(saved, previous, revision)
        }
      } catch (error) {
        if (!disposed) options.onError(error)
        requested = false
      } finally {
        if (!disposed) options.ready()
      }
    }
  }
  function run(): Promise<void> {
    if (running || disposed) return running ?? Promise.resolve()
    running = drain().finally(() => {
      running = null
      if (requested && !disposed) void run()
    })
    return running
  }
  return {
    refresh() { requested = true; return run() },
    change(next: AgentTabsState) {
      if (disposed || equal(value, next)) return
      value = next
      dirty = true
      version++
      requested = true
      void run()
    },
    dispose() { disposed = true },
  }
}
