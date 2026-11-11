import { useEffect, useState } from 'react'
import { OPEN_NOTICE_EVENT, type MewcatNotice } from '../utils/mewcat-notifications'
import { deferredComponent } from './deferred-component'

const ProjectActionNoticeResults = deferredComponent(async () => ({ default: (await import('./ProjectActionNoticeResults')).ProjectActionNoticeResults }))
const ProjectReleaseNoticeResults = deferredComponent(async () => ({ default: (await import('./ProjectReleaseNoticeResults')).ProjectReleaseNoticeResults }))

/** Results remain reachable after the originating project controls unmount. */
export function ProjectActionNoticeHost({ enabled }: { enabled: boolean }) {
  const [noticeKey, setNoticeKey] = useState<string | null>(null)
  useEffect(() => {
    if (!enabled) return
    const open = (event: Event) => {
      const notice = (event as CustomEvent<MewcatNotice>).detail
      if (notice?.key.startsWith('project-action:') || notice?.key.startsWith('project-pipeline:')) setNoticeKey(notice.key)
    }
    window.addEventListener(OPEN_NOTICE_EVENT, open)
    return () => window.removeEventListener(OPEN_NOTICE_EVENT, open)
  }, [enabled])
  if (!enabled || !noticeKey) return null
  return noticeKey.startsWith('project-pipeline:')
    ? <ProjectReleaseNoticeResults noticeKey={noticeKey} onClose={() => setNoticeKey(null)} />
    : <ProjectActionNoticeResults noticeKey={noticeKey} onClose={() => setNoticeKey(null)} />
}
