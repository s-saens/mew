import { useId, useState, type FormEvent } from 'react'
import { LogOut, Xmark } from 'iconoir-react'
import { DialogFrame, HoverTipLayer } from '@mew/ui'
import { uiText } from '@mew/ui/i18n-core'
import { useUiLocale } from '@mew/ui/i18n'
import { changePassword, logout } from '../api/client'
import { useI18n } from '../i18n'
import { requestMewlinkLogout } from '../utils/remote-app'
import { AccountProfileForm } from './account-profile-form'
import { MewlinkAccountConnection } from './mewlink-account-connection'

const PASSWORD_MIN_LENGTH = 10

interface AccountSettingsModalProps {
  email: string
  displayName: string | null
  avatarDataUrl: string | null
  hasPassword?: boolean
  authenticationMethod?: 'password' | 'mewlink' | null
  onClose: () => void
  onLoggedOut: () => void
  onProfileChanged: (profile: { displayName: string; avatarDataUrl: string | null }) => void
}

export function AccountSettingsModal({ email, displayName, avatarDataUrl, hasPassword = true, authenticationMethod, onClose, onLoggedOut, onProfileChanged }: AccountSettingsModalProps) {
  useUiLocale()
  const { t } = useI18n()
  const titleId = useId()
  const [loggingOut, setLoggingOut] = useState(false)

  async function handleLogout() {
    if (loggingOut) return
    setLoggingOut(true)
    try { await logout() }
    catch { /* Local logout still succeeds when the server cannot be reached. */ }
    if (authenticationMethod === 'mewlink' && requestMewlinkLogout()) return
    onLoggedOut()
  }

  return <DialogFrame labelledBy={titleId} onClose={onClose} busy={loggingOut} className="flex max-h-[90dvh] max-w-[520px] flex-col">
    <HoverTipLayer className="contents">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-edge px-3 py-2">
        <h2 id={titleId} className="text-sm font-semibold text-ink-bright">{t('settings.myAccount')}</h2>
        <button type="button" onClick={onClose} disabled={loggingOut} aria-label={t('settings.close')} data-tip={t('settings.close')}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-secondary outline-none hover:bg-surface-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40">
          <Xmark width={18} height={18} aria-hidden="true" />
        </button>
      </header>
      <div className="min-h-0 overflow-y-auto p-3">
        <AccountProfileForm email={email} displayName={displayName} avatarDataUrl={avatarDataUrl} hasPassword={hasPassword} onProfileChanged={onProfileChanged} />
        <MewlinkAccountConnection email={email} authenticationMethod={authenticationMethod} />
        {hasPassword && <PasswordForm />}
      </div>
      <footer className="flex shrink-0 justify-end border-t border-edge px-3 py-2">
        <button type="button" onClick={() => void handleLogout()} disabled={loggingOut}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-danger outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40">
          <LogOut width={16} height={16} aria-hidden="true" />{t('settings.logout')}
        </button>
      </footer>
    </HoverTipLayer>
  </DialogFrame>
}

function PasswordForm() {
  const { t } = useI18n()
  const titleId = useId()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [busy, setBusy] = useState(false)

  async function handleChangePassword(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setError(null)
    setSuccess(false)
    if (newPassword.length < PASSWORD_MIN_LENGTH) {
      setError(uiText('비밀번호는 {p0}자 이상이어야 합니다', { p0: PASSWORD_MIN_LENGTH }))
      return
    }
    if (newPassword !== confirmPassword) {
      setError(uiText('새 비밀번호가 서로 다릅니다'))
      return
    }
    setBusy(true)
    try {
      await changePassword(currentPassword, newPassword)
      setSuccess(true)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setError(err instanceof Error ? err.message : uiText('비밀번호 변경에 실패했습니다'))
    } finally { setBusy(false) }
  }

  const inputClass = 'min-w-0 w-full rounded-md border border-edge-strong bg-surface px-2.5 py-1.5 text-sm text-ink outline-none placeholder:text-ink-faint focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent disabled:opacity-40'

  return <form onSubmit={handleChangePassword} aria-labelledby={titleId} className="flex flex-col gap-2 border-t border-edge pt-3">
    <h3 id={titleId} className="text-sm font-medium text-ink">{t('settings.changePassword')}</h3>
    <input type="password" aria-label={t('settings.currentPassword')} value={currentPassword} onChange={event => setCurrentPassword(event.target.value)}
      placeholder={t('settings.currentPassword')} autoComplete="current-password" required disabled={busy} className={inputClass} />
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <input type="password" aria-label={t('settings.newPassword')} value={newPassword} onChange={event => setNewPassword(event.target.value)}
        placeholder={`${t('settings.newPassword')} (${PASSWORD_MIN_LENGTH}+)`} autoComplete="new-password" required disabled={busy} className={inputClass} />
      <input type="password" aria-label={t('settings.confirmPassword')} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)}
        placeholder={t('settings.confirmPassword')} autoComplete="new-password" required disabled={busy} className={inputClass} />
    </div>
    {error && <div role="alert" className="select-text text-sm text-danger">{error}</div>}
    {success && <div role="status" className="text-sm text-success">{uiText('비밀번호 변경 완료 · 다른 기기에서 다시 로그인 필요')}</div>}
    <div className="flex justify-end">
      <button type="submit" disabled={busy || !currentPassword || !newPassword || !confirmPassword}
        className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-ink-on-accent outline-none hover:bg-accent-strong focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:opacity-40">
        {busy ? t('settings.changing') : t('settings.change')}
      </button>
    </div>
  </form>
}
