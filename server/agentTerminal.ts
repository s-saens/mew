import crypto from 'node:crypto'
import { AGENT_TERMINAL_SESSION_PREFIX, createDirectTerminal, directTerminalNames, stopDirectTerminal, type DirectTerminalKind, type TmuxManager } from '@mew/tmux-term/server'
import { findExecutable, RUNTIMES, resolvedTerminalSpec } from './agentRuntimes.ts'
import { spawnSpecCommand } from './spawnSpecCommand.ts'
import { agentGitEnv } from './agent-git-identity.ts'
import { workspaceContext } from './paths.ts'
import { terminalGitBootstrap } from './terminal-git-bootstrap.ts'
import type { WorkspaceScope } from '../shared/workspace-scope.ts'

export { AGENT_TERMINAL_SESSION_PREFIX }
const TAB_ID = /^[A-Za-z0-9_-]{1,64}$/

export class AgentTerminalError extends Error {}
export type AgentTerminalIdentity = WorkspaceScope & { account: string }
type TerminalOptions = { allowLegacy?: boolean }
export function isDirectTerminal(runtime: string): runtime is DirectTerminalKind {
  return runtime === 'shell' || runtime === 'zellij' || runtime === 'screen'
}
export function isShellTerminal(runtime: string): boolean { return runtime === 'tmux' || isDirectTerminal(runtime) }

export function terminalBackends() {
  return [
    { id: 'shell', label: 'Terminal', installed: true },
    { id: 'tmux', label: 'tmux', installed: !!findExecutable(process.env.MEW_MULTIPLEXER || (process.platform === 'win32' ? 'psmux' : 'tmux')) },
    { id: 'zellij', label: 'Zellij', installed: !!findExecutable('zellij') },
    { id: 'screen', label: 'GNU Screen', installed: !!findExecutable('screen') },
  ]
}

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
  if (isDirectTerminal(runtime)) {
    if (!terminalBackends().find(item => item.id === runtime)?.installed) throw new AgentTerminalError(`${runtime} is not installed`)
    const names = new Set(directTerminalNames())
    const qualified = directSessionName(runtime, tab, identity)
    const legacy = directSessionName(runtime, tab)
    const session = !names.has(qualified) && options.allowLegacy && names.has(legacy) ? legacy : qualified
    const account = identity?.account ?? workspaceContext.getStore()?.account
    const env = !names.has(session) && account ? agentGitEnv(process.env, account) : process.env
    createDirectTerminal(session, runtime, cwd, env)
    return { session }
  }
  const entry = RUNTIMES[runtime]
  const spec = resolvedTerminalSpec(runtime)
  if (entry?.surface !== 'terminal' || !spec) throw new AgentTerminalError('터미널형 에이전트 런타임이 아닙니다')
  const names = new Set((await manager.list()).map(item => item.name))
  const session = selectedSession(names, runtime, tab, identity, options)
  const running = names.has(session)
  if (!running) {
    const account = identity?.account ?? workspaceContext.getStore()?.account
    if (entry.terminalLaunch === 'shell' && account) {
      const bootstrap = terminalGitBootstrap(agentGitEnv(process.env, account))
      try { await manager.startCommand(session, bootstrap.command, cwd) } catch (error) { bootstrap.cleanup(); throw error }
    }
    else if (entry.terminalLaunch === 'shell') await manager.create(session, cwd)
    else await manager.runCommand(session, spawnSpecCommand(spec), cwd)
  }
  return { session }
}

export async function stopAgentTerminal(manager: TmuxManager, runtime: string, tab: string, identity?: AgentTerminalIdentity, options: TerminalOptions = {}): Promise<void> {
  if (isDirectTerminal(runtime)) {
    const names = new Set(directTerminalNames())
    const qualified = directSessionName(runtime, tab, identity)
    const legacy = directSessionName(runtime, tab)
    const session = !names.has(qualified) && options.allowLegacy && names.has(legacy) ? legacy : qualified
    await stopDirectTerminal(session, runtime)
    return
  }
  if (RUNTIMES[runtime]?.surface !== 'terminal') throw new AgentTerminalError('터미널형 에이전트 런타임이 아닙니다')
  const names = new Set((await manager.list()).map(item => item.name))
  const session = selectedSession(names, runtime, tab, identity, options)
  if (names.has(session)) await manager.kill(session)
}

function directSessionName(runtime: DirectTerminalKind, tab: string, identity?: AgentTerminalIdentity): string {
  return `mewdirect-${agentTerminalSessionName(runtime, tab, identity).slice(AGENT_TERMINAL_SESSION_PREFIX.length)}`
}
