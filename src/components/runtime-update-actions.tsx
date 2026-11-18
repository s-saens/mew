import { useEffect, useState } from 'react'
import { useWorkspaceApi } from '../api/workspace-api-context'
import { uiText } from '@mew/ui/i18n-core'
import type { UpdatesStatus } from '../../shared/updates'

/** Update discovery runs independently of runtime presence and never delays the picker. */
export function useRuntimeUpdates(active: boolean) {
  const { fetchUpdatesStatus, runUpdates } = useWorkspaceApi()
  const [status, setStatus] = useState<UpdatesStatus | null>(null)
  const [starting, setStarting] = useState<string | null>(null)
  const [error, setError] = useState<{ id: string; message: string } | null>(null)

  useEffect(() => {
    if (!active) return
    let alive = true
    const refresh = () => fetchUpdatesStatus().then(next => { if (alive) setStatus(next) }).catch(() => { /* No system permission or network: keep the picker usable. */ })
    void refresh()
    const timer = window.setInterval(() => { if (status?.job.running) void refresh() }, 1500)
    return () => { alive = false; window.clearInterval(timer) }
  }, [active, fetchUpdatesStatus, status?.job.running])

  const start = (id: string) => {
    setStarting(id)
    setError(null)
    void runUpdates([id]).then(setStatus).catch((err: unknown) => {
      setError({ id, message: err instanceof Error ? err.message : String(err) })
    }).finally(() => setStarting(null))
  }
  return { status, starting, error, start }
}

export function RuntimeUpdateAction({ runtimeId, updates }: { runtimeId: string; updates: ReturnType<typeof useRuntimeUpdates> }) {
  const id = `${runtimeId === 'codex' || runtimeId === 'claude' ? 'cli' : 'agent'}:${runtimeId}`
  const item = updates.status?.items.find(row => row.id === id && row.category === 'agent')
  const job = updates.status?.job.items.find(row => row.id === id)
  const running = updates.starting === id || !!updates.status?.job.running && (job?.state === 'queued' || job?.state === 'running')
  const error = updates.error?.id === id ? updates.error.message : job?.state === 'failed' ? job.error : null
  if (!item?.available || !item.canUpdate) return null
  return <>
    <button type="button" disabled={!!updates.starting || !!updates.status?.job.running} onClick={() => updates.start(id)} className="relative rounded px-2.5 py-1 text-xs text-accent hover:bg-surface-raised disabled:opacity-40">{uiText(running ? '업데이트 중…' : job?.state === 'failed' ? '다시 시도' : '업데이트')}</button>
    {error && <div role="alert" className="relative w-full basis-full whitespace-pre-wrap text-xs text-danger">{error}</div>}
  </>
}
