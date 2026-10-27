import { createPortal } from 'react-dom'
import { DockSettingsPanel } from './dock-settings-panel'
import type { MobileDockPanel } from '../utils/mobile-dock'
import { uiText } from '@mew/ui/i18n-core'
import { useUiLocale } from '@mew/ui/i18n'
import { lazy, Suspense, useEffect, useId, useState, type Ref } from 'react'
import { SelectField, useOverlayDismiss } from '@mew/ui'
import { changePassword, fetchIgnoreList, logout, saveIgnoreList } from '../api/client'
import { AccountProfileForm } from './account-profile-form'
import { DEFAULT_SHORTCUTS, formatKeyCombo, resetAllBindings, resetBinding, setBinding, useShortcutBindings } from '@mew/shortcuts'
import { LOCALES, LOCALE_NAMES, localizeShortcut, useI18n, type Locale, type TranslationKey } from '../i18n'
import { DEFAULT_FONT_PREFERENCES, type FontPreferences } from '../utils/fontPreferences'
import { DEFAULT_THEME_PALETTE, type ThemeSettings } from '../utils/theme-color'
import { ThemeSettingsPanel } from './theme-settings'
import type { MewcatSkinSelection } from '../utils/mewcatSkin'
import { MewcatSkinSettings } from './mewcat-skin-settings'
import { MewcatSizeSettings } from './mewcat-size-settings'
import { MewcatNotificationSettings } from './mewcat-notifications'
import { MewcatBreakSettings } from './mewcat-break'
import { requestMewlinkLogout } from '../utils/remote-app.ts'
import { MewlinkAccountConnection } from './mewlink-account-connection.tsx'

const DebuggerSettings = lazy(() => import('./debugger-settings'))

const PASSWORD_MIN_LENGTH = 10

type Section = 'debugger' | 'account' | 'appearance' | 'notifications' | 'dock' | 'mewcat' | 'shortcuts' | 'ignore'

interface SettingsModalProps {
  mewcatHostRef?: Ref<HTMLDivElement>
  mewcatRequest?: number
  initialDebugger?: boolean
  debuggerRoot?: string
  onOpenDebugger?: () => void
  dockAvailable?: readonly MobileDockPanel[]
  /** 로그인한 사용자의 이메일 — 게스트면 null이라 계정 탭을 숨긴다 */
  email: string | null
  displayName: string | null
  avatarDataUrl: string | null
  hasPassword?: boolean
  authenticationMethod?: 'password' | 'mewlink' | null
  /** owner·manager만 숨김 목록 탭을 본다 — 모두의 트리를 바꾸는 전역 설정이라 */
  canEditIgnore: boolean
  fontPreferences: FontPreferences
  themeSettings: ThemeSettings
  mewcatHideDesktop: boolean
  onMewcatHideDesktopChange: (value: boolean) => void
  mewcatSkin: MewcatSkinSelection
  onFontPreferencesChange: (fonts: FontPreferences) => void
  onThemeSettingsChange: (settings: ThemeSettings) => void
  onMewcatSkinChange: (skin: MewcatSkinSelection) => void
  onClose: () => void
  onLoggedOut: () => void
  onProfileChanged: (profile: { displayName: string; avatarDataUrl: string | null }) => void
}

const SECTION_LABEL: Record<Section, TranslationKey> = {
  debugger: 'settings.debugger',
  account: 'settings.account',
  appearance: 'settings.appearance',
  dock: 'settings.dock',
  notifications: 'settings.notifications',
  mewcat: 'settings.mewcat',
  shortcuts: 'settings.shortcuts',
  ignore: 'settings.ignoreList',
}

