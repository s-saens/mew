import { Check, Xmark } from 'iconoir-react'
import { useLayoutEffect, useRef, useState } from 'react'
import { uiText } from '@mew/ui/i18n-core'

export function InlinePageNameInput({ onSubmit, onCancel }: { onSubmit: (name: string) => void; onCancel: () => void }) {
  const [name, setName] = useState('')
  const input = useRef<HTMLInputElement>(null)
  useLayoutEffect(() => { input.current?.focus({ preventScroll: true }) }, [])
  const submit = () => { if (name.trim()) onSubmit(name.trim()) }
  return <span
    className="inline-flex w-72 max-w-full items-center gap-1 rounded border border-edge-strong bg-surface-raised p-1 align-middle font-sans text-sm text-ink"
    onKeyDown={event => {
      if (event.nativeEvent.isComposing || event.keyCode === 229) return
      if (event.key === 'Enter' && event.target === input.current) { event.preventDefault(); submit() }
      if (event.key === 'Escape') { event.preventDefault(); onCancel() }
    }}
  >
    <input ref={input} value={name} onChange={event => setName(event.target.value)}
      aria-label={uiText('새 문서 이름')} placeholder={uiText('새 문서 이름')}
      className="min-w-0 flex-1 bg-transparent px-1 py-0.5 text-ink outline-none placeholder:text-ink-muted focus-visible:rounded focus-visible:ring-1 focus-visible:ring-accent" />
    <button type="button" onClick={submit} disabled={!name.trim()} aria-label={uiText('만들기')} title={uiText('만들기')}
      className="shrink-0 rounded p-1 text-accent hover:bg-surface-hover focus-visible:outline focus-visible:outline-accent disabled:opacity-40">
      <Check width={18} height={18} />
    </button>
    <button type="button" onClick={onCancel} aria-label={uiText('취소')} title={uiText('취소')}
      className="shrink-0 rounded p-1 text-ink-muted hover:bg-surface-hover focus-visible:outline focus-visible:outline-accent">
      <Xmark width={18} height={18} />
    </button>
  </span>
}
