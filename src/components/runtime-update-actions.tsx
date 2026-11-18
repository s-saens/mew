import { useEffect, useState } from 'react'
import { Terminal } from 'iconoir-react'
import { HoverTipLayer } from '@mew/ui'
import { useWorkspaceApi } from '../api/workspace-api-context'
import { uiText } from '@mew/ui/i18n-core'
import type { UpdatesStatus } from '../../shared/updates'
import { SessionTerminalPopup } from './SessionTerminalPopup'

const updateStateLabels = { queued: '대기 중', running: '업데이트 중…', succeeded: '완료', failed: '실패' } as const
const actionClass = 'grid h-7 shrink-0 place-items-center rounded px-2.5 text-xs text-accent hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40 aria-disabled:opacity-40'

/** Update discovery runs independently of runtime presence and never delays the picker. */
export function useRuntimeUpdates(active: boolean) {
  const { fetchUpdatesStatus, runUpdates } = useWorkspaceApi()
  const [status, setStatus] = useState<UpdatesStatus | null>(null)
  const [starting, setStarting] = useState<string | null>(null)
  const [error, setError] = useState<{ id: string; message: string } | null>(null)
  const jobRunning = !!status?.job.running
  const needsVersionCheck = status?.checkedAt === 0 && !jobRunning

  useEffect(() => {
    if (!active) return
    let alive = true
    const refresh = () => fetchUpdatesStatus().then(next => { if (alive) setStatus(next) }).catch(() => { /* No system permission or network: keep the picker usable. */ })
    void refresh()
    const timer = jobRunning ? window.setInterval(() => void refresh(), 1500) : undefined
    return () => { alive = false; window.clearInterval(timer) }
  }, [active, fetchUpdatesStatus, jobRunning, needsVersionCheck])

  const start = (id: string) => {
    setStarting(id)
    setError(null)
    void runUpdates([id]).then(setStatus).catch((err: unknown) => {
      setError({ id, message: err instanceof Error ? err.message : String(err) })
    }).finally(() => setStarting(null))
  }
  return { status, starting, error, start }
}

export function RuntimeUpdateAction({ runtimeId, runtimeLabel, installed, canViewSessions, updates }: {
  runtimeId: string
  runtimeLabel: string
  installed: boolean
  canViewSessions: boolean
  updates: ReturnType<typeof useRuntimeUpdates>
}) {
  const [openedSession, setOpenedSession] = useState<string | null>(null)
  const id = `${runtimeId === 'codex' || runtimeId === 'claude' ? 'cli' : 'agent'}:${runtimeId}`
  const item = updates.status?.items.find(row => row.id === id && row.category === 'agent')
  const job = updates.status?.job.items.find(row => row.id === id)
  const session = item?.session ?? job?.session ?? null
  const starting = updates.starting === id
  const busy = !!updates.starting || !!updates.status?.job.running
  const running = starting || !!updates.status?.job.running && (job?.state === 'queued' || job?.state === 'running')
  const error = running ? null : updates.error?.id === id ? updates.error.message : job?.state === 'failed' ? job.error : null
  const canUpdate = installed && item?.available && item.canUpdate && (job?.state !== 'succeeded' || updates.status?.checkedAt !== 0)
  const showTerminal = canViewSessions && (running || !!session)
  const mainDisabled = showTerminal ? !session || starting : busy
  const label = item?.label ?? runtimeLabel
  const actionText = uiText(error ? '다시 시도' : '업데이트')
  const popupState = job?.session === openedSession ? job?.state : undefined

  if (openedSession && (!canViewSessions || openedSession !== session)) setOpenedSession(null)

  if (!showTerminal && !canUpdate && !running && !error) return null
  return <>
    {(showTerminal || canUpdate || running) && <HoverTipLayer className="relative flex shrink-0 items-center">
      <button
        type="button"
        className={actionClass}
        aria-label={showTerminal ? uiText('{p0} 터미널 세션', { p0: label }) : undefined}
        aria-busy={running || undefined}
        aria-disabled={mainDisabled || undefined}
        data-tip={showTerminal ? uiText(mainDisabled ? '업데이트 중…' : '터미널 세션 보기') : undefined}
        onClick={() => {
          if (mainDisabled) return
          if (showTerminal) setOpenedSession(session)
          else updates.start(id)
        }}
      >{showTerminal ? <>
        <span aria-hidden="true" className="invisible col-start-1 row-start-1">{uiText('업데이트')}</span>
        <Terminal aria-hidden="true" width={16} height={16} className="col-start-1 row-start-1" />
      </> : running ? uiText('업데이트 중…') : actionText}</button>
      {showTerminal && canUpdate && !running && <button type="button" disabled={busy} className={actionClass} onClick={() => updates.start(id)}>{actionText}</button>}
    </HoverTipLayer>}
    {error && <div role="alert" className="relative order-last max-h-24 w-full min-w-0 basis-full select-text overflow-auto whitespace-pre-wrap wrap-anywhere text-xs text-danger">{error}</div>}
    {canViewSessions && openedSession && openedSession === session && <SessionTerminalPopup
      key={openedSession}
      title={label}
      session={openedSession}
      running
      canStop={false}
      statusNote={popupState && uiText(updateStateLabels[popupState])}
      statusTone={popupState === 'failed' ? 'danger' : popupState === 'succeeded' ? 'success' : 'muted'}
      onRun={async () => {}}
      onChanged={() => {}}
      onClose={() => setOpenedSession(null)}
      zIndex={1300}
    />}
  </>
}
