import { useEffect, useState } from 'react'
import { ArrowRight, Refresh } from 'iconoir-react'
import { HoverTipLayer, LoadingIndicator } from '@mew/ui'
import { uiText } from '@mew/ui/i18n-core'
import { useUiLocale } from '@mew/ui/i18n'
import type { DomBrowserPort } from '../../shared/dom-browser'
import { mewFetch } from '../utils/remote-transport'

type PortFailure = false | 'request' | 'server-update'

function parsePorts(value: unknown): DomBrowserPort[] {
  if (!value || typeof value !== 'object' || !('ports' in value) || !Array.isArray(value.ports)) throw new Error('invalid-ports')
  const ports = new Map<number, DomBrowserPort>()
  const priority = { app: 0, blocked: 1, mew: 2 }
  for (const entry of value.ports) {
    if (!entry || typeof entry !== 'object' || !Number.isInteger(entry.port) || entry.port < 1 || entry.port > 65535 || !['app', 'mew', 'blocked'].includes(entry.kind)) continue
    const port = entry as DomBrowserPort, previous = ports.get(port.port)
    if (!previous || priority[port.kind] > priority[previous.kind]) ports.set(port.port, port)
  }
  return [...ports.values()].sort((a, b) => a.port - b.port)
}

export function DomBrowserPorts({ onOpen }: { onOpen: (url: string) => void }) {
  useUiLocale()
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<{ attempt: number; ports: DomBrowserPort[]; failed: PortFailure }>({ attempt: -1, ports: [], failed: false })
  const loading = result.attempt !== attempt
  const failed = !loading && result.failed
  const ports = result.ports
  useEffect(() => {
    const controller = new AbortController()
    void (async () => {
      let failure: PortFailure = 'request'
      try {
        const response = await mewFetch('/api/dom-browser/ports', { signal: controller.signal })
        if (response.status === 404 || response.ok && response.headers.get('content-type')?.toLowerCase().includes('text/html')) {
          failure = 'server-update'
          throw new Error('ports-api-unavailable')
        }
        if (!response.ok) throw new Error('ports-request-failed')
        const next = parsePorts(await response.json())
        if (!controller.signal.aborted) setResult({ attempt, ports: next, failed: false })
      } catch {
        if (!controller.signal.aborted) setResult(current => ({ attempt, ports: current.ports, failed: failure }))
      }
    })()
    return () => controller.abort()
  }, [attempt])

  const retry = () => setAttempt(current => current + 1)
  const buttonClass = 'flex h-7 w-7 shrink-0 items-center justify-center rounded text-ink-secondary hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent'
  return <HoverTipLayer className="flex h-full min-h-0 min-w-0 flex-col text-ink">
    <section data-dom-browser-ports aria-label={uiText('열려 있는 포트')} aria-busy={loading} className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 px-2 py-1">
        <h2 className="min-w-0 flex-1 text-xs font-medium">{uiText('열려 있는 포트')}</h2>
        {loading && <span role="status" aria-label={uiText('불러오는 중…')} className="text-ink-muted"><LoadingIndicator size={13} /></span>}
        <button type="button" className={buttonClass} aria-label={uiText('새로고침')} data-tip={uiText('새로고침')} onClick={retry}><Refresh width={15} height={15} aria-hidden="true" /></button>
      </div>
      {failed && <div role="alert" className="flex shrink-0 items-center gap-2 px-2 py-1 text-xs text-danger">
        <span className="min-w-0 flex-1 break-words">{failed === 'server-update'
          ? uiText('포트 목록을 사용하려면 Mew 서버를 최신 코드로 다시 시작해 주세요.')
          : uiText('포트 목록을 불러오지 못했습니다.')}</span>
        <button type="button" className={buttonClass} aria-label={uiText('다시 시도')} data-tip={uiText('다시 시도')} onClick={retry}><Refresh width={15} height={15} aria-hidden="true" /></button>
      </div>}
      {!loading && !failed && ports.length === 0 && <p className="px-2 py-1 text-xs text-ink-muted">{uiText('열려 있는 포트가 없습니다.')}</p>}
      <ul className="min-h-0 flex-1 overflow-auto px-1 pb-1">
        {ports.map(({ port, kind }) => <li key={port}>
          <button type="button" disabled={kind !== 'app' || loading || !!failed} onClick={() => onOpen(`http://localhost:${port}/`)} className="flex min-h-9 w-full items-center gap-2 rounded px-2 py-1 text-left text-xs text-ink-secondary hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-default disabled:text-ink-muted disabled:hover:bg-transparent">
            <span className="min-w-0 flex-1 truncate font-mono tabular-nums">localhost:{port}</span>
            {kind === 'mew' ? <span className="shrink-0 text-xs">{uiText('Mew')}</span> : kind === 'blocked' ? <span className="shrink-0 text-xs">{uiText('사용 불가')}</span> : <ArrowRight width={15} height={15} aria-hidden="true" className="shrink-0" />}
          </button>
        </li>)}
      </ul>
    </section>
  </HoverTipLayer>
}
