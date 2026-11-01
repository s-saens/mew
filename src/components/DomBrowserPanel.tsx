import { useEffect, useRef, useState } from 'react'
import { Replayer } from '@rrweb/replay'
import { EventType, IncrementalSource, type eventWithTime } from '@rrweb/types'
import { ArrowLeft, ArrowRight, HomeSimple, Refresh } from 'iconoir-react'
import { HoverTipLayer, LoadingIndicator } from '@mew/ui'
import { uiText } from '@mew/ui/i18n-core'
import { useUiLocale } from '@mew/ui/i18n'
import { useFocusedShortcutScope } from '@mew/shortcuts'
import { DOM_BROWSER_WS, type DomBrowserCommand, type DomBrowserMessage, type DomBrowserState } from '../../shared/dom-browser'
import { openMewSocket } from '../utils/remote-transport'
import { appTabShortcut } from '../utils/app-tab-shortcuts'
import { bindDomBrowserScroll, type DomBrowserScroll } from '../utils/dom-browser-scroll'
import { PanelCloseButton } from './panel-close-button'
import { DockGrip } from './DockWorkspace'
import { DomBrowserPorts } from './DomBrowserPorts'

type Connection = 'connecting' | 'open' | 'closed'

export function DomBrowserPanel({ url, navigationRequest = 0, onClose }: { url: string; navigationRequest?: number; onClose: () => void }) {
  const [entry, setEntry] = useState({ url, navigationRequest })
  useEffect(() => { setEntry({ url, navigationRequest }) }, [url, navigationRequest])
  const open = (target: string) => setEntry(current => ({ ...current, url: target }))
  return entry.url
    ? <DomBrowserPage url={entry.url} navigationRequest={entry.navigationRequest} onClose={onClose} onHome={() => open('')} />
    : <DomBrowserStart onOpen={open} onClose={onClose} />
}

function browserAddress(value: string): URL {
  const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `http://${value}`)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('invalid-address')
  return url
}

function DomBrowserStart({ onOpen, onClose }: { onOpen: (url: string) => void; onClose: () => void }) {
  useUiLocale()
  const scope = useRef<HTMLDivElement>(null)
  useFocusedShortcutScope(scope, { closeTab: () => { onClose(); return true } })
  const [address, setAddress] = useState('')
  const [error, setError] = useState('')
  return <div ref={scope} data-dom-browser className="flex h-full min-h-0 min-w-0 flex-col bg-surface-deep text-ink">
    <form className="flex h-9 shrink-0 items-center gap-0.5 border-b border-edge bg-surface px-1" onSubmit={event => {
      event.preventDefault()
      if (!address.trim()) return
      try { onOpen(browserAddress(address.trim()).href) }
      catch { setError(uiText('브라우저 주소가 올바르지 않습니다')) }
    }}>
      <DockGrip group="browser" />
      <input aria-label={uiText('브라우저 주소')} className="h-7 min-w-0 flex-1 rounded bg-surface-deep px-2 text-xs text-ink outline-none focus-visible:ring-1 focus-visible:ring-accent" value={address} onChange={event => setAddress(event.target.value)} autoCapitalize="off" autoCorrect="off" spellCheck={false} type="text" inputMode="url" />
      <PanelCloseButton aria-label={uiText('브라우저 닫기')} onClick={onClose} />
    </form>
    {error && <div role="alert" className="border-b border-edge px-2 py-1 text-xs text-danger">{error}</div>}
    <DomBrowserPorts onOpen={onOpen} />
  </div>
}

