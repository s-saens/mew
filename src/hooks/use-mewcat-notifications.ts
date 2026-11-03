import { useEffect, useRef } from 'react'
import { fetchSystemStats } from '../api/client'
import { useI18n } from '../i18n'
import { createResourceNoticeTracker } from '../utils/mewcat-notification-rules'
import { createNotificationDelivery } from '../utils/browser-notifications'
import { clearMewcatNotices, desktopNotificationPermission, focusMewcatNotice, getNotificationPreferences, onMewcatNotice, openMewcatNotice, playNotificationSound, publishMewcatNotice, unlockNotificationAudio, useNotificationPreferences } from '../utils/mewcat-notifications'

/** Mounted independently of the cat skin and settings dialog. */
export function useMewcatNotifications(canMonitorResources: boolean, identity: string | null) {
  const preferences = useNotificationPreferences()
  const { t } = useI18n()
  const current = useRef(t)
  current.current = t

  useEffect(() => {
    clearMewcatNotices()
    const desktop = new Map<string, Parameters<typeof openMewcatNotice>[0]>()
    const deliveryId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
    const delivery = createNotificationDelivery(id => {
      const notice = desktop.get(id)
      if (!notice) return
      window.focus()
      openMewcatNotice(notice)
      delivery.close(id)
      desktop.delete(id)
    })
    const unsubscribe = onMewcatNotice(notice => {
      const t = current.current
      const preferences = getNotificationPreferences()
      const away = document.visibilityState === 'hidden' || !document.hasFocus()
      if (notice.kind === 'permission' && preferences.autoOpenApproval) focusMewcatNotice(notice)
      if (preferences.sound) playNotificationSound(notice.level)
      if (!preferences.desktop || !away || desktopNotificationPermission() !== 'granted') return
      const id = `${deliveryId}:${notice.id}`
      if (desktop.size >= 30) desktop.delete(desktop.keys().next().value!)
      desktop.set(id, notice)
      // Only a generic localized title and opaque click ID leave this app context.
      void delivery.show(`mew · ${notice.kind === 'test' ? t('mewcat.testBody') : t(`mewcat.${notice.kind}`)}`, id)
        .then(shown => { if (!shown) desktop.delete(id) })
        .catch(() => { desktop.delete(id) })
    })
    return () => { unsubscribe(); desktop.clear(); delivery.dispose() }
  }, [identity])

  useEffect(() => {
    if (!preferences.sound) return
    const unlock = () => { void unlockNotificationAudio() }
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
    return () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock) }
  }, [preferences.sound])

  useEffect(() => {
    if (!canMonitorResources || !preferences.resources) return
    let disposed = false
    let timer: number | undefined
    const controller = new AbortController()
    const sample = createResourceNoticeTracker()
    const poll = async () => {
      try {
        const stats = await fetchSystemStats(AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]), { processes: false })
        if (!disposed) sample(stats).forEach(publishMewcatNotice)
      } catch { sample(null) }
      if (!disposed) timer = window.setTimeout(poll, 15_000)
    }
    void poll()
    return () => { disposed = true; clearTimeout(timer); controller.abort() }
  }, [canMonitorResources, preferences.resources, identity])
}
