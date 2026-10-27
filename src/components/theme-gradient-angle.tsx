import { useState, type PointerEvent } from 'react'

const normalizeAngle = (angle: number) => ((Math.round(angle) % 360) + 360) % 360

export function ThemeGradientAngle({ value, onChange, label }: { value: number; onChange: (angle: number) => void; label: string }) {
  const [input, setInput] = useState<string | null>(null)

  function point(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - rect.left - rect.width / 2
    const y = rect.top + rect.height / 2 - event.clientY
    if (Math.hypot(x, y) < 2) return
    onChange(normalizeAngle(Math.atan2(x, y) * 180 / Math.PI))
  }

  return <div className="flex items-center gap-1">
    <span className="mr-1 text-xs text-ink-secondary">{label}</span>
    <div role="slider" tabIndex={0} aria-label={label} aria-valuemin={0} aria-valuemax={359} aria-valuenow={value} aria-valuetext={`${value}°`}
      className="flex h-8 w-8 shrink-0 touch-none select-none items-center justify-center rounded text-ink-secondary hover:bg-surface-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11 pointer-coarse:w-11"
      onPointerDown={event => {
        if (!event.isPrimary || event.button !== 0) return
        event.preventDefault()
        event.currentTarget.focus({ preventScroll: true })
        event.currentTarget.setPointerCapture(event.pointerId)
        point(event)
      }}
      onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) point(event) }}
      onPointerUp={event => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
        point(event)
        event.currentTarget.releasePointerCapture(event.pointerId)
      }}
      onPointerCancel={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) }}
      onKeyDown={event => {
        if (event.altKey || event.ctrlKey || event.metaKey) return
        const steps: Record<string, number> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 10, PageDown: -10 }
        const step = steps[event.key]
        if (step === undefined && event.key !== 'Home' && event.key !== 'End') return
        event.preventDefault()
        event.stopPropagation()
        onChange(event.key === 'Home' ? 0 : event.key === 'End' ? 359 : normalizeAngle(value + step))
      }}>
      <svg aria-hidden="true" width={24} height={24} viewBox="0 0 24 24" fill="none" className="h-6 w-6 shrink-0">
        <circle cx={12} cy={12} r={10.5} stroke="currentColor" />
        <path d="M12 2v2m10 8h-2M12 22v-2M2 12h2" stroke="currentColor" />
        <g transform={`rotate(${value} 12 12)`} className="text-accent">
          <path d="M12 13V5m-2 2 2-2 2 2" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={12} cy={12} r={1.5} fill="currentColor" />
        </g>
      </svg>
    </div>
    <label className="flex h-8 items-center gap-1 rounded border border-edge-strong bg-surface px-2 text-xs text-ink focus-within:border-accent pointer-coarse:h-11">
      <input type="number" min={0} max={359} step={1} inputMode="numeric" aria-label={label} value={input ?? value}
        className="w-12 min-w-0 bg-transparent text-right tabular-nums outline-none pointer-coarse:text-base"
        onChange={event => {
          if (event.target.value !== '' && Number.isFinite(event.target.valueAsNumber)) {
            setInput(null)
            onChange(normalizeAngle(event.target.valueAsNumber))
          } else setInput(event.target.value)
        }}
        onBlur={() => setInput(null)}
        onKeyDown={event => { if (event.key === 'Enter') { setInput(null); event.currentTarget.blur() } }} />
      <span aria-hidden="true" className="text-ink-secondary">°</span>
    </label>
  </div>
}
