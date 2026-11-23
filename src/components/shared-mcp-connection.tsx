import { useCallback, useEffect, useRef, useState } from 'react'
import { OpenNewWindow, PlugTypeA, RefreshDouble, Xmark } from 'iconoir-react'
import { uiText } from '@mew/ui/i18n-core'
import { useUiLocale } from '@mew/ui/i18n'
import type { SharedMcpConnectionStatus } from '../../shared/shared-mcp'
import { changeSharedMcpConnection, fetchSharedMcpAuthorizeUrl, fetchSharedMcpStatus, submitSharedMcpCallback } from '../api/shared-mcp'
import { LoginDesktopViewer } from './LoginDesktopViewer'
import { mcpManagerCopy } from './mcp-manager-copy'

const button = 'inline-flex min-h-9 items-center justify-center gap-1.5 rounded px-2 text-xs text-ink-secondary hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40'
const input = 'min-h-9 min-w-0 rounded border border-edge-strong bg-surface px-2 text-xs text-ink placeholder:text-ink-secondary focus:outline-2 focus:outline-accent'
const pending = (value: SharedMcpConnectionStatus | null) => value?.status === 'connecting' || value?.status === 'needs_auth' && typeof value.ownsJob === 'boolean'
const ownsPendingJob = (value: SharedMcpConnectionStatus | null) => pending(value) && value?.ownsJob === true

