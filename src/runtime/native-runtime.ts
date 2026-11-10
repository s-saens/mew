import { setBrowserStorageScope } from '@mew/ui/browser-storage-scope'
import type { AuthStatus } from '../api/auth.ts'
import { configureAppRuntime } from './app-runtime.ts'
import { getNativeBridge, nativeDeadline, type MewNativeBridge } from './native-bridge.ts'
import { NativeDirectTransport } from './native-direct-transport.ts'
import { nativeResourceUrl } from './native-direct-path.ts'

export function isNativeDirectHost(bridge: MewNativeBridge | undefined, url: string): boolean {
  if (!bridge?.direct || bridge.connection.kind !== 'direct') return false
  try {
    const page = new URL(url), endpoint = new URL(bridge.connection.endpoint)
    return page.protocol === 'mew-app:' && page.host === 'workspace' && ['http:', 'https:'].includes(endpoint.protocol)
      && !endpoint.username && !endpoint.password && !endpoint.search && !endpoint.hash && endpoint.pathname === '/'
      && bridge.connection.scope === `direct:${bridge.connection.endpoint}`
  } catch { return false }
}

/** Install the native boundary before account reads or application modules start. */
export async function initializeNativeApp(): Promise<AuthStatus | undefined> {
  const bridge = getNativeBridge()
  if (location.protocol !== 'mew-app:') return undefined
  if (!isNativeDirectHost(bridge, location.href) || !bridge?.direct || window.top !== window) throw new Error('Invalid native application host')
  const transport = new NativeDirectTransport(bridge.direct)
  configureAppRuntime({ kind: 'live', transport, resourceUrl: nativeResourceUrl, publicBaseUrl: bridge.connection.endpoint })
  try {
    const response = await transport.fetch('/api/auth/me')
    if (!response.ok) throw new Error('Could not verify the connected Mew account')
    const status: AuthStatus = await response.json()
    if (typeof status?.authenticated !== 'boolean' || !(status.email === null || typeof status.email === 'string') || !['owner', 'manager', 'member', 'guest'].includes(status.role) || typeof status.mustChangePassword !== 'boolean') throw new Error('Invalid connected Mew account')
    const identityFor = (value: AuthStatus) => value.authenticated ? (typeof value.accountId === 'string' && value.accountId ? value.accountId : value.email) : null
    const identity = identityFor(status)
    setBrowserStorageScope(identity ?? 'anonymous', bridge.connection.scope)
    let reloading = false
    const reload = () => {
      if (reloading) return
      reloading = true
      void nativeDeadline(bridge.direct!.reload(), 5000).catch(() => location.reload())
    }
    configureAppRuntime({
      kind: 'live', transport, initialAuth: status, basePath: '/', resourceUrl: nativeResourceUrl, publicBaseUrl: bridge.connection.endpoint,
      onAuthChanged(next) {
        if (identityFor(next) === identity) return false
        reload()
        return true
      },
      onLoggedOut: reload,
    })
    window.addEventListener('pagehide', () => transport.close(), { once: true })
    return status
  } catch (error) { transport.close(); throw error }
}
