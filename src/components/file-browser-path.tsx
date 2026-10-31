import { canAutoFocusInput, getFixedPopupLayout, LoadingIndicator, useOverlayDismiss } from '@mew/ui'
import { ArrowRight, Folder, HomeSimple } from 'iconoir-react'
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { fetchAgentCwdSuggestions, type ExternalEntriesResult } from '../api/client'
import { useI18n } from '../i18n'
import { currentFolderPathSuggestions, resolveFileBrowserDraft, type FileBrowserPathSuggestion } from './file-browser-path-suggestions'

export function FileBrowserPath({ draft, result, disabled, autoFocus, label, onDraftChange, onNavigate }: {
  draft: string
  result: ExternalEntriesResult | null
  disabled: boolean
  autoFocus: boolean
  label: string
  onDraftChange: (value: string) => void
  onNavigate: (value: string) => void
}) {
  const { t } = useI18n()
  const id = useId()
  const form = useRef<HTMLFormElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const popup = useRef<HTMLDivElement>(null)
  const composing = useRef(false)
  const sequence = useRef(0)
  const [open, setOpen] = useState(false)
  const [selection, setSelection] = useState<{ key: string; index: number } | null>(null)
  const [position, setPosition] = useState<{ style: CSSProperties; container: Element } | null>(null)
  const [remote, setRemote] = useState<{ key: string; dirs: FileBrowserPathSuggestion[]; error?: string } | null>(null)
  const local = useMemo(() => currentFolderPathSuggestions(draft, result), [draft, result])
  const base = result?.path ?? ''
  const key = JSON.stringify([draft, base])
  const active = selection?.key === key ? selection.index : -1
  const expanded = open && !disabled
  const suggestions = local ?? (remote?.key === key ? remote.dirs : [])
  const loading = local === null && remote?.key !== key
  const error = local === null && remote?.key === key ? remote.error : undefined
  const activeSuggestion = suggestions[active]
  const close = useCallback(() => { setOpen(false); setSelection(null) }, [])

  useOverlayDismiss(expanded && close, {
    outside: () => popup.current,
    outsideIgnore: () => form.current,
    closeOnEscape: event => !event.isComposing && !composing.current,
  })

  useEffect(() => {
    if (!expanded || local !== null) return
    const request = ++sequence.current
    let cancelled = false
    void fetchAgentCwdSuggestions(draft, base, draft === base)
      .then(next => { if (!cancelled && request === sequence.current) setRemote({ key, dirs: next.dirs }) })
      .catch((reason: unknown) => {
        if (!cancelled && request === sequence.current) setRemote({ key, dirs: [], error: reason instanceof Error ? reason.message : String(reason) })
      })
    return () => { cancelled = true }
  }, [expanded, local, draft, base, key])

  useLayoutEffect(() => {
    if (!expanded) return
    const host = input.current?.closest('.mew-dialog')
    const place = () => {
      const rect = input.current!.getBoundingClientRect()
      const layout = getFixedPopupLayout(host)
      const bounds = layout.bounds
      const width = Math.min(Math.max(rect.width, 260), Math.max(0, bounds.width - 16))
      const below = bounds.bottom - rect.bottom - 8
      const above = rect.top - bounds.top - 8
      const down = below >= Math.min(240, above)
      setPosition({ container: host ?? document.body, style: layout.toStyle({
        width,
        left: Math.max(bounds.left + 8, Math.min(rect.left, bounds.right - width - 8)),
        maxHeight: Math.max(0, Math.min(260, down ? below : above)),
        ...(down ? { top: rect.bottom + 4 } : { bottom: window.innerHeight - rect.top + 4 }),
      }) })
    }
    const focusOutside = (event: FocusEvent) => {
      if (!form.current?.contains(event.target as Node) && !popup.current?.contains(event.target as Node)) close()
    }
    place()
    const observer = new ResizeObserver(place)
    observer.observe(input.current!)
    if (host) observer.observe(host)
    const mutations = new MutationObserver(place)
    mutations.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] })
    if (host) mutations.observe(host, { attributes: true, attributeFilter: ['class', 'style'] })
    document.addEventListener('focusin', focusOutside)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    window.visualViewport?.addEventListener('resize', place)
    window.visualViewport?.addEventListener('scroll', place)
    return () => {
      observer.disconnect(); mutations.disconnect()
      document.removeEventListener('focusin', focusOutside)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
      window.visualViewport?.removeEventListener('resize', place)
      window.visualViewport?.removeEventListener('scroll', place)
    }
  }, [expanded, close])

  useEffect(() => {
    if (active >= 0) popup.current?.querySelector<HTMLElement>(`[data-suggestion-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const navigate = (value: string) => {
    close()
    onNavigate(resolveFileBrowserDraft(value, base))
  }
  const choose = (entry: FileBrowserPathSuggestion) => {
    navigate(entry.path)
    if (canAutoFocusInput()) input.current?.focus({ preventScroll: true })
    else input.current?.blur()
  }

  return <form ref={form} noValidate className="shrink-0 px-3 pb-2 sm:px-4" onSubmit={event => {
    event.preventDefault()
    if (!disabled && !composing.current) navigate(draft)
  }}>
    <label htmlFor={id} className="mb-1 block text-xs font-medium text-ink-secondary">{label}</label>
    <div className="flex items-center gap-1">
      <button type="button" disabled={disabled} onClick={() => navigate('')} aria-label={t('project.home')} data-tip={t('project.home')}
        className="inline-flex min-h-9 min-w-9 shrink-0 items-center justify-center rounded-md text-ink-secondary hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40"><HomeSimple width={18} height={18} aria-hidden="true" /></button>
      <input ref={input} id={id} role="combobox" aria-autocomplete="list" aria-haspopup="listbox" aria-expanded={expanded}
        aria-controls={expanded ? `${id}-suggestions` : undefined} aria-activedescendant={expanded && activeSuggestion ? `${id}-option-${active}` : undefined}
        data-dialog-autofocus={autoFocus || undefined} value={draft} disabled={disabled} spellCheck={false} autoComplete="off" autoCapitalize="none" autoCorrect="off"
        onFocus={() => setOpen(true)} onClick={() => setOpen(true)} onChange={event => { setSelection(null); onDraftChange(event.target.value); setOpen(true) }}
        onCompositionStart={() => { composing.current = true }} onCompositionEnd={() => { composing.current = false }}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing || composing.current || event.keyCode === 229) {
            if (event.key === 'Enter') event.preventDefault()
            return
          }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault(); event.stopPropagation(); setOpen(true)
            if (suggestions.length) setSelection(current => {
              const index = current?.key === key ? current.index : -1
              return { key, index: event.key === 'ArrowDown' ? (index + 1) % suggestions.length : (index <= 0 ? suggestions.length : index) - 1 }
            })
          } else if (event.key === 'Enter' && expanded && activeSuggestion) {
            event.preventDefault(); event.stopPropagation(); choose(activeSuggestion)
          } else if (event.key === 'Tab') close()
        }}
        className="min-h-9 min-w-0 flex-1 rounded-md border border-edge-strong bg-surface-deep px-2 font-mono text-xs text-ink caret-accent focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40" />
      <button type="submit" disabled={disabled} aria-label={t('folder.go')} data-tip={t('folder.go')}
        className="inline-flex min-h-9 min-w-9 shrink-0 items-center justify-center rounded-md text-ink-secondary hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40"><ArrowRight width={18} height={18} aria-hidden="true" /></button>
    </div>
    {expanded && position && createPortal(<div ref={popup} id={`${id}-suggestions`} role="listbox" aria-label={label} aria-busy={loading} style={position.style}
      className="fixed z-[1201] overflow-y-auto overscroll-contain rounded-lg border border-edge-bright bg-surface-raised p-1 shadow-lg">
      {loading ? <div role="status" className="flex min-h-10 items-center justify-center gap-2 px-2 text-xs text-ink-secondary"><LoadingIndicator size={16} />{t('common.loading')}</div>
        : error ? <p role="alert" className="select-text break-words px-2 py-2 text-xs text-danger-ink">{error}</p>
          : suggestions.length === 0 ? <p role="status" className="px-2 py-2 text-xs text-ink-secondary">{t('project.noMatches')}</p>
            : suggestions.map((entry, index) => <button type="button" key={entry.path} id={`${id}-option-${index}`} role="option" aria-selected={active === index}
              tabIndex={-1} data-suggestion-index={index} onMouseDown={event => event.preventDefault()} onClick={() => choose(entry)}
              onPointerMove={event => { if (event.pointerType === 'mouse') setSelection({ key, index }) }}
              className={`flex min-h-10 w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-ink hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent ${active === index ? 'bg-surface-hover' : ''}`}>
              <Folder width={16} height={16} className="shrink-0 text-ink-secondary" aria-hidden="true" />
              <span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">{entry.name}</span><span className="block truncate font-mono text-xs text-ink-secondary">{entry.path}</span></span>
            </button>)}
    </div>, position.container)}
  </form>
}
