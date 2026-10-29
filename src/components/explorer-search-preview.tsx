import { getFixedPopupLayout } from '@mew/ui'
import { uiText } from '@mew/ui/i18n-core'
import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import type { ExplorerSearch } from '../utils/explorer-search'

export function ExplorerSearchPreview({ listRef, search }: { listRef: RefObject<HTMLDivElement | null>; search: ExplorerSearch }) {
  const id = useId()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [index, setIndex] = useState(0)
  const popup = useRef<HTMLDivElement>(null)
  const shownFor = useRef<HTMLElement | null>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const path = anchor?.dataset.searchFile ?? ''
  const matches = search.matches.get(path) ?? []
  const match = matches[Math.min(index, matches.length - 1)]
  const cancelHide = () => clearTimeout(hideTimer.current)
  const hideSoon = () => { cancelHide(); hideTimer.current = setTimeout(() => setAnchor(null), 120) }

  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const show = (event: Event) => {
      if (event instanceof PointerEvent && event.pointerType !== 'mouse') return
      const row = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-search-file]') : null
      if (!row || !search.matches.has(row.dataset.searchFile!)) { hideSoon(); return }
      cancelHide()
      if (shownFor.current !== row) setIndex(0)
      shownFor.current = row
      setAnchor(row)
    }
    const leave = (event: Event) => {
      const next = (event as PointerEvent | FocusEvent).relatedTarget
      if (next instanceof Node && (shownFor.current?.contains(next) || popup.current?.contains(next))) return
      hideSoon()
    }
    const close = () => setAnchor(null)
    list.addEventListener('pointerover', show)
    list.addEventListener('pointerout', leave)
    list.addEventListener('focusin', show)
    list.addEventListener('focusout', leave)
    list.addEventListener('pointerdown', close)
    list.addEventListener('scroll', close)
    return () => {
      cancelHide()
      list.removeEventListener('pointerover', show)
      list.removeEventListener('pointerout', leave)
      list.removeEventListener('focusin', show)
      list.removeEventListener('focusout', leave)
      list.removeEventListener('pointerdown', close)
      list.removeEventListener('scroll', close)
    }
  }, [listRef, search.matches])

  useEffect(() => { setAnchor(null) }, [search.query, search.matches])
  useEffect(() => {
    if (!anchor || !match) return
    anchor.setAttribute('aria-describedby', id)
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      setAnchor(null)
    }
    window.addEventListener('keydown', keydown, true)
    return () => { anchor.removeAttribute('aria-describedby'); window.removeEventListener('keydown', keydown, true) }
  }, [anchor, match, id])

  useLayoutEffect(() => {
    if (!anchor || !popup.current || !match) return
    const place = () => {
      if (!anchor.isConnected || !popup.current) { setAnchor(null); return }
      const layout = getFixedPopupLayout(document.body)
      const bounds = layout.bounds, row = anchor.getBoundingClientRect(), tip = popup.current
      const width = Math.min(640, bounds.width - 16)
      tip.style.width = `${width}px`
      tip.style.maxHeight = `${Math.max(0, bounds.height - 16)}px`
      const height = tip.getBoundingClientRect().height
      const right = bounds.right - row.right >= width + 6
      const left = right ? row.right + 6 : Math.max(bounds.left + 8, Math.min(row.left, bounds.right - width - 8))
      const top = Math.max(bounds.top + 8, Math.min(right ? row.top : row.bottom + 6, bounds.bottom - height - 8))
      const position = layout.toStyle({ left, top })
      tip.style.left = `${position.left}px`
      tip.style.top = `${position.top}px`
    }
    place()
    window.addEventListener('resize', place)
    window.visualViewport?.addEventListener('resize', place)
    return () => { window.removeEventListener('resize', place); window.visualViewport?.removeEventListener('resize', place) }
  }, [anchor, match])

  if (!anchor || !match) return null
  const lines = match.context ?? [{ line: match.line, text: match.text, matchStart: match.matchStart, matchEnd: match.matchEnd }]
  const buttonClass = 'flex h-6 w-6 shrink-0 items-center justify-center rounded text-ink-secondary hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40'
  return createPortal(<div ref={popup} id={id} role="tooltip" data-search-preview
    onPointerEnter={cancelHide} onPointerLeave={hideSoon} onFocus={cancelHide} onBlur={hideSoon}
    className="fixed z-[1200] max-h-[calc(100dvh-16px)] overflow-auto rounded border border-edge-bright bg-surface-raised p-2 text-xs text-ink shadow-lg">
    <div className="mb-1 flex min-w-0 items-center gap-1">
      <span className="min-w-0 flex-1 truncate text-ink-secondary">{path}:{match.line}</span>
      {matches.length > 1 && <>
        <button type="button" aria-label={uiText('이전 매치')} disabled={index === 0} className={buttonClass} onClick={() => setIndex(value => value - 1)}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg></button>
        <span className="shrink-0 tabular-nums text-ink-muted">{Math.min(index + 1, matches.length)}/{matches.length}</span>
        <button type="button" aria-label={uiText('다음 매치')} disabled={index >= matches.length - 1} className={buttonClass} onClick={() => setIndex(value => value + 1)}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg></button>
      </>}
      {search.onReplaceFile && <button type="button" aria-label={uiText('이 파일에서 모두 바꾸기')} className={buttonClass} onClick={() => { search.onReplaceFile?.(path); setAnchor(null) }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 7h15l-3-3M20 17H5l3 3M19 7l-3 3M5 17l3-3" /></svg></button>}
      <button type="button" aria-label={uiText('파일 열기')} className={buttonClass} onClick={() => { search.onOpenMatch(path, match); setAnchor(null) }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M8 5h11v11M19 5 5 19" /></svg></button>
    </div>
    <div className="font-mono leading-5">{lines.map(line => <div key={line.line} data-search-context-line={line.line} className={`flex min-w-0 gap-2 ${line.line === match.line ? 'text-ink' : 'text-ink-secondary'}`}>
      <span aria-hidden="true" className="w-8 shrink-0 text-right tabular-nums">{line.line}</span>
      {line.matchStart !== undefined && line.matchEnd !== undefined ? <span className="flex min-w-0 flex-1 whitespace-pre">
        <span className="max-w-[35%] shrink truncate">{line.text.slice(0, line.matchStart)}</span>
        <mark className="min-w-0 shrink-0 truncate rounded bg-accent/25 px-0.5 font-semibold text-ink" style={{ maxWidth: '100%' }}>{line.text.slice(line.matchStart, line.matchEnd)}</mark>
        <span className="min-w-0 flex-1 truncate">{line.text.slice(line.matchEnd)}</span>
      </span> : <span className="min-w-0 flex-1 truncate whitespace-pre">{line.text || ' '}</span>}
    </div>)}</div>
  </div>, document.body)
}
