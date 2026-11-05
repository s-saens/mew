import { useCallback, useEffect, useRef, useState } from 'react'
import type { StoredTabs } from '../utils/editor-tab-state.ts'
import { fetchAccountEditorTabs, saveAccountEditorTabs } from '../api/editor-tabs.ts'
import { createAccountEditorTabsSync, type AccountEditorTabs, type AccountEditorTabsSnapshot } from '../utils/account-editor-tabs.ts'

type Scope = { account: string | null; workspacePath: string | null }
type State = Scope & { tabs: AccountEditorTabs | undefined; hydrated: boolean }
type Controller = Scope & { sync: ReturnType<typeof createAccountEditorTabsSync> }
type Preparation = Scope & { controller: AbortController; promise: Promise<AccountEditorTabsSnapshot>; detach: () => void }

export function useAccountEditorTabs(account: string | null, workspacePath: string | null, onError: (error: unknown) => void) {
  const [state, setState] = useState<State>({ account, workspacePath, tabs: undefined, hydrated: false })
  const controller = useRef<Controller | null>(null), errorHandler = useRef(onError)
  const preparation = useRef<Preparation | null>(null)
  const currentScope = state.account === account && state.workspacePath === workspacePath
  if (!currentScope) setState({ account, workspacePath, tabs: undefined, hydrated: false })
  useEffect(() => { errorHandler.current = onError }, [onError])

  const discardPreparation = useCallback(() => {
    const pending = preparation.current
    preparation.current = null
    pending?.detach()
    pending?.controller.abort()
  }, [])

  const prepare = useCallback((path: string, signal: AbortSignal) => {
    discardPreparation()
    if (!account || signal.aborted) return
    const pendingController = new AbortController()
    const abort = () => {
      if (preparation.current === pending) preparation.current = null
      pending.detach()
      pendingController.abort()
    }
    const pending: Preparation = {
      account, workspacePath: path, controller: pendingController,
      promise: fetchAccountEditorTabs(path, pendingController.signal).then(snapshot => {
        pendingController.signal.throwIfAborted()
        return snapshot
      }),
      detach: () => signal.removeEventListener('abort', abort),
    }
    preparation.current = pending
    signal.addEventListener('abort', abort, { once: true })
    void pending.promise.catch(() => {
      if (preparation.current === pending) discardPreparation()
    })
  }, [account, discardPreparation])

  useEffect(() => {
    const refresh = () => { discardPreparation(); controller.current?.sync.refresh() }
    const onTabsChanged = (event: Event) => {
      const path = (event as CustomEvent<{ workspacePath?: string }>).detail?.workspacePath
      if (path === preparation.current?.workspacePath) discardPreparation()
      if (path === controller.current?.workspacePath) controller.current?.sync.refresh()
    }
    const onVisibility = () => { if (document.visibilityState !== 'hidden') refresh() }
    const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) refresh() }
    window.addEventListener('mew:editor-tabs-changed', onTabsChanged)
    window.addEventListener('mew:permissions-changed', refresh)
    window.addEventListener('online', refresh)
    window.addEventListener('pageshow', onPageShow)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      discardPreparation()
      window.removeEventListener('mew:editor-tabs-changed', onTabsChanged)
      window.removeEventListener('mew:permissions-changed', refresh)
      window.removeEventListener('online', refresh)
      window.removeEventListener('pageshow', onPageShow)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [account, discardPreparation])

  useEffect(() => {
    if (!account || !workspacePath) return
    const pending = preparation.current
    if (pending && (pending.account !== account || pending.workspacePath !== workspacePath)) discardPreparation()
    let consumed: Preparation | undefined
    const sync = createAccountEditorTabsSync({
      read: async signal => {
        const pending = preparation.current
        if (!pending || pending.account !== account || pending.workspacePath !== workspacePath) {
          return fetchAccountEditorTabs(workspacePath, signal)
        }
        preparation.current = null
        consumed = pending
        const abort = () => pending.controller.abort()
        signal.addEventListener('abort', abort, { once: true })
        try { return await pending.promise }
        finally { pending.detach(); signal.removeEventListener('abort', abort); consumed = undefined }
      },
      write: (project, tabs, initialize, signal) => saveAccountEditorTabs(workspacePath, project, tabs, initialize, signal),
      apply: tabs => setState({ account, workspacePath, tabs, hydrated: true }),
      onError: error => errorHandler.current(error),
    })
    controller.current = { account, workspacePath, sync }
    sync.refresh()
    return () => {
      sync.dispose()
      consumed?.detach()
      consumed?.controller.abort()
      controller.current = null
    }
  }, [account, workspacePath, discardPreparation])

  const change = useCallback((project: string, tabs: StoredTabs) => {
    const current = controller.current
    if (current?.account === account && current.workspacePath === workspacePath) current.sync.change(project, tabs)
  }, [account, workspacePath])
  return { tabs: currentScope ? state.tabs : undefined, hydrated: currentScope && state.hydrated, change, prepare }
}
