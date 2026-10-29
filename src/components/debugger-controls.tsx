import { useState, type ReactNode } from 'react'
import { NavArrowRight } from 'iconoir-react'
import { debugButton, debugPrimaryButton } from './debugger-helpers'

export function DebugAction({ label, disabled, onClick, children, primary = false, compact = false, pressed, expanded }: { label: string; disabled?: boolean; onClick: () => void; children: ReactNode; primary?: boolean; compact?: boolean; pressed?: boolean; expanded?: boolean }) {
  const style = primary ? debugPrimaryButton : compact ? debugButton.replace('h-8 w-8', 'h-6 w-6').replace(' pointer-coarse:h-11 pointer-coarse:w-11', '') : debugButton
  return <button type="button" className={`${style} ${pressed ? 'text-accent' : ''}`} aria-label={label} aria-pressed={pressed} aria-expanded={expanded} data-tip={label} disabled={disabled} onClick={onClick}><span aria-hidden="true" className="inline-flex items-center gap-1.5">{children}</span></button>
}

export function DebugSection({ title, count, open, children, onToggle, meta, actions, className = '' }: { title: string; count?: number; open?: boolean; children: ReactNode; onToggle?: (open: boolean) => void; meta?: ReactNode; actions?: ReactNode; className?: string }) {
  const [disclosure, setDisclosure] = useState({ suggested: open, expanded: !!open })
  const expanded = disclosure.suggested === open ? disclosure.expanded : !!open
  if (disclosure.suggested !== open) setDisclosure({ suggested: open, expanded })
  const setExpanded = (expanded: boolean) => setDisclosure({ suggested: open, expanded })
  return <details open={expanded} className={`min-w-0 border-b border-edge ${className}`} onToggle={e => { if (e.target !== e.currentTarget) return; setExpanded(e.currentTarget.open); onToggle?.(e.currentTarget.open) }}>
    <summary aria-label={title} className="flex min-h-8 min-w-0 cursor-pointer list-none items-center gap-1.5 px-2 py-1 text-xs font-medium text-ink hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11 [&::-webkit-details-marker]:hidden">
      <NavArrowRight width={12} height={12} aria-hidden="true" className={`shrink-0 text-ink-secondary ${expanded ? 'rotate-90' : ''}`} />
      <span className="min-w-0 truncate">{title}</span>
      {count !== undefined && <span className="rounded bg-surface-raised px-1.5 font-normal tabular-nums text-ink-secondary">{count}</span>}
      <span className="ml-auto min-w-0 truncate font-normal text-ink-secondary">{meta}</span>
      {actions && <span className="-my-1 flex shrink-0 items-center" onClick={e => { e.preventDefault(); e.stopPropagation(); setExpanded(true) }}>{actions}</span>}
    </summary>
    <div className="min-w-0 space-y-1 px-2 pb-2 pt-1">{children}</div>
  </details>
}
