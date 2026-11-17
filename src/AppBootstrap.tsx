import { useCallback, useEffect, useState } from 'react'
import { scopedBrowserStorage } from '@mew/ui/browser-storage-scope'
import { useUiLocale } from '@mew/ui/i18n'
import { fetchAuthStatus, GUEST_AUTH, type AuthStatus } from './api/auth'
import { LoginPage } from './components/LoginPage'
import { useRefreshTasks } from './hooks/use-refresh-tasks'
import { clearFileContentCache, setContentIdentity } from './utils/contentCache'
import { isRemoteMode } from './utils/remote-transport'
import { reloadRemoteAppForIdentity } from './utils/remote-app'
import { StartupScreen } from './components/startup-screen'
import { getAppRuntime } from './runtime/app-runtime'
import { WorkspaceErrorScreen } from './components/app-error-boundary'
import { FirstOwnerSetup } from './components/FirstOwnerSetup'
import { deferredDialog } from './components/deferred-dialog'

type WorkspaceComponent = typeof import('./App.tsx')['default']
const startupScreen = <StartupScreen />
const FirstRunAgentSetup = deferredDialog(async () => ({ default: (await import('./components/AgentSetupModal')).AgentSetupModal }), { title: () => 'Agent Set', className: 'flex max-h-[90dvh] max-w-2xl flex-col' })
const FirstRunRemoteAccess = deferredDialog(async () => ({ default: (await import('./components/remote-access-settings')).RemoteAccessModal }), { title: () => 'Mewlink', className: 'flex max-h-[90dvh] max-w-2xl flex-col' })
/** Consume launcher credentials before any workspace or account UI can use the URL. */
function consumeFirstOwnerSetupToken(): string | null {
  const fragment = new URLSearchParams(window.location.hash.slice(1))
  const token = fragment.get('setup')
  if (token === null) return null
  fragment.delete('setup')
  const remaining = fragment.toString()
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}${remaining ? `#${remaining}` : ''}`)
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null
}

let capturedSetupToken = consumeFirstOwnerSetupToken()

/** Remote login does not need the editor, terminal, or workspace modules. */
export default function AppBootstrap({ initialAuth }: { initialAuth?: AuthStatus }) {
  useUiLocale()
  const { pending: refreshing, track: trackRefresh } = useRefreshTasks()
  const [auth, setAuth] = useState<AuthStatus | null>(null)
  const [loginOpen, setLoginOpen] = useState(false)
  const [setupToken, setSetupToken] = useState(capturedSetupToken)
  const [setupLoginRequired, setSetupLoginRequired] = useState(false)
  const [agentWelcomeOpen, setAgentWelcomeOpen] = useState(false)
  const [remoteWelcomeOpen, setRemoteWelcomeOpen] = useState(false)
  const [Workspace, setWorkspace] = useState<WorkspaceComponent | null>(null)
  const [workspaceFailure, setWorkspaceFailure] = useState<string | null>(null)
  const workspaceAllowed = !!auth && !auth.setupRequired && !setupLoginRequired && (!isRemoteMode() || auth.authenticated && !auth.mustChangePassword)
  const workspaceIdentity = auth ? JSON.stringify([auth.email, auth.role, auth.accessRevision, auth.capabilities]) : ''

  // Prepare identity and permission-scoped caches before workspace effects restore tabs.
  const applyAuth = useCallback((status: AuthStatus) => {
    if (!status.setupRequired) { capturedSetupToken = null; setSetupToken(null) }
    if (getAppRuntime().onAuthChanged?.(status) || reloadRemoteAppForIdentity(status.authenticated ? status.email : null)) { clearFileContentCache(); setAuth(null); return }
    setContentIdentity(status.email)
    const permissionVersion = JSON.stringify([status.email, status.role, status.accessRevision, status.capabilities])
    try {
      if (scopedBrowserStorage().getItem('mew:access-version') !== permissionVersion) clearFileContentCache()
      scopedBrowserStorage().setItem('mew:access-version', permissionVersion)
    } catch { clearFileContentCache() }
    setAuth(status)
  }, [])

  useEffect(() => {
    if (initialAuth) { applyAuth(initialAuth); return }
    void trackRefresh(fetchAuthStatus()
      .then(applyAuth)
      .catch((err) => {
        console.error(err)
        applyAuth(GUEST_AUTH)
      }))
  }, [applyAuth, initialAuth, trackRefresh])

  useEffect(() => {
    const onExpired = () => applyAuth(GUEST_AUTH)
    window.addEventListener('mew:auth-expired', onExpired)
    return () => window.removeEventListener('mew:auth-expired', onExpired)
  }, [applyAuth])

  useEffect(() => {
    const refresh = () => { clearFileContentCache(); void trackRefresh(fetchAuthStatus().then(applyAuth).catch(() => {})) }
    window.addEventListener('mew:permissions-changed', refresh)
    return () => window.removeEventListener('mew:permissions-changed', refresh)
  }, [applyAuth, trackRefresh])

  // A normal state update avoids delaying the entire workspace on a lazy retry lane.
  useEffect(() => {
    if (!workspaceAllowed || Workspace) return
    let active = true
    void import('./App.tsx').then(module => {
      if (active) setWorkspace(() => module.default)
    }, () => { if (active) setWorkspaceFailure(workspaceIdentity) })
    return () => { active = false }
  }, [workspaceAllowed, workspaceIdentity, Workspace])

  if (!auth) return startupScreen
  if (auth.setupRequired) return <FirstOwnerSetup token={setupToken} onSuccess={status => { setAgentWelcomeOpen(status.authenticated && status.role === 'owner'); applyAuth(status) }} onInitialized={status => { applyAuth(status); setSetupLoginRequired(!status.authenticated) }} />
  if ((isRemoteMode() || setupLoginRequired) && (!auth.authenticated || auth.mustChangePassword)) {
    return <LoginPage dismissible={false} initialMustChangePassword={auth.mustChangePassword} onClose={() => {}} onSuccess={status => { setSetupLoginRequired(false); applyAuth(status) }} />
  }

  if (!Workspace) return workspaceFailure === workspaceIdentity
    ? <WorkspaceErrorScreen />
    : startupScreen

  return <>
    <Workspace
      auth={auth}
      refreshing={refreshing}
      onLoggedOut={() => {
        setAgentWelcomeOpen(false)
        setRemoteWelcomeOpen(false)
        const onLoggedOut = getAppRuntime().onLoggedOut
        if (onLoggedOut) onLoggedOut()
        else applyAuth(GUEST_AUTH)
      }}
      onRequestLogin={() => setLoginOpen(true)}
      onProfileChanged={(profile) => setAuth((current) => current ? { ...current, ...profile } : current)}
    />
    {agentWelcomeOpen && auth.authenticated && auth.role === 'owner' && <FirstRunAgentSetup onClose={() => { setAgentWelcomeOpen(false); setRemoteWelcomeOpen(true) }} />}
    {remoteWelcomeOpen && auth.authenticated && auth.role === 'owner' && <FirstRunRemoteAccess onClose={() => setRemoteWelcomeOpen(false)} />}
    {loginOpen && <LoginPage onClose={() => setLoginOpen(false)} onSuccess={(status) => { applyAuth(status); setLoginOpen(false) }} />}
  </>
}
