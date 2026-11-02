import { readWorkspaceUiSnapshot, type WorkspaceUiSnapshotInfo } from '../../shared/workspace-ui-snapshot.ts'
import type { WorkspaceSnapshotCache } from './workspace-snapshot-cache.ts'

type WorkspaceReadScope = { sequence: number; epoch: number }

/** Seed only the accepted initial response, preserving a newer local or prefetched layout. */
export function seedWorkspaceUiSnapshot(
  info: WorkspaceUiSnapshotInfo,
  cache: WorkspaceSnapshotCache<Record<string, unknown>>,
  request: WorkspaceReadScope,
  current: WorkspaceReadScope,
  restore: (path: string, state: Record<string, unknown>) => Record<string, unknown>,
): void {
  if (request.sequence !== current.sequence || request.epoch !== current.epoch) return
  const snapshot = readWorkspaceUiSnapshot(info)
  if (!snapshot || cache.get(snapshot.workspacePath) !== undefined) return
  cache.set(snapshot.workspacePath, restore(snapshot.workspacePath, snapshot.state ?? {}))
}
