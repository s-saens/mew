import { applyWorkspaceZoom, loadWorkspaceZoom } from './utils/workspace-zoom'
import { initializeRemoteApp } from './utils/remote-app'
import { startBrowserStorageMaintenance } from '@mew/ui/browser-storage'
import { startInputFocusTracking } from '@mew/ui/input-focus'
import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { applyFontPreferences, loadFontPreferences } from './utils/fontPreferences.ts'
import { applyThemePalette, loadThemeSettings } from './utils/theme-color.ts'
import { startNetworkTracking } from './utils/network-tracking.ts'
import { startScrollbarGradientTracking } from './utils/scrollbar-gradient.ts'
import { startScrollbarTouchDragging } from './utils/scrollbar-touch.ts'
import { startWorkspacePinchZoom } from './utils/workspace-pinch-zoom.ts'
import { StartupScreen } from './components/startup-screen.tsx'
import { getAppRuntime } from './runtime/app-runtime.ts'
import { startAppInstallTracking } from './utils/app-install.ts'
import { parsePublicSharePath } from './utils/public-share-route.ts'
import { appRoute } from '../shared/app-route.ts'
import { AppErrorBoundary, WorkspaceErrorScreen } from './components/app-error-boundary.tsx'
import { fetchAuthStatus, GUEST_AUTH } from './api/auth.ts'

applyWorkspaceZoom(loadWorkspaceZoom())
startAppInstallTracking()

const stopInputFocusTracking = startInputFocusTracking()
if (import.meta.hot) import.meta.hot.dispose(stopInputFocusTracking)

const stopWorkspacePinchZoom = startWorkspacePinchZoom()
if (import.meta.hot) import.meta.hot.dispose(stopWorkspacePinchZoom)

const stopScrollbarGradientTracking = startScrollbarGradientTracking()
if (import.meta.hot) import.meta.hot.dispose(stopScrollbarGradientTracking)

const stopScrollbarTouchDragging = startScrollbarTouchDragging()
if (import.meta.hot) import.meta.hot.dispose(stopScrollbarTouchDragging)

const stopNetworkTracking = startNetworkTracking()
if (import.meta.hot) import.meta.hot.dispose(stopNetworkTracking)

async function startApp() {
  if (new URLSearchParams(location.search).get('viewport-debug') === '1') {
    const { installViewportDiagnostics } = await import('./utils/viewport-diagnostics.ts')
    const stop = installViewportDiagnostics()
    if (import.meta.hot) import.meta.hot.dispose(stop)
  }

  // 저장한 글꼴을 첫 React 렌더 전에 적용해 기본 글꼴이 잠깐 보이는 것을 막는다.
  applyFontPreferences(loadFontPreferences())
  applyThemePalette(loadThemeSettings().palette)

  const root = createRoot(document.getElementById('root')!)
  root.render(<StartupScreen />)

  try {
    const nativeAuth = location.protocol === 'mew-app:'
      ? await import('./runtime/native-runtime.ts').then(module => module.initializeNativeApp())
      : undefined
    if (nativeAuth) {
      applyFontPreferences(loadFontPreferences())
      applyThemePalette(loadThemeSettings().palette)
    }
    const remoteApp = document.querySelector('meta[name="mew-p2p-app"]')
    const initialRoute = remoteApp ? 'workspace' : appRoute(location.pathname, getAppRuntime().basePath)
    const bootstrapModule = initialRoute === 'workspace' ? import('./AppBootstrap.tsx') : null
    const localAuth = !remoteApp && initialRoute === 'workspace' && !nativeAuth && !getAppRuntime().initialAuth
      ? fetchAuthStatus().catch(error => { console.error(error); return GUEST_AUTH })
      : undefined
    const [bootstrap, initialAuth, { I18nProvider }] = await Promise.all([
      bootstrapModule,
      remoteApp ? initializeRemoteApp() : nativeAuth ?? getAppRuntime().initialAuth ?? localAuth,
      import('./i18n.tsx'),
    ])
    const sharePath = remoteApp ? new URLSearchParams(location.search).get('sharePath') : location.pathname
    const share = sharePath ? parsePublicSharePath(sharePath) : null
    let page: ReactNode
    if (initialRoute === 'not-found' || remoteApp && sharePath && !share) {
      const { NotFoundPage } = await import('./components/not-found-page.tsx')
      page = <NotFoundPage homeHref={remoteApp ? location.pathname : getAppRuntime().basePath ?? '/'} />
    } else if (share) {
      const { PublicSharePage } = await import('./components/public-share-page.tsx')
      page = <PublicSharePage share={share} />
    } else {
      const { default: AppBootstrap } = bootstrap ?? await import('./AppBootstrap.tsx')
      page = <AppBootstrap initialAuth={initialAuth} />
    }

    // Migrate old disposable caches before any workspace effect persists state.
    const stopStorageMaintenance = startBrowserStorageMaintenance()
    if (import.meta.hot) import.meta.hot.dispose(stopStorageMaintenance)

    root.render(
      <StrictMode>
        <AppErrorBoundary>
          <I18nProvider>
            {page}
          </I18nProvider>
        </AppErrorBoundary>
      </StrictMode>,
    )
  } catch (error) {
    console.error(error)
    root.render(<WorkspaceErrorScreen />)
  }
}

void startApp()
