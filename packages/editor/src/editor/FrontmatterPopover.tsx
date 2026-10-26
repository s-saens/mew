import { canAutoFocusInput, getFixedPopupLayout, useOverlayDismiss } from '@mew/ui'
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** Field menus share viewport placement, dismissal and keyboard navigation. */
export function FrontmatterPopover({ anchor, label, onClose, children, initialFocus, ignoreAnchor = false }: {
  anchor: HTMLElement; label: string; onClose: () => void; children: ReactNode; initialFocus?: 'input'; ignoreAnchor?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<CSSProperties>({ left: 0, top: 0, maxHeight: 280, visibility: 'hidden' })
  const close = () => { onClose(); if (anchor.isConnected) anchor.focus({ preventScroll: true }) }
  useOverlayDismiss(close, { outside: () => ref.current, outsideIgnore: () => ignoreAnchor ? anchor : null })
  useLayoutEffect(() => {
    const place = () => {
      const rect = anchor.getBoundingClientRect()
      const menu = ref.current!
      const layout = getFixedPopupLayout(menu.parentElement)
      const { left, top, right, bottom, width, height } = layout.bounds
      const maxWidth = Math.max(0, width - 16)
      menu.style.maxWidth = `${layout.toStyle({ maxWidth }).maxWidth}px`
      const below = bottom - rect.bottom - 8, above = rect.top - top - 8
      const down = below >= Math.min(menu.scrollHeight, 280) || below >= above
      const maxHeight = Math.max(0, Math.min(height - 16, down ? below : above))
      setPosition({ ...layout.toStyle({ left: Math.max(left + 8, Math.min(rect.left, right - menu.getBoundingClientRect().width - 8)),
        top: down ? Math.max(top + 8, rect.bottom + 4) : Math.max(top + 8, rect.top - Math.min(menu.scrollHeight, maxHeight) - 4),
        maxHeight, maxWidth }), visibility: 'visible' })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    window.visualViewport?.addEventListener('resize', place)
    window.visualViewport?.addEventListener('scroll', place)
    const observer = new ResizeObserver(place)
    observer.observe(ref.current!)
    observer.observe(anchor)
    const host = getFixedPopupLayout(ref.current!.parentElement).host
    if (host) observer.observe(host)
    const mutations = new MutationObserver(place)
    mutations.observe(anchor.ownerDocument.documentElement, { attributes: true, attributeFilter: ['style', 'class'] })
    if (host) mutations.observe(host, { attributes: true, attributeFilter: ['style', 'class'] })
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
      window.visualViewport?.removeEventListener('resize', place)
      window.visualViewport?.removeEventListener('scroll', place)
      observer.disconnect()
      mutations.disconnect()
    }
  }, [anchor])
  useEffect(() => {
    if (position.visibility !== 'visible') return
    const target = initialFocus === 'input' && canAutoFocusInput() ? 'input' : 'button'
    ref.current?.querySelector<HTMLElement>(target)?.focus({ preventScroll: true })
  }, [position.visibility, initialFocus])
  return createPortal(<div ref={ref} role="dialog" aria-label={label} style={position}
    className="frontmatter-popover fixed z-[1201] overflow-y-auto overscroll-contain rounded border border-edge-bright bg-surface-raised p-1 text-xs text-ink shadow-xl"
    onKeyDown={event => {
      if (event.nativeEvent.isComposing) return
      if (event.key === 'Tab') {
        const controls = Array.from(ref.current!.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)'))
        if (event.target === (event.shiftKey ? controls[0] : controls.at(-1))) close()
        return
      }
      if ((event.target as HTMLElement).tagName === 'INPUT') return
      const buttons = Array.from(ref.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
      const index = buttons.indexOf(event.target as HTMLButtonElement)
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault()
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
          : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
        buttons[next]?.focus()
      }
    }}>{children}</div>, anchor.closest('[role="dialog"]') ?? document.body)
}
