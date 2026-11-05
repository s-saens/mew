import path from 'node:path'
import type { HistoryPreview } from '../shared/agent-history.ts'
import { canUse } from './access-policy.ts'
import { readAgentHistoryPreview } from './agent-history-preview.ts'
import type { AgentEvent } from './agentAcp.ts'
import { resolveAgentCwd } from './agentCwd.ts'
import { isAcpRuntime } from './agentRuntimes.ts'
import type { RequestAuth } from './reqAuth.ts'
import { readAgentTabs } from './userUiState.ts'

export class AgentTabPreviewError extends Error {
  readonly status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}

function account(auth: RequestAuth): string {
  if (!auth.email || !canUse(auth, 'agent')) throw new AgentTabPreviewError(403, 'Agent access is required')
  return auth.email
}

function target(email: string, workspace: string, id: string) {
  const tab = readAgentTabs(email, workspace)?.tabs.find(tab => tab.id === id)
  if (!tab?.runtime || !isAcpRuntime(tab.runtime)) return null
  let cwd: string
  try { cwd = resolveAgentCwd(tab.cwd || workspace, workspace) }
  catch { throw new AgentTabPreviewError(400, 'Invalid agent working directory') }
  const sessionId = tab.sessionIds?.[JSON.stringify([tab.runtime, cwd])]
  return sessionId ? { runtime: tab.runtime, cwd, sessionId } : null
}

/** Saved display history is account-tab scoped and never starts or connects an agent. */
export async function readAgentTabPreview(
  currentAuth: () => RequestAuth,
  workspace: unknown,
  tab: unknown,
  readPreview: typeof readAgentHistoryPreview = readAgentHistoryPreview,
): Promise<HistoryPreview<AgentEvent> | null> {
  const email = account(currentAuth())
  if (typeof workspace !== 'string' || !path.isAbsolute(workspace) || workspace.length > 4096
    || typeof tab !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(tab)) {
    throw new AgentTabPreviewError(400, 'Invalid agent tab request')
  }
  try { resolveAgentCwd(workspace, workspace) }
  catch { throw new AgentTabPreviewError(400, 'Invalid workspace directory') }
  const before = target(email, workspace, tab)
  if (!before) return null
  const preview = await readPreview(before.runtime, before.cwd, before.sessionId, { deferWork: true, turns: 3 })
  if (account(currentAuth()) !== email) throw new AgentTabPreviewError(403, 'Agent account changed')
  const after = target(email, workspace, tab)
  if (!after || after.runtime !== before.runtime || after.cwd !== before.cwd || after.sessionId !== before.sessionId) return null
  return preview
}
