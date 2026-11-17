import { useEffect, useId, useState } from 'react'
import { DialogFrame } from '@mew/ui'
import { uiText } from '@mew/ui/i18n-core'
import { useUiLocale } from '@mew/ui/i18n'
import { useWorkspaceApi } from '../api/workspace-api-context'
import type { AgentRuntimeStatus } from '../api/client'
import { updateAgentRuntimesCache, subscribeAgentRuntimes } from '../utils/agentPickerCache'
import { AgentSetPicker } from './AgentSetPicker'
import { AgentTaskBindings } from './AgentTaskBindings'
import { RuntimeInstallProgress } from './RuntimeInstallProgress'
import { RuntimeSettingsButton } from './RuntimeSettingsModal'

export function AgentSetupModal({ onClose }: { onClose: () => void }) {
  const { fetchAgentRuntimes, installAgentRuntime } = useWorkspaceApi()
  useUiLocale()
  const titleId = useId()
  const [runtimes, setRuntimes] = useState<AgentRuntimeStatus[] | null>(null)
  const [installing, setInstalling] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void fetchAgentRuntimes().then(({ runtimes: result }) => {
      if (alive) { setRuntimes(result); updateAgentRuntimesCache(result) }
    }).catch((err: unknown) => { if (alive) setError(err instanceof Error ? err.message : String(err)) })
    return () => { alive = false }
  }, [fetchAgentRuntimes])
  useEffect(() => subscribeAgentRuntimes(setRuntimes), [])

  const install = async (id: string) => {
    setInstalling(id)
    setError(null)
    try {
      const { status } = await installAgentRuntime(id)
      if (!status.installed) throw new Error(uiText('설치 후에도 실행 파일을 찾지 못했습니다'))
      const { runtimes: result } = await fetchAgentRuntimes()
      updateAgentRuntimesCache(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      try { updateAgentRuntimesCache((await fetchAgentRuntimes()).runtimes) } catch { /* retain the reported installation error */ }
    } finally { setInstalling(null) }
  }

  const agents = runtimes?.filter(runtime => runtime.surface === 'acp')
  return <DialogFrame labelledBy={titleId} onClose={onClose} className="flex max-h-[90dvh] max-w-2xl flex-col">
    <div className="border-b border-edge px-4 py-3 text-sm font-medium text-ink" id={titleId}>{uiText('에이전트 설정')}</div>
    <div className="min-h-0 overflow-y-auto p-4">
      <h3 className="mb-2 text-sm text-ink">{uiText('에이전트 런타임')}</h3>
      {!agents ? <div className="text-xs text-ink-muted">{uiText('런타임 확인 중…')}</div> : <div className="flex flex-col gap-2">
        {agents.map(runtime => {
          const busy = installing === runtime.id || runtime.installing
          return <div key={runtime.id} className="flex flex-wrap items-center gap-2 rounded-md border border-edge bg-surface px-3 py-2">
            <span className="min-w-0 flex-1 text-sm text-ink">{runtime.label}</span>
            {runtime.installed ? <span className="text-xs text-ink-muted">{uiText('설치됨')}</span> : <button type="button" disabled={!runtime.installable || busy || installing !== null} onClick={() => void install(runtime.id)} className="rounded px-2 py-1 text-xs text-accent hover:bg-surface-raised disabled:opacity-40">{busy ? uiText('설치 중…') : uiText('설치')}</button>}
            <RuntimeSettingsButton runtimeId={runtime.id} label={runtime.label} />
            <RuntimeInstallProgress runtimeId={runtime.id} busy={busy} installation={runtime.installation} />
          </div>
        })}
      </div>}
      {error && <div role="alert" className="mt-2 whitespace-pre-wrap text-xs text-danger">{error}</div>}
      <h3 className="mb-2 mt-5 text-sm text-ink">{uiText('에이전트셋')}</h3>
      <AgentSetPicker manageOnly defaultRuntime={agents?.find(runtime => runtime.installed)?.id} onSelect={() => {}} />
      <AgentTaskBindings />
    </div>
    <div className="flex justify-end border-t border-edge px-4 py-3"><button type="button" onClick={onClose} className="rounded bg-accent px-3 py-1.5 text-xs text-ink-on-accent">{uiText('완료')}</button></div>
  </DialogFrame>
}
