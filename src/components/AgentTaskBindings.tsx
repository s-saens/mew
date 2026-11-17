import { useEffect, useState } from 'react'
import { SelectField } from '@mew/ui'
import { uiText } from '@mew/ui/i18n-core'
import { useWorkspaceApi } from '../api/workspace-api-context'
import { cachedAgentSets, refreshAgentSets, subscribeAgentSets } from '../utils/agentPickerCache'
import type { AgentTask, AgentTaskBindings as Bindings } from '../../shared/agent-task-bindings'

const tasks = [
  { id: 'assistant', label: 'Mew 도우미' },
  { id: 'gitCommit', label: 'AI 커밋' },
  { id: 'schedule', label: '예약 작업' },
  { id: 'projectCreation', label: 'Create with AI' },
] as const satisfies readonly { id: AgentTask; label: string }[]

export function AgentTaskBindings() {
  const { fetchAgentTaskBindings, saveAgentTaskBindings } = useWorkspaceApi()
  const [sets, setSets] = useState(cachedAgentSets)
  const [bindings, setBindings] = useState<Bindings | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    void Promise.all([refreshAgentSets(), fetchAgentTaskBindings()]).then(([items, result]) => {
      if (active) { setSets(items); setBindings(result.bindings) }
    }).catch(err => { if (active) setError(err instanceof Error ? err.message : String(err)) })
    return () => { active = false }
  }, [fetchAgentTaskBindings])
  useEffect(() => subscribeAgentSets(setSets), [])
  const change = async (task: AgentTask, value: string) => {
    if (!bindings || busy) return
    setBusy(true); setError(null)
    try {
      setBindings((await saveAgentTaskBindings({ ...bindings, [task]: value })).bindings)
      window.dispatchEvent(new Event('mew:agent-task-bindings-changed'))
    }
    catch (err) { setError(err instanceof Error ? err.message : String(err)) }
    finally { setBusy(false) }
  }
  return <section className="mt-5">
    <h3 className="mb-2 text-sm text-ink">{uiText('작업별 에이전트셋')}</h3>
    <div className="grid gap-2 sm:grid-cols-2">{tasks.map(task => <div key={task.id}><div className="mb-1 text-xs text-ink-muted">{uiText(task.label)}</div><SelectField label={uiText(task.label)} value={sets?.some(set => set.id === bindings?.[task.id]) ? bindings?.[task.id] ?? '' : ''} disabled={!bindings || busy} onChange={value => void change(task.id, value)} options={[{ value: '', label: uiText('직접 선택') }, ...(sets ?? []).map(set => ({ value: set.id, label: set.name }))]} /></div>)}</div>
    {error && <div role="alert" className="mt-2 text-xs text-danger">{error}</div>}
  </section>
}
