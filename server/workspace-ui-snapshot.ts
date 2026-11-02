import { readWorkspaceUiSnapshot, type WorkspaceUiSnapshot, type WorkspaceUiSnapshotInfo } from '../shared/workspace-ui-snapshot.ts'
import { readWorkspaceUi } from './userUiState.ts'

/** Account UI is optional metadata; a large or unreadable record cannot block the root response. */
export function withWorkspaceUiSnapshot<T extends Omit<WorkspaceUiSnapshotInfo, 'workspaceUi'>>(info: T, email: string, include: unknown): T & { workspaceUi?: WorkspaceUiSnapshot } {
  if (include !== 'workspace-ui' || info.hasProject === false) return info
  try {
    const workspacePath = info.projectPath ?? info.path
    const workspaceUi = readWorkspaceUiSnapshot({ ...info, workspaceUi: { workspacePath, state: readWorkspaceUi(email, workspacePath) } })
    if (workspaceUi) return { ...info, workspaceUi }
  } catch { /* The separate account UI endpoint retains its existing error handling. */ }
  return info
}
