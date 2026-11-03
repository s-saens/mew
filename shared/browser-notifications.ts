type NotificationPermission = 'default' | 'denied' | 'granted'
export type BrowserNotificationPermission = NotificationPermission | 'unsupported' | 'install-required'

type NativeNotice = { close(): void; onclick: (() => void) | null; onclose: (() => void) | null }
type NotificationData = { protocol: 'mew-notification-v1'; id: string; clientId: string }
type WorkerNotice = { data: unknown; close(): void }
type Worker = {
  state: string
  postMessage(message: unknown, ports: Port[]): void
  addEventListener(type: string, listener: () => void): void
  removeEventListener(type: string, listener: () => void): void
}
type Registration = {
  active: Worker | null
  installing: Worker | null
  waiting: Worker | null
  showNotification(title: string, options: { tag: string; silent: boolean; data: NotificationData }): Promise<void>
  getNotifications(options: { tag: string }): Promise<WorkerNotice[]>
}
type WorkerMessage = { source: unknown; origin: string; data: unknown }
type Port = { onmessage: ((event: { data: unknown }) => void) | null; postMessage(value: unknown): void; close(): void }
type Browser = {
  isSecureContext?: boolean
  location: { origin: string }
  navigator: {
    userAgent?: string
    platform?: string
    maxTouchPoints?: number
    standalone?: boolean
    serviceWorker?: {
      register(script: string, options: { scope: string }): Promise<Registration>
      addEventListener(type: string, listener: (event: WorkerMessage) => void): void
      removeEventListener(type: string, listener: (event: WorkerMessage) => void): void
    }
  }
  matchMedia?(query: string): { matches: boolean }
  Notification?: {
    new(title: string, options: { tag: string; silent: boolean }): NativeNotice
    permission: NotificationPermission
    requestPermission(): Promise<NotificationPermission>
  }
  MessageChannel?: new() => { port1: Port; port2: Port }
}

function browser(): Browser | undefined {
  return (globalThis as unknown as { window?: Browser }).window
}

export function browserNotificationPermission(): BrowserNotificationPermission {
  const target = browser()
  if (!target?.isSecureContext) return 'unsupported'
  const nav = target.navigator
  const ios = /iPad|iPhone|iPod/.test(nav.userAgent ?? '') || (nav.platform === 'MacIntel' && (nav.maxTouchPoints ?? 0) > 1)
  if (ios && !nav.standalone && !['standalone', 'fullscreen', 'minimal-ui'].some(mode => target.matchMedia?.(`(display-mode: ${mode})`).matches)) return 'install-required'
  return target.Notification?.permission ?? 'unsupported'
}

export function requestBrowserNotificationPermission(): Promise<BrowserNotificationPermission> {
  const permission = browserNotificationPermission()
  if (permission !== 'default') return Promise.resolve(permission)
  try {
    // Call within the original user gesture; worker setup must happen afterwards.
    return Promise.resolve(browser()!.Notification!.requestPermission()).catch(() => browserNotificationPermission())
  } catch {
    return Promise.resolve(browserNotificationPermission())
  }
}

function notificationData(value: unknown): NotificationData | undefined {
  if (!value || typeof value !== 'object') return undefined
  const data = value as Partial<NotificationData>
  return data.protocol === 'mew-notification-v1' && typeof data.id === 'string' && typeof data.clientId === 'string'
    ? data as NotificationData : undefined
}

