import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react'
import { DialogFrame, useToast } from '@mew/ui'
import { uiText } from '@mew/ui/i18n-core'
import type { AuthStatus } from '../api/auth'
import { defaultCapabilities } from '../../shared/access-policy'
import { useAccountTheme } from '../hooks/use-account-theme'
import { useRootProjectTabs } from '../hooks/use-root-project-tabs'
import { useRefreshTasks } from '../hooks/use-refresh-tasks'
import { useMewcatNotifications } from '../hooks/use-mewcat-notifications'
import { useChatNotifications } from '../hooks/use-chat-notifications'
import { applyFontPreferences, loadFontPreferences, saveFontPreferences } from '../utils/fontPreferences'
import { loadMewcatSkin, saveMewcatSkin, loadMewcatHideDesktop } from '../utils/mewcatSkin'
import { deferredComponent } from '../components/deferred-component'
import { PanelCloseButton } from '../components/panel-close-button'

const Mewcat = deferredComponent(async () => ({ default: (await import('../components/Mewcat')).Mewcat }), null)
const BrowserDesktopPanel = deferredComponent(async () => ({ default: (await import('../components/BrowserDesktopPanel')).BrowserDesktopPanel }))
type MewcatProps = ComponentProps<typeof Mewcat>
type MascotEntry = { owner: object; props: MewcatProps }
const MascotContext = createContext<((entry: MascotEntry | null, owner: object) => void) | null>(null)
export const BrowserContext = createContext<((url?: string) => void) | null>(null)

function useAccountServices(auth: AuthStatus) {
  const { showToast, toast } = useToast()
  const { track } = useRefreshTasks()
  const capabilities = useMemo(() => auth.capabilities ?? defaultCapabilities(auth.role), [auth.capabilities, auth.role])
  const [themeSettings, setThemeSettings] = useAccountTheme(auth.role === 'guest' ? null : auth.email, error => showToast(error instanceof Error ? error.message : String(error)))
  const [fontPreferences, setFontPreferences] = useState(loadFontPreferences)
  const [mewcatSkin, setMewcatSkin] = useState(loadMewcatSkin)
  const [mewcatHideDesktop, setMewcatHideDesktop] = useState(loadMewcatHideDesktop)
  const projects = useRootProjectTabs(auth.role !== 'guest', track)
  useMewcatNotifications(capabilities.system, auth.email)
  useChatNotifications(capabilities.chat, auth.email)
  useEffect(() => { applyFontPreferences(fontPreferences); saveFontPreferences(fontPreferences) }, [fontPreferences])
  useEffect(() => { saveMewcatSkin(mewcatSkin) }, [mewcatSkin])
  const value = useMemo(() => ({ role: auth.role, capabilities, themeSettings, setThemeSettings, fontPreferences, setFontPreferences, mewcatSkin, setMewcatSkin,
    mewcatHideDesktop, setMewcatHideDesktop, projects }),
  [auth.role, capabilities, themeSettings, setThemeSettings, fontPreferences, mewcatSkin, mewcatHideDesktop, projects])
  return { value, toast }
}

type AccountServices = ReturnType<typeof useAccountServices>['value']
const AccountContext = createContext<AccountServices | null>(null)

/** Account services live above every project and remain mounted when focus or layout changes. */
export function WorkspaceAccountProvider({ auth, children }: { auth: AuthStatus; children: ReactNode }) {
  const { value: services, toast } = useAccountServices(auth)
  const [mascot, setMascot] = useState<MascotEntry | null>(null)
  const [browser, setBrowser] = useState<{ url: string; request: number } | null>(null)
  const title = useId()
  const capabilities = auth.capabilities ?? defaultCapabilities(auth.role)
  const registerMascot = useCallback((entry: MascotEntry | null, owner: object) => {
    setMascot(previous => entry ?? (previous?.owner === owner ? null : previous))
  }, [])
  const openBrowser = useCallback((url = 'about:blank') => setBrowser(previous => ({ url, request: (previous?.request ?? 0) + 1 })), [])
  return <AccountContext.Provider value={services}><MascotContext.Provider value={registerMascot}><BrowserContext.Provider value={openBrowser}>
    {children}{toast}
    {mascot && <Mewcat {...mascot.props} />}
    {browser && <DialogFrame labelledBy={title} onClose={() => setBrowser(null)} className="flex h-[90dvh] max-w-6xl flex-col">
      <header className="flex h-9 shrink-0 items-center border-b border-edge px-2"><span id={title} className="flex-1 text-sm">{uiText('브라우저')}</span><PanelCloseButton onClick={() => setBrowser(null)} aria-label={uiText('닫기')} /></header>
      <div className="min-h-0 flex-1"><BrowserDesktopPanel url={browser.url} navigationRequest={browser.request} nativeAllowed={capabilities.nativeBrowser} onClose={() => setBrowser(null)} /></div>
    </DialogFrame>}
  </BrowserContext.Provider></MascotContext.Provider></AccountContext.Provider>
}

/** The live mascot stays mounted above the views while its active project callbacks change. */
export function WorkspaceMewcat(props: MewcatProps) {
  const register = useContext(MascotContext)
  const owner = useRef({})
  useEffect(() => {
    register?.({ owner: owner.current, props }, owner.current)
    const identity = owner.current
    return () => register?.(null, identity)
  }, [register, props])
  return null
}

export function useWorkspaceBrowser() { return useContext(BrowserContext) }

export function useWorkspaceAccount() {
  const services = useContext(AccountContext)
  if (!services) throw new Error('Workspace account services are unavailable')
  return services
}