/** 헤더의 계정 버튼(게스트는 톱니 버튼)으로 여는 설정 창 — 계정·화면(테마)·단축키·숨김 목록을 한곳에서 관리한다 */
export function SettingsModal({ mewcatHostRef, mewcatRequest, initialDebugger, debuggerRoot, onOpenDebugger, dockAvailable, email, displayName, avatarDataUrl, hasPassword = true, authenticationMethod, canEditIgnore, themeSettings = { palette: DEFAULT_THEME_PALETTE, custom: [] }, fontPreferences, mewcatSkin, mewcatHideDesktop, onMewcatHideDesktopChange, onFontPreferencesChange, onThemeSettingsChange = () => {}, onMewcatSkinChange, onClose, onLoggedOut, onProfileChanged }: SettingsModalProps) {
  useUiLocale()
  const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(null)
  const [section, setSection] = useState<Section>(mewcatRequest ? 'mewcat' : debuggerRoot && initialDebugger ? 'debugger' : email ? 'account' : 'appearance')
  // Mobile begins with the category list; the selected panel is a second screen.
  const [mobileSection, setMobileSection] = useState<Section | null>(section === 'debugger' || mewcatRequest ? section : null)
  const { t } = useI18n()
  const [previousMewcatRequest, setPreviousMewcatRequest] = useState(mewcatRequest)
  if (previousMewcatRequest !== mewcatRequest) {
    setPreviousMewcatRequest(mewcatRequest)
    if (mewcatRequest) {
      setSection('mewcat')
      setMobileSection('mewcat')
    }
  }

  // Esc·모바일 뒤로가기로 이 창만 닫는다 (뒤의 사이드바·터미널은 그대로)
  useOverlayDismiss(onClose)

  const sections: Section[] = [
    ...(email ? (['account'] as Section[]) : []),
    'appearance',
    'notifications',
    'dock',
    ...(debuggerRoot ? (['debugger'] as Section[]) : []),
    'mewcat',
    'shortcuts',
    ...(canEditIgnore ? (['ignore'] as Section[]) : []),
  ]

  return createPortal(
    <div ref={setPortalContainer} role="dialog" aria-modal="true" aria-label={t('settings.title')} style={{ zIndex: 'var(--layer-settings)' }} className="fixed inset-0 flex items-center justify-center bg-black/50 max-md:px-0 md:px-4" onClick={onClose}>
      <div
        className="flex h-[70vh] w-full max-w-[740px] overflow-hidden rounded-lg border border-edge bg-surface-deep max-md:h-full max-md:rounded-none"
        onClick={(e) => e.stopPropagation()}
      >
        <nav className={`${mobileSection ? 'hidden md:flex' : 'flex'} w-28 shrink-0 flex-col gap-1 border-r border-edge p-3 sm:w-40 max-md:w-full max-md:border-r-0 max-md:p-4`}>
          <div className="mb-2 flex items-center justify-between gap-2 px-2 text-sm font-semibold text-ink-bright">
            {t('settings.title')}
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-ink-secondary hover:bg-surface-raised hover:text-ink md:hidden"
              aria-label={t('settings.close')}
            >
              ×
            </button>
          </div>
          {sections.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setSection(id)
                setMobileSection(id)
              }}
              className={`rounded px-2 py-1.5 text-left text-sm max-md:px-3 max-md:py-3 max-md:text-base ${
                section === id ? 'bg-surface-raised font-medium text-ink' : 'text-ink-secondary hover:bg-surface-raised hover:text-ink'
              }`}
            >
              {t(SECTION_LABEL[id])}
            </button>
          ))}
        </nav>

        <div className={`${mobileSection ? 'flex' : 'hidden md:flex'} min-h-0 min-w-0 flex-1 flex-col`}>
          <div className="flex items-center justify-between gap-2 border-b border-edge px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setMobileSection(null)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-lg text-ink-secondary hover:bg-surface-raised hover:text-ink md:hidden"
                aria-label={t('settings.back')}
              >
                ←
              </button>
              <div className="truncate text-sm font-semibold text-ink-bright">{t(SECTION_LABEL[section])}</div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-ink-secondary hover:bg-surface-raised hover:text-ink"
              aria-label={t('settings.close')}
            >
              ×
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {section === 'account' && email && <AccountPanel email={email} displayName={displayName} avatarDataUrl={avatarDataUrl} hasPassword={hasPassword} authenticationMethod={authenticationMethod} onLoggedOut={onLoggedOut} onProfileChanged={onProfileChanged} />}
            {section === 'appearance' && (
              <AppearancePanel
                portalContainer={portalContainer}
                themeSettings={themeSettings}
                fonts={fontPreferences}
                onFontsChange={onFontPreferencesChange}
                onThemeSettingsChange={onThemeSettingsChange}
              />
            )}
            {section === 'notifications' && <MewcatNotificationSettings hasCat={mewcatSkin !== null} />}
            {section === 'debugger' && debuggerRoot && <Suspense fallback={<div role="status">…</div>}><DebuggerSettings key={debuggerRoot} root={debuggerRoot} portalContainer={portalContainer} onOpen={onOpenDebugger ?? onClose} /></Suspense>}
            {section === 'dock' && <DockSettingsPanel available={dockAvailable} />}
            {section === 'mewcat' && <><MewcatSkinSettings skin={mewcatSkin} onChange={onMewcatSkinChange} /><MewcatSizeSettings /><label className="mt-3 flex min-h-11 cursor-pointer items-center gap-2 text-sm text-ink"><input type="checkbox" checked={mewcatHideDesktop} onChange={event => onMewcatHideDesktopChange(event.target.checked)} className="accent-accent" />{uiText("원격 데스크톱에서 뮤펫 숨기기")}</label><MewcatBreakSettings /></>}
            {section === 'shortcuts' && <ShortcutsPanel />}
            {section === 'ignore' && <IgnorePanel />}
          </div>
        </div>
      </div>
      <div ref={mewcatHostRef} data-settings-mewcat-host className="contents" onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()} onKeyUp={event => event.stopPropagation()} />
    </div>, document.body
  )
}

