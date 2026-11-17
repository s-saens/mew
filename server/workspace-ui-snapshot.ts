import { MAX_WORKSPACE_UI_SNAPSHOT_BYTES, readWorkspaceEditorTabsSnapshot, readWorkspaceUiSnapshot, type WorkspaceEditorTabsSnapshot, type WorkspaceUiSnapshot, type WorkspaceUiSnapshotInfo } from '../shared/workspace-ui-snapshot.ts'
import { readEditorTabs, readWorkspaceUi } from './userUiState.ts'

/** Account UI is optional metadata; a large or unreadable record cannot block the root response. */
export function withWorkspaceUiSnapshot<T extends Omit<WorkspaceUiSnapshotInfo, 'workspaceUi' | 'editorTabs'>>(info: T, email: string, include: unknown): T & { workspaceUi?: WorkspaceUiSnapshot; editorTabs?: WorkspaceEditorTabsSnapshot } {
  if (include !== 'workspace-ui' || info.hasProject === false) return info
  const workspacePath = info.projectPath ?? info.path
  let result: T & { workspaceUi?: WorkspaceUiSnapshot; editorTabs?: WorkspaceEditorTabsSnapshot } = info
  try {
    const workspaceUi = readWorkspaceUiSnapshot({ ...info, workspaceUi: { workspacePath, state: readWorkspaceUi(email, workspacePath) } })
    if (workspaceUi) result = { ...result, workspaceUi }
  } catch { /* The separate account UI endpoint retains its existing error handling. */ }
  try {
    const editorTabs = readWorkspaceEditorTabsSnapshot({ ...info, editorTabs: { workspacePath, ...readEditorTabs(email, workspacePath) } })
    if (editorTabs && new TextEncoder().encode(JSON.stringify({ workspaceUi: result.workspaceUi, editorTabs })).byteLength <= MAX_WORKSPACE_UI_SNAPSHOT_BYTES) {
      result = { ...result, editorTabs }
    }
  } catch { /* The separate authoritative tab read remains available, including migration errors. */ }
  return result
}
