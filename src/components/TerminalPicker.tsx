import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Terminal } from 'iconoir-react'
import { uiText } from '@mew/ui/i18n-core'
import { useUiLocale } from '@mew/ui/i18n'
import { useWorkspaceApi } from '../api/workspace-api-context'
import { json } from '../api/response'
import { runtimeOf } from './agentRuntimes'

type Backend = { id: string; label: string; installed: boolean }

export function TerminalPicker({ onSelect }: { onSelect: (id: string) => void }) {
  const { fetch } = useWorkspaceApi()
  useUiLocale()
  const [backends, setBackends] = useState<Backend[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { ref.current?.focus({ preventScroll: true }) }, [])
  useEffect(() => {
    let alive = true
    void fetch('/api/terminal-backends').then(json<{ backends: Backend[] }>).then(result => {
      if (alive) setBackends(result.backends)
    }).catch((err: unknown) => { if (alive) setError(err instanceof Error ? err.message : String(err)) })
    return () => { alive = false }
  }, [fetch, retry])
  const selectNumber = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.repeat || event.nativeEvent.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || !/^[1-9]$/.test(event.key)) return
    const backend = backends?.[Number(event.key) - 1]
    if (!backend?.installed) return
    event.preventDefault()
    onSelect(backend.id)
  }
  return <div ref={ref} tabIndex={-1} onKeyDown={selectNumber} className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-4 outline-none">
    <div className="flex w-full max-w-xl flex-col gap-2">
      {backends?.map((backend, index) => <button key={backend.id} type="button" disabled={!backend.installed} onClick={() => onSelect(backend.id)} className="flex min-h-10 items-center gap-2 rounded-md border border-edge bg-surface px-2.5 py-1.5 text-left enabled:hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center text-ink-secondary"><Terminal /></span>
        <span className="min-w-0 flex-1 truncate text-sm text-ink">{runtimeOf(backend.id).label}</span>
        {!backend.installed && <span className="text-xs text-ink-muted">{uiText('설치되지 않음')}</span>}
        {index < 9 && <kbd aria-hidden="true" className="text-xs tabular-nums text-ink-muted">{index + 1}</kbd>}
      </button>)}
      {!backends && !error && <div className="py-8 text-center text-xs text-ink-muted">{uiText('확인 중…')}</div>}
      {error && <div className="text-xs text-danger">{error} <button type="button" className="rounded px-1.5 py-0.5 text-ink-secondary hover:bg-surface-raised" onClick={() => { setError(null); setRetry(value => value + 1) }}>{uiText('다시 연결')}</button></div>}
    </div>
  </div>
}
