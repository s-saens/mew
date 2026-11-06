import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { DocumentationGuidanceKey } from '../../shared/agent-guidance'
import { defaultGuidanceText } from './agent-default-guidance-copy'

const names = { ko: '기본 지침 내용 보기', en: 'Show default instruction', ja: '基本指針の内容を表示', 'zh-CN': '查看默认指引内容' }

export function DefaultGuidanceTip({ locale, guidanceKey, label, portalContainer }: { locale: keyof typeof names; guidanceKey: DocumentationGuidanceKey | 'codeQuality'; label: string; portalContainer: HTMLElement | null }) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ left: 8, top: 8 })
  const button = useRef<HTMLButtonElement>(null)
  const id = useId()
  useEffect(() => {
    if (!open) return
    const dismiss = (event: PointerEvent) => { if (!button.current?.contains(event.target as Node)) setOpen(false) }
    window.addEventListener('pointerdown', dismiss)
    return () => window.removeEventListener('pointerdown', dismiss)
  }, [open])
  return <>
    <button ref={button} type="button" data-select-option-action aria-label={`${label}: ${names[locale]}`} aria-expanded={open} aria-describedby={open ? id : undefined}
      className="order-last flex h-8 w-8 shrink-0 items-center justify-center rounded font-semibold text-ink-secondary hover:bg-surface focus-visible:outline-2 focus-visible:outline-accent"
      onPointerDown={event => event.stopPropagation()} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); button.current?.focus() } }}
      onClick={event => { event.stopPropagation(); const rect = event.currentTarget.getBoundingClientRect(); setPosition({ left: Math.max(8, Math.min(rect.right - 320, window.innerWidth - 328)), top: Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - 220)) }); setOpen(value => !value) }}>T</button>
    {open && createPortal(<div id={id} role="tooltip" style={{ position: 'fixed', left: position.left, top: position.top, width: 'min(320px, calc(100vw - 16px))', maxHeight: 'min(200px, calc(100vh - 16px))', zIndex: 1900 }} className="overflow-y-auto rounded border border-edge-bright bg-surface-raised p-2 text-xs leading-5 text-ink shadow-lg">{defaultGuidanceText(locale, guidanceKey)}</div>, portalContainer ?? document.body)}
  </>
}