// ── 계정: 비밀번호 변경 + 로그아웃 ───────────────────────────────────────────
function AccountPanel({
  email,
  displayName,
  avatarDataUrl,
  hasPassword,
  authenticationMethod,
  onLoggedOut,
  onProfileChanged,
}: {
  email: string
  displayName: string | null
  avatarDataUrl: string | null
  hasPassword: boolean
  authenticationMethod?: 'password' | 'mewlink' | null
  onLoggedOut: () => void
  onProfileChanged: (profile: { displayName: string; avatarDataUrl: string | null }) => void
}) {
  useUiLocale()
  const { t } = useI18n()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [busy, setBusy] = useState(false)

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    if (newPassword.length < PASSWORD_MIN_LENGTH) {
      setError(uiText("비밀번호는 {p0}자 이상이어야 합니다", { p0: PASSWORD_MIN_LENGTH }))
      return
    }
    if (newPassword !== confirmPassword) {
      setError(uiText("새 비밀번호가 서로 다릅니다"))
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
      setError(err instanceof Error ? err.message : uiText("비밀번호 변경에 실패했습니다"))
    } finally {
      setBusy(false)
    }
  }

  async function handleLogout() {
    try {
      await logout()
    } catch {
      // 서버에 못 알려도 클라이언트 상태는 로그아웃으로 전환한다
    }
    if (authenticationMethod === 'mewlink' && requestMewlinkLogout()) return
    onLoggedOut()
  }

  const inputClass =
    'w-full rounded border border-edge-strong bg-surface px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-edge-bright'

  return (
    <div>
      <AccountProfileForm email={email} displayName={displayName} avatarDataUrl={avatarDataUrl} hasPassword={hasPassword} onProfileChanged={onProfileChanged} />

      <MewlinkAccountConnection email={email} authenticationMethod={authenticationMethod} />

      {hasPassword && <form onSubmit={handleChangePassword} className="flex flex-col gap-3 border-t border-edge pt-4">
        <div className="text-sm font-medium">{t('settings.changePassword')}</div>
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          placeholder={t('settings.currentPassword')}
          autoComplete="current-password"
          required
          className={inputClass}
        />
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder={`${t('settings.newPassword')} (${PASSWORD_MIN_LENGTH}+)`}
          autoComplete="new-password"
          required
          className={inputClass}
        />
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder={t('settings.confirmPassword')}
          autoComplete="new-password"
          required
          className={inputClass}
        />
        {error && <div className="select-text text-sm text-danger">{error}</div>}
        {success && (
          <div className="text-sm text-success">{uiText("비밀번호 변경 완료 · 다른 기기에서 다시 로그인 필요")}</div>
        )}
        <button
          type="submit"
          disabled={busy || !currentPassword || !newPassword || !confirmPassword}
          className="rounded bg-accent py-2 text-sm font-medium text-ink-on-accent hover:bg-accent-strong disabled:opacity-40"
        >
          {busy ? t('settings.changing') : t('settings.change')}
        </button>
      </form>}

      <div className="mt-4 border-t border-edge pt-4">
        <button
          type="button"
          onClick={handleLogout}
          className="w-full rounded border border-edge-strong py-2 text-sm text-danger hover:bg-surface-raised"
        >
          {t('settings.logout')}
        </button>
      </div>
    </div>
  )
}

const FONT_SUGGESTIONS = ['Noto Serif KR', 'IBM Plex Sans KR', 'IBM Plex Mono', 'Pretendard', 'Arial', 'Georgia', 'Menlo', 'Consolas']

