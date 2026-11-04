import { useCallback, useEffect, useRef, useState } from 'react'
import type { StoredTabs } from '../utils/editor-tab-state.ts'
import { fetchAccountEditorTabs, saveAccountEditorTabs } from '../api/editor-tabs.ts'
import { createAccountEditorTabsSync, type AccountEditorTabs } from '../utils/account-editor-tabs.ts'

type Scope = { account: string | null; workspacePath: string | null }
type State = Scope & { tabs: AccountEditorTabs | undefined; hydrated: boolean }
type Controller = Scope & { sync: ReturnType<typeof createAccountEditorTabsSync> }

export function useAccountEditorTabs(account: string | null, workspacePath: string | null, onError: (error: unknown) => void) {
  const [state, setState] = useState<State>({ account, workspacePath, tabs: undefined, hydrated: false })
  const controller = useRef<Controller | null>(null), errorHandler = useRef(onError)
  const currentScope = state.account === account && state.workspacePath === workspacePath
  if (!currentScope) setState({ account, workspacePath, tabs: undefined, hydrated: false })
  useEffect(() => { errorHandler.current = onError }, [onError])

  useEffect(() => {
    if (!account || !workspacePath) return
    const sync = createAccountEditorTabsSync({
      read: signal => fetchAccountEditorTabs(workspacePath, signal),
      write: (project, tabs, initialize, signal) => saveAccountEditorTabs(workspacePath, project, tabs, initialize, signal),
      apply: tabs => setState({ account, workspacePath, tabs, hydrated: true }),
      onError: error => errorHandler.current(error),
    })
    controller.current = { account, workspacePath, sync }
    const refresh = () => sync.refresh()
    const onTabsChanged = (event: Event) => {
      if ((event as CustomEvent<{ workspacePath?: string }>).detail?.workspacePath === workspacePath) refresh()
    }
    const onVisibility = () => { if (document.visibilityState !== 'hidden') refresh() }
    const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) refresh() }
    window.addEventListener('mew:editor-tabs-changed', onTabsChanged)
    window.addEventListener('mew:permissions-changed', refresh)
    window.addEventListener('online', refresh)
    window.addEventListener('pageshow', onPageShow)
    document.addEventListener('visibilitychange', onVisibility)
    refresh()
    return () => {
      sync.dispose()
      controller.current = null
      window.removeEventListener('mew:editor-tabs-changed', onTabsChanged)
      window.removeEventListener('mew:permissions-changed', refresh)
      window.removeEventListener('online', refresh)
      window.removeEventListener('pageshow', onPageShow)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [account, workspacePath])

  const change = useCallback((project: string, tabs: StoredTabs) => {
    const current = controller.current
    if (current?.account === account && current.workspacePath === workspacePath) current.sync.change(project, tabs)
  }, [account, workspacePath])
  return { tabs: currentScope ? state.tabs : undefined, hydrated: currentScope && state.hydrated, change }
}
