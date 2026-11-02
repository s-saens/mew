import { useId, useState, type ComponentProps } from 'react'
import { DialogFrame } from '@mew/ui'
import { useI18n } from '../i18n'
import { WORKSPACE_PROJECT } from '../utils/active-project'
import { uuid } from '../utils/uuid'
import type { RequestedAgentTab } from '../utils/agentTabs'
import { AgentPanel } from './AgentPanel'
import { PanelCloseButton } from './panel-close-button'

export function ProjectCreationAgentDialog({ projectPath, projectName, cacheAccount, onOpenFile, onClose }: {
  projectPath: string
  projectName: string
  cacheAccount?: string
  onOpenFile?: ComponentProps<typeof AgentPanel>['onOpenFile']
  onClose: () => void
}) {
  const { t } = useI18n()
  const titleId = useId()
  const [requestedTab] = useState<RequestedAgentTab>(() => ({
    id: uuid(), label: projectName, runtime: null, cwd: projectPath, renamed: true,
  }))
  const [startupPrompt] = useState(() => ({
    tabId: requestedTab.id,
    displayText: t('project.createWithAgent'),
    text: `Help me create the new project named ${JSON.stringify(projectName)} in the current working directory. Start by asking me a focused question about what I want to build; do not generate the project before I answer. Continue the conversation to clarify the purpose, users, scope, and necessary technology choices, asking a few relevant questions at a time. Once the direction is agreed, create the project with me. Follow the supplied Mew default instructions and all project instructions. Document the agreed requirements and implementation in the project's configured Documents location, with accurate descriptions, canonical ownership, and decision and work records where required. Keep documentation proportional to the project and follow its language and verification settings. Preserve the existing .mew configuration and files.`,
  }))
  return <DialogFrame labelledBy={titleId} onClose={onClose} closeOnEscape={event => !event.defaultPrevented && !event.isComposing}
    className="flex h-[min(44rem,90dvh)] max-w-3xl flex-col max-md:h-full max-md:rounded-none">
    <header className="flex shrink-0 items-center gap-2 border-b border-edge px-3 py-2">
      <h2 id={titleId} className="min-w-0 flex-1 truncate text-sm font-medium">{t('project.createWithAgent')} · {projectName}</h2>
      <PanelCloseButton aria-label={t('common.close')} onClick={onClose} />
    </header>
    <div className="min-h-0 flex-1">
      <AgentPanel embedded requestedTab={requestedTab} startupPrompt={startupPrompt} cacheAccount={cacheAccount}
        project={WORKSPACE_PROJECT} workspacePath={projectPath} workingPath={projectPath} allowTerminal={false}
        tree={[]} focusedFilePath={null} onOpenFile={onOpenFile ?? (() => undefined)} onClose={onClose} />
    </div>
  </DialogFrame>
}
