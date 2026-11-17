import { canAutoFocusInput } from './input-focus'
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useOverlayDismiss } from './useOverlayDismiss'
import { getFixedPopupLayout } from './fixed-popup-layout'

export type SelectOption = { value: string; label: string; disabled?: boolean; leading?: ReactNode }

type SelectFieldProps = {
  id?: string; label: string; options: readonly SelectOption[]; disabled?: boolean
  compact?: boolean; className?: string; portalContainer?: HTMLElement | null
  triggerContent?: ReactNode; triggerClassName?: string; popupWidth?: number; popupClassName?: string
  placeholder?: string
} & ({ multiple?: false; editable?: boolean; value: string; onChange: (value: string) => void }
  | { multiple: true; editable?: false; value: string[]; onChange: (value: string[]) => void })

const SELECT_OPEN_DURATION = 160
const SELECT_CLOSE_DURATION = 120
const SELECT_OPEN_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)'
const SELECT_CLOSE_EASING = 'cubic-bezier(0.4, 0, 1, 1)'
const SELECT_CLOSED_FRAME = { opacity: 0, transform: 'scaleY(0.25)' }
const SELECT_OPEN_FRAME = { opacity: 1, transform: 'scaleY(1)' }

/** Themed selection. Focus stays on the trigger, including inside dialogs. */
export function SelectField({ id: fieldId, label, value, options, disabled = false, editable = false, compact = false, className = 'w-full min-w-0', portalContainer, onChange, multiple, triggerContent, triggerClassName, popupWidth, popupClassName, placeholder }: SelectFieldProps) {
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null), field = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false), [closing, setClosing] = useState(false), [active, setActive] = useState(0)
  const [position, setPosition] = useState<CSSProperties | null>(null)
  const search = useRef({ text: '', at: 0 })
  const animation = useRef<Animation | null>(null)
  const snapshot = useRef<{ opacity: number; transform: string } | null>(null)
  const isSelected = (option: SelectOption) => multiple ? value.includes(option.value) : option.value === value
  const expanded = open && !disabled
  const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const readFrame = () => {
    const view = menu.current?.ownerDocument.defaultView
    if (!menu.current || !view) return null
    const style = view.getComputedStyle(menu.current)
    const opacity = Number.parseFloat(style.opacity)
    return { opacity: Number.isFinite(opacity) ? opacity : 1, transform: !style.transform || style.transform === 'none' ? 'scaleY(1)' : style.transform }
  }
  const openMenu = () => {
    if (closing && menu.current) snapshot.current = readFrame()
    setClosing(false)
    setOpen(true)
  }
  const close = () => {
    if (!open) return
    if (disabled || !menu.current?.animate || reducedMotion()) {
      animation.current?.cancel(); animation.current = null; snapshot.current = null
      setClosing(false); setOpen(false); setPosition(null)
      return
    }
    snapshot.current = readFrame()
    setClosing(true); setOpen(false)
  }
  useOverlayDismiss(expanded && close)
  useEffect(() => {
    if (!disabled) return
    animation.current?.cancel(); animation.current = null; snapshot.current = null
    setClosing(false); setOpen(false); setPosition(null)
  }, [disabled])
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const stop = () => {
      animation.current?.cancel(); animation.current = null; snapshot.current = null
      setClosing(false)
    }
    const onChange = () => { if (media.matches) stop() }
    media.addEventListener('change', onChange)
    return () => { media.removeEventListener('change', onChange); animation.current?.cancel(); animation.current = null }
  }, [])
  useLayoutEffect(() => {
    if (!expanded) return
    const place = () => {
      let rect = field.current!.getBoundingClientRect()
      const transform = portalContainer && getComputedStyle(portalContainer).transform
      const matrix = transform && transform !== 'none' ? new DOMMatrixReadOnly(transform) : null
      const local = !!matrix && (matrix.b !== 0 || matrix.c !== 0)
      if (local && portalContainer && matrix) {
        const area = portalContainer.getBoundingClientRect()
        // Only invert the linear part: layout coordinates are centered in the container.
        const inverse = new DOMMatrixReadOnly([matrix.a, matrix.b, matrix.c, matrix.d, 0, 0]).inverse()
        const corners = [[rect.left, rect.top], [rect.right, rect.top], [rect.left, rect.bottom], [rect.right, rect.bottom]].map(([x, y]) => {
          const point = inverse.transformPoint({ x: x - area.left - area.width / 2, y: y - area.top - area.height / 2 })
          return { x: portalContainer.clientWidth / 2 + point.x, y: portalContainer.clientHeight / 2 + point.y }
        })
        const x = Math.min(...corners.map(point => point.x)), y = Math.min(...corners.map(point => point.y))
        rect = new DOMRect(x, y, Math.max(...corners.map(point => point.x)) - x, Math.max(...corners.map(point => point.y)) - y)
      }
      const layout = getFixedPopupLayout(portalContainer)
      const left = local ? 0 : layout.bounds.left, top = local ? 0 : layout.bounds.top
      const width = local ? portalContainer!.clientWidth : layout.bounds.width
      const height = local ? portalContainer!.clientHeight : layout.bounds.height
      const below = top + height - rect.bottom - 8, above = rect.top - top - 8
      const down = below >= Math.min(280, menu.current?.scrollHeight ?? options.length * 44 + 8) || below >= above
      const menuWidth = Math.max(0, Math.min(popupWidth ?? rect.width, width - 16))
      const position = { left: Math.max(left + 8, Math.min(rect.left, left + width - menuWidth - 8)),
        width: menuWidth, maxHeight: Math.max(0, Math.min(280, down ? below : above)),
        ...(down ? { top: rect.bottom + 4 } : { bottom: (local ? height : window.innerHeight) - rect.top + 4 }) }
      const style = local ? { ...position, position: 'absolute' as const } : layout.toStyle(position)
      setPosition({ ...style, transformOrigin: down ? 'top' : 'bottom' })
    }
    const outside = (event: PointerEvent) => {
      const target = event.target as Node
      if (!field.current?.contains(target) && !menu.current?.contains(target)) close()
    }
    place()
    const observer = new ResizeObserver(place)
    observer.observe(field.current!)
    const fixedHost = getFixedPopupLayout(portalContainer).host
    if (portalContainer) observer.observe(portalContainer)
    if (fixedHost && fixedHost !== portalContainer) observer.observe(fixedHost)
    const mutations = new MutationObserver(place)
    mutations.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class'] })
    if (portalContainer) mutations.observe(portalContainer, { attributes: true, attributeFilter: ['style', 'class'] })
    if (fixedHost && fixedHost !== portalContainer) mutations.observe(fixedHost, { attributes: true, attributeFilter: ['style', 'class'] })
    document.addEventListener('pointerdown', outside, true)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    window.visualViewport?.addEventListener('resize', place)
    window.visualViewport?.addEventListener('scroll', place)
    return () => {
      observer.disconnect(); mutations.disconnect()
      document.removeEventListener('pointerdown', outside, true)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
      window.visualViewport?.removeEventListener('resize', place)
      window.visualViewport?.removeEventListener('scroll', place)
    }
  }, [expanded, options.length, portalContainer, popupWidth])
  const positioned = position !== null
  useLayoutEffect(() => {
    if (expanded && positioned) menu.current?.children[active]?.scrollIntoView({ block: 'nearest' })
  }, [expanded, active, positioned])
  useLayoutEffect(() => {
    if (!expanded && !closing) {
      if (positioned) setPosition(null)
      return
    }
    const element = menu.current
    if (!element || !positioned) return
    animation.current?.cancel(); animation.current = null
    if (reducedMotion() || !element.animate) {
      snapshot.current = null
      if (closing) { setClosing(false); setPosition(null) }
      return
    }
    if (expanded) {
      const from = snapshot.current ?? SELECT_CLOSED_FRAME
      snapshot.current = null
      const current = element.animate([from, SELECT_OPEN_FRAME], {
        duration: SELECT_OPEN_DURATION,
        easing: SELECT_OPEN_EASING,
      })
      animation.current = current
      current.onfinish = current.oncancel = () => {
        if (animation.current === current) animation.current = null
      }
      return
    }
    const from = snapshot.current ?? SELECT_OPEN_FRAME
    snapshot.current = null
    const current = element.animate([from, SELECT_CLOSED_FRAME], {
      duration: SELECT_CLOSE_DURATION,
      easing: SELECT_CLOSE_EASING,
      fill: 'forwards',
    })
    animation.current = current
    current.onfinish = current.oncancel = () => {
      if (animation.current !== current) return
      animation.current = null
      setClosing(false)
      setPosition(null)
    }
  }, [expanded, closing, positioned])
  const show = () => {
    const selected = options.findIndex(option => isSelected(option) && !option.disabled)
    setActive(selected >= 0 ? selected : editable ? -1 : options.findIndex(option => !option.disabled))
    search.current = { text: '', at: 0 }
    openMenu()
  }
  const pick = (index: number) => {
    const option = options[index]
    if (!option || option.disabled || disabled) return
    if (!multiple) close()
    const focusTarget = editable ? input.current : trigger.current
    if (!editable || canAutoFocusInput()) focusTarget?.focus({ preventScroll: true })
    if (multiple) onChange(value.includes(option.value) ? value.filter(item => item !== option.value) : [...value, option.value])
    else if (option.value !== value) onChange(option.value)
  }
  const move = (step: number) => {
    for (let n = 1; n <= options.length; n++) {
      const origin = active < 0 ? (step > 0 ? -1 : 0) : active
      const index = (origin + step * n + options.length) % options.length
      if (!options[index].disabled) { setActive(index); return }
    }
  }
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement | HTMLButtonElement>) => {
    if (disabled || event.nativeEvent.isComposing) return
    if (event.key === 'Tab') {
      const action = expanded && !event.shiftKey ? menu.current?.querySelector<HTMLButtonElement>('[data-select-option-action]') : null
      if (action) { event.preventDefault(); action.focus() } else close()
      return
    }
    if (!expanded && !editable && !multiple && !event.altKey && !event.ctrlKey && !event.metaKey &&
      (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault(); event.stopPropagation()
      const step = event.key === 'ArrowDown' ? 1 : -1
      const selected = options.findIndex(option => option.value === value)
      const origin = selected >= 0 ? selected : step > 0 ? -1 : options.length
      for (let index = origin + step; index >= 0 && index < options.length; index += step) {
        if (!options[index].disabled) { pick(index); break }
      }
      return
    }
    // Keep spaces, caret movement and text shortcuts available while entering a custom value.
    if (editable && (event.key === ' ' || event.ctrlKey || event.metaKey || event.altKey ||
      (['Home', 'End', 'Enter'].includes(event.key) && (!expanded || active < 0)))) {
      if (event.key === 'Enter') close()
      return
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(event.key)) {
      event.preventDefault(); event.stopPropagation()
      if (!expanded) { show(); return }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') move(event.key === 'ArrowDown' ? 1 : -1)
      else if (event.key === 'Home') setActive(options.findIndex(option => !option.disabled))
      else if (event.key === 'End') setActive(options.findLastIndex(option => !option.disabled))
      else pick(active)
    } else if (!editable && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault()
      if (!expanded) show()
      const now = Date.now(), text = (now - search.current.at < 700 ? search.current.text : '') + event.key.toLocaleLowerCase()
      search.current = { text, at: now }
      const index = options.findIndex(option => !option.disabled && option.label.toLocaleLowerCase().startsWith(text))
      if (index >= 0) setActive(index)
    }
  }
  const accessibility = {
    id: fieldId, role: 'combobox', 'aria-label': label, 'aria-haspopup': 'listbox' as const,
    'aria-expanded': expanded, 'aria-controls': expanded ? id : undefined,
    'aria-activedescendant': expanded && active >= 0 ? `${id}-${active}` : undefined,
  }
  const chevron = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" className="shrink-0"><path d={expanded ? 'm6 15 6-6 6 6' : 'm6 9 6 6 6-6'} /></svg>
  return <>
    <div ref={field} className={className}>
      {editable ? <div className={`flex rounded border border-edge-strong bg-surface text-ink focus-within:border-edge-bright ${compact ? 'min-h-8 text-xs pointer-coarse:min-h-11' : 'min-h-11 text-sm'}`}>
        <input ref={input} {...accessibility} value={value} placeholder={placeholder} disabled={disabled} autoComplete="off" spellCheck={false}
          className="min-w-0 flex-1 rounded bg-transparent px-2.5 focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-60"
          onClick={() => { if (!expanded) show() }} onKeyDown={onKeyDown}
          onChange={event => { if (!multiple) { setActive(-1); openMenu(); onChange(event.target.value) } }} />
        <button type="button" tabIndex={-1} aria-label={label} aria-expanded={expanded} aria-controls={expanded ? id : undefined}
          disabled={disabled} className={`flex shrink-0 items-center justify-center rounded hover:bg-surface-hover disabled:opacity-60 ${compact ? 'w-8 pointer-coarse:w-11' : 'w-11'}`}
          onPointerDown={event => event.preventDefault()}
          onClick={() => {
            if (canAutoFocusInput()) input.current?.focus({ preventScroll: true })
            if (expanded) close()
            else show()
          }}>{chevron}</button>
      </div> : <button ref={trigger} type="button" {...accessibility}
        data-tip={triggerContent !== undefined ? label : undefined}
        disabled={disabled} onClick={() => expanded ? close() : show()} onKeyDown={onKeyDown}
        className={triggerClassName ?? `flex w-full min-w-0 items-center justify-between gap-2 rounded border border-edge-strong bg-surface px-2.5 text-left text-ink hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-60 ${compact ? 'min-h-8 text-xs pointer-coarse:min-h-11' : 'min-h-11 text-sm'}`}>
        {triggerContent ?? <><span className="min-w-0 flex-1 truncate">{multiple ? options.filter(isSelected).map(option => option.label).join(', ') || label : options.find(isSelected)?.label ?? value}</span>{chevron}</>}
      </button>}
    </div>
    {(expanded || closing) && position && createPortal(<div ref={menu} id={expanded ? id : undefined} role={expanded ? 'listbox' : undefined} aria-hidden={!expanded || undefined}
      aria-label={expanded ? label : undefined} aria-multiselectable={expanded && multiple ? true : undefined}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget) && event.relatedTarget !== trigger.current && event.relatedTarget !== input.current) close() }}
      data-state={expanded ? 'open' : 'closed'} data-placement={position.transformOrigin === 'bottom' ? 'top' : 'bottom'} style={position}
      className={`mew-overlay-surface fixed z-[1201] overflow-y-auto overscroll-contain rounded border border-edge-bright bg-surface-raised py-1 text-sm shadow-xl ${expanded ? '' : 'pointer-events-none '} ${popupClassName ?? ''}`}>
      {options.map((option, index) => <div key={option.value} id={expanded ? `${id}-${index}` : undefined} role={expanded ? 'option' : undefined}
        aria-label={expanded ? option.label : undefined} aria-selected={expanded ? isSelected(option) : undefined} aria-disabled={expanded && option.disabled ? true : undefined}
        data-active={active === index || undefined}
        onPointerDown={event => event.preventDefault()} onClick={() => { setActive(index); pick(index) }}
        className={`flex items-center gap-2 px-2.5 ${multiple && compact ? 'min-h-8 text-xs pointer-coarse:min-h-11' : 'min-h-11'} ${option.disabled ? 'cursor-default text-ink-muted' : 'cursor-pointer text-ink hover:bg-surface-hover'} ${active === index ? 'bg-surface-hover' : ''}`}>
        {option.leading}
        <span className="min-w-0 flex-1 break-words">{option.label}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" className="shrink-0">{isSelected(option) && <path d="m5 12 4 4L19 6" />}</svg>
      </div>)}
    </div>, portalContainer ?? document.body)}
  </>
}
