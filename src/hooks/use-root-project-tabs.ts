import { useEffect, useRef, useState } from 'react'
import { writeBrowserStorage } from '@mew/ui/browser-storage'
import { fetchRootProjectTabs, saveRootProjectTabs } from '../api/client.ts'

export function useRootProjectTabs(enabled: boolean, trackRefresh: <T>(request: Promise<T>) => Promise<T>) {
  const [paths, setPaths] = useState<string[]>([])
  const [icons, setIcons] = useState<Record<string, string>>({})
  const [synced, setSynced] = useState(!enabled)
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve())

  useEffect(() => {
    if (!enabled) return
    let alive = true
    void trackRefresh(fetchRootProjectTabs()).then(({ state }) => {
      if (!alive) return
      setPaths(state?.paths ?? [])
      setIcons(state?.icons ?? {})
      setSynced(true)
    }).catch(console.error)
    return () => { alive = false }
  }, [enabled, trackRefresh])

  useEffect(() => {
    if (!enabled || !synced) return
    const uniquePaths = [...new Set(paths)]
    writeBrowserStorage('mew:open-project-paths', JSON.stringify(uniquePaths))
    let current = true
    saveQueue.current = saveQueue.current.catch(() => {})
      .then(() => current ? saveRootProjectTabs({ paths: uniquePaths, icons: {}, groups: [] }) : undefined)
      .catch(console.error)
    return () => { current = false }
  }, [enabled, paths, synced])

  return { paths, setPaths, icons, setIcons, synced, saveQueue }
}
