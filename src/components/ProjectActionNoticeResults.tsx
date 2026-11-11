import { useId } from 'react'
import { DialogFrame } from '@mew/ui'
import { useUiLocale } from '@mew/ui/i18n'
import { useWorkspaceBrowser } from '../workspace/workspace-browser-context'
import { projectActionNoticeStore } from './ProjectActionsState'
import { projectActionsCopy } from './project-actions-copy'
import { PanelCloseButton } from './panel-close-button'
import { ProjectActionsResults } from './ProjectActionsResults'

/** A notice retains the completed result independently of project controls and later history. */
export function ProjectActionNoticeResults({ noticeKey, onClose }: { noticeKey: string; onClose: () => void }) {
  const result = projectActionNoticeStore(noticeKey)
  const copy = projectActionsCopy(useUiLocale()), title = useId(), browser = useWorkspaceBrowser()
  if (!result) return null
  return <DialogFrame labelledBy={title} onClose={onClose} className="max-h-[90dvh] max-w-lg overflow-y-auto max-sm:max-w-[calc(100vw-16px)]">
    <div className="p-3">
      <header className="flex items-center gap-2"><h2 id={title} className="flex-1 text-sm font-medium">{copy.results}</h2><PanelCloseButton aria-label={copy.close} onClick={onClose} /></header>
      <ProjectActionsResults runs={[result.run]} copy={copy} onPreview={browser} artifactUrl={result.store.artifactUrl} archiveUrl={result.store.archiveUrl} showHeading={false} />
    </div>
  </DialogFrame>
}
