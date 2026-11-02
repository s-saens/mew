import { isArchivedPath, type Role } from '../api/client'
import type { Tab } from '../hooks/useTabs'
import type { Collab } from '../hooks/useCollab'
import { canOpenEditorFile } from './editor-open-policy'
import { isExternalTabPath } from './externalFiles'
import { mediaKind } from './media'

export type PreparedEditorCollaboration = {
  project: string
  path: string | null
  authEmail: string | null
  session: Collab | null
}

/** Prepare the main editing view's socket; attaching still requires file validation. */
export function primaryCollabPath(tab: Tab | null, role: Role, project: string, prepare = false): string | null {
  if (role === 'guest' || !tab || tab.deferredLoad || tab.anchorPreview || isExternalTabPath(tab.path) || !canOpenEditorFile(tab.path) || isArchivedPath(tab.path, project) || mediaKind(tab.path)) return null
  if (!(prepare && tab.revalidating) && (tab.revalidating || !tab.editable)) return null
  const eligible = tab.path.endsWith('.md') ? tab.viewMode === 'hotview' : tab.viewMode === 'plain'
  return eligible ? tab.path : null
}
