import { ProjectReleaseDialog } from './ProjectReleaseDialog'
import { projectReleaseNoticeStore } from './ProjectReleaseState'

/** Completion navigation retains the exact project even after its original controls unmount. */
export function ProjectReleaseNoticeResults({ noticeKey, onClose }: { noticeKey: string; onClose: () => void }) {
  const result = projectReleaseNoticeStore(noticeKey)
  if (!result) return null
  return <ProjectReleaseDialog scope={result.store.scope} store={result.store} onClose={onClose} />
}