function DomBrowserPage({ url, navigationRequest, onClose, onHome }: { url: string; navigationRequest: number; onClose: () => void; onHome: () => void }) {
  useUiLocale()
  const scope = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  useEffect(() => { close.current = onClose }, [onClose])
  useFocusedShortcutScope(scope, { closeTab: () => { onClose(); return true } })
  const surface = useRef<HTMLDivElement>(null)
  const socket = useRef<WebSocket | null>(null)
  const requestedUrl = useRef(url)
  const currentUrl = useRef(url)
  const interactionReady = useRef(false)
  const currentGeneration = useRef(-1)
  const requiredGeneration = useRef(0)
  const documentLoading = useRef(true)
  const [address, setAddress] = useState(url)
  const [page, setPage] = useState<DomBrowserState>({ type: 'state', generation: 0, url, title: '', loading: false })
  const [connection, setConnection] = useState<Connection>('connecting')
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [hasSnapshot, setHasSnapshot] = useState(false)

  const blockInteraction = () => {
    interactionReady.current = false; documentLoading.current = true
    requiredGeneration.current = currentGeneration.current + 1
    setHasSnapshot(false); setPage(current => ({ ...current, loading: true }))
  }

  const send = (command: DomBrowserCommand) => {
    const ws = socket.current
    if (ws?.readyState !== WebSocket.OPEN) return
    if (['navigate', 'back', 'forward', 'reload'].includes(command.type)) blockInteraction()
    try { ws.send(JSON.stringify(command)) }
    catch { setConnection('closed'); setError(uiText('연결이 끊겼습니다. 다시 연결해 주세요.')) }
  }

  useEffect(() => {
    requestedUrl.current = url
    if (!url) return
    currentUrl.current = url
    setAddress(url); setError(''); setPage(current => ({ ...current, loading: true }))
    send({ type: 'navigate', url })
  }, [url, navigationRequest])

  useEffect(() => {
    let disposed = false, replay: Replayer | undefined, replayGeneration = -1, snapshotGeneration = -1, unbind = () => {}
    let replayBaseline = 0, replayStartedAt = 0
    let resizeTimer: ReturnType<typeof setTimeout> | undefined
    let applyHostScroll = (_data: DomBrowserScroll) => {}
    const reportedInputs = new Map<number, string>()
    interactionReady.current = false; currentGeneration.current = -1; requiredGeneration.current = 0; documentLoading.current = true
    setConnection('connecting'); setError(''); setHasSnapshot(false)
    let ws: WebSocket
    try {
      const target = new URL(DOM_BROWSER_WS, location.href)
      target.protocol = target.protocol === 'https:' ? 'wss:' : 'ws:'
      ws = openMewSocket(target.href)
    } catch (cause) {
      setConnection('closed'); setError(cause instanceof Error ? cause.message : uiText('브라우저에 연결하지 못했습니다. 다시 연결해 주세요.'))
      return
    }
    socket.current = ws
    const relay = (command: DomBrowserCommand) => {
      if (['navigate', 'back', 'forward', 'reload'].includes(command.type)) blockInteraction()
      if (!disposed && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(command))
    }
    const updateReady = () => {
      const fresh = snapshotGeneration === currentGeneration.current && snapshotGeneration >= requiredGeneration.current
      interactionReady.current = !documentLoading.current && fresh
      setHasSnapshot(fresh)
    }
    const resize = () => {
      const bounds = surface.current?.getBoundingClientRect()
      if (bounds && bounds.width > 0 && bounds.height > 0) relay({ type: 'resize', width: Math.max(240, Math.min(3840, Math.round(bounds.width))), height: Math.max(160, Math.min(2160, Math.round(bounds.height))) })
    }
    const observer = new ResizeObserver(() => { clearTimeout(resizeTimer); resizeTimer = setTimeout(resize, 120) })
    if (surface.current) observer.observe(surface.current)

    const bindReplay = (generation: number) => {
      if (generation !== replayGeneration) return
      unbind()
      const player = replay, doc = player?.iframe.contentDocument
      if (!player || !doc) return
      const relayInput = (command: DomBrowserCommand) => {
        if (interactionReady.current && generation === currentGeneration.current) relay(command)
      }
      reportedInputs.clear()
      const policy = doc.createElement('meta')
      policy.httpEquiv = 'Content-Security-Policy'
      policy.content = "default-src 'none'; style-src 'unsafe-inline' data: blob: https:; img-src data: blob: https:; font-src data: blob: https:; media-src data: blob: https:; form-action 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'"
      doc.head?.prepend(policy)
      const idOf = (node: EventTarget | null) => node && 'nodeType' in node ? player.getMirror().getId(node as Node) : -1
      const scrolling = bindDomBrowserScroll(doc, idOf, data => relayInput({ type: 'scroll', generation, ...data }))
      applyHostScroll = data => scrolling.applyHostScroll(data, player.getMirror().getNode(data.id))
      const click = (event: MouseEvent) => {
        if (event.button !== 0) { event.preventDefault(); return }
        const target = event.target as Element | null, id = idOf(target)
        if (target?.closest('a,button,input[type=submit],input[type=button],input[type=checkbox],input[type=radio],label,summary')) event.preventDefault()
        if (id >= 0) relayInput({ type: 'click', generation, id })
      }
      const focus = (event: FocusEvent) => {
        const id = idOf(event.target)
        if (id >= 0) relayInput({ type: 'focus', generation, id })
      }
      const input = (event: Event) => {
        if (event instanceof (doc.defaultView!.InputEvent) && event.isComposing) return
        const target = event.target as HTMLInputElement, id = idOf(target)
        if (id < 0) return
        const value = target.isContentEditable ? target.innerText : target.value
        const checked = ['checkbox', 'radio'].includes(target.type) ? target.checked : undefined
        const signature = `${checked}:${value}`
        if (typeof value === 'string' && reportedInputs.get(id) !== signature) {
          reportedInputs.set(id, signature); relayInput({ type: 'input', generation, id, value, ...(checked === undefined ? {} : { checked }) })
        }
      }
      const key = (event: KeyboardEvent) => {
        if (event.isComposing || ['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) return
        const shortcut = appTabShortcut(event)
        if (shortcut) {
          event.preventDefault(); event.stopImmediatePropagation()
          if (shortcut === 'close' && !event.repeat) close.current()
          return
        }
        if (event.key === 'F5') { event.preventDefault(); if (interactionReady.current) relay({ type: 'reload' }); return }
        const target = event.target as HTMLElement | null
        const editable = target?.matches('input,textarea,select,[contenteditable="true"]')
        if (editable && (event.ctrlKey || event.metaKey) && ['c', 'v', 'x', 'a'].includes(event.key.toLowerCase())) return
        if (editable && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) return
        if (editable && ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key) && !event.altKey) return
        if (!/^(Enter|Tab|Backspace|Delete|Escape|Arrow(Up|Down|Left|Right)|Home|End|Page(Up|Down)| |[a-zA-Z0-9])$/.test(event.key)) return
        // Native focus and clipboard remain usable; navigation and form actions run only on the host.
        if (event.key !== 'Tab') event.preventDefault()
        relayInput({ type: 'key', generation, key: event.key, ctrlKey: event.ctrlKey, metaKey: event.metaKey, altKey: event.altKey, shiftKey: event.shiftKey })
      }
      const submit = (event: Event) => event.preventDefault()
      doc.addEventListener('click', click, true)
      doc.addEventListener('focusin', focus, true)
      doc.addEventListener('auxclick', submit, true)
      doc.addEventListener('input', input, true)
      doc.addEventListener('change', input, true)
      doc.addEventListener('compositionend', input, true)
      doc.addEventListener('keydown', key, true)
      doc.addEventListener('submit', submit, true)
      unbind = () => {
        scrolling.dispose(); applyHostScroll = () => {}
        doc.removeEventListener('click', click, true); doc.removeEventListener('auxclick', submit, true)
        doc.removeEventListener('focusin', focus, true)
        doc.removeEventListener('input', input, true); doc.removeEventListener('change', input, true); doc.removeEventListener('compositionend', input, true)
        doc.removeEventListener('keydown', key, true); doc.removeEventListener('submit', submit, true)
      }
      snapshotGeneration = generation; updateReady()
    }
    ws.onopen = () => {
      if (disposed) return
      setConnection('open'); resize()
      const target = currentUrl.current || requestedUrl.current
      if (target) relay({ type: 'navigate', url: target })
    }
    ws.onmessage = ({ data }) => {
      if (disposed || typeof data !== 'string') return
      try {
        const message = JSON.parse(data) as DomBrowserMessage
        if (message.type === 'state') {
          if (message.generation < currentGeneration.current || message.generation < requiredGeneration.current) return
          if (message.generation > currentGeneration.current) { currentGeneration.current = message.generation; interactionReady.current = false; setHasSnapshot(false) }
          documentLoading.current = message.loading
          setPage(message)
          if (message.url && message.url !== 'about:blank') { currentUrl.current = message.url; setAddress(message.url) }
          if (!message.loading) setError('')
          updateReady()
        } else if (message.type === 'error') { setError(message.message); setPage(current => ({ ...current, loading: false })) }
        else if (message.type === 'events' && Array.isArray(message.events) && surface.current) {
          if (message.generation < currentGeneration.current || message.generation < requiredGeneration.current) return
          if (message.generation > currentGeneration.current) { currentGeneration.current = message.generation; interactionReady.current = false; documentLoading.current = true; setHasSnapshot(false) }
          if (replayGeneration !== message.generation) {
            unbind(); replay?.destroy(); replay = undefined; replayGeneration = message.generation; snapshotGeneration = -1
          }
          reportedInputs.clear()
          if (!replay) {
            replay = new Replayer([], { root: surface.current, liveMode: true, mouseTail: false, triggerFocus: false, showWarning: false, useVirtualDom: false })
            replay.iframe.title = uiText('서버 웹페이지')
            Object.assign(replay.wrapper.style, { width: '100%', height: '100%' })
            Object.assign(replay.iframe.style, { width: '100%', height: '100%', border: '0' })
            replay.wrapper.querySelector<HTMLElement>('.replayer-mouse')?.style.setProperty('display', 'none')
            replay.enableInteract()
            const generation = replayGeneration
            replay.on('fullsnapshot-rebuilded', event => {
              bindReplay(generation)
              const snapshot = event as Extract<eventWithTime, { type: EventType.FullSnapshot }>
              applyHostScroll({ id: snapshot.data.node.id, x: snapshot.data.initialOffset.left, y: snapshot.data.initialOffset.top })
            })
            replay.on('custom-event', event => {
              const custom = event as Extract<eventWithTime, { type: EventType.Custom }>
              if (custom.data.tag === 'mew-dom-scroll') applyHostScroll(custom.data.payload as DomBrowserScroll)
            })
            replayBaseline = Date.now(); replayStartedAt = performance.now()
            replay.startLive(replayBaseline)
          }
          // This is a live surface: apply received events now, independently of the host's clock.
          const timestamp = replayBaseline + Math.floor(performance.now() - replayStartedAt)
          for (const event of message.events) {
            const recorded = event as eventWithTime
            // Keep scroll ordering with DOM mutations while bypassing rrweb's smooth scroll.
            replay.addEvent(recorded.type === EventType.IncrementalSnapshot && recorded.data.source === IncrementalSource.Scroll
              ? { type: EventType.Custom, timestamp, data: { tag: 'mew-dom-scroll', payload: recorded.data } }
              : { ...recorded, timestamp })
          }
        }
      } catch { setError(uiText('브라우저 화면을 복원하지 못했습니다. 다시 연결해 주세요.')) }
    }
    ws.onerror = () => { if (!disposed) { interactionReady.current = false; setError(uiText('브라우저에 연결하지 못했습니다. 다시 연결해 주세요.')); setConnection('closed') } }
    ws.onclose = () => { if (!disposed) { interactionReady.current = false; setConnection('closed'); setError(current => current || uiText('연결이 끊겼습니다. 다시 연결해 주세요.')) } }
    return () => {
      disposed = true; interactionReady.current = false; unbind(); observer.disconnect(); clearTimeout(resizeTimer)
      ws.onopen = null; ws.onmessage = null; ws.onerror = null; ws.onclose = null
      if (socket.current === ws) socket.current = null
      ws.close(); replay?.destroy()
    }
  }, [attempt])

  const navigate = () => {
    const value = address.trim()
    if (!value) return
    let target: URL
    try {
      target = browserAddress(value)
    } catch { setError(uiText('브라우저 주소가 올바르지 않습니다')); return }
    currentUrl.current = target.href; setAddress(target.href); setError('')
    if (connection !== 'open') { setAttempt(current => current + 1); return }
    setPage(current => ({ ...current, loading: true })); send({ type: 'navigate', url: target.href })
  }
  const buttonClass = 'flex h-7 w-7 shrink-0 items-center justify-center rounded text-ink-secondary hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40'
  const busy = connection === 'connecting' || page.loading
  return <div ref={scope} data-dom-browser className="h-full min-h-0 min-w-0"><HoverTipLayer className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-surface-deep text-ink">
    <form className="flex h-9 shrink-0 items-center gap-0.5 border-b border-edge bg-surface px-1" onSubmit={event => { event.preventDefault(); navigate() }}>
      <DockGrip group="browser" />
      <button type="button" className={buttonClass} aria-label={uiText('열려 있는 포트')} data-tip={uiText('열려 있는 포트')} onClick={onHome}><HomeSimple width={16} height={16} aria-hidden="true" /></button>
      <button type="button" className={buttonClass} disabled={connection !== 'open' || !page.canGoBack} aria-label={uiText('뒤로가기')} data-tip={uiText('뒤로가기')} onClick={() => send({ type: 'back' })}><ArrowLeft width={16} height={16} aria-hidden="true" /></button>
      <button type="button" className={buttonClass} disabled={connection !== 'open' || !page.canGoForward} aria-label={uiText('앞으로가기')} data-tip={uiText('앞으로가기')} onClick={() => send({ type: 'forward' })}><ArrowRight width={16} height={16} aria-hidden="true" /></button>
      <button type="button" className={buttonClass} aria-label={uiText(connection === 'closed' ? '다시 연결' : '새로고침')} data-tip={uiText(connection === 'closed' ? '다시 연결' : '새로고침')} disabled={connection === 'connecting'} onClick={() => { setError(''); if (connection === 'closed') setAttempt(current => current + 1); else send({ type: 'reload' }) }}><Refresh width={16} height={16} aria-hidden="true" /></button>
      <input aria-label={uiText('브라우저 주소')} className="h-7 min-w-0 flex-1 rounded bg-surface-deep px-2 text-xs text-ink outline-none focus-visible:ring-1 focus-visible:ring-accent" value={address} onChange={event => setAddress(event.target.value)} autoCapitalize="off" autoCorrect="off" spellCheck={false} type="text" inputMode="url" />
      {busy && <span role="status" aria-label={uiText('연결 중…')} className="flex w-5 shrink-0 items-center justify-center text-ink-muted"><LoadingIndicator size={13} /></span>}
      <PanelCloseButton aria-label={uiText('브라우저 닫기')} onClick={onClose} />
    </form>
    {error && <div role="alert" className="flex shrink-0 items-center gap-1 border-b border-edge px-2 py-1 text-xs text-danger"><span className="min-w-0 flex-1 select-text break-words">{error}</span><button type="button" className={buttonClass} aria-label={uiText('다시 연결')} data-tip={uiText('다시 연결')} onClick={() => setAttempt(current => current + 1)}><Refresh width={14} height={14} aria-hidden="true" /></button></div>}
    <div className="relative min-h-0 flex-1 overflow-hidden">
      <div ref={surface} data-dom-browser-surface inert={connection !== 'open' || page.loading || !hasSnapshot} className={`h-full w-full ${connection !== 'open' || page.loading || !hasSnapshot ? 'pointer-events-none' : ''}`} />
      {!hasSnapshot && busy && !error && <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-ink-muted"><LoadingIndicator size={18} /></div>}
    </div>
  </HoverTipLayer></div>
}
