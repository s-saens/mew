import { useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Copy, Group, Key, Trash, Undo, Xmark } from 'iconoir-react'
import { copyText, getFixedPopupLayout, useOverlayDismiss } from '@mew/ui'
import type { AccessRow } from '../../shared/access-policy'
import { uiText } from '@mew/ui/i18n-core'
import { useI18n } from '../i18n'
import { AccountRoleSelect } from './account-role-select'

interface AccountControls {
  onRoleChange: (subject: string, role: AccessRow['role']) => Promise<void>
  onDelete: (subject: string) => Promise<void>
  onResetPassword: (subject: string) => Promise<string>
  canResetPassword: boolean
  disabled: boolean
  lastOwner: boolean
}

function AccountIcon({ account, onRoleChange, onDelete, onResetPassword, canResetPassword, disabled, lastOwner }: { account: AccessRow } & AccountControls) {
  const { t } = useI18n()
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const popup = useRef<HTMLDivElement>(null)
  const [failedAvatar, setFailedAvatar] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState<'delete' | 'reset' | null>(null)
  const [tempPassword, setTempPassword] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null)
  const name = account.subject === 'guest' ? account.displayName : `${account.displayName} (${account.subject})`
  const close = () => { if (!busy) { setOpen(false); setConfirming(null); setTempPassword(null); setCopied(false); setError(''); trigger.current?.focus({ preventScroll: true }) } }
  useOverlayDismiss(open && close, { outside: () => popup.current, outsideIgnore: () => trigger.current })
  useLayoutEffect(() => {
    if (!open) return
    const element = popup.current!
    const place = () => {
      const rect = trigger.current!.getBoundingClientRect()
      const layout = getFixedPopupLayout(portalContainer)
      const host = portalContainer?.getBoundingClientRect()
      const left = Math.max(layout.bounds.left, host?.left ?? -Infinity) + 8
      const top = Math.max(layout.bounds.top, host?.top ?? -Infinity) + 8
      const right = Math.min(layout.bounds.right, host?.right ?? Infinity) - 8
      const bottom = Math.min(layout.bounds.bottom, host?.bottom ?? Infinity) - 8
      const width = Math.min(288, Math.max(0, right - left))
      const limits = layout.toStyle({ width, maxHeight: Math.max(0, bottom - top) })
      Object.assign(element.style, { width: `${limits.width}px`, maxHeight: `${limits.maxHeight}px` })
      const below = bottom - rect.bottom - 4, above = rect.top - top - 4
      const down = below >= element.getBoundingClientRect().height || below >= above
      element.style.maxHeight = `${layout.toStyle({ maxHeight: Math.max(0, down ? below : above) }).maxHeight}px`
      const height = element.getBoundingClientRect().height
      const position = layout.toStyle({ left: Math.max(left, Math.min(rect.left + rect.width / 2 - width / 2, right - width)),
        top: Math.max(top, Math.min(down ? rect.bottom + 4 : rect.top - height - 4, bottom - height)) })
      element.style.left = `${position.left}px`
      element.style.top = `${position.top}px`
    }
    place()
    const observer = new ResizeObserver(place)
    observer.observe(element)
    observer.observe(trigger.current!)
    if (portalContainer) observer.observe(portalContainer)
    const mutations = new MutationObserver(place)
    mutations.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class'] })
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    window.visualViewport?.addEventListener('resize', place)
    window.visualViewport?.addEventListener('scroll', place)
    return () => {
      observer.disconnect()
      mutations.disconnect()
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
      window.visualViewport?.removeEventListener('resize', place)
      window.visualViewport?.removeEventListener('scroll', place)
    }
  }, [open, portalContainer])
  async function act(action: () => Promise<void>) {
    setBusy(true); setError('')
    try { await action() }
    catch (err) { setError(err instanceof Error ? err.message : t('access.saveFailed')) }
    finally { setBusy(false) }
  }
  const showAvatar = account.subject !== 'guest' && account.avatarDataUrl && account.avatarDataUrl !== failedAvatar
  const initial = [...(account.displayName.trim() || account.subject.trim())][0]?.toUpperCase() ?? '?'
  const fallback = <span aria-hidden="true" className="text-sm font-semibold leading-none">{initial}</span>
  return <>
    <button ref={trigger} type="button" disabled={busy || disabled} aria-label={name} aria-expanded={open} aria-controls={open ? id : undefined} data-tip={name}
      onClick={event => { if (open) close(); else { setPortalContainer(event.currentTarget.closest<HTMLElement>('[role="dialog"]')); setOpen(true) } }}
      className={`mx-auto flex h-9 w-9 items-center justify-center rounded-full outline-none ring-offset-2 ring-offset-surface focus-visible:ring-2 focus-visible:ring-accent pointer-coarse:h-11 pointer-coarse:w-11 ${open ? 'bg-accent/15 text-ink ring-2 ring-accent' : 'bg-surface-raised text-ink-secondary hover:ring-2 hover:ring-edge-bright hover:text-ink'}`}>
      {showAvatar
        ? <img src={account.avatarDataUrl!} alt="" className="h-full w-full rounded-full object-cover" onError={() => setFailedAvatar(account.avatarDataUrl)} />
        : account.subject === 'guest' ? <Group width={18} height={18} aria-hidden="true" /> : fallback}
    </button>
    {open && createPortal(<div ref={popup} id={id} role="region" aria-label={`${t('access.account')}: ${account.displayName}`}
      className="mew-dialog fixed z-[1300] overflow-y-auto overscroll-contain rounded-lg border border-edge-bright bg-surface p-3 text-left text-sm font-normal text-ink shadow-xl">
      <div className="flex items-start gap-2.5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-raised text-ink-secondary" aria-hidden="true">
          {showAvatar ? <img src={account.avatarDataUrl!} alt="" className="h-full w-full object-cover" onError={() => setFailedAvatar(account.avatarDataUrl)} /> : account.subject === 'guest' ? <Group width={20} height={20} /> : fallback}
        </div>
        <div className="min-w-0 flex-1 py-0.5">
          <div className="select-text break-words font-semibold text-ink-bright">{account.displayName}</div>
          {account.subject !== 'guest' && <div className="select-text mt-0.5 break-all text-xs text-ink-secondary">{account.subject}</div>}
        </div>
        <button type="button" aria-label={t('common.close')} data-tip={t('common.close')} disabled={busy} onClick={close} className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-ink-secondary hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent pointer-coarse:h-11 pointer-coarse:w-11"><Xmark width={16} height={16} aria-hidden="true" /></button>
      </div>
      {account.subject !== 'guest' && <>
        <div className="mt-2 flex items-center justify-between gap-2 border-t border-edge pt-2">
          <span className="text-xs text-ink-secondary">{t('access.role')}</span>
          <AccountRoleSelect iconOnly={false} className="w-40 max-w-full" portalContainer={portalContainer} popupClassName="z-[1400]" label={`${account.subject} ${uiText('역할 변경')}`} value={account.role} disabled={busy || disabled || lastOwner}
            onChange={role => void act(() => onRoleChange(account.subject, role))} />
        </div>
        {lastOwner && <p className="mt-2 text-xs text-ink-secondary">{uiText('마지막 owner 계정은 유지해야 합니다.')}</p>}
        {canResetPassword && <div className="mt-2 border-t border-edge pt-2">
          {tempPassword ? <div role="status">
            <div className="text-xs text-ink-secondary">{t('admin.temporaryPassword')}</div>
            <div className="mt-1 flex items-center gap-2">
              <code className="select-text min-w-0 flex-1 break-all text-sm font-semibold text-ink-bright">{tempPassword}</code>
              <button type="button" aria-label={copied ? uiText('복사됨') : t('admin.copyTemporaryPassword')} data-tip={copied ? uiText('복사됨') : t('admin.copyTemporaryPassword')}
                onClick={() => { void copyText(tempPassword).then(ok => { setCopied(ok); if (!ok) setError(t('admin.copyPasswordFailed')) }) }}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-ink-secondary hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent">{copied ? <Check width={16} height={16} aria-hidden="true" /> : <Copy width={16} height={16} aria-hidden="true" />}</button>
            </div>
            <p className="mt-1 text-xs text-ink-secondary">{t('admin.passwordDeliveryWarning')}</p>
          </div> : confirming === 'reset' ? <>
            <p className="mb-2 text-xs leading-relaxed text-ink-secondary">{t('admin.passwordResetNotice')}</p>
            <div className="flex items-center gap-1">
              <button type="button" disabled={busy || disabled} onClick={() => void act(async () => { setTempPassword(await onResetPassword(account.subject)); setConfirming(null) })}
                className="flex min-h-8 flex-1 items-center justify-center gap-1.5 rounded-md bg-accent px-2 text-xs font-medium text-ink-on-accent hover:bg-accent-strong disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-accent">{busy ? t('access.saving') : t('admin.confirmPasswordReset')}</button>
              <button type="button" disabled={busy} aria-label={t('common.cancel')} data-tip={t('common.cancel')} onClick={() => { setConfirming(null); setError('') }} className="flex h-8 w-8 items-center justify-center rounded-md text-ink-secondary hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent"><Xmark width={16} height={16} aria-hidden="true" /></button>
            </div>
          </> : <button type="button" disabled={busy || disabled} onClick={() => { setConfirming('reset'); setError('') }} className="flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-xs text-ink-secondary hover:bg-surface-hover hover:text-ink disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-accent"><Key width={16} height={16} aria-hidden="true" />{t('admin.resetPassword')}</button>}
        </div>}
        <div className="mt-2 border-t border-edge pt-2">
          {confirming === 'delete' ? <>
            <p className="mb-2 text-xs leading-relaxed text-ink-secondary">{uiText('계정과 로그인 권한을 삭제합니다. 프로젝트 파일과 작업 기록은 유지됩니다.')}</p>
            <div className="flex items-center gap-1">
              <button type="button" disabled={busy || disabled} onClick={() => void act(() => onDelete(account.subject))} className="flex min-h-8 flex-1 items-center justify-center gap-1.5 rounded-md bg-danger-strong px-2 text-xs font-medium text-ink-on-danger hover:bg-danger disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-accent">{busy ? t('access.saving') : uiText('삭제 확인')}</button>
              <button type="button" disabled={busy} aria-label={uiText('삭제 취소')} data-tip={uiText('취소')} onClick={() => { setConfirming(null); setError('') }} className="flex h-8 w-8 items-center justify-center rounded-md text-ink-secondary hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent"><Xmark width={16} height={16} aria-hidden="true" /></button>
            </div>
          </> : <button type="button" disabled={busy || disabled || lastOwner} onClick={() => { setConfirming('delete'); setError('') }} className="flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-xs text-danger hover:bg-danger/10 disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-accent"><Trash width={16} height={16} aria-hidden="true" />{uiText('계정 삭제')}</button>}
        </div>
        {error && <p role="alert" className="select-text mt-2 break-words text-xs text-danger">{error}</p>}
      </>}
    </div>, portalContainer ?? document.body)}
  </>
}

