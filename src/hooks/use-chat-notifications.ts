import { useEffect } from 'react'
import { fetchChat } from '../api/client'
import { createChatNoticeTracker } from '../utils/chat-notification-rules'
import { publishMewcatNotice } from '../utils/mewcat-notifications'

/** Keep receiving member chat notices while the chat panel is closed. */
export function useChatNotifications(enabled: boolean, identity: string | null) {
  useEffect(() => {
    if (!enabled || !identity) return
    const track = createChatNoticeTracker(identity)
    let disposed = false
    let fetching = false
    let pending = false
    const refresh = async () => {
      pending = true
      if (fetching) return
      fetching = true
      try {
        do {
          pending = false
          try {
            const view = await fetchChat()
            if (!disposed) track(view.messages).forEach(publishMewcatNotice)
          } catch { /* A later presence or foreground event retries without replaying history. */ }
        } while (pending && !disposed)
      } finally { fetching = false }
    }
    const onSignal = (event: Event) => {
      if ((event as CustomEvent<{ type?: string }>).detail?.type === 'chat') void refresh()
    }
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh() }
    window.addEventListener('mew:signal', onSignal)
    window.addEventListener('mew:permissions-changed', refresh)
    window.addEventListener('mew:remote-reconnected', refresh)
    document.addEventListener('visibilitychange', onVisible)
    void refresh()
    return () => {
      disposed = true
      window.removeEventListener('mew:signal', onSignal)
      window.removeEventListener('mew:permissions-changed', refresh)
      window.removeEventListener('mew:remote-reconnected', refresh)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [enabled, identity])
}
