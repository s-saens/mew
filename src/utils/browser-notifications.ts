import {
  browserNotificationPermission,
  createBrowserNotificationDelivery,
  requestBrowserNotificationPermission,
  type BrowserNotificationPermission,
} from '../../shared/browser-notifications.ts'

type Pending = { finish(data?: Record<string, unknown>): void }
type HostedNotifications = {
  port: MessagePort
  permission: BrowserNotificationPermission
  pending: Map<string, Pending>
  clicks: Map<string, () => void>
  disposed: boolean
  requestPrefix: string
}
let hosted: HostedNotifications | undefined
let disposeHosted: (() => void) | undefined
let sequence = 0
const listeners = new Set<() => void>()
const permissions = new Set(['granted', 'denied', 'default', 'unsupported', 'install-required'])
const emit = () => listeners.forEach(listener => listener())

export function getBrowserNotificationPermission(): BrowserNotificationPermission {
  if (hosted) return hosted.permission
  // Hosted permission requests must be handled by the trusted top-level connection page.
  if (window.parent !== window) return 'unsupported'
  return browserNotificationPermission()
}

export function onBrowserNotificationPermissionChange(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function request(context: HostedNotifications, type: string, fields: Record<string, unknown> = {}, timeout = 5000) {
  return new Promise<Record<string, unknown> | undefined>(resolve => {
    if (context.disposed || hosted !== context) { resolve(undefined); return }
    const requestId = `${context.requestPrefix}:${++sequence}`
    const finish = (data?: Record<string, unknown>) => {
      clearTimeout(timer)
      context.pending.delete(requestId)
      resolve(data)
    }
    const timer = setTimeout(() => finish(), timeout)
    context.pending.set(requestId, { finish })
    try { context.port.postMessage({ type, requestId, ...fields }) } catch { finish() }
  })
}

/** Send the permission request immediately, preserving the button's user activation. */
export async function requestBrowserNotificationPermissionForApp(): Promise<BrowserNotificationPermission> {
  if (!hosted) return getBrowserNotificationPermission() === 'unsupported' ? 'unsupported' : requestBrowserNotificationPermission()
  const context = hosted
  const response = await request(context, 'mew-notification-permission-request', {}, 60_000)
  if (!response || !permissions.has(String(response.permission))) throw new Error('Notification permission request timed out')
  return response.permission as BrowserNotificationPermission
}

export function createNotificationDelivery(onClick: (id: string) => void) {
  const context = hosted
  if (!context) return createBrowserNotificationDelivery(onClick)
  let disposed = false
  const owned = new Set<string>()
  const close = (id: string) => {
    owned.delete(id)
    context.clicks.delete(id)
    if (!context.disposed) {
      try { context.port.postMessage({ type: 'mew-notification-close', id }) } catch { /* Disconnected parent. */ }
    }
  }
  return {
    async show(title: string, id: string) {
      if (disposed || context.disposed || hosted !== context) return false
      if (owned.size >= 30) close(owned.values().next().value!)
      owned.add(id)
      context.clicks.set(id, () => { if (!disposed && hosted === context) onClick(id) })
      const result = await request(context, 'mew-notification-show', { title, id })
      if (disposed || context.disposed || hosted !== context) { close(id); return false }
      if (result?.shown !== true) { close(id); return false }
      return true
    },
    close,
    dispose() {
      disposed = true
      for (const id of [...owned]) close(id)
    },
  }
}

/** Only initializeRemoteApp's frame-bound port may install or update this bridge. */
export function installHostedBrowserNotifications(port: MessagePort) {
  disposeHosted?.()
  const context: HostedNotifications = {
    port, permission: 'unsupported', pending: new Map(), clicks: new Map(), disposed: false,
    requestPrefix: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
  }
  const dispose = () => {
    if (context.disposed) return
    for (const id of context.clicks.keys()) {
      try { port.postMessage({ type: 'mew-notification-close', id }) } catch { /* Parent already disconnected. */ }
    }
    context.disposed = true
    context.clicks.clear()
    for (const entry of [...context.pending.values()]) entry.finish()
    if (hosted === context) { hosted = undefined; disposeHosted = undefined; emit() }
  }
  hosted = context
  disposeHosted = dispose
  port.postMessage({ type: 'mew-notification-state-request' })
  emit()
  return {
    update(data: Record<string, unknown>) {
      if (context.disposed || hosted !== context) return
      if ((data.type === 'mew-notification-state' || data.type === 'mew-notification-permission-result') && permissions.has(String(data.permission))) {
        context.permission = data.permission as BrowserNotificationPermission
        emit()
      }
      if ((data.type === 'mew-notification-permission-result' || data.type === 'mew-notification-result') && typeof data.requestId === 'string') context.pending.get(data.requestId)?.finish(data)
      if (data.type === 'mew-notification-click' && typeof data.id === 'string') context.clicks.get(data.id)?.()
    },
    dispose,
  }
}
