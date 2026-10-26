import type { CSSProperties } from 'react'
import './loading-indicator.css'

export function LoadingIndicator({ size = 16, active = true, variant = 'dots', className = '' }: {
  size?: number
  active?: boolean
  variant?: 'dots' | 'logo'
  className?: string
}) {
  return <span aria-hidden="true" className={`mew-loading-indicator mew-loading-${variant} ${className}`} data-active={active}
    style={{ '--mew-loading-size': `${size}px` } as CSSProperties}>
    {variant === 'dots' && <><span className="mew-loading-dot" /><span className="mew-loading-dot" /><span className="mew-loading-dot" /></>}
  </span>
}
