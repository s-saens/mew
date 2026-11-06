/** Browser identity is a routing hint; the server authenticates and validates both paths. */
export type WorkspaceScope = Readonly<{ workspacePath: string; projectPath: string }>

export const WORKSPACE_SCOPE_VERSION = 1 as const
export const WORKSPACE_SCOPE_QUERY = { workspacePath: 'mewWorkspacePath', projectPath: 'mewProjectPath' } as const

export function readWorkspaceScope(params: URLSearchParams): WorkspaceScope | null {
  const workspace = params.getAll(WORKSPACE_SCOPE_QUERY.workspacePath)
  const project = params.getAll(WORKSPACE_SCOPE_QUERY.projectPath)
  if (!workspace.length && !project.length) return null
  if (workspace.length !== 1 || project.length > 1) throw new Error('잘못된 프로젝트 범위입니다.')
  const workspacePath = workspace[0], projectPath = project[0] ?? workspacePath
  if ([workspacePath, projectPath].some(value => !value || value.length > 4096 || /[\0\r\n]/.test(value))) throw new Error('잘못된 프로젝트 경로입니다.')
  return { workspacePath, projectPath }
}

/** Works for fetch, WebSocket, download, and DOM resource paths without custom headers. */
export function workspaceScopeUrl(input: string, scope: WorkspaceScope): string {
  const url = new URL(input, 'http://mew.invalid')
  const existing = readWorkspaceScope(url.searchParams)
  if (existing && (existing.workspacePath !== scope.workspacePath || existing.projectPath !== scope.projectPath)) throw new Error('요청의 프로젝트 범위가 일치하지 않습니다.')
  url.searchParams.set(WORKSPACE_SCOPE_QUERY.workspacePath, scope.workspacePath)
  url.searchParams.set(WORKSPACE_SCOPE_QUERY.projectPath, scope.projectPath)
  return /^[a-z][a-z\d+.-]*:/i.test(input) ? url.href : `${url.pathname}${url.search}${url.hash}`
}
