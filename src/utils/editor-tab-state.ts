import type { Pane, Tab } from '../hooks/useTabs.ts'
import { isExternalTabPath } from './externalFiles.ts'
import { isGitTabPath } from './gitTabs.ts'
import { normalizeLayout, type PaneNode } from './paneTree.ts'
import { activePaneTab } from './editor-tab-navigation.ts'

export type StoredTab = { path: string; preview: boolean; viewMode: 'hotview' | 'plain' }
export type StoredTabs = {
  unifiedScopes?: boolean
  panes: { id: string; tabs: StoredTab[]; activePath: string | null }[]
  layout: PaneNode
  focusedPaneId: string
}
export type EditorTabState = { panes: Pane[]; layout: PaneNode; focusedPaneId: string }

export function normalizeStoredTabs(input: unknown): StoredTabs | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const parsed = input as Partial<StoredTabs> & { tabs?: StoredTab[]; activePath?: string | null }
  const seenPanes = new Set<string>()
  const panes = (Array.isArray(parsed.panes) ? parsed.panes : Array.isArray(parsed.tabs)
    ? [{ id: 'main', tabs: parsed.tabs, activePath: parsed.activePath ?? null }] : [])
    .filter(pane => {
      if (!pane || typeof pane.id !== 'string' || !pane.id || seenPanes.has(pane.id) || !Array.isArray(pane.tabs)) return false
      seenPanes.add(pane.id)
      return true
    }).map(pane => {
      const seen = new Set<string>()
      const tabs = pane.tabs.filter(tab => {
        if (!tab || typeof tab.path !== 'string' || !tab.path || isExternalTabPath(tab.path) || isGitTabPath(tab.path) || seen.has(tab.path)
          || typeof tab.preview !== 'boolean') return false
        seen.add(tab.path)
        return true
      }).map(tab => ({ path: tab.path, preview: tab.preview, viewMode: tab.viewMode === 'plain' ? 'plain' as const : 'hotview' as const }))
      return { id: pane.id, tabs, activePath: pane.activePath === null ? null : typeof pane.activePath === 'string' && seen.has(pane.activePath) ? pane.activePath : tabs[0]?.path ?? null }
    })
  if (!panes.length) return null
  return {
    ...(parsed.unifiedScopes ? { unifiedScopes: true } : {}), panes,
    layout: normalizeLayout(parsed.layout, panes.map(pane => pane.id)),
    focusedPaneId: panes.some(pane => pane.id === parsed.focusedPaneId) ? parsed.focusedPaneId! : panes[0].id,
  }
}

export function storedEditorTabs(state: EditorTabState, project: string): StoredTabs {
  return {
    ...(project === '.workspace' ? { unifiedScopes: true } : {}),
    panes: state.panes.map(pane => ({
      id: pane.id,
      tabs: [...new Map(pane.tabs.filter(tab => !isExternalTabPath(tab.path) && !isGitTabPath(tab.path))
        .map(tab => [tab.path, { path: tab.path, preview: tab.preview, viewMode: tab.viewMode }])).values()],
      activePath: pane.activePath && !isExternalTabPath(pane.activePath) && !isGitTabPath(pane.activePath) ? pane.activePath : null,
    })),
    layout: state.layout, focusedPaneId: state.focusedPaneId,
  }
}

/** Reuse live buffers and identities when a remote tab moves, without sharing file bodies. */
export function reconcileEditorTabs(previous: EditorTabState, stored: StoredTabs, create: (tab: StoredTab) => Tab): EditorTabState {
  const existing = previous.panes.flatMap(pane => pane.tabs)
  const panes: Pane[] = stored.panes.map(pane => {
    const localPane = previous.panes.find(local => local.id === pane.id)
    const tabs = pane.tabs.map(tab => {
      const local = localPane?.tabs.find(local => local.path === tab.path) ?? existing.find(local => local.path === tab.path)
      return local ? { ...local, preview: tab.preview, viewMode: tab.viewMode } : create(tab)
    })
    return { ...pane, tabs, activeTabId: tabs.find(tab => tab.path === pane.activePath)?.id, recentTabIds: localPane?.recentTabIds }
  })
  // External files and transient diff tabs have always remained local to the device.
  for (const pane of previous.panes) {
    const local = pane.tabs.filter(tab => isExternalTabPath(tab.path) || isGitTabPath(tab.path))
    if (!local.length) continue
    const target = panes.find(target => target.id === pane.id) ?? panes[0]
    target.tabs.push(...local)
    if (!target.activePath) {
      const active = activePaneTab(pane)
      if (active && local.includes(active)) { target.activePath = active.path; target.activeTabId = active.id }
    }
  }
  return { panes, layout: stored.layout, focusedPaneId: stored.focusedPaneId }
}
