import { useId, useState, type ComponentProps } from 'react'
import { DialogFrame } from '@mew/ui'
import { useI18n } from '../i18n'
import { WORKSPACE_PROJECT } from '../utils/active-project'
import { uuid } from '../utils/uuid'
import type { RequestedAgentTab } from '../utils/agentTabs'
import { AgentPanel } from './AgentPanel'
import { PanelCloseButton } from './panel-close-button'
import { projectSettingPrompt } from '../utils/project-setting-prompt'

export function ProjectCreationAgentDialog({ projectPath, projectName, setupTitle, cacheAccount, onOpenFile, onClose }: {
  projectPath: string
  projectName: string
  setupTitle?: string
  cacheAccount?: string
  onOpenFile?: ComponentProps<typeof AgentPanel>['onOpenFile']
  onClose: () => void
}) {
  const { t } = useI18n()
  const title = setupTitle ?? t('project.createWithAgent')
  const titleId = useId()
  const [requestedTab] = useState<RequestedAgentTab>(() => ({
    id: uuid(), label: projectName, runtime: null, cwd: projectPath, renamed: true,
  }))
  const [startupPrompt] = useState(() => ({
    tabId: requestedTab.id,
    displayText: title,
    text: projectSettingPrompt(projectName, setupTitle !== undefined),
  }))
  return <DialogFrame labelledBy={titleId} onClose={onClose} closeOnEscape={event => !event.defaultPrevented && !event.isComposing}
    className="flex h-[min(44rem,90dvh)] max-w-3xl flex-col max-md:h-full max-md:rounded-none">
    <header className="flex shrink-0 items-center gap-2 border-b border-edge px-3 py-2">
      <h2 id={titleId} className="min-w-0 flex-1 truncate text-sm font-medium">{title} · {projectName}</h2>
      <PanelCloseButton aria-label={t('common.close')} onClick={onClose} />
    </header>
    <div className="min-h-0 flex-1">
      <AgentPanel embedded requestedTab={requestedTab} startupPrompt={startupPrompt} cacheAccount={cacheAccount}
        project={WORKSPACE_PROJECT} workspacePath={projectPath} workingPath={projectPath} allowTerminal={false}
        tree={[]} focusedFilePath={null} onOpenFile={onOpenFile ?? (() => undefined)} onClose={onClose} />
    </div>
  </DialogFrame>
}
