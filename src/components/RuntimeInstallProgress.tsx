import { useEffect, useRef, useState } from 'react'
import { Terminal } from 'iconoir-react'
import { uiText } from '@mew/ui/i18n-core'
import { useUiLocale } from '@mew/ui/i18n'
import type { AgentRuntimeStatus } from '../api/client'
import type { InstallFailure } from '../hooks/use-runtime-install'
import { refreshAgentRuntimes } from '../utils/agentPickerCache'
import { SessionTerminalOutputPopup } from './SessionTerminalPopup'

export function RuntimeInstallAction({ runtimeId, label, status, installing, installFailure, install, disabled }: {
  runtimeId: string
  label: string
  status?: AgentRuntimeStatus | null
  installing: string | null
  installFailure: InstallFailure | null
  install: (id: string) => Promise<void>
  disabled?: boolean
}) {
  useUiLocale()
  const [open, setOpen] = useState(false)
  const actionRef = useRef<HTMLButtonElement>(null)
  const progress = status?.installation
  const busy = installing === runtimeId || progress?.state === 'running'

  useEffect(() => {
    if (!busy) return
    let active = true
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try { await refreshAgentRuntimes() } catch { /* Resume reading on the next poll. */ }
      if (active) timer = setTimeout(poll, 1000)
    }
    void poll()
    return () => { active = false; clearTimeout(timer) }
  }, [busy])

  const failure = installFailure?.id === runtimeId ? installFailure.message : null
  const showOutput = busy || !!progress || !!failure
  const failed = !busy && (progress?.state === 'failed' || !!failure)
  const canInstall = !!status?.installable && !status.installed && !status.installBlocker
  const blocked = !!disabled || !!status?.installing || busy || installing !== null
  const terminalLabel = `${label} · ${uiText('설치')} · ${uiText('터미널 세션 보기')}`
  const actionClass = 'relative shrink-0 rounded px-2.5 py-1 text-xs text-ink-secondary hover:bg-surface-raised hover:text-ink disabled:opacity-40'
  // eslint-disable-next-line no-control-regex -- Strip terminal control sequences from the captured output.
  const text = (busy && progress?.state === 'failed' ? '' : progress?.output ?? '').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/\r\n?/g, '\n')
  const output = !busy && failure && !text.includes(failure) ? [text, failure].filter(Boolean).join('\n') : text

  return <>
    {(showOutput || canInstall) && <button
      ref={actionRef}
      type="button"
      className={actionClass}
      disabled={!showOutput && blocked}
      aria-label={showOutput ? terminalLabel : undefined}
      aria-busy={busy || undefined}
      data-tip={showOutput ? terminalLabel : undefined}
      onClick={() => { if (showOutput) setOpen(true); else void install(runtimeId) }}
    >{showOutput ? <Terminal aria-hidden width={16} height={16} /> : uiText('설치')}</button>}
    {failed && canInstall && <button type="button" disabled={blocked} className={actionClass} onClick={() => {
      actionRef.current?.focus()
      void install(runtimeId)
    }}>{uiText('다시 시도')}</button>}
    {!busy && status?.installBlocker === 'configured-command' && <p role="status" className="relative order-last min-w-0 w-full basis-full py-1 text-xs text-warning">
      {uiText('설치된 기본 실행 파일을 사용하려면 런타임 설정의 실행 파일 항목을 비우고 저장하세요.')}
    </p>}
    {open && <SessionTerminalOutputPopup
      title={`${label} · ${uiText('설치')}`}
      output={output}
      status={busy && (!progress || progress.state !== 'succeeded') ? uiText('설치 중…') : failed ? uiText('실패') : uiText('설치됨')}
      tone={failed ? 'danger' : progress?.state === 'succeeded' ? 'success' : 'muted'}
      onClose={() => setOpen(false)}
    />}
  </>
}
