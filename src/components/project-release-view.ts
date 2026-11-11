import type { ProjectActionRun } from '../../shared/project-actions.ts'
import type { ProjectPipelineRun } from '../../shared/project-pipelines.ts'

export function projectReleaseResultUrl(run?: ProjectPipelineRun) {
  if (run?.resultUrl) return run.resultUrl
  for (const step of [...(run?.steps ?? [])].reverse()) {
    if (step.providerRun?.resultUrl) return step.providerRun.resultUrl
    if (step.actionRun?.previewUrl) return step.actionRun.previewUrl
  }
}

type AvailableResult = { action?: ProjectActionRun; url?: string; at: string }
const hasResult = (run: ProjectActionRun) => !!run.previewUrl || run.artifacts.length > 0 || !!run.archive
const happenedAt = (run: { startedAt: string; finishedAt?: string }) => run.finishedAt ?? run.startedAt

/** Keep a usable result visible when a later run fails or finishes without an output. */
export function latestProjectReleaseResult(pipelines: ProjectPipelineRun[], actions: ProjectActionRun[]): AvailableResult | undefined {
  const successfulActions = [...actions, ...pipelines.flatMap(run => run.steps.flatMap(step => step.status === 'succeeded' && step.actionRun ? [step.actionRun] : []))]
    .filter(run => run.kind === 'build' && run.status === 'succeeded' && hasResult(run))
  const results: AvailableResult[] = successfulActions.map(action => ({ action, ...(action.previewUrl ? { url: action.previewUrl } : {}), at: happenedAt(action) }))
  for (const run of pipelines) {
    if (run.purpose !== 'preview' || run.status !== 'succeeded') continue
    const url = projectReleaseResultUrl(run)
    if (!url) continue
    const action = run.steps.flatMap(step => step.status === 'succeeded' && step.actionRun?.status === 'succeeded' && hasResult(step.actionRun) ? [step.actionRun] : [])
      .sort((a, b) => happenedAt(b).localeCompare(happenedAt(a)))[0]
    results.push({ ...(action ? { action } : {}), url, at: happenedAt(run) })
  }
  return results.sort((a, b) => b.at.localeCompare(a.at))[0]
}
