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
    let sequence = 0
    async function load(afterDeletion = false) {
      const request = ++sequence
      if (afterDeletion) await saveQueue.current
      if (!alive || request !== sequence) return
      const { state } = await trackRefresh(fetchRootProjectTabs())
      if (!alive || request !== sequence) return
      setPaths(state?.paths ?? [])
      setIcons(state?.icons ?? {})
      setSynced(true)
    }
    const deleted = () => { void load(true).catch(console.error) }
    void load().catch(console.error)
    window.addEventListener('mew:projects-deleted', deleted)
    return () => { alive = false; window.removeEventListener('mew:projects-deleted', deleted) }
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
