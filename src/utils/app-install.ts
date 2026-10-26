export type AppInstallOutcome = 'accepted' | 'dismissed' | 'unavailable' | 'error'
export type AppInstallState = { available: boolean; installed: boolean; platform: 'ios' | 'browser'; secure: boolean }
type InstallPrompt = Event & { prompt(): Promise<unknown>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

let displayQueries: MediaQueryList[] = []
const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
let installedLaunch = false
let installationCompleted = false
const isInstalled = () => installedLaunch || installationCompleted
let state: AppInstallState = { available: false, installed: false, platform: 'browser', secure: false }
let initialized = false
let deferred: InstallPrompt | undefined
let started = false
const listeners = new Set<() => void>()
let hostedPort: MessagePort | undefined
let pending: { resolve: (outcome: AppInstallOutcome) => void; timer: ReturnType<typeof setTimeout> } | undefined

function publish(next: AppInstallState) {
  if (Object.keys(next).every(key => next[key as keyof AppInstallState] === state[key as keyof AppInstallState])) return
  state = next
  for (const listener of listeners) listener()
}
function initializeState() {
  if (initialized) return
  initialized = true
  displayQueries = ['standalone', 'fullscreen', 'minimal-ui'].map(mode => window.matchMedia(`(display-mode: ${mode})`))
  installedLaunch = (navigator as Navigator & { standalone?: boolean }).standalone === true || displayQueries[0].matches || displayQueries[2].matches || displayQueries[1].matches && !document.fullscreenElement
  state = { available: false, installed: isInstalled(), platform: isIos() ? 'ios' : 'browser', secure: window.isSecureContext }
}
export const getAppInstallState = () => { if (!hostedPort) initializeState(); return state }
export const subscribeAppInstall = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
export const hasManualAppInstall = () => isIos() || /Android|Mobile|Chrome\/|Chromium\/|Edg\/|Safari\//i.test(navigator.userAgent)

/** Capture before React and remote authentication finish loading. No offline cache is registered. */
export function startAppInstallTracking() {
  if (started) return
  initializeState()
  started = true
  window.addEventListener('beforeinstallprompt', event => {
    if (window.parent !== window || typeof (event as InstallPrompt).prompt !== 'function') return
    event.preventDefault()
    deferred = event as InstallPrompt
    publish({ ...state, available: true })
  })
  window.addEventListener('appinstalled', () => {
    installationCompleted = true
    deferred = undefined
    publish({ ...state, installed: true, available: false })
  })
  for (const query of displayQueries) query.addEventListener('change', () => {
    if (!hostedPort) publish({ ...state, installed: isInstalled() })
  })
}

export async function promptAppInstall(): Promise<AppInstallOutcome> {
  if (pending) return 'unavailable'
  if (hostedPort) {
    const port = hostedPort
    return new Promise(resolve => {
      pending = { resolve, timer: setTimeout(() => finish('error'), 60_000) }
      port.postMessage({ type: 'mew-app-install-request' })
    })
  }
  const event = deferred
  if (!event) return 'unavailable'
  deferred = undefined
  publish({ ...state, available: false })
  try {
    await event.prompt()
    return (await event.userChoice).outcome
  } catch { return 'error' }
}

function finish(outcome: AppInstallOutcome) {
  if (!pending) return
  clearTimeout(pending.timer)
  pending.resolve(outcome)
  pending = undefined
}

/** Only the frame-bound port established by initializeRemoteApp may supply parent install state. */
export function installHostedAppInstall(port: MessagePort) {
  hostedPort = port
  port.postMessage({ type: 'mew-app-install-state-request' })
  return {
    update(data: Record<string, unknown>) {
      if (data.type === 'mew-app-install-state' && typeof data.available === 'boolean' && typeof data.installed === 'boolean' && typeof data.secure === 'boolean' && (data.platform === 'ios' || data.platform === 'browser')) {
        publish({ available: data.available, installed: data.installed, secure: data.secure, platform: data.platform })
      } else if (data.type === 'mew-app-install-result' && ['accepted', 'dismissed', 'unavailable', 'error'].includes(String(data.outcome))) finish(data.outcome as AppInstallOutcome)
    },
    dispose() { if (hostedPort === port) hostedPort = undefined; finish('error') },
  }
}