export function createBrowserNotificationDelivery(onClick: (id: string) => void) {
  const target = browser(), container = target?.navigator.serviceWorker
  const notices = new Map<string, { native?: NativeNotice }>()
  const cancellations = new Set<() => void>()
  let disposed = false
  let registration: Registration | undefined
  let clientId: string | undefined
  let preparing: Promise<{ registration: Registration; clientId: string }> | undefined

  const handleMessage = (event: WorkerMessage) => {
    if (disposed || !registration?.active || event.source !== registration.active || event.origin !== target?.location.origin) return
    if (!event.data || typeof event.data !== 'object') return
    const data = event.data as { type?: unknown; id?: unknown }
    if (data.type !== 'mew-notification-click' || typeof data.id !== 'string' || !notices.has(data.id)) return
    onClick(data.id)
    close(data.id)
  }
  container?.addEventListener('message', handleMessage)

  function prepare() {
    if (preparing) return preparing
    const attempt = new Promise<{ registration: Registration; clientId: string }>((resolve, reject) => {
      const cleanups: (() => void)[] = []
      let finished = false
      const finish = (result?: { registration: Registration; clientId: string }) => {
        if (finished) return
        finished = true
        for (const cleanup of cleanups) cleanup()
        cancellations.delete(cancel)
        if (result) resolve(result)
        else reject(new Error('Notification worker unavailable'))
      }
      const cancel = () => finish()
      cancellations.add(cancel)
      const timer = setTimeout(cancel, 5_000)
      cleanups.push(() => clearTimeout(timer))
      if (!container || !target?.MessageChannel || disposed) { cancel(); return }
      void Promise.resolve().then(() => container.register('/notification-worker.js', { scope: '/__mew_notifications__/' })).then(value => {
        if (finished || disposed) return
        registration = value
        let connecting = false
        const connect = () => {
          if (finished || connecting || !value.active || value.active.state !== 'activated') return
          connecting = true
          const channel = new target.MessageChannel!()
          cleanups.push(() => { channel.port1.onmessage = null; channel.port1.close(); channel.port2.close() })
          channel.port1.onmessage = event => {
            if (!event.data || typeof event.data !== 'object') return
            const data = event.data as { type?: unknown; protocol?: unknown; clientId?: unknown }
            if (data.type !== 'mew-notification-client' || data.protocol !== 1 || typeof data.clientId !== 'string' || !data.clientId) return
            clientId = data.clientId
            finish({ registration: value, clientId })
          }
          try { value.active.postMessage({ type: 'mew-notification-client', protocol: 1 }, [channel.port2]) } catch { cancel() }
        }
        if (value.active?.state === 'activated') { connect(); return }
        const worker = value.installing ?? value.waiting ?? value.active
        if (!worker) { cancel(); return }
        const changed = () => {
          if (worker.state === 'redundant') cancel()
          else if (worker.state === 'activated') connect()
        }
        worker.addEventListener('statechange', changed)
        cleanups.push(() => worker.removeEventListener('statechange', changed))
        changed()
      }, cancel).catch(cancel)
    })
    preparing = attempt
    void attempt.catch(() => { if (preparing === attempt) preparing = undefined })
    return attempt
  }

  async function closeWorker(id: string, owner = clientId, workerRegistration = registration) {
    if (!owner || !workerRegistration) return
    try {
      const notifications = await workerRegistration.getNotifications({ tag: id })
      for (const notice of notifications) {
        const data = notificationData(notice.data)
        if (data?.id === id && data.clientId === owner) notice.close()
      }
    } catch { /* The browser may remove a registration while a page closes. */ }
  }

  function close(id: string) {
    const notice = notices.get(id)
    notices.delete(id)
    if (notice?.native) {
      notice.native.onclick = null
      notice.native.onclose = null
      notice.native.close()
    }
    void closeWorker(id)
  }

  async function show(title: string, id: string): Promise<boolean> {
    if (disposed || browserNotificationPermission() !== 'granted' || !id || id.length > 512) return false
    if (notices.has(id)) close(id)
    while (notices.size >= 30) close(notices.keys().next().value!)
    const record: { native?: NativeNotice } = {}
    notices.set(id, record)
    const current = () => !disposed && notices.get(id) === record
    try {
      const ready = await prepare()
      if (!current()) return false
      if (browserNotificationPermission() !== 'granted') { notices.delete(id); return false }
      await ready.registration.showNotification(title, {
        tag: id, silent: true, data: { protocol: 'mew-notification-v1', id, clientId: ready.clientId },
      })
      if (!current()) { await closeWorker(id, ready.clientId, ready.registration); return false }
      return true
    } catch {
      if (!current()) return false
      if (!target?.Notification || browserNotificationPermission() !== 'granted') { notices.delete(id); return false }
      try {
        const native = new target.Notification(title, { tag: id, silent: true })
        record.native = native
        native.onclick = () => { if (current()) { onClick(id); close(id) } }
        native.onclose = () => { if (current()) notices.delete(id) }
        return true
      } catch {
        notices.delete(id)
        return false
      }
    }
  }

  function dispose() {
    if (disposed) return
    disposed = true
    container?.removeEventListener('message', handleMessage)
    for (const cancel of cancellations) cancel()
    for (const id of notices.keys()) close(id)
  }

  return { show, close, dispose }
}
