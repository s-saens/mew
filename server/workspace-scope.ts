import fs from 'node:fs'
import path from 'node:path'
import type { IncomingMessage } from 'node:http'
import { readWorkspaceScope, type WorkspaceScope } from '../shared/workspace-scope.ts'
import { projectRegistry } from './project-registry.ts'
import { assertNotServerDataPath, pathsForWorkspace, workspaceContext, type WorkspacePaths } from './paths.ts'
import { runAccountWorkspace } from './account-workspace.ts'
import type { RequestAuth } from './reqAuth.ts'

export class WorkspaceScopeError extends Error {
  readonly status: number
  constructor(message: string, status = 400) { super(message); this.status = status }
}

function directory(value: string): string {
  if (typeof value !== 'string' || !value || value.length > 4096 || /[\0\r\n]/.test(value) || !path.isAbsolute(value)) throw new WorkspaceScopeError('프로젝트 폴더의 절대 경로가 필요합니다.')
  let canonical: string
  try {
    canonical = fs.realpathSync(value)
    if (!fs.statSync(canonical).isDirectory()) throw new Error('Not a directory')
  } catch { throw new WorkspaceScopeError('프로젝트 폴더를 찾을 수 없습니다.', 404) }
  try { assertNotServerDataPath(canonical) } catch { throw new WorkspaceScopeError('프로젝트 폴더에 접근할 수 없습니다.', 403) }
  return canonical
}

/** Git's reciprocal metadata establishes membership without starting a Git subprocess per request. */
function repository(root: string): { common: string; git: string; linked: boolean } {
  const marker = path.join(root, '.git'), stat = fs.statSync(marker)
  if (stat.isDirectory()) return { common: fs.realpathSync(marker), git: fs.realpathSync(marker), linked: false }
  const match = /^gitdir: ([^\r\n]+)\r?\n?$/.exec(fs.readFileSync(marker, 'utf8'))
  if (!match) throw new Error('Invalid Git metadata')
  const git = fs.realpathSync(path.resolve(root, match[1]))
  const common = fs.realpathSync(path.resolve(git, fs.readFileSync(path.join(git, 'commondir'), 'utf8').trim()))
  if (path.dirname(git) !== fs.realpathSync(path.join(common, 'worktrees'))
    || fs.realpathSync(path.resolve(git, fs.readFileSync(path.join(git, 'gitdir'), 'utf8').trim())) !== fs.realpathSync(marker)) throw new Error('Unregistered worktree')
  return { common, git, linked: true }
}

export function assertWorkspaceWorktree(projectPath: string, workspacePath: string): void {
  if (projectPath === workspacePath) return
  try {
    const project = repository(projectPath), workspace = repository(workspacePath)
    if (project.common !== workspace.common || !project.linked && !workspace.linked) throw new Error('Unrelated repositories')
  } catch { throw new WorkspaceScopeError('프로젝트에 연결된 worktree만 열 수 있습니다.') }
}

export function resolveWorkspaceScope(auth: RequestAuth, requested: WorkspaceScope): WorkspacePaths {
  if (!auth.email || auth.role === 'guest' || auth.mustChangePassword) throw new WorkspaceScopeError('로그인이 필요합니다.', 403)
  if (auth.role === 'member' && (typeof requested.workspacePath !== 'string' || typeof requested.projectPath !== 'string'
    || !path.isAbsolute(requested.workspacePath) || !path.isAbsolute(requested.projectPath)
    || path.resolve(requested.workspacePath) !== path.resolve(requested.projectPath) || !projectRegistry.has(requested.projectPath))) {
    throw new WorkspaceScopeError('등록된 프로젝트만 열 수 있습니다.', 403)
  }
  const root = directory(requested.workspacePath), projectPath = directory(requested.projectPath)
  if (auth.role === 'member' && (root !== projectPath || !projectRegistry.has(projectPath))) throw new WorkspaceScopeError('등록된 프로젝트만 열 수 있습니다.', 403)
  assertWorkspaceWorktree(projectPath, root)
  return { ...pathsForWorkspace(root, auth.email), projectPath, explicit: true }
}

export function requestWorkspaceScope(req: Pick<IncomingMessage, 'url'>): WorkspaceScope | null {
  try { return readWorkspaceScope(new URL(req.url ?? '', 'http://localhost').searchParams) }
  catch (error) { throw new WorkspaceScopeError(error instanceof Error ? error.message : '잘못된 프로젝트 범위입니다.') }
}

/** Both presentation modes share execution identity for newly created authenticated resources. */
export function currentWorkspaceScope(): WorkspaceScope | null {
  const context = workspaceContext.getStore()
  return context?.account ? { workspacePath: fs.realpathSync(context.root), projectPath: fs.realpathSync(context.projectPath ?? context.root) } : null
}

export function runRequestWorkspace<T>(req: Pick<IncomingMessage, 'url'>, auth: RequestAuth, action: () => T): T {
  const requested = requestWorkspaceScope(req)
  return requested ? workspaceContext.run(resolveWorkspaceScope(auth, requested), action) : runAccountWorkspace(auth.email, action)
}

/** Recheck a captured connection without following the account's later project selection. */
export function workspaceScopeAllowed(scope: WorkspacePaths, auth: RequestAuth): boolean {
  if (scope.account !== auth.email) return false
  if (!scope.explicit) return true
  try {
    const current = resolveWorkspaceScope(auth, { workspacePath: scope.root, projectPath: scope.projectPath ?? scope.root })
    return current.root === scope.root && current.docsRoot === scope.docsRoot && current.projectPath === scope.projectPath
  } catch { return false }
}
