import type { BrowserNotificationPermission } from '../../shared/browser-notifications.ts'
import { getNativeBridge, nativeDeadline, type MewNativeBridge } from '../runtime/native-bridge.ts'

type PermissionState = { permission: BrowserNotificationPermission; refreshing?: Promise<void>; loaded: boolean; revision: number }
const states = new WeakMap<MewNativeBridge, PermissionState>()
const valid = (value: string): value is 'default' | 'granted' | 'denied' => ['default', 'granted', 'denied'].includes(value)

function refresh(bridge: MewNativeBridge, state: PermissionState, changed: () => void) {
  if (state.refreshing) return
  const revision = state.revision
  state.refreshing = nativeDeadline(bridge.notifications.permission()).then(permission => {
    if (revision === state.revision && valid(permission)) { state.permission = permission; state.loaded = true; changed() }
  }).catch(() => {}).finally(() => { state.refreshing = undefined })
}

export function nativeNotificationPermission(changed: () => void): BrowserNotificationPermission | undefined {
  const bridge = getNativeBridge()
  if (!bridge) return undefined
  const known = states.get(bridge)
  if (known) { if (!known.loaded) refresh(bridge, known, changed); return known.permission }
  const state: PermissionState = { permission: 'default', loaded: false, revision: 0 }
  states.set(bridge, state)
  globalThis.addEventListener('mew:native-foreground', () => refresh(bridge, state, changed))
  refresh(bridge, state, changed)
  return state.permission
}

export async function requestNativeNotificationPermission(changed: () => void) {
  const bridge = getNativeBridge()
  if (!bridge) return undefined
  nativeNotificationPermission(changed)
  const state = states.get(bridge)!
  state.revision++
  const permission = await nativeDeadline(bridge.notifications.request(), 60_000)
  if (!valid(permission)) throw new Error('Invalid native notification permission')
  state.permission = permission; state.loaded = true
  changed()
  return permission
}

export function createNativeNotificationDelivery(onClick: (id: string) => void) {
  const bridge = getNativeBridge()
  if (!bridge) return undefined
  const owner = Array.from(crypto.getRandomValues(new Uint32Array(4)), value => value.toString(16)).join('-')
  const owned = new Map<string, { nativeId: string }>()
  let sequence = 0
  let disposed = false
  const close = (id: string) => {
    const record = owned.get(id)
    owned.delete(id)
    if (record) void nativeDeadline(bridge.notifications.close({ id: record.nativeId })).catch(() => {})
  }
  const clicked = (event: Event) => {
    const id: unknown = (event as CustomEvent<{ id?: unknown }>).detail?.id
    if (!disposed && typeof id === 'string') {
      for (const [logicalId, record] of owned) if (record.nativeId === id) { onClick(logicalId); close(logicalId); break }
    }
  }
  globalThis.addEventListener('mew:native-notification-click', clicked)
  return {
    async show(title: string, id: string) {
      if (disposed || !id || id.length > 512 || new TextEncoder().encode(title).byteLength > 500) return false
      if (owned.has(id)) close(id)
      while (owned.size >= 30) close(owned.keys().next().value!)
      const record = { nativeId: `mew:${owner}:${++sequence}` }
      owned.set(id, record)
      try {
        const shown = await nativeDeadline(bridge.notifications.show({ title, id: record.nativeId }))
        if (disposed || owned.get(id) !== record) { void nativeDeadline(bridge.notifications.close({ id: record.nativeId })).catch(() => {}); return false }
        if (!shown) owned.delete(id)
        return shown === true
      } catch { if (owned.get(id) === record) owned.delete(id); return false }
    },
    close,
    dispose() {
      disposed = true
      globalThis.removeEventListener('mew:native-notification-click', clicked)
      for (const id of [...owned.keys()]) close(id)
    },
  }
}
