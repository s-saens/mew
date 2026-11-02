import { useEffect, useRef, useState } from 'react'
import { RefreshDouble, Xmark, PlugTypeA } from 'iconoir-react'
import { uiText } from '@mew/ui/i18n-core'
import { useUiLocale } from '@mew/ui/i18n'
import type { SharedMcpConnectionStatus } from '../../shared/shared-mcp'
import { changeSharedMcpConnection, fetchSharedMcpStatus } from '../api/shared-mcp'
import { LoginDesktopViewer } from './LoginDesktopViewer'

const button = 'inline-flex min-h-9 items-center justify-center gap-1.5 rounded px-2 text-xs text-ink-secondary hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40'
const pending = (value: SharedMcpConnectionStatus | null) => value?.status === 'connecting' || value?.status === 'needs_auth'

export function SharedMcpConnection({ name }: { name: string }) {
  useUiLocale()
  const [connection, setConnection] = useState<SharedMcpConnectionStatus | null>(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const mounted = useRef(false), latest = useRef(connection), generation = useRef(0)
  useEffect(() => { latest.current = connection }, [connection])
  const needsPolling = pending(connection)
  useEffect(() => {
    mounted.current = true
    const controller = new AbortController()
    fetchSharedMcpStatus(name, controller.signal).then(value => {
      if (!controller.signal.aborted) setConnection(value)
    }).catch(cause => { if (!controller.signal.aborted) setError(cause.message) })
    return () => {
      mounted.current = false; controller.abort()
      if (pending(latest.current)) void changeSharedMcpConnection(name, 'cancel').catch(() => {})
    }
  }, [name])
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
          else {
            setError(uiText('연결 시간이 초과되었습니다. 다시 연결하세요.'))
            setConnection(await changeSharedMcpConnection(name, 'cancel'))
          }
        }
      } catch (cause) {
        if (!controller.signal.aborted && attempt === generation.current) {
          setError(cause instanceof Error ? cause.message : uiText('MCP 연결을 확인하지 못했습니다. 다시 시도하세요.'))
          void changeSharedMcpConnection(name, 'cancel').catch(() => {})
          setConnection({ name, status: 'error' })
        }
      }
    }
    timer = setTimeout(poll, 1500)
    return () => { controller.abort(); clearTimeout(timer) }
  }, [name, needsPolling, busy])

  async function change(action: 'connect' | 'disconnect' | 'cancel') {
    const attempt = ++generation.current
    setBusy(true); setError('')
    try {
      const value = await changeSharedMcpConnection(name, action)
      if (!mounted.current) { if (pending(value)) void changeSharedMcpConnection(name, 'cancel').catch(() => {}); return value }
      if (attempt === generation.current) setConnection(value)
      return value
    } catch (cause) {
      if (mounted.current && attempt === generation.current) setError(cause instanceof Error ? cause.message : uiText('MCP 연결을 확인하지 못했습니다. 다시 시도하세요.'))
    } finally { if (mounted.current && attempt === generation.current) setBusy(false) }
  }
  const label = !connection ? uiText('연결 확인 중…') : connection.status === 'connected' ? uiText('연결됨') : connection.status === 'needs_auth' ? uiText('로그인 필요') : connection.status === 'connecting' ? uiText('연결 중…') : connection.status === 'error' ? uiText('연결 오류') : uiText('연결 안 됨')
  return <section aria-label={uiText('MCP 연결 상태')} className="shrink-0 border-b border-edge px-4 py-2">
    <div className="flex flex-wrap items-center gap-2">
      <span role="status" className={`min-w-0 flex-1 text-xs ${connection?.status === 'connected' ? 'text-success' : 'text-ink-secondary'}`}>{label}</span>
      {pending(connection) ? <button type="button" className={button} aria-label={uiText('연결 취소')} data-tip={uiText('연결 취소')} disabled={busy} onClick={() => void change('cancel')}><Xmark width={16} height={16} aria-hidden /></button>
        : connection?.status === 'connected' ? <button type="button" className={button} aria-label={uiText('연결 해제')} data-tip={uiText('연결 해제')} disabled={busy} onClick={() => void change('disconnect')}><PlugTypeA width={16} height={16} aria-hidden /></button>
          : <button type="button" className={button} disabled={busy || !connection && !error} onClick={() => void change('connect')}>{error || connection?.status === 'error' ? <RefreshDouble width={14} height={14} aria-hidden /> : <PlugTypeA width={14} height={14} aria-hidden />}{connection?.status === 'error' || error ? uiText('다시 연결') : uiText('연결')}</button>}
    </div>
    {(error || connection?.error) && <p role="alert" className="mt-1 break-words text-xs text-danger-strong">{error || connection?.error}</p>}
    {connection?.status === 'needs_auth' && connection.streamUrl && <div className="mt-2 h-64 min-h-0 overflow-hidden rounded sm:h-80"><LoginDesktopViewer key={connection.streamUrl} streamUrl={connection.streamUrl} reopen={async () => {
      const value = await change('connect')
      if (!value?.streamUrl) throw new Error(uiText('로그인 화면을 열지 못했습니다. 다시 연결하세요.'))
      return value.streamUrl
    }} /></div>}
  </section>
}
