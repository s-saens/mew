import { createContext, createElement, useContext, useSyncExternalStore, type ReactNode, type RefObject } from 'react'

export type WorkspaceView = { id: string; compact: boolean; active: boolean; root: RefObject<HTMLElement | null>; restoreFocus?: () => HTMLElement | null }
const WorkspaceViewContext = createContext<WorkspaceView | null>(null)

export function WorkspaceViewProvider({ value, children }: { value: WorkspaceView; children?: ReactNode }) {
  return createElement(WorkspaceViewContext.Provider, { value }, children)
}

export function useWorkspaceView() { return useContext(WorkspaceViewContext) }

let viewportWindow: Window | undefined, viewportQuery: MediaQueryList | undefined
function desktopQuery() {
  if (viewportWindow !== window || !viewportQuery) {
    viewportWindow = window
    viewportQuery = window.matchMedia('(min-width: 768px)')
  }
  return viewportQuery
}
const subscribeDesktop = (change: () => void) => {
  const query = desktopQuery()
  query.addEventListener('change', change)
  return () => query.removeEventListener('change', change)
}
const desktopSnapshot = () => desktopQuery().matches
const compactSnapshot = () => false
const noSubscription = () => () => {}

/** Presentation follows the view; device input capabilities remain independent. */
export function useWorkspaceDesktop() {
  const compact = useWorkspaceView()?.compact
  return useSyncExternalStore(compact ? noSubscription : subscribeDesktop, compact ? compactSnapshot : desktopSnapshot, () => true)
}
