import { useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { WarningTriangle } from 'iconoir-react'
import { getFixedPopupLayout, useOverlayDismiss } from '@mew/ui'
import { useUiLocale } from '@mew/ui/i18n'
import { uiText } from '@mew/ui/i18n-core'

export function RuntimeIssueTip({ tone, message }: { tone: 'warning' | 'danger'; message: string }) {
  useUiLocale()
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const tip = useRef<HTMLDivElement>(null)
  const [portalTarget, setPortalTarget] = useState<Element | null>(null)
  const open = portalTarget !== null
  const color = tone === 'warning' ? 'text-warning' : 'text-danger'
  useOverlayDismiss(open && (() => setPortalTarget(null)), { outside: () => tip.current, outsideIgnore: () => trigger.current })

  useLayoutEffect(() => {
    const button = trigger.current
    const popup = tip.current
    if (!open || !button || !popup) return
    const viewport = window.visualViewport
    const place = () => {
      const layout = getFixedPopupLayout(popup.parentElement)
      const { left, top, right, bottom, width, height } = layout.bounds
      const size = layout.toStyle({ maxWidth: Math.min(320, width - 16), maxHeight: Math.min(160, height - 16) })
      popup.style.maxWidth = `${size.maxWidth}px`
      popup.style.maxHeight = `${size.maxHeight}px`
      const anchor = button.getBoundingClientRect()
      const box = popup.getBoundingClientRect()
      const above = anchor.top - box.height - 6
      const below = anchor.bottom + 6
      const position = layout.toStyle({
        left: Math.max(left + 8, Math.min(anchor.right - box.width, right - box.width - 8)),
        top: Math.max(top + 8, Math.min(above >= top + 8 ? above : below, bottom - box.height - 8)),
      })
      popup.style.left = `${position.left}px`
      popup.style.top = `${position.top}px`
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    viewport?.addEventListener('resize', place)
    viewport?.addEventListener('scroll', place)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
      viewport?.removeEventListener('resize', place)
      viewport?.removeEventListener('scroll', place)
    }
  }, [open, message])

  return <>
    <button ref={trigger} type="button"
      aria-label={uiText(tone === 'warning' ? '경고 상세 보기' : '오류 상세 보기')}
      aria-expanded={open}
      aria-describedby={open ? id : undefined}
      onClick={event => {
        setPortalTarget(open ? null : event.currentTarget.closest('.mew-dialog-overlay') ?? document.fullscreenElement ?? document.body)
      }}
      className={`relative grid size-7 shrink-0 place-items-center rounded hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-accent ${color}`}>
      <WarningTriangle aria-hidden width={16} height={16} />
    </button>
    {portalTarget && createPortal(
      <div ref={tip} id={id} role="tooltip"
        className={`fixed w-max select-text overflow-auto whitespace-pre-wrap wrap-anywhere rounded border border-edge-bright bg-surface-raised px-2.5 py-1.5 text-xs shadow-lg ${color}`}
        style={{ zIndex: 'var(--layer-tooltip, 1900)' }}>
        {message}
      </div>,
      portalTarget,
    )}
  </>
}
