import { useEffect, useRef, useState } from 'react'
import { ArrowRight, HomeSimple, Refresh } from 'iconoir-react'
import { HoverTipLayer, LoadingIndicator } from '@mew/ui'
import { uiText } from '@mew/ui/i18n-core'
import { useUiLocale } from '@mew/ui/i18n'
import { requestLocalBrowser } from '@mew/ui/local-browser'
import { useFocusedShortcutScope } from '@mew/shortcuts'
import { BROWSER_DESKTOP_WS } from '../../shared/browser-desktop'
import { loginDesktopSize } from '../../shared/login-desktop'
import { openMewSocket } from '../utils/remote-transport'
import { browserDesktopPeer } from '../utils/browser-desktop-peer'
import { bindBrowserDesktopInput } from '../utils/browser-desktop-input'
import { DockGrip } from './DockWorkspace'
import { DomBrowserPorts } from './DomBrowserPorts'
import { DesktopIcon } from './desktop-stick'
import { PanelCloseButton } from './panel-close-button'

type Connection = 'connecting' | 'ready' | 'error' | 'closed'

export function BrowserDesktopPanel({ url, navigationRequest = 0, nativeAllowed = true, previewAllowed = true, streamUrl, reopen, onReady, embedded = false, onClose }: {
  url: string; navigationRequest?: number; nativeAllowed?: boolean; previewAllowed?: boolean
  streamUrl?: string; reopen?: () => Promise<string>; onReady?: () => void; embedded?: boolean; onClose?: () => void
}) {
  useUiLocale()
  const [entry, setEntry] = useState({ url, request: navigationRequest })
  const [address, setAddress] = useState(''), [addressError, setAddressError] = useState('')
  const source = streamUrl ?? BROWSER_DESKTOP_WS
  const [transport, setTransport] = useState({ url: source, attempt: 0 }), [reopening, setReopening] = useState(false)
  const [connection, setConnection] = useState<Connection>('connecting'), [error, setError] = useState('')
  const scope = useRef<HTMLDivElement>(null), stage = useRef<HTMLDivElement>(null), video = useRef<HTMLVideoElement>(null), keyboard = useRef<HTMLTextAreaElement>(null)
  const socket = useRef<WebSocket | null>(null), input = useRef<ReturnType<typeof bindBrowserDesktopInput> | null>(null)
  const latestUrl = useRef(entry.url), dimensions = useRef({ width: 960, height: 640 }), shown = useRef(false)
  const reconnecting = useRef(false)
  const previousSource = useRef(source), reopeningGeneration = useRef(0), readyCallback = useRef(onReady)
  const active = !!entry.url && nativeAllowed
  useFocusedShortcutScope(scope, { closeTab: () => { if (!onClose) return false; onClose(); return true } })
  useEffect(() => { latestUrl.current = entry.url }, [entry.url])
  useEffect(() => { setEntry({ url, request: navigationRequest }) }, [url, navigationRequest])
  useEffect(() => { readyCallback.current = onReady }, [onReady])
  useEffect(() => {
    if (previousSource.current === source) return
    previousSource.current = source; reopeningGeneration.current++; reconnecting.current = true
    setReopening(false); setTransport(current => ({ url: source, attempt: current.attempt + 1 }))
  }, [source])
  useEffect(() => () => { reopeningGeneration.current++ }, [])

  useEffect(() => {
    if (!active) return
    const surface = stage.current!, element = video.current!, field = keyboard.current!
    let disposed = false, ended = false, resizeTimer: ReturnType<typeof setTimeout> | undefined, startupTimer: ReturnType<typeof setTimeout> | undefined, frameCallback: number | undefined
    let lastSize = '', openSent = false, notified = false
    shown.current = false; setConnection('connecting'); setError('')
    const send = (value: unknown) => {
      const ws = socket.current
      if (!disposed && ws?.readyState === WebSocket.OPEN) { try { ws.send(JSON.stringify(value)) } catch { fail() } }
    }
    const fail = (message = uiText('브라우저에 연결하지 못했습니다. 다시 연결해 주세요.')) => {
      if (disposed || ended) return
      ended = true; shown.current = false; input.current?.release(); peer.close(); socket.current?.close(); setConnection('error'); setError(message)
    }
    const peer = browserDesktopPeer({ signal: send, stream: stream => {
      if (disposed || ended) return
      shown.current = false; setConnection('connecting')
      if (frameCallback !== undefined) element.cancelVideoFrameCallback(frameCallback)
      element.srcObject = stream
      clearTimeout(startupTimer); startupTimer = setTimeout(() => fail(), 30_000)
      watchFrame()
      void element.play().catch(() => fail())
    }, failed: () => fail() })
    const remoteInput = bindBrowserDesktopInput({ stage: surface, keyboard: field, size: () => dimensions.current, ready: () => shown.current && !ended && !disposed, send: message => peer.input(message) })
    input.current = remoteInput
    startupTimer = setTimeout(() => { if (!shown.current) fail() }, 30_000)
    const frame = () => {
      if (disposed || ended) return
      if (element.videoWidth > 0 && element.videoHeight > 0) {
        dimensions.current = { width: element.videoWidth, height: element.videoHeight }
        shown.current = true; clearTimeout(startupTimer); setConnection('ready'); peer.ready()
        if (!notified) { notified = true; readyCallback.current?.() }
      }
    }
    const watchFrame = () => {
      if (disposed || ended || shown.current) return
      if (typeof element.requestVideoFrameCallback === 'function') frameCallback = element.requestVideoFrameCallback(() => { frame(); if (!shown.current) watchFrame() })
    }
    const loaded = () => {
      if (typeof element.requestVideoFrameCallback !== 'function' && element.readyState >= 2) frame()
    }
    element.addEventListener('loadeddata', loaded); element.addEventListener('playing', loaded)
    watchFrame()
    let ws: WebSocket
    try {
      const target = new URL(transport.url, location.href)
      if (target.protocol === 'https:') target.protocol = 'wss:'
      else if (target.protocol === 'http:') target.protocol = 'ws:'
      else if (!['ws:', 'wss:'].includes(target.protocol)) throw new Error(uiText('브라우저 주소가 올바르지 않습니다'))
      ws = openMewSocket(target.href)
    } catch (cause) {
      fail(cause instanceof Error ? cause.message : undefined)
      return () => { disposed = true; remoteInput.close(); peer.close(); clearTimeout(startupTimer); element.removeEventListener('loadeddata', loaded); element.removeEventListener('playing', loaded); if (frameCallback !== undefined) element.cancelVideoFrameCallback(frameCallback); input.current = null }
    }
    socket.current = ws
    const resize = () => {
      if (!openSent || ended || disposed) return
      const bounds = surface.getBoundingClientRect()
      if (bounds.width <= 0 || bounds.height <= 0) return
      const next = loginDesktopSize(bounds.width, bounds.height), key = `${next.width}:${next.height}`
      if (key !== lastSize) { lastSize = key; send({ type: 'resize', ...next }) }
    }
    const observer = new ResizeObserver(() => { clearTimeout(resizeTimer); resizeTimer = setTimeout(resize, 150) })
    observer.observe(surface)
    ws.onopen = () => {
      if (disposed) return
      const bounds = surface.getBoundingClientRect(), size = loginDesktopSize(bounds.width, bounds.height)
      lastSize = `${size.width}:${size.height}`; openSent = true
      send({ type: 'open', url: latestUrl.current, ...size })
    }
    ws.onmessage = ({ data }) => {
      if (disposed || ended || typeof data !== 'string' || data.length > 256 * 1024) return
      try {
        const value = JSON.parse(data) as Record<string, unknown>
        if (value.type === 'offer' || value.type === 'candidate') void peer.message(value)
        else if (['ready', 'size', 'video'].includes(String(value.type)) && typeof value.width === 'number' && typeof value.height === 'number' && value.width > 0 && value.height > 0) dimensions.current = loginDesktopSize(value.width, value.height)
        else if (value.type === 'error') fail(typeof value.message === 'string' ? value.message : undefined)
        else if (value.type === 'closed') { ended = true; shown.current = false; remoteInput.release(); peer.close(); setConnection('closed') }
      } catch { fail(uiText('브라우저 주소가 올바르지 않습니다')) }
    }
    ws.onerror = () => fail()
    ws.onclose = () => { if (!disposed && !ended) { ended = true; shown.current = false; remoteInput.release(); peer.close(); setConnection('closed') } }
    return () => {
      const replacingViewer = reconnecting.current && surface.isConnected
      reconnecting.current = false
      if (!replacingViewer) send({ type: 'close' })
      remoteInput.close(); disposed = true; shown.current = false
      observer.disconnect(); clearTimeout(resizeTimer); clearTimeout(startupTimer)
      ws.onopen = null; ws.onmessage = null; ws.onerror = null; ws.onclose = null; ws.close()
      if (socket.current === ws) socket.current = null
      if (input.current === remoteInput) input.current = null
      peer.close(); element.pause(); element.srcObject = null
      element.removeEventListener('loadeddata', loaded); element.removeEventListener('playing', loaded)
      if (frameCallback !== undefined) element.cancelVideoFrameCallback(frameCallback)
    }
  }, [active, transport])

  useEffect(() => {
    const ws = socket.current
    if (active && ws?.readyState === WebSocket.OPEN) { input.current?.release(); ws.send(JSON.stringify({ type: 'navigate', url: entry.url })) }
  }, [entry.url, entry.request, active])

  const open = (raw: string) => {
    setAddressError('')
    if (previewAllowed && requestLocalBrowser(raw)) return
    if (!nativeAllowed) { setAddressError(uiText('권한이 없습니다')); return }
    try {
      const target = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`)
      if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) throw new Error('invalid-address')
      setEntry(current => ({ url: target.href, request: current.request + 1 }))
    } catch { setAddressError(uiText('브라우저 주소가 올바르지 않습니다')) }
  }
  const reconnect = async () => {
    if (reopening) return
    const generation = ++reopeningGeneration.current
    setReopening(true)
    try {
      const next = reopen ? await reopen() : transport.url
      if (generation !== reopeningGeneration.current) return
      reconnecting.current = true; setTransport(current => ({ url: next, attempt: current.attempt + 1 }))
    } catch (cause) {
      if (generation !== reopeningGeneration.current) return
      input.current?.release(); shown.current = false; setConnection('error')
      setError(cause instanceof Error ? cause.message : uiText('다시 연결하지 못했습니다.'))
    } finally { if (generation === reopeningGeneration.current) setReopening(false) }
  }
  const iconButton = 'flex h-7 w-7 shrink-0 items-center justify-center rounded text-ink-secondary hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40'
  return <HoverTipLayer className="flex h-full min-h-0 min-w-0 flex-col bg-surface-deep text-ink">
    <div ref={scope} data-browser-desktop-panel data-embedded={embedded || undefined} className="flex h-full min-h-0 min-w-0 flex-col">
      <header className="flex h-8 shrink-0 items-center gap-0.5 border-b border-edge bg-surface px-1">
        {!embedded && <DockGrip group="browser" />}
        {!embedded && active && previewAllowed && <button type="button" className={iconButton} aria-label={uiText('열려 있는 포트')} data-tip={uiText('열려 있는 포트')} onClick={() => setEntry(current => ({ url: '', request: current.request + 1 }))}><HomeSimple width={15} height={15} aria-hidden="true" /></button>}
        <span className="min-w-0 flex-1 truncate text-xs">{!embedded && uiText('브라우저')}</span>
        {active && <>
          <button type="button" className={iconButton} aria-label={uiText('키보드 입력')} data-tip={uiText('키보드 입력')} disabled={connection !== 'ready'} onClick={() => keyboard.current?.focus({ preventScroll: true })}><DesktopIcon kind="keyboard" /></button>
          <button type="button" className={iconButton} aria-label={uiText('다시 연결')} data-tip={uiText('다시 연결')} disabled={reopening} onClick={() => void reconnect()}><Refresh width={15} height={15} aria-hidden="true" /></button>
        </>}
        {!embedded && onClose && <PanelCloseButton aria-label={uiText('브라우저 닫기')} onClick={onClose} />}
      </header>
      {!active ? <>
        <form className="flex shrink-0 items-center gap-1 border-b border-edge px-1 py-1" onSubmit={event => { event.preventDefault(); if (address.trim()) open(address.trim()) }}>
          <input aria-label={uiText('브라우저 주소')} className="h-8 min-w-0 flex-1 rounded bg-surface px-2 text-xs outline-none focus-visible:ring-1 focus-visible:ring-accent" value={address} onChange={event => setAddress(event.target.value)} autoCapitalize="off" autoCorrect="off" spellCheck={false} inputMode="url" />
          <button type="submit" className={iconButton} aria-label={uiText('이동')} data-tip={uiText('이동')}><ArrowRight width={16} height={16} aria-hidden="true" /></button>
        </form>
        {addressError && <p role="alert" className="px-2 py-1 text-xs text-danger">{addressError}</p>}
        {previewAllowed && <DomBrowserPorts onOpen={raw => { requestLocalBrowser(raw) }} />}
      </> : <div ref={stage} data-browser-desktop data-login-desktop={embedded || undefined} tabIndex={0} role="application" aria-label={embedded ? uiText('로그인 화면') : uiText('브라우저')} className="relative min-h-0 flex-1 touch-none overflow-hidden bg-black outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent">
        <video ref={video} playsInline autoPlay muted disablePictureInPicture className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain" />
        <textarea ref={keyboard} aria-label={embedded ? uiText('로그인 키보드 입력') : uiText('키보드 입력')} autoCapitalize="off" autoCorrect="off" spellCheck={false} className="absolute bottom-0 left-0 h-px w-px opacity-0" />
        {connection === 'connecting' && <div role="status" className="pointer-events-none absolute inset-0 flex items-center justify-center text-white"><LoadingIndicator size={20} /></div>}
        {(connection === 'error' || connection === 'closed') && <div role="alert" className="absolute inset-x-1 bottom-1 flex items-center gap-1 rounded bg-surface-raised px-2 py-1 text-xs"><span className="min-w-0 flex-1 select-text break-words">{error || uiText('연결이 끊겼습니다. 다시 연결해 주세요.')}</span><button type="button" className={iconButton} aria-label={uiText('다시 연결')} data-tip={uiText('다시 연결')} disabled={reopening} onClick={() => void reconnect()}><Refresh width={15} height={15} aria-hidden="true" /></button></div>}
      </div>}
    </div>
  </HoverTipLayer>
}
