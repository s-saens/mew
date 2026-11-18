import type { Ref } from 'react'
import { Undo, Xmark } from 'iconoir-react'
import { HoverTipLayer, keepFocusOnPress } from '@mew/ui'
import { useUiLocale } from '@mew/ui/i18n'
import { uiText } from '@mew/ui/i18n-core'
import { useMobileKeyboard } from '../hooks/use-mobile-keyboard'

export function AgentReplyPreview({ ref, target, onDismiss }: {
  ref: Ref<HTMLDivElement>
  target: { kind: 'user' | 'turn'; text: string } | null
  onDismiss: () => void
}) {
  useUiLocale()
  const keyboardOpen = useMobileKeyboard()
  if (!target) return null
  const { kind, text } = target
  const dismissLabel = uiText('답장 취소')

  return <div ref={ref} data-agent-reply-preview
    className="flex min-w-0 shrink-0 items-center gap-2 rounded-lg border border-edge bg-surface-raised px-2 py-0.5">
    <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-md bg-accent/15 text-accent">
      <Undo width={15} height={15} />
    </span>
    <div className="min-w-0 flex-1 py-0.5 text-xs" role="status">
      <div className="truncate font-semibold text-ink">{kind === 'user' ? uiText('내 메시지에 답장') : uiText('에이전트에게 답장')}</div>
      <div className="truncate text-ink-secondary">{text.replace(/\s+/g, ' ')}</div>
    </div>
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
