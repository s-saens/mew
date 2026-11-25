import { Bug, Brain, EditPencil, Folder, GitBranch, Notes, Terminal, Globe } from 'iconoir-react'
import { uiText } from '@mew/ui/i18n-core'
import { useI18n } from '../i18n'
import type { MobileDockPanel } from '../utils/mobile-dock'

export const dockIcons = { sidebar: Folder, editor: EditPencil, agent: Brain, terminal: Terminal, git: GitBranch, memo: Notes, debugger: Bug, browser: Globe }
const labels = { sidebar: 'panel.sidebar', editor: 'panel.editor', agent: 'header.agent', terminal: 'header.terminal', git: 'access.git', browser: 'header.browser' } as const
export function useDockLabel() {
  const { t } = useI18n()
  return (id: MobileDockPanel) => id === 'debugger' ? t('settings.debugger') : id === 'memo' ? uiText('메모') : t(labels[id])
}
