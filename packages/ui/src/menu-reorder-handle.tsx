import type { ButtonHTMLAttributes } from 'react'

export function MenuReorderHandle({ onMove, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  onMove: (direction: -1 | 1) => void
}) {
  return <button {...props} type="button" className="mew-menu-reorder-handle"
    onKeyDown={event => {
      if (event.nativeEvent.isComposing || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
      event.preventDefault(); event.stopPropagation()
      onMove(event.key === 'ArrowUp' ? -1 : 1)
    }}>
    <svg width="12" height="14" viewBox="0 0 12 14" fill="currentColor" aria-hidden="true">
      <circle cx="4" cy="3" r="1" /><circle cx="8" cy="3" r="1" />
      <circle cx="4" cy="7" r="1" /><circle cx="8" cy="7" r="1" />
      <circle cx="4" cy="11" r="1" /><circle cx="8" cy="11" r="1" />
    </svg>
  </button>
}
