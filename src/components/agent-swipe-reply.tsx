import { useRef, useState, type ReactNode } from 'react'
import { Undo } from 'iconoir-react'

export function quoteAgentReply(text: string, draft: string): string {
  const quote = text.trim().split(/\r?\n/).map(line => `> ${line}`).join('\n')
  return `${quote}\n\n${draft}`
}

export function AgentSwipeReply({ text, label, onReply, children, showButton = true }: { text: string; label: string; onReply: (text: string) => void; children: ReactNode; showButton?: boolean }) {
  const gesture = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null)
  const suppressClick = useRef(false)
  const [offset, setOffset] = useState(0)
  return <div data-agent-swipe-reply className="relative min-w-0" style={{ touchAction: 'pan-y pinch-zoom' }}
    onPointerDown={event => {
      if (event.button !== 0 || (event.target as Element).closest('a, input, textarea, [contenteditable], [data-agent-reply-button]')) return
      gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false }
    }}
    onPointerMove={event => {
      const start = gesture.current
      if (!start || start.id !== event.pointerId) return
      const dx = event.clientX - start.x, dy = event.clientY - start.y
      if (!start.moved && Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx) * 0.6) { gesture.current = null; return }
      if (dx < -10 && Math.abs(dy) <= Math.abs(dx) * 0.6) {
        start.moved = true
        event.currentTarget.setPointerCapture(event.pointerId)
        setOffset(Math.max(-64, dx))
      }
    }}
    onPointerUp={event => {
      const start = gesture.current
      gesture.current = null
      setOffset(0)
      if (!start || start.id !== event.pointerId || !start.moved) return
      suppressClick.current = true
      if (event.clientX - start.x <= -48 && Math.abs(event.clientY - start.y) <= Math.abs(event.clientX - start.x) * 0.6) onReply(text)
    }}
    onPointerCancel={() => { gesture.current = null; setOffset(0) }}
    onClickCapture={event => {
      if (suppressClick.current && event.detail > 0) { event.preventDefault(); event.stopPropagation() }
      suppressClick.current = false
    }}>
    <span aria-hidden="true" className="pointer-events-none absolute right-2 top-2 text-ink-secondary" style={{ opacity: Math.min(1, -offset / 48) }}><Undo width={16} height={16} /></span>
    <div style={{ transform: `translateX(${offset}px)`, transition: offset ? 'none' : 'transform 160ms ease-out' }}>{children}</div>
    {showButton && <button data-agent-reply-button type="button" onClick={() => onReply(text)} aria-label={label} data-tip={label}
      className="absolute right-1 bottom-1 rounded bg-surface p-1 text-ink-secondary opacity-0 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-accent [@media(hover:hover)]:group-hover:opacity-100"><Undo width={16} height={16} aria-hidden="true" /></button>}
  </div>
}
