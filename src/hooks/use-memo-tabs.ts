import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { MemoTab } from '../../shared/shared-memo'
import { createMemoTab, deleteMemoTab, fetchMemoTabs } from '../api/memo-tabs'

/** Metadata is authoritative on the server; failed mutations keep the current tabs. */
export function useMemoTabs(account: string, open: boolean) {
  const [state, setState] = useState({ account, tabs: [] as MemoTab[], ownerId: '', loaded: false, busy: false, error: '' })
  const identity = useRef(account)
  useLayoutEffect(() => { identity.current = account }, [account])
  const generation = useRef(0)
  const pending = useRef(false)
  const current = state.account === account ? state : { account, tabs: [], ownerId: '', loaded: false, busy: false, error: '' }

  const refresh = useCallback(async () => {
    if (!account || pending.current) return
    const version = ++generation.current
    try {
      const result = await fetchMemoTabs()
      if (identity.current === account && generation.current === version) setState({ account, ...result, loaded: true, busy: false, error: '' })
    } catch (error) {
      if (identity.current === account && generation.current === version) setState(old => ({ ...old, account, error: error instanceof Error ? error.message : String(error) }))
    }
  }, [account])
  useEffect(() => {
    generation.current++
    pending.current = false
    setState({ account, tabs: [], ownerId: '', loaded: false, busy: false, error: '' })
  }, [account])
  useEffect(() => {
    if (!open || !account) return
    void refresh()
    const foreground = () => { if (document.visibilityState === 'visible') void refresh() }
    window.addEventListener('focus', foreground)
    window.addEventListener('mew:remote-reconnected', foreground)
    document.addEventListener('visibilitychange', foreground)
    const timer = window.setInterval(foreground, 5000)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', foreground)
      window.removeEventListener('mew:remote-reconnected', foreground)
      document.removeEventListener('visibilitychange', foreground)
    }
  }, [account, open, refresh])

  const mutate = useCallback(async (id?: string) => {
    if (!account || pending.current) return null
    pending.current = true
    const version = ++generation.current
    setState(old => ({ ...old, busy: true, error: '' }))
    try {
      const tab = id ? (await deleteMemoTab(id), null) : (await createMemoTab()).tab
      if (identity.current !== account || generation.current !== version) return null
      setState(old => ({ ...old, tabs: id ? old.tabs.filter(tab => tab.id !== id) : [...old.tabs, tab!], busy: false }))
      return tab
    } catch (error) {
      if (identity.current === account && generation.current === version) setState(old => ({ ...old, busy: false, error: error instanceof Error ? error.message : String(error) }))
      return null
    } finally { if (identity.current === account && generation.current === version) pending.current = false }
  }, [account])
  return { ...current, refresh, add: () => mutate(), remove: (id: string) => mutate(id) }
}
