import { useState } from 'react'
import { FloppyDisk, Trash } from 'iconoir-react'
import { ActionMenu, ActionMenuItem, HoverTipLayer } from '@mew/ui'
import { uiText } from '@mew/ui/i18n-core'
import { useUiLocale } from '@mew/ui/i18n'
import type { AgentAttachmentInput } from '../../shared/agent-attachment'
import { deleteSavedAgentPrompt, readSavedAgentPrompts, saveAgentPrompt, type SavedAgentPrompt } from '../utils/agent-saved-prompts'
import { withoutAttachmentTokens } from '../utils/agent-attachments'

export function AgentPromptDrafts({ workspace, text, cliMode, attachments, disabled, allowTerminal, onRestore, onError }: {
  workspace: string
  text: string
  cliMode: boolean
  attachments: AgentAttachmentInput[]
  disabled: boolean
  allowTerminal: boolean
  onRestore: (prompt: SavedAgentPrompt) => void
  onError: () => void
}) {
  useUiLocale()
  const [menu, setMenu] = useState<{ x: number; y: number; trigger: HTMLButtonElement; prompts: SavedAgentPrompt[] } | null>(null)
  const [context, setContext] = useState({ workspace, disabled })
  if (context.workspace !== workspace || context.disabled !== disabled) {
    setContext({ workspace, disabled })
    setMenu(null)
  }
  const close = () => setMenu(null)
  return <>
    <HoverTipLayer className="flex w-8 shrink-0 items-stretch bg-transparent">
      <div data-tip={text.trim() ? uiText('프롬프트 임시저장') : uiText('저장한 프롬프트')}
        className="flex min-h-8 w-full items-center justify-center">
      <button type="button" disabled={disabled} aria-label={uiText('프롬프트 임시저장')}
        aria-haspopup="menu" aria-expanded={menu !== null}
        className="flex h-5 w-full items-center justify-center rounded text-ink-secondary hover:bg-surface-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40"
        onClick={event => {
          const prompts = text.trim() ? saveAgentPrompt(workspace, { text, cliMode, attachments }) : readSavedAgentPrompts(workspace)
          if (!prompts) { onError(); return }
          const rect = event.currentTarget.getBoundingClientRect()
          setMenu({ x: rect.right, y: rect.top, trigger: event.currentTarget, prompts })
        }}><FloppyDisk width={16} height={16} aria-hidden="true" /></button>
      </div>
    </HoverTipLayer>
    {menu && !disabled && <ActionMenu x={menu.x} y={menu.y} trigger={menu.trigger} label={uiText('저장한 프롬프트')} onClose={close}>
      {menu.prompts.length === 0 && <div className="px-2 py-1 text-xs text-ink-secondary" role="status">{uiText('저장한 프롬프트가 없습니다.')}</div>}
      {menu.prompts.map(prompt => {
        const preview = withoutAttachmentTokens(prompt.text).trim() || prompt.attachments.map(file => file.path.split('/').at(-1)).join(', ')
        return <div key={prompt.id} className="mew-action-menu-row w-64 max-w-full">
          <ActionMenuItem aria-label={uiText('프롬프트 불러오기: {text}', { text: preview })} title={preview}
            disabled={prompt.cliMode && !allowTerminal}
            onClick={() => onRestore(prompt)}><span className="min-w-0 flex-1 truncate">{prompt.cliMode ? `! ${preview}` : preview}</span></ActionMenuItem>
          <HoverTipLayer className="w-8 shrink-0">
            <ActionMenuItem closeOnSelect={false} danger aria-label={uiText('프롬프트 삭제: {text}', { text: preview })}
              data-tip={uiText('삭제')} icon={<Trash />} onClick={() => {
                const prompts = deleteSavedAgentPrompt(workspace, prompt.id)
                if (!prompts) { onError(); return }
                setMenu(current => current ? { ...current, prompts } : null)
                menu.trigger.focus({ preventScroll: true })
              }} />
          </HoverTipLayer>
        </div>
      })}
    </ActionMenu>}
  </>
}
