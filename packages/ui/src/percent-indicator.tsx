import type { CSSProperties } from 'react'
import './percent-indicator.css'

export function PercentIndicator({ percent, label, size = 12 }: {
  percent: number
  label: string
  size?: number
}) {
  const value = Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 0

  return <span
    className="mew-percent-indicator"
    role="progressbar"
    aria-label={label}
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={value}
    style={{ width: size, height: size, '--mew-percent-value': `${value}%` } as CSSProperties}
  />
}
