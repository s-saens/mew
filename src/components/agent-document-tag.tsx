import { useState } from 'react'
import { Page } from 'iconoir-react'
import { ActionMenu, ActionMenuItem } from '@mew/ui'

export function AgentDocumentTag({ project, path, onOpenFile }: {
  project: string
  path: string
  onOpenFile: (project: string, path: string, line: number | null) => void
}) {
  const [position, setPosition] = useState<{ x: number; y: number; trigger: HTMLButtonElement } | null>(null)
  const name = path.split('/').filter(Boolean).at(-1) ?? path

  return <span data-agent-document title={name} className="mx-0.5 inline-flex h-6 items-center rounded-md bg-surface align-middle text-xs text-ink-secondary">
    <button type="button" aria-label={name} aria-haspopup="menu" aria-expanded={!!position}
      className="flex size-6 items-center justify-center rounded-md hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
      onClick={event => {
        const trigger = event.currentTarget
        const bounds = trigger.getBoundingClientRect()
        setPosition(current => current ? null : { x: bounds.left, y: bounds.bottom + 6, trigger })
      }}>
      <Page width={16} height={16} aria-hidden="true" />
    </button>
    {position && <ActionMenu x={position.x} y={position.y} label={name} trigger={position.trigger}
      outsideIgnore={() => position.trigger} onClose={() => setPosition(null)}>
      <ActionMenuItem onClick={() => onOpenFile(project, path, null)}>{name}</ActionMenuItem>
    </ActionMenu>}
  </span>
}
