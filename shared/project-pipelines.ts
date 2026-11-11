import type { ProjectActionRun } from './project-actions.ts'
import type { ReleaseProviderRun } from './release-providers.ts'

export type ProjectPipelineStep =
  | { id: string; name: string; type: 'action'; actionId: string }
  | { id: string; name: string; type: 'provider'; connectionId: string }

export interface ProjectPipeline {
  id: string
  name: string
  purpose: 'preview' | 'publish'
  steps: ProjectPipelineStep[]
  resultUrl?: string
}

export type ProjectPipelineRunStatus = 'running' | 'succeeded' | 'failed' | 'interrupted' | 'unknown'
export type ProjectPipelineStepStatus = ProjectPipelineRunStatus | 'pending' | 'skipped'

export type ProjectPipelineStepRun = ProjectPipelineStep & {
  status: ProjectPipelineStepStatus
  startedAt?: string
  finishedAt?: string
  actionRun?: ProjectActionRun
  providerRun?: ReleaseProviderRun
  error?: string
}

export interface ProjectPipelineRun {
  id: string
  pipelineId: string
  name: string
  purpose: 'preview' | 'publish'
  status: ProjectPipelineRunStatus
  startedAt: string
  finishedAt?: string
  resultUrl?: string
  source: { commit?: string; dirty: boolean | null }
  steps: ProjectPipelineStepRun[]
  error?: string
}

export interface ProjectPipelinesState {
  projectRoot: string
  pipelines: ProjectPipeline[]
  runs: ProjectPipelineRun[]
  readiness: Record<string, { ready: boolean; issues: string[]; revision: string }>
  warnings: string[]
  needsAgent: boolean
}
