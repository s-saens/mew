import { scopedBrowserStorage } from '@mew/ui/browser-storage-scope'

const legacyKey = (account: string, workspace: string) => `mew:device-layout:${encodeURIComponent(account)}:${encodeURIComponent(workspace)}`
const desktopKey = (account: string) => `mew:device-layout:${encodeURIComponent(account)}:desktop`
const fields = ['dock', 'chrome'] as const
function geometry(state: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(fields.filter(field => state[field] === null || state[field] && typeof state[field] === 'object' && !Array.isArray(state[field])).map(field => [field, state[field]]))
}
function read(key: string): Record<string, unknown> | null {
  try {
    const saved = JSON.parse(scopedBrowserStorage().getItem(key) ?? 'null')
    return saved && typeof saved === 'object' && !Array.isArray(saved) ? geometry(saved) : null
  } catch { return null }
}
export function restoreDeviceLayout(account: string, workspace: string, fallback: Record<string, unknown>, desktop = true): Record<string, unknown> {
  const saved = desktop ? read(desktopKey(account)) ?? read(legacyKey(account, workspace)) : read(legacyKey(account, workspace))
  return saved ? { ...fallback, ...saved } : fallback
}
export function saveDeviceLayout(account: string, workspace: string, state: Record<string, unknown>, desktop = true): void {
  try { scopedBrowserStorage().setItem(desktop ? desktopKey(account) : legacyKey(account, workspace), JSON.stringify(geometry(state))) } catch { /* restricted storage */ }
}

/** Keep accepted desktop geometry current even when project snapshots were prefetched or storage is blocked. */
export function createDeviceLayoutSession(account: string) {
  let desktopState: Record<string, unknown> | null = null
  return {
    pending(state: Record<string, unknown>, desktop: boolean): Record<string, unknown> {
      return desktop ? { ...state, ...desktopState } : state
    },
    restore(workspace: string, state: Record<string, unknown>, desktop: boolean): Record<string, unknown> {
      if (!desktop) return restoreDeviceLayout(account, workspace, state, false)
      desktopState ??= { dock: null, chrome: null, ...geometry(restoreDeviceLayout(account, workspace, state)) }
      saveDeviceLayout(account, workspace, desktopState)
      return { ...state, ...desktopState }
    },
    save(workspace: string, state: Record<string, unknown>, desktop: boolean): void {
      if (desktop) desktopState = { dock: null, chrome: null, ...geometry(state) }
      saveDeviceLayout(account, workspace, state, desktop)
    },
  }
}
