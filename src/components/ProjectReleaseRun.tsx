import { useUiLocale } from '@mew/ui/i18n'
import { Check, Globe, RefreshDouble, WarningTriangle } from 'iconoir-react'
import type { ProjectPipelineRun, ProjectPipelineStepRun } from '../../shared/project-pipelines'
import type { ReleaseProviderRunState } from '../../shared/release-providers'
import type { ProjectReleaseCopy } from './project-release-copy'
import type { ProjectReleaseStore } from './ProjectReleaseState'
import { ProjectActionsResults } from './ProjectActionsResults'
import { projectActionsCopy } from './project-actions-copy'
import { projectReleaseResultUrl } from './project-release-view'

function providerState(state: ReleaseProviderRunState | 'pending' | 'skipped'): keyof Pick<ProjectReleaseCopy, 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped' | 'unknown'> {
  return state === 'queued' ? 'pending' : state === 'cancelled' ? 'failed' : state
}

function StepStatus({ status }: { status: ProjectPipelineStepRun['status'] }) {
  return <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${status === 'succeeded' ? 'bg-success/10 text-success-ink' : status === 'failed' || status === 'interrupted' || status === 'unknown' ? 'bg-danger/10 text-danger-strong' : status === 'running' ? 'bg-accent/15 text-accent' : 'bg-surface-hover text-ink-secondary'}`} aria-hidden="true">
    {status === 'succeeded' ? <Check width={14} height={14} /> : status === 'failed' || status === 'interrupted' || status === 'unknown' ? <WarningTriangle width={14} height={14} /> : status === 'running' ? <span className="h-2 w-2 rounded-full bg-current motion-safe:animate-pulse" /> : <span className="h-1.5 w-1.5 rounded-full bg-current opacity-50" />}
  </span>
}

export function ProjectReleaseRun({ run, copy, store, onPreview }: { run: ProjectPipelineRun; copy: ProjectReleaseCopy; store: ProjectReleaseStore; onPreview: ((url: string) => void) | null }) {
  const locale = useUiLocale(), actionCopy = projectActionsCopy(locale)
  const actionRuns = run.steps.flatMap(step => step.actionRun?.status === 'succeeded' && (step.actionRun.artifacts.length > 0 || step.actionRun.archive) ? [step.actionRun] : [])
  const logSteps = run.steps.filter(step => step.actionRun?.output && !actionRuns.some(action => action.id === step.actionRun!.id))
  const resultUrl = run.status === 'succeeded' ? projectReleaseResultUrl(run) : undefined
  const completion = run.purpose === 'publish' && resultUrl ? copy.published : run.purpose === 'preview' && (resultUrl || actionRuns.length) ? copy.made : copy.executionComplete
  return <article data-project-pipeline-run={run.id} className="min-w-0 rounded-lg border border-edge bg-surface-raised/40 p-3">
    <div className="mb-2 flex min-w-0 items-center gap-2"><StepStatus status={run.status} /><div className="min-w-0 flex-1"><h3 className="break-words text-sm font-semibold">{run.name}</h3><p className="text-xs text-ink-secondary">{run.status === 'succeeded' ? completion : copy[run.status]}</p><time dateTime={run.startedAt} className="text-[11px] text-ink-secondary">{Number.isNaN(Date.parse(run.startedAt)) ? run.startedAt : new Date(run.startedAt).toLocaleString(locale)}</time></div></div>
    <ol role={run.status === 'running' ? 'status' : undefined} aria-label={copy.progress} className="space-y-1.5">
      {run.steps.map(step => <li key={step.id} className="min-w-0">
        <div className="flex min-w-0 items-center gap-2"><StepStatus status={step.status} /><span className="min-w-0 flex-1 break-words text-xs">{step.name}</span><span className="shrink-0 text-[11px] text-ink-secondary">{copy[step.status]}</span></div>
        {step.error && <p className="ml-8 mt-1 select-text break-words text-xs text-danger-strong">{step.error}</p>}
        {step.providerRun && <div className="ml-8 mt-1 space-y-1">
          {step.providerRun.steps.map(remote => <div key={remote.id} className="flex min-w-0 items-center gap-2 text-[11px] text-ink-secondary"><span className="min-w-0 flex-1 break-words">{remote.label}</span><span>{copy[providerState(remote.state)]}</span></div>)}
          {(step.providerRun.state === 'unknown' || step.status === 'unknown') && <button type="button" className="inline-flex items-center gap-1 rounded border border-edge px-2 py-1 text-xs hover:bg-surface-hover" onClick={() => void store.refreshProvider(step.providerRun!.id)}><RefreshDouble width={13} height={13} aria-hidden="true" />{copy.refresh}</button>}
          {run.status !== 'succeeded' && step.providerRun.state === 'succeeded' && step.providerRun.resultUrl && run.steps.find(item => item.providerRun?.state === 'succeeded' && item.providerRun.resultUrl === step.providerRun!.resultUrl)?.id === step.id && <button type="button" disabled={!onPreview} className="inline-flex items-center gap-1 rounded border border-edge px-2 py-1 text-xs hover:bg-surface-hover disabled:opacity-40" onClick={() => onPreview?.(step.providerRun!.resultUrl!)}><Globe width={13} height={13} aria-hidden="true" />{copy.openSite}</button>}
          {step.providerRun.url && <button type="button" disabled={!onPreview} className="inline-flex items-center gap-1 rounded px-1 py-1 text-xs text-ink-secondary hover:bg-surface-hover disabled:opacity-40" onClick={() => onPreview?.(step.providerRun!.url!)}><Globe width={13} height={13} aria-hidden="true" />{copy.openService}</button>}
        </div>}
      </li>)}
    </ol>
    {run.status === 'failed' && <p className="mt-2 text-xs text-ink-secondary">{copy.failedHint}</p>}
    {(run.status === 'unknown' || run.status === 'interrupted') && <p className="mt-2 text-xs text-ink-secondary">{run.status === 'unknown' ? copy.unknownHint : copy.interruptedHint}</p>}
    {run.error && <p role="alert" className="mt-1 select-text break-words text-xs text-danger-strong">{run.error}</p>}
    {resultUrl && <button type="button" disabled={!onPreview} className="mt-2 inline-flex items-center gap-1.5 rounded bg-accent px-2.5 py-2 text-xs font-medium text-ink-on-accent hover:bg-accent-strong disabled:opacity-40" onClick={() => onPreview?.(resultUrl)}><Globe width={15} height={15} aria-hidden="true" />{copy.openSite}</button>}
    {actionRuns.length > 0 && <ProjectActionsResults runs={actionRuns} copy={actionCopy} onPreview={onPreview} artifactUrl={store.artifactUrl} archiveUrl={store.archiveUrl} showHeading={false} />}
    {run.status === 'succeeded' && !resultUrl && !actionRuns.length && <p className="mt-2 text-xs leading-relaxed text-ink-secondary">{copy.noResult}</p>}
    {logSteps.length > 0 && <details className="mt-2"><summary className="cursor-pointer text-xs text-ink-secondary">{copy.logs}</summary>{logSteps.map(step => <div key={step.id} className="mt-2"><div className="text-xs font-medium">{step.name}</div><pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-surface p-2 font-mono text-[11px]">{step.actionRun!.output || actionCopy.noOutput}</pre></div>)}</details>}
  </article>
}
