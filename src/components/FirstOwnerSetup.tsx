import { canAutoFocusInput } from '@mew/ui'
import { useState, type FormEvent } from 'react'
import { createFirstOwner, fetchAuthStatus, type AuthStatus } from '../api/auth'
import { ApiResponseError } from '../api/response'
import { useI18n } from '../i18n'

interface FirstOwnerSetupProps {
  token: string | null
  onSuccess: (status: AuthStatus) => void
  onInitialized: (status: AuthStatus) => void
}

export function FirstOwnerSetup({ token, onSuccess, onInitialized }: FirstOwnerSetupProps) {
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [tokenRejected, setTokenRejected] = useState(false)
  const canSetUp = !!token && !tokenRejected
  const inputClass = 'w-full rounded border border-edge-strong bg-surface px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-edge-bright disabled:opacity-40'

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token || busy) return
    setError('')
    if (password.length < 10) { setError(t('auth.passwordTooShort', { length: 10 })); return }
    if (password !== confirmation) { setError(t('auth.setupPasswordMismatch')); return }
    if (password.toLowerCase() === email.trim().toLowerCase()) { setError(t('auth.setupPasswordEmail')); return }
    setBusy(true)
    try {
      const status = await createFirstOwner(token, email.trim(), password)
      setPassword('')
      setConfirmation('')
      onSuccess(status)
    } catch (cause) {
      if (cause instanceof ApiResponseError && cause.status === 403) {
        setPassword('')
        setConfirmation('')
        setTokenRejected(true)
      } else if (cause instanceof ApiResponseError && cause.status === 409) {
        try {
          const status = await fetchAuthStatus()
          if (!status.setupRequired) { onInitialized(status); return }
          setError(t('auth.setupFailed'))
        } catch { setError(t('auth.setupFailed')) }
      } else {
        setError(t(cause instanceof ApiResponseError && cause.status === 429 ? 'auth.setupRateLimited' : cause instanceof ApiResponseError && cause.status === 400 ? 'auth.setupInvalidFields' : 'auth.setupFailed'))
      }
    } finally {
      setBusy(false)
    }
  }

  return <main className="fixed inset-0 flex items-center justify-center overflow-y-auto bg-surface p-3 text-ink">
    <section aria-labelledby="first-owner-title" className="my-auto w-full max-w-sm rounded-lg border border-edge bg-surface-deep p-4">
      <div className="mb-3 text-lg font-semibold text-ink-bright">mew</div>
      <h1 id="first-owner-title" className="text-base font-semibold text-ink-bright">{t('auth.setupTitle')}</h1>
      {canSetUp ? <>
        <p className="mb-3 mt-1 text-sm text-ink-secondary">{t('auth.setupDescription')}</p>
        <form onSubmit={submit} className="flex flex-col gap-3" aria-busy={busy}>
          <label className="flex flex-col gap-1 text-sm">
            {t('auth.email')}
            <input name="email" type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="username" autoFocus={canAutoFocusInput()} maxLength={254} required disabled={busy} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span id="first-owner-password-label">{t('auth.password')}</span>
            <input name="password" type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="new-password" aria-labelledby="first-owner-password-label" aria-describedby="first-owner-password-hint" maxLength={256} required disabled={busy} className={inputClass} />
            <span id="first-owner-password-hint" className="text-xs text-ink-secondary">{t('auth.setupPasswordHint', { length: 10 })}</span>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t('auth.setupConfirmPassword')}
            <input name="passwordConfirmation" type="password" value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="new-password" maxLength={256} required disabled={busy} className={inputClass} />
          </label>
          {error && <p role="alert" className="select-text text-sm text-danger">{error}</p>}
          <button type="submit" disabled={busy || !email.trim() || !password || !confirmation} className="mt-1 rounded bg-accent px-3 py-2 text-sm font-medium text-ink-on-accent hover:bg-accent-strong disabled:opacity-40">{busy ? t('auth.setupCreating') : t('auth.setupCreate')}</button>
        </form>
      </> : <p role="status" className="mt-2 text-sm text-ink-secondary">{t('auth.setupReopen')}</p>}
    </section>
  </main>
}
