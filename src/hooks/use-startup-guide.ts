import { useEffect, useState, useSyncExternalStore } from 'react'
import { scopedBrowserStorage } from '@mew/ui/browser-storage-scope'
import { writeBrowserStorage } from '@mew/ui/browser-storage'
import { getAppInstallState, hasManualAppInstall, startAppInstallTracking, subscribeAppInstall } from '../utils/app-install'

export type StartupGuide = 'install' | 'fullscreen'
const preferenceKey = (guide: StartupGuide) => `mew:startup-guide:${guide}:hidden`
function hidden(guide: StartupGuide) { try { return scopedBrowserStorage().getItem(preferenceKey(guide)) === '1' } catch { return false } }

export function useStartupGuide() {
  const install = useSyncExternalStore(subscribeAppInstall, getAppInstallState)
  const [dismissed, setDismissed] = useState({ install: false, fullscreen: false })
  const [initialHidden] = useState(() => ({ install: hidden('install'), fullscreen: hidden('fullscreen') }))
  const [preferences, setPreferences] = useState(initialHidden)
  const [accepted, setAccepted] = useState(false)
  const [fullscreen, setFullscreen] = useState(!!document.fullscreenElement)
  useEffect(() => {
    startAppInstallTracking()
    const entered = () => {
      setFullscreen(!!document.fullscreenElement)
      if (document.fullscreenElement) setDismissed(current => ({ ...current, fullscreen: true }))
    }
    document.addEventListener('fullscreenchange', entered)
    return () => document.removeEventListener('fullscreenchange', entered)
  }, [])
  const installEligible = install.secure && (install.available || hasManualAppInstall())
  const fullscreenEligible = document.fullscreenEnabled !== false && typeof document.documentElement.requestFullscreen === 'function'
  const guide: StartupGuide | null = install.installed || accepted || fullscreen ? null
    : !dismissed.install && !initialHidden.install && installEligible ? 'install'
    : !dismissed.fullscreen && !initialHidden.fullscreen && fullscreenEligible ? 'fullscreen' : null
  return {
    guide, install,
    // Keep the visible guide open so its checkbox can be unchecked before dismissing it.
    preferences,
    setHidden(guide: StartupGuide, value: boolean) {
      writeBrowserStorage(preferenceKey(guide), value ? '1' : '0')
      setPreferences(current => ({ ...current, [guide]: value }))
    },
    dismiss(guide: StartupGuide) { setDismissed(current => ({ ...current, [guide]: true })) },
    installed() { setAccepted(true) },
  }
}
