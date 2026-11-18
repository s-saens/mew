import type { Ref } from 'react'
import { Undo, Xmark } from 'iconoir-react'
import { HoverTipLayer, keepFocusOnPress } from '@mew/ui'
import { useUiLocale } from '@mew/ui/i18n'
import { uiText } from '@mew/ui/i18n-core'
import type { AgentReplyReference } from '../../shared/agent-reply'
import { useMobileKeyboard } from '../hooks/use-mobile-keyboard'

export function AgentReplyLink({ reply, onJump }: {
  reply: AgentReplyReference
  onJump?: (reply: AgentReplyReference) => void
}) {
  const source = reply.kind === 'user' ? uiText('내 메시지에 답장') : uiText('에이전트에게 답장')
  const content = <>
    <Undo className="shrink-0 text-accent" width={15} height={15} aria-hidden="true" />
    <span className="min-w-0 truncate text-ink-secondary"><span className="font-medium text-ink">{source}</span> · {reply.excerpt}</span>
  </>
  const className = 'flex min-h-8 w-full min-w-0 items-center gap-2 rounded border-l-2 border-accent/60 bg-surface-raised px-2 py-1 text-left text-xs'
  if (!onJump) return <div data-agent-reply-reference className={className}>{content}</div>
  return <button type="button" data-agent-reply-reference
    onClick={event => {
      event.stopPropagation()
      onJump(reply)
    }}
    aria-label={uiText('답장 원문 보기 · {p0} · {p1}', { p0: source, p1: reply.excerpt })}
    className={`${className} hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent`}>
    {content}
  </button>
}

export function AgentReplyPreview({ ref, target, onJump, onDismiss }: {
  ref: Ref<HTMLDivElement>
  target: AgentReplyReference | null
  onJump: (reply: AgentReplyReference) => void
  onDismiss: () => void
}) {
  useUiLocale()
  const keyboardOpen = useMobileKeyboard()
  if (!target) return null
  const { kind, excerpt } = target
  const dismissLabel = uiText('답장 취소')
  const source = kind === 'user' ? uiText('내 메시지에 답장') : uiText('에이전트에게 답장')

  return <div ref={ref} data-agent-reply-preview
    className="flex min-w-0 shrink-0 items-center gap-2 rounded-lg border border-edge bg-surface-raised px-2 py-0.5">
    <button type="button" data-agent-reply-reference onClick={() => onJump(target)}
      aria-label={uiText('답장 원문 보기 · {p0} · {p1}', { p0: source, p1: excerpt })}
      className="flex min-w-0 flex-1 items-center gap-2 rounded py-0.5 text-left text-xs hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent">
      <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-md bg-accent/15 text-accent">
        <Undo width={15} height={15} />
      </span>
      <span className="min-w-0 flex-1" role="status">
        <span className="block truncate font-semibold text-ink">{source}</span>
        <span className="block truncate text-ink-secondary">{excerpt}</span>
      </span>
    </button>
    <HoverTipLayer className="shrink-0">
      <button type="button" aria-label={dismissLabel} data-tip={dismissLabel}
        onPointerDown={event => {
          keepFocusOnPress(event)
          if (event.pointerType !== 'touch' || keyboardOpen) return
          const focused = event.currentTarget.ownerDocument.activeElement
          // A dismissed Android keyboard can leave the editor focused.
          if (focused instanceof HTMLElement && (focused.isContentEditable || focused.matches('input, textarea'))) focused.blur()
        }}
        onClick={onDismiss}
        className="flex size-9 items-center justify-center rounded-md text-ink-secondary hover:bg-surface-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-accent">
        <Xmark width={16} height={16} aria-hidden="true" />
      </button>
    </HoverTipLayer>
  </div>
}
