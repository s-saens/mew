import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Refresh, Xmark } from 'iconoir-react'
import { ActionMenu, ActionMenuItem, ConfirmDialog, HoverTipLayer, LoadingIndicator } from '@mew/ui'
import { uiText } from '@mew/ui/i18n-core'
import { useUiLocale } from '@mew/ui/i18n'
import type { DomBrowserPort } from '../../shared/dom-browser'
import { mewFetch } from '../utils/remote-transport'
import { useLongPress } from '../hooks/useLongPress'

type PortFailure = false | 'request' | 'server-update'
type PortMenu = { port: number; x: number; y: number; trigger: HTMLButtonElement }

function closeError(code: string): string {
  switch (code) {
    case 'dom-browser-port-close-forbidden': return uiText('포트를 닫으려면 로컬 앱 접근 및 터미널 실행 권한이 필요합니다.')
    case 'dom-browser-port-protected': return uiText('Mew 또는 보호된 서비스의 포트는 닫을 수 없습니다.')
    case 'dom-browser-port-still-open': return uiText('종료를 요청했지만 포트가 아직 열려 있습니다. 상태를 확인하고 다시 시도해 주세요.')
    case 'dom-browser-port-owners-unavailable': return uiText('포트를 사용하는 프로세스를 확인하지 못했습니다. 상태를 확인하고 다시 시도해 주세요.')
    case 'server-update': return uiText('포트를 닫으려면 Mew 서버를 최신 코드로 다시 시작해 주세요.')
    default: return uiText('포트를 닫지 못했습니다. 권한과 프로세스 상태를 확인하고 다시 시도해 주세요.')
  }
}

function parsePorts(value: unknown): DomBrowserPort[] {
  if (!value || typeof value !== 'object' || !('ports' in value) || !Array.isArray(value.ports)) throw new Error('invalid-ports')
  const ports = new Map<number, DomBrowserPort>()
  const priority = { app: 0, blocked: 1, mew: 2 }
  for (const entry of value.ports) {
    if (!entry || typeof entry !== 'object' || !Number.isInteger(entry.port) || entry.port < 1 || entry.port > 65535 || !['app', 'mew', 'blocked'].includes(entry.kind)) continue
    const port: DomBrowserPort = { port: entry.port, kind: entry.kind }
    if (port.kind === 'app' && typeof entry.title === 'string' && entry.title.trim()) port.title = Array.from(entry.title.trim()).slice(0, 200).join('')
    if (port.kind !== 'mew' && typeof entry.processName === 'string' && entry.processName.trim()) port.processName = Array.from(entry.processName.replace(/[\s\p{Cc}\p{Cf}]+/gu, ' ').trim()).slice(0, 80).join('')
    const previous = ports.get(port.port)
    if (!previous || priority[port.kind] > priority[previous.kind]) ports.set(port.port, port)
  }
  return [...ports.values()].sort((a, b) => a.port - b.port)
}

