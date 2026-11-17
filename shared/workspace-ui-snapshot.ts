export const MAX_WORKSPACE_UI_SNAPSHOT_BYTES = 64 * 1024

export type WorkspaceUiSnapshot = {
  workspacePath: string
  state: Record<string, unknown> | null
}

export type WorkspaceEditorTabsSnapshot = {
  workspacePath: string
  state: Record<string, Record<string, unknown>> | null
  revision: number
}

export type WorkspaceUiSnapshotInfo = {
  path: string
  projectPath?: string
  hasProject?: boolean
  workspaceUi?: unknown
  editorTabs?: unknown
}

function ownValue(value: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key)
  return descriptor && 'value' in descriptor ? descriptor.value : undefined
}

/** An omitted or malformed snapshot keeps the older, separate UI read available. */
export function readWorkspaceUiSnapshot(info: WorkspaceUiSnapshotInfo): WorkspaceUiSnapshot | undefined {
  if (info.hasProject === false) return undefined
  const snapshot = ownValue(info, 'workspaceUi')
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return undefined
  const workspacePath = ownValue(snapshot, 'workspacePath')
  const state = ownValue(snapshot, 'state')
  if (typeof workspacePath !== 'string' || !workspacePath || workspacePath.length > 4096 || workspacePath !== (info.projectPath ?? info.path)) return undefined
  if (state !== null && (!state || typeof state !== 'object' || Array.isArray(state))) return undefined
  try {
    const value = { workspacePath, state } as WorkspaceUiSnapshot
    if (new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_WORKSPACE_UI_SNAPSHOT_BYTES) return undefined
    return value
  } catch { return undefined }
}

/** Optional authoritative tabs retain their logical project key and account-ledger revision. */
export function readWorkspaceEditorTabsSnapshot(info: WorkspaceUiSnapshotInfo): WorkspaceEditorTabsSnapshot | undefined {
  if (info.hasProject === false) return undefined
  const snapshot = ownValue(info, 'editorTabs')
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return undefined
  const workspacePath = ownValue(snapshot, 'workspacePath'), state = ownValue(snapshot, 'state'), revision = ownValue(snapshot, 'revision')
  if (typeof workspacePath !== 'string' || !workspacePath || workspacePath.length > 4096 || workspacePath !== (info.projectPath ?? info.path)) return undefined
  if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0) return undefined
  if (state !== null && (!state || typeof state !== 'object' || Array.isArray(state))) return undefined
  try {
    if (state && Object.entries(state).some(([project, value]) => !project || project.length > 4096 || !value || typeof value !== 'object' || Array.isArray(value))) return undefined
    const value = { workspacePath, state, revision } as WorkspaceEditorTabsSnapshot
    if (new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_WORKSPACE_UI_SNAPSHOT_BYTES) return undefined
    return value
  } catch { return undefined }
}