export function AccountColumnHeaders({ accounts, passwordAccounts, onRoleChange, onDelete, onResetPassword, onResetFeatures, disabled }: {
  accounts: AccessRow[]
  passwordAccounts: string[]
  onResetFeatures?: (subject: string) => void
} & Omit<AccountControls, 'lastOwner' | 'canResetPassword'>) {
  const { t } = useI18n()
  return <thead><tr>
    <th scope="col" className="sticky left-0 top-0 z-20 w-32 min-w-32 max-w-32 border-b border-r border-edge bg-surface-raised px-3 py-2 text-left text-xs font-medium">{t('access.account')}</th>
    {accounts.map(account => <th key={account.subject} scope="col" className="sticky top-0 z-10 w-16 min-w-16 border-b border-edge bg-surface-raised px-1 py-2">
      <AccountIcon account={account} onRoleChange={onRoleChange} onDelete={onDelete} onResetPassword={onResetPassword} canResetPassword={passwordAccounts.includes(account.subject)} disabled={disabled} lastOwner={account.role === 'owner' && accounts.filter(row => row.role === 'owner').length === 1} />
      {onResetFeatures && <button type="button" disabled={disabled || Object.keys(account.overrides).length === 0}
        onClick={() => onResetFeatures(account.subject)} aria-label={`${account.subject} ${t('access.accountFeatureReset')}`} data-tip={t('access.accountFeatureReset')}
        className="mx-auto mt-1 flex h-7 w-7 items-center justify-center rounded text-ink-secondary hover:bg-surface-hover hover:text-ink disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-accent pointer-coarse:h-11 pointer-coarse:w-11"><Undo width={14} height={14} aria-hidden="true" /></button>}
    </th>)}
  </tr></thead>
}
