import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useOverlayDismiss } from '@mew/ui'

/** A nonmodal project selector confined to its workspace panel. */
export function ProjectSelectionFrame({ host, labelledBy, busy, onClose, restoreFocus, children }: {
  host: HTMLElement
  labelledBy: string
  busy: boolean
  onClose: () => void
  restoreFocus?: () => HTMLElement | null
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const restoreRef = useRef(restoreFocus)
  useLayoutEffect(() => { restoreRef.current = restoreFocus }, [restoreFocus])
  useOverlayDismiss(() => { if (!busy) onClose() }, {
    closeOnEscape: event => ref.current?.contains(event.target as Node) ?? false,
  })

  useLayoutEffect(() => {
    if (!ref.current?.contains(document.activeElement)) ref.current?.focus({ preventScroll: true })
  }, [])

  useLayoutEffect(() => () => {
    if (ref.current?.contains(document.activeElement)) restoreRef.current?.()?.focus({ preventScroll: true })
  }, [])

  return createPortal(<div ref={ref} role="dialog" aria-labelledby={labelledBy} aria-busy={busy || undefined}
    className="mew-dialog mew-mobile-project-panel mew-project-selection-frame" tabIndex={-1}>
    {children}
  </div>, host)
}
