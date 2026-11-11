import { Download, Globe } from 'iconoir-react'
import type { ProjectActionRun } from '../../shared/project-actions'
import type { ProjectActionsCopy } from './project-actions-copy'

export function ProjectActionsResults({ runs, copy, onPreview, artifactUrl, showHeading = true }: {
  runs: ProjectActionRun[]
  copy: ProjectActionsCopy
  onPreview: ((url: string) => void) | null
  artifactUrl: (runId: string, path: string) => string
  showHeading?: boolean
}) {
  if (!runs.length) return null
  return <section aria-label={copy.results} className={showHeading ? 'mt-3 border-t border-edge pt-3' : 'mt-2'}>
    {showHeading && <h3 className="mb-2 text-xs font-medium text-ink-secondary">{copy.results}</h3>}
    <div className="space-y-2">
      {runs.map(run => <article key={run.id} data-project-action-run={run.id} className="min-w-0 rounded border border-edge px-2 py-2">
        <div className="flex min-w-0 items-start justify-between gap-2 text-xs">
          <span className="min-w-0 break-words font-medium">{run.name}</span>
          <span role="status" className={`shrink-0 ${run.status === 'failed' ? 'text-danger-strong' : 'text-ink-secondary'}`}>{copy[run.status]}</span>
        </div>
        {run.status === 'succeeded' && (run.previewUrl || run.artifacts.length > 0) && <div className="mt-2 flex flex-wrap gap-2">
          {run.previewUrl && <button type="button" disabled={!onPreview} aria-label={copy.preview} data-tip={onPreview ? copy.preview : copy.previewUnavailable}
            className="inline-flex min-w-0 items-center gap-1 rounded border border-edge px-2 py-1 text-xs hover:bg-surface-hover disabled:opacity-40" onClick={() => onPreview?.(run.previewUrl!)}>
            <Globe width={14} height={14} aria-hidden="true" />{copy.preview}
          </button>}
          {run.artifacts.map(artifact => <a key={artifact.path} href={artifactUrl(run.id, artifact.path)} download={artifact.name}
            aria-label={`${copy.download} ${artifact.name}`} className="inline-flex min-w-0 max-w-full items-center gap-1 rounded border border-edge px-2 py-1 text-xs hover:bg-surface-hover">
            <Download width={14} height={14} className="shrink-0" aria-hidden="true" /><span className="truncate">{artifact.name}</span>
          </a>)}
        </div>}
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-ink-secondary">{copy.output}</summary>
          <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-surface-raised p-2 font-mono text-[11px] leading-relaxed">{run.output || copy.noOutput}</pre>
        </details>
      </article>)}
    </div>
  </section>
}
