import type { StoredTabs } from '../hooks/useTabs'
import { editorFile, mergeEditorTabs } from './editor-files.ts'
import { canOpenEditorFile } from './editor-open-policy.ts'
import { gitDiffTarget } from './git-diff-tabs.ts'
import { isExternalTabPath } from './externalFiles.ts'
import { mediaKind } from './media.ts'

type EditorPreparation = { mode: 'plain' | 'hotview'; path: string }

function storedTabs(value: unknown): StoredTabs | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const state = value as Partial<StoredTabs>
  if (!Array.isArray(state.panes) || state.panes.length > 32 || !state.panes.every(pane =>
    pane && typeof pane.id === 'string' && (pane.activePath === null || typeof pane.activePath === 'string') &&
    Array.isArray(pane.tabs) && pane.tabs.length <= 1000 && pane.tabs.every(tab =>
      tab && typeof tab.path === 'string' && typeof tab.preview === 'boolean' && ['plain', 'hotview'].includes(tab.viewMode)))) return null
  return state as StoredTabs
}

/** Optional public-code preparation from the accepted, device-restored UI snapshot. */
export function workspaceEditorPreparations(state: unknown): EditorPreparation[] {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return []
  const tabs = (state as { tabs?: unknown }).tabs
  if (!tabs || typeof tabs !== 'object' || Array.isArray(tabs)) return []
  const values = tabs as Record<string, unknown>
  try {
    const selected = mergeEditorTabs(storedTabs(values['.workspace']), storedTabs(values.docs))
    if (!selected) return []
    const result: EditorPreparation[] = []
    for (const pane of selected.panes) {
      const tab = pane.tabs.find(tab => tab.path === pane.activePath)
      if (!tab || isExternalTabPath(tab.path) || gitDiffTarget(tab.path)) continue
      const path = editorFile(tab.path).path
      if (!canOpenEditorFile(path) || mediaKind(path) || path.endsWith('.svg') && tab.viewMode === 'hotview') continue
      if (!result.some(value => value.path === path && value.mode === tab.viewMode)) result.push({ mode: tab.viewMode, path })
    }
    return result
  } catch { return [] }
}
