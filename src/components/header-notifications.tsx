import { useId } from 'react'
import { Check, WarningTriangle, Xmark } from 'iconoir-react'
import { DialogFrame } from '@mew/ui'
import { uiText } from '@mew/ui/i18n-core'
import { useI18n } from '../i18n'
import { clearMewcatNotices, dismissMewcatNotice, openMewcatNotice, useMewcatNotices, type MewcatNotice } from '../utils/mewcat-notifications'

export function orderMenuNotices(notices: readonly MewcatNotice[]) {
  return [...notices].sort((a, b) => ({ danger: 2, warning: 1, success: 0 }[b.level] - { danger: 2, warning: 1, success: 0 }[a.level]) || b.id - a.id)
}

export function NotificationHistoryDialog({ onClose }: { onClose: () => void }) {
  const notices = useMewcatNotices()
  const { t } = useI18n()
  const titleId = useId()
  const ordered = orderMenuNotices(notices)
  return <DialogFrame labelledBy={titleId} onClose={onClose} className="max-w-md max-h-[85dvh] flex flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b border-edge px-3 py-2">
        <h2 id={titleId} className="min-w-0 flex-1 text-sm font-medium text-ink">{uiText('알림')}</h2>
        <button type="button" className="rounded px-2 py-1 text-xs text-ink-secondary hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-accent" onClick={clearMewcatNotices}>{t('mewcat.clear')}</button>
        <button type="button" aria-label={t('common.close')} data-dialog-autofocus className="flex h-7 w-7 items-center justify-center rounded text-ink-secondary hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-accent" onClick={onClose}><Xmark width={16} height={16} aria-hidden="true" /></button>
      </header>
      {!ordered.length && <p className="px-3 py-4 text-xs text-ink-muted">{t('menu.noNotifications')}</p>}
      <ul className="min-h-0 overflow-y-auto divide-y divide-edge px-3">
        {ordered.map(notice => {
          const Icon = notice.level === 'success' ? Check : WarningTriangle
          const body = <><span className="block break-words text-xs leading-5 text-ink">{notice.kind === 'test' ? t('mewcat.testBody') : t(`mewcat.${notice.kind}`)}</span><span className="block break-words text-[11px] leading-4 text-ink-secondary">{notice.kind === 'test' ? uiText('알림') : notice.source}</span></>
          return <li key={notice.id} className="flex items-start gap-2 py-2">
            <Icon width={16} height={16} aria-hidden="true" className={`mt-0.5 shrink-0 ${notice.level === 'danger' ? 'text-danger' : notice.level === 'warning' ? 'text-warning' : 'text-success'}`} />
            {notice.target ? <button type="button" className="min-w-0 flex-1 rounded text-left hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-accent" onClick={() => { onClose(); openMewcatNotice(notice) }}>{body}</button> : <div className="min-w-0 flex-1">{body}</div>}
            <button type="button" aria-label={`${t('mewcat.dismiss')}: ${notice.source}`} className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-ink-secondary hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-accent" onClick={() => dismissMewcatNotice(notice.id)}><Xmark width={14} height={14} aria-hidden="true" /></button>
          </li>
        })}
      </ul>
    </DialogFrame>
}
