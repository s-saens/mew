import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Check, Xmark } from 'iconoir-react'
import { HoverTipLayer } from '@mew/ui'
import { useUiLocale } from '@mew/ui/i18n'
import { uiText } from '@mew/ui/i18n-core'

export function AgentScheduleInput({ onClose, onConfirm, disabled, initialAt }: {
  onClose: () => void
  onConfirm: (at: string) => Promise<void>
  disabled: boolean
  initialAt?: string
}) {
  useUiLocale()
  const [delay, setDelay] = useState(() => {
    const remaining = initialAt ? Math.ceil((new Date(initialAt).getTime() - Date.now()) / 60_000) : 60
    const minutes = Number.isFinite(remaining) ? Math.max(1, remaining) : 60
    return { hours: String(Math.floor(minutes / 60)), minutes: String(minutes % 60) }
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submitting = useRef(false)
  const hoursInput = useRef<HTMLInputElement>(null)
  useEffect(() => { hoursInput.current?.focus(); hoursInput.current?.select() }, [])
  const hours = Number(delay.hours)
  const minutes = Number(delay.minutes)
  const valid = /^\d+$/.test(delay.hours) && /^\d+$/.test(delay.minutes)
    && Number.isInteger(hours) && hours >= 0 && hours <= 999
    && Number.isInteger(minutes) && minutes >= 0 && minutes <= 59
    && hours * 60 + minutes > 0
  const [prefix, suffix] = uiText('{p0} 후', { p0: '__delay__' }).split('__delay__')
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!valid || disabled || submitting.current) return
    submitting.current = true
    setSaving(true)
    setError(null)
    try {
      await onConfirm(new Date(Date.now() + (hours * 60 + minutes) * 60_000).toISOString())
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      submitting.current = false
      setSaving(false)
    }
  }
  const inputClass = 'h-6 w-8 rounded border border-edge bg-surface px-0.5 text-center text-xs tabular-nums text-ink outline-none focus-visible:border-accent disabled:opacity-50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'
  const buttonClass = 'flex h-7 w-7 shrink-0 items-center justify-center rounded text-ink-secondary hover:bg-surface-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40'
  return (
    <form aria-label={uiText('예약 전송')} onSubmit={submit}
      onKeyDown={event => {
        if (event.nativeEvent.isComposing) return
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          if (!submitting.current) onClose()
        }
      }}
      className="relative flex min-h-8 shrink-0 items-center gap-1 rounded-lg border border-edge bg-surface-raised px-1 text-xs text-ink-secondary"
      aria-busy={saving}>
      {prefix.trim() && <span>{prefix.trim()}</span>}
      <label className="flex items-center gap-0.5">
        <input ref={hoursInput} type="number" inputMode="numeric" min={0} max={999} step={1} required
          aria-label={uiText('시간')} value={delay.hours} disabled={saving} className={inputClass}
          onChange={event => { setDelay(current => ({ ...current, hours: event.target.value })); setError(null) }} />
        {uiText('시간')}
      </label>
      <label className="flex items-center gap-0.5">
        <input type="number" inputMode="numeric" min={0} max={59} step={1} required
          aria-label={uiText('분')} value={delay.minutes} disabled={saving} className={inputClass}
          onChange={event => { setDelay(current => ({ ...current, minutes: event.target.value })); setError(null) }} />
        {uiText('분')}
      </label>
      {suffix.trim() && <span>{suffix.trim()}</span>}
      <HoverTipLayer className="flex items-center">
        <button type="submit" aria-label={uiText('확인')} data-tip={saving ? uiText('등록 중…') : uiText('확인')}
          disabled={saving || disabled || !valid} className={buttonClass}>
          <Check width={16} height={16} aria-hidden="true" />
        </button>
        <button type="button" onClick={onClose} aria-label={uiText('예약 전송 닫기')} data-tip={uiText('닫기')}
          disabled={saving} className={buttonClass}>
          <Xmark width={16} height={16} aria-hidden="true" />
        </button>
      </HoverTipLayer>
      {error && <p role="alert" className="absolute right-0 bottom-full mb-1 w-full rounded bg-surface-raised p-1 text-xs break-words text-danger">{error}</p>}
    </form>
  )
}
