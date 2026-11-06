import { useCallback, useMemo, useState } from 'react'
import { createDeviceLayoutSession } from '../utils/device-layout'

/** A retained workspace accepts incoming geometry before it can persist that presentation. */
export function useDeviceLayout(account: string, workspace: string | null, compact: boolean, desktop: boolean) {
  const sessions = useMemo(() => ({ single: createDeviceLayoutSession(account), panel: createDeviceLayoutSession(account, 'project-panel') }), [account])
  const session = compact ? sessions.panel : sessions.single
  const scopeKey = workspace ? JSON.stringify([account, compact ? 'project-panel' : desktop ? 'desktop' : 'mobile', workspace]) : null
  const [restoredScope, setRestoredScope] = useState<string | null>(null)
  const restored = scopeKey !== null && scopeKey === restoredScope

  const restore = useCallback((state: Record<string, unknown>) => {
    if (!workspace) return state
    const next = session.restore(workspace, state, desktop)
    setRestoredScope(scopeKey)
    return next
  }, [session, workspace, desktop, scopeKey])

  const save = useCallback((state: Record<string, unknown>) => {
    if (!workspace || !restored) return false
    session.save(workspace, state, desktop)
    return true
  }, [session, workspace, desktop, restored])

  return { session, scopeKey, restored, restore, save }
}
