import { LoadingIndicator } from '@mew/ui'

export function AgentReplyPending({ label, active }: { label: string; active: boolean }) {
  return <span data-agent-reply-pending role="status" aria-label={label} className="inline-flex items-center align-middle">
    <LoadingIndicator size={16} active={active} />
  </span>
}

export function AgentLoadingBubbles({ label, active = true, compact = false }: {
  label: string
  active?: boolean
  compact?: boolean
}) {
  return (
    <div className="agent-loading-bubbles" data-active={active} data-compact={compact} role="status" aria-label={label}>
      <LoadingIndicator size={compact ? 16 : 20} active={active} />
    </div>
  )
}
