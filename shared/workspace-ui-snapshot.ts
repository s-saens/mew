export const MAX_WORKSPACE_UI_SNAPSHOT_BYTES = 64 * 1024

export type WorkspaceUiSnapshot = {
  workspacePath: string
  state: Record<string, unknown> | null
}

export type WorkspaceUiSnapshotInfo = {
  path: string
  projectPath?: string
  hasProject?: boolean
  workspaceUi?: unknown
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
