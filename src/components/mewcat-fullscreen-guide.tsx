import { useState, type ReactNode, type RefObject } from 'react'
import { Download, Expand, Xmark } from 'iconoir-react'
import { useShortcutBindings } from '@mew/shortcuts'
import { requestFullscreenWithKeyboard } from '@mew/ui/virtual-keyboard'
import { useMewcatBubble } from '../hooks/use-mewcat-bubble'
import { useI18n } from '../i18n'
import { promptAppInstall, type AppInstallState } from '../utils/app-install'

type GuideProps = { anchorRef?: RefObject<HTMLDivElement | null>; onClose: () => void; hidden: boolean; onHiddenChange: (value: boolean) => void }

function GuideBubble({ anchorRef, onClose, hidden, onHiddenChange, message, children }: GuideProps & { message: string; children?: ReactNode }) {
  const { t } = useI18n()
  const bubbleRef = useMewcatBubble(anchorRef, !!anchorRef, 300, false)
  return <aside ref={bubbleRef} className={`mewcat-notifications mewcat-notifications-auto${anchorRef ? ' mewcat-notifications-with-cat' : ''}`} aria-label={t('settings.mewcat')}>
    <div className="mewcat-notifications-content p-3">
      <div className="flex items-start gap-2">
        <p role="status" className="min-w-0 flex-1 text-[13px] leading-5 text-ink">{message}</p>
        <button type="button" className="mewcat-notification-button shrink-0 text-ink-secondary" aria-label={t('mewcat.dismiss')} onClick={onClose}><Xmark width={16} height={16} aria-hidden="true" /></button>
      </div>
      {children}
      <label className="mt-1 flex min-h-11 cursor-pointer items-center gap-2 text-xs text-ink-secondary">
        <input type="checkbox" className="h-4 w-4 shrink-0 accent-accent" checked={hidden} onChange={event => onHiddenChange(event.target.checked)} />
        {t('mewcat.guideDontShowAgain')}
      </label>
    </div>
  </aside>
}

const actionClass = 'mt-2 flex min-h-11 w-full items-center justify-center gap-1.5 rounded bg-accent px-2 text-xs text-ink-on-accent hover:bg-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50'

export function MewcatInstallGuide({ install, onInstalled, ...props }: GuideProps & { install: AppInstallState; onInstalled: () => void }) {
  const { t } = useI18n()
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const [manual, setManual] = useState(false)
  const enter = async () => {
    setPending(true)
    setFailed(false)
    try {
      const outcome = await promptAppInstall()
      if (outcome === 'accepted') onInstalled()
      else { setManual(true); setFailed(outcome === 'error') }
    } finally { setPending(false) }
  }
  return <GuideBubble {...props} message={t('mewcat.installGuide')}>
    {install.available && <button type="button" disabled={pending} onClick={() => { void enter() }} className={actionClass}>
      <Download width={15} height={15} aria-hidden="true" /><span>{t('mewcat.installApp')}</span>
    </button>}
    {(!install.available || manual) && <p className="mt-2 text-xs leading-5 text-ink-secondary">{t(install.platform === 'ios' ? 'mewcat.installIos' : 'mewcat.installBrowser')}</p>}
    {failed && <p role="alert" className="mt-2 text-xs leading-4 text-danger">{t('mewcat.installFailed')}</p>}
  </GuideBubble>
}

export function MewcatFullscreenGuide(props: GuideProps) {
  const { t } = useI18n()
  const bindings = useShortcutBindings()
  const shortcut = /Mac/i.test(navigator.platform || navigator.userAgent)
    ? bindings.fullscreen.replace(/\bAlt\b/g, 'Option').replace(/\bCtrl\b/g, 'Cmd') : bindings.fullscreen
  const [failed, setFailed] = useState(false)
  const [pending, setPending] = useState(false)
  const enter = async () => {
    setFailed(false)
    setPending(true)
    try {
      if (!document.fullscreenElement) await requestFullscreenWithKeyboard(document.documentElement)
      props.onClose()
    } catch { setFailed(true) }
    finally { setPending(false) }
  }
  return <GuideBubble {...props} message={t('mewcat.fullscreenGuide')}>
      <button type="button" disabled={pending} onClick={() => { void enter() }} className={actionClass}>
        <Expand width={15} height={15} aria-hidden="true" /><span>{t('mewcat.fullscreenEnter')} ({shortcut})</span>
      </button>
      {failed && <p role="alert" className="mt-2 text-xs leading-4 text-danger">{t('mewcat.fullscreenFailed')}</p>}
  </GuideBubble>
}
