import { useCallback, useEffect, useState } from 'react'
import { useWorkspaceApi } from '../api/workspace-api-context'
import type { AgentSet } from '../api/client'

/** Resolve a task binding each time the configuration changes. */
export function useAgentTaskSet(task: 'assistant' | 'projectCreation') {
  const api = useWorkspaceApi()
  const [state, setState] = useState<{ loaded: boolean; set: AgentSet | null }>({ loaded: false, set: null })
  useEffect(() => {
    let active = true, revision = 0
    const load = () => {
      const current = ++revision
      void Promise.all([api.fetchAgentTaskBindings(), api.fetchAgentSets()]).then(([{ bindings }, { sets }]) => {
        if (active && revision === current) setState({ loaded: true, set: sets.find(set => set.id === bindings[task]) ?? null })
      }).catch(() => { if (active && revision === current) setState({ loaded: true, set: null }) })
    }
    load()
    if (task === 'assistant') window.addEventListener('mew:agent-task-bindings-changed', load)
    return () => { active = false; window.removeEventListener('mew:agent-task-bindings-changed', load) }
  }, [api, task])
  return state
}

/** Manual assistant choices take precedence until the task configuration changes. */
export function useAssistantTaskSet() {
  const { set, loaded } = useAgentTaskSet('assistant')
  const [override, setOverride] = useState(false)
  useEffect(() => {
    const reset = () => setOverride(false)
    window.addEventListener('mew:agent-task-bindings-changed', reset)
    return () => window.removeEventListener('mew:agent-task-bindings-changed', reset)
  }, [])
  const choose = useCallback(() => setOverride(true), [])
  const reset = useCallback(() => setOverride(false), [])
  return { set: override ? null : set, loaded, override: choose, reset }
}