export function SharedMcpConnection({
  name,
  canManage,
  logoutLabel,
  effectiveEnabled,
  autoConnect,
  onAutoConnectConsumed,
  onStatusChange,
}: {
  name: string
  canManage: boolean
  logoutLabel?: string
  effectiveEnabled?: boolean
  autoConnect?: boolean
  onAutoConnectConsumed?: () => void
  onStatusChange?: (value: SharedMcpConnectionStatus) => void
}) {
  const copy = mcpManagerCopy[useUiLocale()]
  const [connection, setConnection] = useState<SharedMcpConnectionStatus | null>(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [callbackUrl, setCallbackUrl] = useState('')
  const mounted = useRef(false), latest = useRef(connection), generation = useRef(0)
  const onStatusChangeRef = useRef(onStatusChange)
  const onAutoConnectConsumedRef = useRef(onAutoConnectConsumed)
  useEffect(() => { onStatusChangeRef.current = onStatusChange }, [onStatusChange])
  useEffect(() => { onAutoConnectConsumedRef.current = onAutoConnectConsumed }, [onAutoConnectConsumed])
  useEffect(() => { if (connection) onStatusChangeRef.current?.(connection) }, [connection])
  useEffect(() => { latest.current = connection }, [connection])
  const needsPolling = pending(connection)

  const change = useCallback(async (action: 'connect' | 'disconnect' | 'cancel', mode?: 'desktop' | 'browser') => {
    if (!canManage) return
    const attempt = ++generation.current
    setBusy(true); setError('')
    try {
      const value = await changeSharedMcpConnection(name, action, mode ? { mode } : undefined)
      if (!mounted.current) { if (ownsPendingJob(value)) void changeSharedMcpConnection(name, 'cancel').catch(() => {}); return value }
      if (attempt === generation.current) {
        setConnection(value)
        if (action !== 'connect') setCallbackUrl('')
      }
      return value
    } catch (cause) {
      if (mounted.current && attempt === generation.current) setError(cause instanceof Error ? cause.message : uiText('MCP 연결을 확인하지 못했습니다. 다시 시도하세요.'))
    } finally { if (mounted.current && attempt === generation.current) setBusy(false) }
  }, [name, canManage])

  useEffect(() => {
    mounted.current = true
    const controller = new AbortController()
    if (autoConnect && canManage) {
      onAutoConnectConsumedRef.current?.()
      void change('connect')
    } else {
      fetchSharedMcpStatus(name, controller.signal).then(value => {
        if (!controller.signal.aborted) setConnection(value)
      }).catch(cause => { if (!controller.signal.aborted) setError(cause.message) })
    }
    return () => {
      mounted.current = false; controller.abort()
      if (canManage && ownsPendingJob(latest.current)) void changeSharedMcpConnection(name, 'cancel').catch(() => {})
    }
  }, [name, canManage, autoConnect, change])

  useEffect(() => {
    if (busy || !needsPolling) return
    const controller = new AbortController(), started = Date.now(), attempt = generation.current
    let timer: ReturnType<typeof setTimeout>
    async function poll() {
      try {
        const value = await fetchSharedMcpStatus(name, controller.signal)
        if (controller.signal.aborted || attempt !== generation.current) return
        setConnection(value)
        if (pending(value)) {
          if (Date.now() - started < 5 * 60_000) timer = setTimeout(poll, 1500)
          else if (canManage && ownsPendingJob(value)) {
            setError(uiText('연결 시간이 초과되었습니다. 다시 연결하세요.'))
            setConnection(await changeSharedMcpConnection(name, 'cancel'))
          }
        }
      } catch (cause) {
        if (!controller.signal.aborted && attempt === generation.current) {
          setError(cause instanceof Error ? cause.message : uiText('MCP 연결을 확인하지 못했습니다. 다시 시도하세요.'))
          if (canManage && ownsPendingJob(latest.current)) void changeSharedMcpConnection(name, 'cancel').catch(() => {})
          setConnection({ name, status: 'error' })
        }
      }
    }
    timer = setTimeout(poll, 1500)
    return () => { controller.abort(); clearTimeout(timer) }
  }, [name, needsPolling, busy, canManage])

  async function openAuthPage() {
    if (!canManage) return
    setBusy(true); setError('')
    try {
      const url = await fetchSharedMcpAuthorizeUrl(name)
      const opened = window.open(url, '_blank', 'noopener,noreferrer')
      if (!opened) setError(copy.popupBlocked)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : copy.authUrlError)
    } finally { if (mounted.current) setBusy(false) }
  }

  async function completeCallback() {
    if (!canManage || !callbackUrl.trim()) return
    const attempt = ++generation.current
    setBusy(true); setError('')
    try {
      const value = await submitSharedMcpCallback(name, callbackUrl.trim())
      if (mounted.current && attempt === generation.current) {
        setConnection(value)
        setCallbackUrl('')
      }
    } catch (cause) {
      if (mounted.current && attempt === generation.current) setError(cause instanceof Error ? cause.message : copy.callbackError)
    } finally { if (mounted.current && attempt === generation.current) setBusy(false) }
  }

  const label = !connection ? uiText('연결 확인 중…') : connection.status === 'connected' ? uiText('연결됨') : connection.status === 'needs_auth' ? uiText('로그인 필요') : connection.status === 'connecting' ? uiText('연결 중…') : connection.status === 'error' ? uiText('연결 오류') : uiText('연결 안 됨')
  const showBrowserOption = canManage && !pending(connection) && connection?.status !== 'connected'
  const showBrowserFlow = canManage && connection?.status === 'needs_auth' && connection.authMode === 'browser' && connection.ownsJob === true
  const enabledButNotReady = effectiveEnabled === true && !!connection && connection.status !== 'connected' && connection.status !== 'connecting'

  return <section aria-label={uiText('MCP 연결 상태')} className="shrink-0 border-b border-edge px-4 py-2">
    <div className="flex flex-wrap items-center gap-2">
      <div className="min-w-0 flex-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span role="status" className={`text-xs ${connection?.status === 'connected' ? 'text-success-ink' : 'text-ink-secondary'}`}>{label}</span>
        {connection?.status === 'connected' && typeof connection.toolCount === 'number' && <span className="text-[11px] text-ink-secondary tabular-nums">{copy.toolsUnit} {connection.toolCount}</span>}
      </div>
      {canManage && (pending(connection) ? <button type="button" className={button} aria-label={uiText('연결 취소')} data-tip={uiText('연결 취소')} disabled={busy} onClick={() => void change('cancel')}><Xmark width={16} height={16} aria-hidden /></button>
        : connection?.status === 'connected' ? <button type="button" className={button} aria-label={logoutLabel ?? uiText('연결 해제')} data-tip={logoutLabel ?? uiText('연결 해제')} disabled={busy} onClick={() => void change('disconnect')}><PlugTypeA width={16} height={16} aria-hidden /></button>
          : <div className="flex flex-wrap items-center gap-1">
            <button type="button" className={button} disabled={busy || !connection && !error} onClick={() => void change('connect')}>{error || connection?.status === 'error' ? <RefreshDouble width={14} height={14} aria-hidden /> : <PlugTypeA width={14} height={14} aria-hidden />}{connection?.status === 'needs_auth' ? uiText('로그인') : connection?.status === 'error' || error ? uiText('다시 연결') : uiText('연결')}</button>
            {showBrowserOption && <button type="button" className={button} disabled={busy || !connection && !error} onClick={() => void change('connect', 'browser')}><OpenNewWindow width={14} height={14} aria-hidden />{copy.openBrowserLogin}</button>}
          </div>)}
    </div>
    {enabledButNotReady && <p className="mt-1 text-xs text-ink-secondary">{copy.notAppliedHint}</p>}
    {!canManage && connection && connection.status !== 'connected' && <p className="mt-1 text-xs text-ink-secondary">{copy.ownerConnectHint}</p>}
    {(error || connection?.error) && <p role="alert" className="mt-1 break-words text-xs text-danger-ink">{error || connection?.error}</p>}
    {connection?.status === 'connected' && !!connection.toolNames?.length && <details className="mt-1.5 text-[11px] text-ink-secondary">
      <summary className="cursor-pointer select-none hover:text-ink">{copy.toolsListLabel} ({connection.toolCount ?? connection.toolNames.length})</summary>
      <div className="mt-1 flex flex-wrap gap-1">{connection.toolNames.map(tool => <span key={tool} className="rounded bg-surface-raised px-1.5 py-0.5 font-mono text-[11px] text-ink-secondary">{tool}</span>)}</div>
    </details>}
    {showBrowserFlow && <div className="mt-2 space-y-2 rounded border border-edge bg-surface-raised p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-xs text-ink-secondary">{copy.browserModeHint}</p>
        <button type="button" className={`${button} bg-accent text-ink-on-accent hover:bg-accent/90`} disabled={busy} onClick={() => void openAuthPage()}><OpenNewWindow width={14} height={14} aria-hidden />{copy.openAuthPage}</button>
      </div>
      <div className="space-y-1">
        <label className="block text-[11px] text-ink-secondary" htmlFor={`mcp-callback-${name}`}>{copy.callbackLabel}</label>
        <div className="flex flex-wrap gap-1.5">
          <input id={`mcp-callback-${name}`} type="url" className={`${input} flex-1`} value={callbackUrl} disabled={busy} autoComplete="off" placeholder="http://127.0.0.1:.../callback?code=...&state=..." onChange={event => setCallbackUrl(event.target.value)} />
          <button type="button" className={button} disabled={busy || !callbackUrl.trim()} onClick={() => void completeCallback()}>{copy.submitCallback}</button>
        </div>
      </div>
    </div>}
    {canManage && connection?.status === 'needs_auth' && connection.streamUrl && <div className="mt-2 h-64 min-h-0 overflow-hidden rounded sm:h-80"><LoginDesktopViewer key={connection.streamUrl} streamUrl={connection.streamUrl} reopen={async () => {
      const value = await change('connect')
      if (!value?.streamUrl) throw new Error(uiText('로그인 화면을 열지 못했습니다. 다시 연결하세요.'))
      return value.streamUrl
    }} /></div>}
  </section>
}
