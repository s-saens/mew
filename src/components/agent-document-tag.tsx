import { useState } from 'react'
import { Page, Xmark } from 'iconoir-react'
import { ActionMenu, ActionMenuItem } from '@mew/ui'
import { uiText } from '@mew/ui/i18n-core'
import { documentReferenceTokens } from '../utils/agent-attachments'

export type OpenAgentDocument = (project: string, path: string, line: number | null) => void

export function AgentDocumentTag({ project, path, title, onOpenFile, onRemove }: {
  project: string
  path: string
  title?: string
  onOpenFile?: OpenAgentDocument
  onRemove?: () => void
}) {
  const [position, setPosition] = useState<{ x: number; y: number; trigger: HTMLButtonElement } | null>(null)
  const name = path.split('/').filter(Boolean).at(-1) ?? path
  const visibleTitle = title?.trim()
  const label = visibleTitle || name
  const content = <><Page width={16} height={16} className="shrink-0" aria-hidden="true" />
    {visibleTitle && <span className="min-w-0 truncate">{visibleTitle}</span>}</>
  const bodyClass = visibleTitle ? 'flex h-6 min-w-0 max-w-64 items-center gap-1 px-1' : 'flex size-6 items-center justify-center'

  return <span data-agent-document title={visibleTitle ? undefined : name} data-tip={visibleTitle || undefined} className="mx-0.5 inline-flex h-6 max-w-full items-center rounded-md bg-surface align-middle text-xs text-ink-secondary">
    {onOpenFile ? <button type="button" aria-label={label} aria-haspopup="menu" aria-expanded={!!position}
      className={`${bodyClass} rounded-md hover:text-ink focus-visible:outline-2 focus-visible:outline-accent`}
      onClick={event => {
        const trigger = event.currentTarget
        const bounds = trigger.getBoundingClientRect()
        setPosition(current => current ? null : { x: bounds.left, y: bounds.bottom + 6, trigger })
      }}>
      {content}
    </button> : <span role="img" aria-label={label} className={bodyClass}>{content}</span>}
    {onRemove && <button type="button" aria-label={uiText('{p0} 첨부 제거', { p0: label })} data-tip={uiText('첨부 제거')}
      className="mr-1 flex size-4 shrink-0 items-center justify-center rounded hover:bg-surface-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
      onClick={onRemove}><Xmark width={12} height={12} aria-hidden="true" /></button>}
    {position && onOpenFile && <ActionMenu x={position.x} y={position.y} label={name} trigger={position.trigger}
      outsideIgnore={() => position.trigger} onClose={() => setPosition(null)}>
      <ActionMenuItem onClick={() => onOpenFile(project, path, null)}>{name}</ActionMenuItem>
    </ActionMenu>}
  </span>
}

/** Passive tags can sit inside queue and schedule preview buttons. */
export function AgentDocumentReferences({ text }: { text: string }) {
  let from = 0
  const content = documentReferenceTokens(text).flatMap(reference => {
    const prefix = text.slice(from, reference.from)
    from = reference.to
    return [prefix, <AgentDocumentTag key={reference.from} project={reference.project} path={reference.path} title={reference.title} />]
  })
  return <>{content}{text.slice(from)}</>
}
