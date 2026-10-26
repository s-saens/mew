import { LoadingIndicator } from '@mew/ui'

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
