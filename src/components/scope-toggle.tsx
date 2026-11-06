import type { MouseEventHandler } from 'react'

export function ScopeToggle<Value extends string>({ label, value, options, onChange, disabled = false }: {
  label: string
  value: Value
  options: readonly { value: Value; label: string; onContextMenu?: MouseEventHandler<HTMLButtonElement> }[]
  onChange: (value: Value) => void
  disabled?: boolean
}) {
  return <div role="group" aria-label={label} data-scope-toggle className="flex min-w-0 flex-1 rounded-md bg-surface p-0.5 text-xs">
    {options.map((option, index) => <button key={option.value} type="button" aria-pressed={value === option.value} disabled={disabled}
      onClick={() => onChange(option.value)} onContextMenu={option.onContextMenu}
      onKeyDown={event => {
        if (disabled) return
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
        event.preventDefault()
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1
          : (index + (event.key === 'ArrowLeft' ? -1 : 1) + options.length) % options.length
        onChange(options[next].value)
        event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button')[next]?.focus()
      }}
      className={`min-w-0 flex-1 rounded px-3 py-1.5 focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40 ${value === option.value ? 'bg-surface-raised text-ink' : 'text-ink-muted hover:text-ink-secondary'}`}>
      {option.label}
    </button>)}
  </div>
}