// ── 화면: 테마·언어·글꼴 ─────────────────────────────────────────────────────
function AppearancePanel({
  themeSettings,
  fonts,
  portalContainer,
  onFontsChange,
  onThemeSettingsChange,
}: {
  themeSettings: ThemeSettings
  fonts: FontPreferences
  portalContainer: HTMLElement | null
  onFontsChange: (fonts: FontPreferences) => void
  onThemeSettingsChange: (settings: ThemeSettings) => void
}) {
  useUiLocale()
  const { locale, setLocale, t } = useI18n()
  const fontId = useId()
  return (
    <div className="flex flex-col gap-3">
      <ThemeSettingsPanel value={themeSettings} onChange={onThemeSettingsChange} />
      <div className="mt-2 border-t border-edge pt-3">
        <div className="text-sm font-medium">
          {t('settings.language')}
        </div>
        <div className="mt-2 max-w-xs">
          <SelectField portalContainer={portalContainer} label={t('settings.language')} value={locale}
            options={LOCALES.map((value) => ({ value, label: LOCALE_NAMES[value] }))}
            onChange={(value) => setLocale(value as Locale)} />
        </div>
      </div>
      <div className="mt-2 border-t border-edge pt-3">
        <div className="text-sm font-medium">{t('settings.fonts')}</div>
        <div className="mt-2 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-2">
          {(['ui', 'markdown', 'mono'] as const).map((kind) => (
            <div key={kind} className="contents">
              <label htmlFor={`${fontId}-${kind}`} className="text-xs font-medium text-ink-secondary">{t(`settings.font.${kind}`)}</label>
              <div className="min-w-0" style={{ fontFamily: kind === 'mono' ? 'var(--font-mono)' : kind === 'markdown' ? 'var(--mew-font-markdown)' : 'var(--font-sans)' }}>
                <SelectField id={`${fontId}-${kind}`} portalContainer={portalContainer} editable label={t(`settings.font.${kind}`)} value={fonts[kind]}
                  options={FONT_SUGGESTIONS.map((font) => ({ value: font, label: font }))}
                  onChange={(value) => onFontsChange({ ...fonts, [kind]: value })} />
              </div>
              <button
                type="button"
                onClick={() => onFontsChange({ ...fonts, [kind]: DEFAULT_FONT_PREFERENCES[kind] })}
                disabled={fonts[kind] === DEFAULT_FONT_PREFERENCES[kind]}
                className="self-stretch rounded border border-edge-strong px-2 text-xs text-ink-secondary hover:bg-surface-hover disabled:opacity-40"
              >
                {t('common.reset')}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── 숨김 목록: 트리·검색에서 건너뛸 폴더·파일 이름 (전역, owner/manager 전용) ──
function IgnorePanel() {
  useUiLocale()
  const [names, setNames] = useState<string[] | null>(null)
  const [defaults, setDefaults] = useState<string[]>([])
  const [locked, setLocked] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    fetchIgnoreList()
      .then((state) => {
        if (!alive) return
        setNames(state.names)
        setDefaults(state.defaults)
        setLocked(state.locked)
      })
      .catch((err) => alive && setError(err instanceof Error ? err.message : uiText("숨김 목록을 불러오지 못했습니다")))
    return () => {
      alive = false
    }
  }, [])

  // 서버가 정규화한 결과(고정 항목 되넣기·중복 제거)를 그대로 화면에 반영한다 — 보낸 값이 아니라 저장된 값
  async function commit(next: string[]) {
    setBusy(true)
    setError(null)
    try {
      const state = await saveIgnoreList(next)
      setNames(state.names)
      setDefaults(state.defaults)
      setLocked(state.locked)
    } catch (err) {
      setError(err instanceof Error ? err.message : uiText("저장하지 못했습니다"))
    } finally {
      setBusy(false)
    }
  }

  function add(e: React.FormEvent) {
    e.preventDefault()
    const name = draft.trim()
    if (!name || !names) return
    if (names.includes(name)) {
      setError(uiText("이미 목록에 있습니다: {p0}", { p0: name }))
      return
    }
    setDraft('')
    void commit([...names, name])
  }

  if (!names) {
    return <div className={`${error ? 'select-text' : ''} text-sm text-ink-muted`}>{error ?? uiText("불러오는 중…")}</div>
  }

  const isLocked = (name: string) => locked.includes(name)
  const isDefault = names.length === defaults.length && names.every((n, i) => n === defaults[i])

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-1">
        {names.map((name) => (
          <li key={name} className="flex items-center justify-between gap-2 rounded px-2 py-1.5 hover:bg-surface-raised">
            <span className="min-w-0 flex-1 truncate font-mono text-sm text-ink">{name}</span>
            {isLocked(name) ? (
              <span
                className="rounded border border-edge-strong px-1.5 py-0.5 text-xs text-ink-muted"
                title={uiText("항상 숨김")}
              >
                {uiText("고정")}</span>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => void commit(names.filter((n) => n !== name))}
                className="rounded px-1.5 py-0.5 text-xs text-ink-muted hover:bg-surface-hover hover:text-danger disabled:opacity-40"
              >
                {uiText("지우기")}</button>
            )}
          </li>
        ))}
      </ul>

      <form onSubmit={add} className="flex items-center gap-2 border-t border-edge pt-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={uiText("숨길 폴더·파일 이름 (예: coverage)")}
          spellCheck={false}
          className="min-w-0 flex-1 rounded border border-edge-strong bg-surface px-3 py-1.5 font-mono text-sm text-ink outline-none placeholder:font-sans placeholder:text-ink-faint focus:border-edge-bright"
        />
        <button
          type="submit"
          disabled={busy || !draft.trim()}
          className="shrink-0 rounded bg-accent px-3 py-1.5 text-sm font-medium text-ink-on-accent hover:bg-accent-strong disabled:opacity-40"
        >
          {uiText("추가")}</button>
      </form>

      {error && <div className="select-text text-sm text-danger">{error}</div>}

      <div className="flex justify-end border-t border-edge pt-3">
        <button
          type="button"
          disabled={busy || isDefault}
          onClick={() => void commit(defaults)}
          className="rounded border border-edge-strong px-2.5 py-1 text-xs text-ink-secondary hover:bg-surface-hover disabled:opacity-40"
        >
          {uiText("기본값으로")}</button>
      </div>
    </div>
  )
}

// ── 단축키: 전체 목록 + 키 재지정 ───────────────────────────────────────────
function ShortcutsPanel() {
  useUiLocale()
  const { locale, t } = useI18n()
  const bindings = useShortcutBindings()
  const [recordingId, setRecordingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const categories = [...new Set(DEFAULT_SHORTCUTS.map((s) => s.category))]

  function startRecording(id: string) {
    setError(null)
    setRecordingId(id)
  }

  function handleRecordKeyDown(id: string, e: React.KeyboardEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return
    if (e.key === 'Escape') {
      setRecordingId(null)
      return
    }
    const combo = formatKeyCombo(e)
    const result = setBinding(id, combo)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setError(null)
    setRecordingId(null)
  }

  return (
    <div>
      {error && <div className="select-text mb-3 text-sm text-danger">{error}</div>}
      {categories.map((category) => (
        <div key={category} className="mb-4 last:mb-0">
          <div className="mb-1.5 text-xs font-semibold text-ink-muted">{localizeShortcut(locale, category, category)}</div>
          <ul className="flex flex-col gap-1">
            {DEFAULT_SHORTCUTS.filter((s) => s.category === category).map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 rounded px-2 py-1.5 hover:bg-surface-raised">
                <span className="text-sm text-ink">{localizeShortcut(locale, s.id, s.label)}</span>
                <div className="flex items-center gap-1.5">
                  {recordingId === s.id ? (
                    <div
                      tabIndex={0}
                      ref={(el) => el?.focus()}
                      onKeyDown={(e) => handleRecordKeyDown(s.id, e)}
                      onBlur={() => setRecordingId(null)}
                      className="rounded border border-accent px-2 py-0.5 font-mono text-xs text-accent outline-none"
                    >
                      {t('settings.pressKey')}
                    </div>
                  ) : (
                    <kbd className="rounded border border-edge-strong bg-surface px-1.5 py-0.5 font-mono text-xs text-ink-secondary">
                      {bindings[s.id]}
                    </kbd>
                  )}
                  {s.editable && recordingId !== s.id && (
                    <button
                      type="button"
                      onClick={() => startRecording(s.id)}
                      className="rounded px-1.5 py-0.5 text-xs text-ink-muted hover:bg-surface-hover hover:text-ink"
                    >
                      {t('settings.reassign')}
                    </button>
                  )}
                  {s.editable && bindings[s.id] !== s.keys && recordingId !== s.id && (
                    <button
                      type="button"
                      onClick={() => resetBinding(s.id)}
                      className="rounded px-1.5 py-0.5 text-xs text-ink-muted hover:bg-surface-hover hover:text-ink"
                      title={uiText("기본값으로 되돌리기")}
                    >
                      {t('common.reset')}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <div className="mt-4 flex justify-end border-t border-edge pt-3">
        <button
          type="button"
          onClick={resetAllBindings}
          className="rounded border border-edge-strong px-2.5 py-1 text-xs text-ink-secondary hover:bg-surface-hover"
        >
          {t('settings.resetAll')}
        </button>
      </div>
    </div>
  )
}
