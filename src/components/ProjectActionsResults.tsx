import { Check, Download, Globe, Page, WarningTriangle } from 'iconoir-react'
import type { ProjectActionRun } from '../../shared/project-actions'
import type { ProjectActionsCopy } from './project-actions-copy'
import { DownloadLink } from './DownloadLink'

function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

export function ProjectActionsResults({ runs, copy, onPreview, artifactUrl, archiveUrl, onConfigure, canConfigure, showHeading = true }: {
  runs: ProjectActionRun[]
  copy: ProjectActionsCopy
  onPreview: ((url: string) => void) | null
  artifactUrl: (runId: string, path: string) => string
  archiveUrl: (runId: string) => string
  onConfigure?: (run: ProjectActionRun) => void
  canConfigure?: (run: ProjectActionRun) => boolean
  showHeading?: boolean
}) {
  if (!runs.length) return null
  return <section aria-label={copy.results} className={showHeading ? 'mt-4 border-t border-edge pt-3' : 'mt-2'}>
    {showHeading && <h3 className="mb-2 text-xs font-medium text-ink-secondary">{copy.results}</h3>}
    <div className="space-y-2">
      {runs.map(run => {
        const StatusIcon = run.status === 'succeeded' ? Check : run.status === 'failed' ? WarningTriangle : null
        const hasResult = !!run.previewUrl || run.artifacts.length > 0
        const artifacts = [...run.artifacts].sort((a, b) => {
          const rank = (name: string) => /\.(apk|aab|exe|dmg|msi|zip|tar|gz)$/i.test(name) ? 0 : /^index\.html?$/i.test(name) ? 1 : 2
          return rank(a.name) - rank(b.name)
        })
        const renderArtifact = (artifact: ProjectActionRun['artifacts'][number]) => {
          const duplicate = artifacts.some(other => other !== artifact && other.name === artifact.name)
          const extension = artifact.name.includes('.') ? artifact.name.split('.').pop()?.toUpperCase() : ''
          const metadata = [extension, artifact.size == null ? '' : fileSize(artifact.size)].filter(Boolean).join(' · ')
          return <DownloadLink key={artifact.path} href={artifactUrl(run.id, artifact.path)} name={artifact.name}
            className="flex w-full min-w-0 items-center gap-2 rounded-md border border-edge px-2 py-2 text-left text-xs hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-ink">
            <span className="sr-only">{copy.download} {artifact.name}{duplicate ? ` (${artifact.path})` : ''}</span>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-surface-raised text-ink-secondary"><Page width={16} height={16} aria-hidden="true" /></span>
            <span aria-hidden="true" className="min-w-0 flex-1"><span className="block break-all font-medium">{artifact.name}</span>{duplicate && <span className="block break-all text-ink-secondary">{artifact.path}</span>}{metadata && <span className="block text-ink-secondary">{metadata}</span>}</span>
            <Download width={16} height={16} className="shrink-0 text-ink-secondary" aria-hidden="true" />
          </DownloadLink>
        }
        return <article key={run.id} data-project-action-run={run.id} className="min-w-0 overflow-hidden rounded-lg border border-edge">
          <div className="flex min-w-0 items-center gap-2 bg-surface-raised px-3 py-2">
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${run.status === 'succeeded' ? 'bg-success/10 text-success-ink' : run.status === 'failed' ? 'bg-danger/10 text-danger-strong' : 'bg-surface-hover text-ink-secondary'}`} aria-hidden="true">
              {StatusIcon ? <StatusIcon width={16} height={16} /> : <span className="h-2 w-2 rounded-full bg-current" />}
            </span>
            <div className="min-w-0 flex-1"><div className="break-words text-sm font-medium">{run.name}</div>
              <div role="status" className={`text-xs ${run.status === 'failed' ? 'text-danger-strong' : 'text-ink-secondary'}`}>{copy[run.status]}</div>
            </div>
          </div>
          <div className="px-3 py-2">
            {run.status === 'succeeded' && <>
              {run.previewUrl && <button type="button" disabled={!onPreview} aria-label={copy.preview} data-tip={onPreview ? copy.preview : copy.previewUnavailable}
                className="mb-2 inline-flex max-w-full items-center gap-2 rounded-md border border-edge bg-surface-raised px-2.5 py-2 text-xs font-medium hover:bg-surface-hover disabled:opacity-40" onClick={() => onPreview?.(run.previewUrl!)}>
                <Globe width={16} height={16} aria-hidden="true" />{copy.preview}
              </button>}
              {run.artifacts.length > 0 && <div>
                <div className="mb-1.5 text-xs font-medium text-ink-secondary">{copy.buildFiles}</div>
                {run.archive && <DownloadLink href={archiveUrl(run.id)} name={run.archive.name}
                  className="mb-1 flex w-full items-center gap-2 rounded-md border border-edge bg-surface-raised px-2 py-2 text-left text-xs hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-ink">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-surface text-ink-secondary"><Download width={16} height={16} aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1"><span className="block font-medium">{copy.downloadAll}</span><span className="block text-ink-secondary">{run.archive.name} · {copy.archiveFiles.replace('{count}', String(run.archive.fileCount))} · {copy.archiveSize.replace('{size}', fileSize(run.archive.size))}</span></span>
                </DownloadLink>}
                <div className="space-y-1">{artifacts.slice(0, 3).map(renderArtifact)}</div>
                {artifacts.length > 3 && <details className="mt-1"><summary className="cursor-pointer py-1 text-xs text-ink-secondary">{copy.moreFiles.replace('{count}', String(artifacts.length - 3))}</summary><div className="space-y-1">{artifacts.slice(3).map(renderArtifact)}</div></details>}
              </div>}
              {!hasResult && <div className="rounded-md bg-surface-raised px-2.5 py-2 text-xs text-ink-secondary">
                <p>{copy.noResults}</p><p className="mt-1">{copy.noResultsHint}</p>
                {onConfigure && (!canConfigure || canConfigure(run)) && <button type="button" aria-label={copy.configureResult.replace('{name}', run.name)} className="mt-2 rounded border border-edge px-2 py-1 text-ink hover:bg-surface-hover" onClick={() => onConfigure(run)}>{copy.configure}</button>}
              </div>}
            </>}
            <details className={run.status === 'succeeded' ? 'mt-2' : ''}>
              <summary className="cursor-pointer text-xs text-ink-secondary">{copy.output}</summary>
              <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-surface-raised p-2 font-mono text-[11px] leading-relaxed">{run.output || copy.noOutput}</pre>
            </details>
          </div>
        </article>
      })}
    </div>
  </section>
}
