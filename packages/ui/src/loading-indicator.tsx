import type { CSSProperties } from 'react'
import './loading-indicator.css'

export function LoadingIndicator({ size = 16, active = true, className = '' }: {
  size?: number
  active?: boolean
  className?: string
}) {
  return <span aria-hidden="true" className={`mew-loading-indicator ${className}`} data-active={active}
    style={{ '--mew-loading-size': `${size}px` } as CSSProperties} />
}
