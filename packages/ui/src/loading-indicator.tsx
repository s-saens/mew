import { useLayoutEffect, useRef, type CSSProperties } from 'react'
import './loading-indicator.css'

export function LoadingIndicator({ size = 16, active = true, variant = 'dots', className = '' }: {
  size?: number
  active?: boolean
  variant?: 'dots' | 'logo' | 'spinner'
  className?: string
}) {
  const indicatorRef = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    if (variant !== 'logo') return
    for (const animation of indicatorRef.current!.getAnimations({ subtree: true })) {
      if (animation.playState === 'running') animation.startTime = 0
    }
  }, [variant])

  return <span ref={indicatorRef} aria-hidden="true" className={`mew-loading-indicator mew-loading-${variant} ${className}`} data-active={active}
    style={{ '--mew-loading-size': `${size}px` } as CSSProperties}>
    {variant === 'dots' && <><span className="mew-loading-dot" /><span className="mew-loading-dot" /><span className="mew-loading-dot" /></>}
  </span>
}
