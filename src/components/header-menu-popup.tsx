import { useState, type MouseEvent } from 'react'
import { ActionMenu, ActionMenuItem, HoverTipLayer } from '@mew/ui'
import { Check, NavArrowRight, WarningTriangle, Xmark } from 'iconoir-react'
import { useI18n } from '../i18n'
import { dismissMewcatNotice, openMewcatNotice, type MewcatNotice } from '../utils/mewcat-notifications'
import { orderMenuNotices } from './header-notifications'
import type { HeaderMenuItem } from './HeaderMenu'
import './workspace-menu.css'

export type HeaderMenuAccount = {
  email: string
  displayName: string | null
  avatarDataUrl: string | null
  onSelect: () => void
}

type HeaderMenuPopupProps = {
  x: number
  y: number
  label: string
  trigger: HTMLButtonElement | null
  items: HeaderMenuItem[]
  account?: HeaderMenuAccount
  notices?: readonly MewcatNotice[]
  onViewNotifications?: () => void
  onClose: () => void
}

function AccountCard({ account }: { account: HeaderMenuAccount }) {
  const { t } = useI18n()
  const [failedAvatar, setFailedAvatar] = useState<string | null>(null)
  const name = account.displayName || account.email.split('@')[0]
  return <ActionMenuItem data-workspace-row="profile" aria-label={`${t('settings.account')}: ${name}`} onClick={account.onSelect}>
    <span className="mew-workspace-menu-avatar" aria-hidden="true">
      {account.avatarDataUrl && failedAvatar !== account.avatarDataUrl
        ? <img src={account.avatarDataUrl} alt="" onError={() => setFailedAvatar(account.avatarDataUrl)} />
        : name.trim().slice(0, 2).toUpperCase()}
    </span>
    <span className="mew-workspace-menu-profile-copy"><span className="mew-workspace-menu-profile-name">{name}</span><span className="mew-workspace-menu-profile-email">{account.email}</span></span>
    <NavArrowRight width={14} height={14} className="text-ink-muted" aria-hidden="true" />
  </ActionMenuItem>
}

function MenuNotice({ notice }: { notice: MewcatNotice }) {
  const { t } = useI18n()
  const Icon = notice.level === 'success' ? Check : WarningTriangle
  const dismiss = (event: MouseEvent<HTMLButtonElement>) => {
    const row = event.currentTarget.closest('[data-menu-notice]')
    const items = Array.from(event.currentTarget.closest('[role="menu"]')?.querySelectorAll<HTMLButtonElement>('[data-action-menu-item]:not(:disabled)') ?? [])
    const index = items.indexOf(event.currentTarget)
    const next = [...items.slice(index + 1), ...items.slice(0, index).reverse()].find(item => !row?.contains(item))
    dismissMewcatNotice(notice.id)
    requestAnimationFrame(() => { if (next?.isConnected) next.focus({ preventScroll: true }) })
  }
  return <div data-menu-notice><HoverTipLayer className="mew-workspace-menu-notice">
    <ActionMenuItem data-workspace-row="notice-main" closeOnSelect={!!notice.target}
      onClick={() => { if (notice.target) openMewcatNotice(notice) }}
      icon={<Icon className={notice.level === 'danger' ? 'text-danger' : notice.level === 'warning' ? 'text-warning' : 'text-success'} />}>
      <span className="mew-workspace-menu-notice-copy"><span>{t(notice.kind === 'test' ? 'mewcat.testBody' : `mewcat.${notice.kind}`)}</span><span className="mew-workspace-menu-notice-source">{notice.source}</span></span>
    </ActionMenuItem>
    <ActionMenuItem data-workspace-row="dismiss" closeOnSelect={false} aria-label={`${t('mewcat.dismiss')}: ${notice.source}`} data-tip={t('mewcat.dismiss')} onClick={dismiss} icon={<Xmark />} />
  </HoverTipLayer></div>
}

const renderItem = (item: HeaderMenuItem) => <ActionMenuItem key={item.id} data-header-menu-item
    disabled={item.disabled} checked={item.active} icon={item.icon} hint={item.hint} onClick={item.onSelect}>
    <span className="mew-action-menu-label">{item.label}</span>
  </ActionMenuItem>

function WorkspaceMenuSections({ items, account, notices, onViewNotifications }: Pick<HeaderMenuPopupProps, 'items' | 'account' | 'notices' | 'onViewNotifications'>) {
  const { t } = useI18n()
  return <>
      {(account || items.some(item => item.group === 'account')) && <div className="mew-workspace-menu-section" role="group" aria-label={t('menu.userAccount')}>
        <div className="mew-workspace-menu-heading">{t('menu.userAccount')}</div>
        {account && <AccountCard account={account} />}
        {items.filter(item => item.group === 'account').map(renderItem)}
      </div>}
      {notices !== undefined && <div className="mew-workspace-menu-section" role="group" aria-label={t('menu.notifications')}>
        <div className="mew-workspace-menu-heading"><span>{t('menu.notifications')}{notices.length > 0 && ` · ${notices.length}`}</span>
          <ActionMenuItem data-workspace-row="view-all" onClick={onViewNotifications}>{t('menu.viewAll')}</ActionMenuItem>
        </div>
        {notices.length ? orderMenuNotices(notices).slice(0, 4).map(notice => <MenuNotice key={notice.id} notice={notice} />)
          : <p className="mew-workspace-menu-empty">{t('menu.noNotifications')}</p>}
      </div>}
      {(['tools', 'mew'] as const).map(group => {
        const actions = items.filter(item => (item.group ?? 'tools') === group)
        return actions.length > 0 && <div className="mew-workspace-menu-section" key={group} role="group" aria-label={group === 'mew' ? 'Mew' : t('menu.tools')}>
          <div className="mew-workspace-menu-heading">{group === 'mew' ? 'Mew' : t('menu.tools')}</div>{actions.map(renderItem)}
        </div>
      })}
    </>
}

export function HeaderMenuPopup({ x, y, onClose, items, label, trigger, account, notices, onViewNotifications }: HeaderMenuPopupProps) {
  const grouped = !!account || notices !== undefined || items.some(item => item.group)

  return <ActionMenu variant="header" x={x} y={y} label={label} trigger={trigger} onClose={onClose}
    ref={element => { if (element && grouped) element.dataset.workspaceMenu = '' }}>
    {grouped ? <WorkspaceMenuSections items={items} account={account} notices={notices} onViewNotifications={onViewNotifications} /> : items.map(renderItem)}
  </ActionMenu>
}
