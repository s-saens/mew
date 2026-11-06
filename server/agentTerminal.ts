import crypto from 'node:crypto'
import { AGENT_TERMINAL_SESSION_PREFIX, type TmuxManager } from '@mew/tmux-term/server'
import { RUNTIMES, resolvedTerminalSpec } from './agentRuntimes.ts'
import { spawnSpecCommand } from './spawnSpecCommand.ts'
import type { WorkspaceScope } from '../shared/workspace-scope.ts'

export { AGENT_TERMINAL_SESSION_PREFIX }
const TAB_ID = /^[A-Za-z0-9_-]{1,64}$/

export class AgentTerminalError extends Error {}
export type AgentTerminalIdentity = WorkspaceScope & { account: string }
type TerminalOptions = { allowLegacy?: boolean }

function selectedSession(names: Set<string>, runtime: string, tab: string, identity: AgentTerminalIdentity | undefined, options: TerminalOptions): string {
  const qualified = agentTerminalSessionName(runtime, tab, identity)
  const legacy = agentTerminalSessionName(runtime, tab)
  return !names.has(qualified) && options.allowLegacy && names.has(legacy) ? legacy : qualified
}

/** Server-derived hashes keep terminal names valid and explicit workspace identities separate. */
export function agentTerminalSessionName(runtime: string, tab: string, identity?: AgentTerminalIdentity): string {
  if (!TAB_ID.test(tab)) throw new AgentTerminalError('에이전트 탭 id가 올바르지 않습니다')
  const key = identity ? JSON.stringify([identity.account, identity.projectPath, identity.workspacePath, runtime, tab]) : `${runtime}\0${tab}`
  const digest = crypto.createHash('sha256').update(key).digest('hex').slice(0, 24)
  return `${AGENT_TERMINAL_SESSION_PREFIX}${digest}`
}

export async function startAgentTerminal(
  manager: TmuxManager,
  runtime: string,
  tab: string,
  cwd: string,
  identity?: AgentTerminalIdentity,
  options: TerminalOptions = {},
): Promise<{ session: string }> {
  const entry = RUNTIMES[runtime]
  const spec = resolvedTerminalSpec(runtime)
  if (entry?.surface !== 'terminal' || !spec) throw new AgentTerminalError('터미널형 에이전트 런타임이 아닙니다')
  const names = new Set((await manager.list()).map(item => item.name))
  const session = selectedSession(names, runtime, tab, identity, options)
  const running = names.has(session)
  if (!running) {
    if (entry.terminalLaunch === 'shell') await manager.create(session, cwd)
    else await manager.runCommand(session, spawnSpecCommand(spec), cwd)
  }
  return { session }
}

export async function stopAgentTerminal(manager: TmuxManager, runtime: string, tab: string, identity?: AgentTerminalIdentity, options: TerminalOptions = {}): Promise<void> {
  if (RUNTIMES[runtime]?.surface !== 'terminal') throw new AgentTerminalError('터미널형 에이전트 런타임이 아닙니다')
  const names = new Set((await manager.list()).map(item => item.name))
  const session = selectedSession(names, runtime, tab, identity, options)
  if (names.has(session)) await manager.kill(session)
}
