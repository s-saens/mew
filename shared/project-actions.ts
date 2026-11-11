/** Project-owned, manually editable build and deployment actions. */
export interface ProjectAction {
  id: string
  name: string
  kind: 'build' | 'deploy'
  variant?: 'debug' | 'release' | 'custom'
  command: string
  previewUrl?: string
  artifacts?: string[]
}

export interface ProjectActionArtifact {
  path: string
  name: string
  size?: number
}

export interface ProjectActionRun {
  id: string
  actionId: string
  name: string
  kind: 'build' | 'deploy'
  status: 'running' | 'succeeded' | 'failed'
  startedAt: string
  finishedAt?: string
  exitCode?: number | null
  output: string
  previewUrl?: string
  artifacts: ProjectActionArtifact[]
  archive?: { name: string; fileCount: number; size: number }
}

export interface ProjectActionsState {
  projectRoot: string
  actions: ProjectAction[]
  runs: ProjectActionRun[]
  warnings: string[]
  needsAgent: boolean
}