export function DomBrowserPorts({ onOpen }: { onOpen: (url: string) => void }) {
  useUiLocale()
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<{ attempt: number; ports: DomBrowserPort[]; canClose: boolean; failed: PortFailure }>({ attempt: -1, ports: [], canClose: false, failed: false })
  const [menu, setMenu] = useState<PortMenu | null>(null)
  const [confirmPort, setConfirmPort] = useState<number | null>(null)
  const [closingPort, setClosingPort] = useState<number | null>(null)
  const [closeFailure, setCloseFailure] = useState('')
  const closeRequest = useRef<AbortController | null>(null)
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
        const body = await response.json()
        const next = parsePorts(body)
        if (!controller.signal.aborted) setResult({ attempt, ports: next, canClose: body.canClose === true, failed: false })
      } catch {
        if (!controller.signal.aborted) setResult(current => ({ attempt, ports: current.ports, canClose: false, failed: failure }))
      }
    })()
    return () => controller.abort()
  }, [attempt])
  useEffect(() => () => closeRequest.current?.abort(), [])

  const retry = () => { setMenu(null); setCloseFailure(''); setAttempt(current => current + 1) }
  const canClose = result.canClose && !loading && !failed && closingPort === null
  const closePort = async (port: number) => {
    setConfirmPort(null)
    if (!canClose || closeRequest.current) return
    const controller = new AbortController()
    closeRequest.current = controller
    setClosingPort(port); setCloseFailure('')
    try {
      const response = await mewFetch(`/api/dom-browser/ports/${port}/close`, { method: 'POST', signal: controller.signal })
      if (response.status === 404 || response.headers.get('content-type')?.toLowerCase().includes('text/html')) throw new Error('server-update')
      const body = await response.json()
      if (!response.ok) throw new Error(typeof body.code === 'string' ? body.code : '')
      if (body.closed !== true || body.port !== port) throw new Error('invalid-response')
    } catch (error) {
      if (!controller.signal.aborted) setCloseFailure(error instanceof Error && error.message ? error.message : 'request')
    } finally {
      if (!controller.signal.aborted) { setClosingPort(null); setAttempt(current => current + 1) }
      if (closeRequest.current === controller) closeRequest.current = null
    }
  }
  const buttonClass = 'flex h-7 w-7 shrink-0 items-center justify-center rounded text-ink-secondary hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent'
  return <HoverTipLayer className="flex h-full min-h-0 min-w-0 flex-col text-ink">
    <section data-dom-browser-ports aria-label={uiText('열려 있는 포트')} aria-busy={loading || closingPort !== null} className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 px-2 py-1">
        <h2 className="min-w-0 flex-1 text-xs font-medium">{uiText('열려 있는 포트')}</h2>
        {loading && <span role="status" aria-label={uiText('불러오는 중…')} className="text-ink-muted"><LoadingIndicator size={13} /></span>}
        <button type="button" disabled={closingPort !== null} className={buttonClass} aria-label={uiText('새로고침')} data-tip={uiText('새로고침')} onClick={retry}><Refresh width={15} height={15} aria-hidden="true" /></button>
      </div>
      {closingPort !== null && <p role="status" className="px-2 py-1 text-xs text-ink-muted">{uiText('포트 {p0} 닫는 중…', { p0: String(closingPort) })}</p>}
      {closeFailure && <p role="alert" className="px-2 py-1 text-xs text-danger">{closeError(closeFailure)}</p>}
      {failed && <div role="alert" className="flex shrink-0 items-center gap-2 px-2 py-1 text-xs text-danger">
        <span className="min-w-0 flex-1 break-words">{failed === 'server-update'
          ? uiText('포트 목록을 사용하려면 Mew 서버를 최신 코드로 다시 시작해 주세요.')
          : uiText('포트 목록을 불러오지 못했습니다.')}</span>
        <button type="button" className={buttonClass} aria-label={uiText('다시 시도')} data-tip={uiText('다시 시도')} onClick={retry}><Refresh width={15} height={15} aria-hidden="true" /></button>
      </div>}
      {!loading && !failed && ports.length === 0 && <p className="px-2 py-1 text-xs text-ink-muted">{uiText('열려 있는 포트가 없습니다.')}</p>}
      <ul className="min-h-0 flex-1 overflow-auto px-1 pb-1">
        {ports.map(({ port, kind, title, processName }) => {
          const name = kind === 'mew' ? uiText('Mew') : title || processName || uiText('(이름 없음)')
          return <PortRow key={port} port={port} kind={kind} name={name} disabled={kind !== 'app' || loading || !!failed || closingPort !== null} canClose={canClose && kind === 'app'} onOpen={onOpen} onMenu={setMenu} />})}
      </ul>
    </section>
    {menu && canClose && <ActionMenu x={menu.x} y={menu.y} trigger={menu.trigger} label={uiText('포트 {p0}', { p0: String(menu.port) })} onClose={() => setMenu(null)}>
      <ActionMenuItem danger icon={<Xmark width={16} height={16} />} onClick={() => setConfirmPort(menu.port)}>{uiText('포트 닫기')}</ActionMenuItem>
    </ActionMenu>}
    {confirmPort !== null && canClose && <ConfirmDialog danger message={uiText('포트 {p0}을 닫을까요?', { p0: String(confirmPort) })} detail={uiText('이 포트를 사용하는 프로세스가 종료되며, 같은 프로세스의 다른 포트도 함께 닫힙니다.')} confirmLabel={uiText('포트 닫기')} onCancel={() => setConfirmPort(null)} onConfirm={() => { void closePort(confirmPort) }} />}
  </HoverTipLayer>
}

function PortRow({ port, kind, name, disabled, canClose, onOpen, onMenu }: {
  port: number; kind: DomBrowserPort['kind']; name: string; disabled: boolean; canClose: boolean
  onOpen: (url: string) => void; onMenu: (menu: PortMenu) => void
}) {
  const button = useRef<HTMLButtonElement>(null)
  const pointer = useRef({ x: 0, y: 0 })
  const openMenu = () => {
    if (!canClose || !button.current) return
    button.current.focus({ preventScroll: true })
    onMenu({ port, ...pointer.current, trigger: button.current })
  }
  const touch = useLongPress(openMenu)
  return <li><button ref={button} type="button" disabled={disabled} aria-haspopup={canClose ? 'menu' : undefined}
    onClick={() => { if (!touch.consumeClick()) onOpen(`http://localhost:${port}/`) }}
    onPointerDown={event => {
      pointer.current = { x: event.clientX, y: event.clientY }
      if (canClose && event.pointerType === 'touch') touch.pressProps.onPointerDown()
    }}
    onPointerMove={event => { if (Math.hypot(event.clientX - pointer.current.x, event.clientY - pointer.current.y) > 10) touch.pressProps.onPointerCancel() }}
    onPointerUp={touch.pressProps.onPointerUp} onPointerCancel={touch.pressProps.onPointerCancel} onPointerLeave={touch.pressProps.onPointerLeave}
    onContextMenu={event => {
      if (!canClose) return
      event.stopPropagation()
      const bounds = event.currentTarget.getBoundingClientRect()
      pointer.current = { x: event.clientX || bounds.left + 16, y: event.clientY || bounds.top + bounds.height / 2 }
      touch.pressProps.onContextMenu(event)
    }}
    onKeyDown={event => {
      if (!canClose || !(event.key === 'ContextMenu' || event.shiftKey && event.key === 'F10')) return
      event.preventDefault(); event.stopPropagation()
      const bounds = event.currentTarget.getBoundingClientRect()
      pointer.current = { x: bounds.left + 16, y: bounds.bottom }
      openMenu()
    }}
    className="flex min-h-9 w-full items-center gap-2 rounded px-2 py-1 text-left text-xs text-ink hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-default disabled:text-ink-muted disabled:hover:bg-transparent">
    <span className="flex min-w-0 items-center gap-2">
      <span data-port-name className="min-w-0 truncate" data-tip={name}>{name}</span>
      <span data-port-badge className="shrink-0 rounded bg-surface-raised px-1.5 py-0.5 font-mono text-xs tabular-nums text-ink-secondary">{port}</span>
    </span>
    <span className="flex-1" />
    {kind === 'blocked' ? <span className="shrink-0 text-xs">{uiText('사용 불가')}</span> : kind === 'app' ? <ArrowRight width={15} height={15} aria-hidden="true" className="shrink-0" /> : null}
  </button></li>
}
