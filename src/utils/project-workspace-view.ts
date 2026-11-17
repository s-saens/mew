export type ProjectWorkspaceView = 'loading' | 'setup' | 'workspace'

export function projectWorkspaceView({ canOpenProjects, shortcutsLoaded, paths, hasProject }: {
  canOpenProjects: boolean
  shortcutsLoaded: boolean
  paths: readonly string[]
  hasProject: boolean | null
}): ProjectWorkspaceView {
  void paths
  if (hasProject === null || canOpenProjects && !shortcutsLoaded) return 'loading'
  if (canOpenProjects && !hasProject) return 'setup'
  return 'workspace'
}
