import { useEffect, useId, useMemo, useState, useSyncExternalStore } from 'react'
import { DialogFrame, HoverTipLayer, LoadingIndicator, SelectField } from '@mew/ui'
import { useUiLocale } from '@mew/ui/i18n'
import { CloudUpload, EditPencil, Eye, Globe, Play, Plus, RefreshDouble } from 'iconoir-react'
import type { ProjectPipeline } from '../../shared/project-pipelines'
import type { ReleaseConnectionSummary } from '../../shared/release-providers'
import { useWorkspaceApi } from '../api/workspace-api-context'
import { useWorkspaceBrowser } from '../workspace/workspace-browser-context'
import { useProjectSetup } from '../workspace/project-setup-context'
import { uuid } from '../utils/uuid'
import type { ProjectActionsScope } from './ProjectActionsState'
import { ProjectActionsResults } from './ProjectActionsResults'
import { projectActionsCopy } from './project-actions-copy'
import { ProjectReleaseRun } from './ProjectReleaseRun'
import { latestProjectReleaseResult } from './project-release-view'
import { ProjectReleaseConnectionEditor } from './ProjectReleaseConnectionEditor'
import { ProjectReleasePipelineEditor } from './ProjectReleasePipelineEditor'
import { projectReleaseStore, type ProjectReleaseStore } from './ProjectReleaseState'
import { projectReleaseCopy } from './project-release-copy'
import { PanelCloseButton } from './panel-close-button'

function destination(connection: ReleaseConnectionSummary) {
  const config = connection.config
  return config.provider === 'github-actions' ? `${config.owner}/${config.repo} · ${config.ref}`
    : config.provider === 'cloudflare-pages' ? `${config.projectName} · ${config.branch}` : `${config.projectId} · ${config.branch}`
}

export function ProjectReleaseDialog({ scope, store: providedStore, onClose, onAdvanced }: {
  scope: ProjectActionsScope
  store?: ProjectReleaseStore
  onClose: () => void
  onAdvanced?: (kind: 'build' | 'deploy') => void
}) {
  const api = useWorkspaceApi(), browser = useWorkspaceBrowser(), setup = useProjectSetup(), locale = useUiLocale()
  const copy = projectReleaseCopy(locale), actionCopy = projectActionsCopy(locale), title = useId(), reviewTitle = useId()
  const { project, directory, workspacePath } = scope
  const store = useMemo(() => providedStore ?? projectReleaseStore(api, { project, directory, workspacePath }), [api, project, directory, workspacePath, providedStore])
  const { state, providers, actions, loading, busy, error } = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const [selected, setSelected] = useState<{ preview?: string; publish?: string }>({})
  const [editing, setEditing] = useState<{ pipeline: ProjectPipeline; isNew: boolean } | null>(null)
  const [connectionEditor, setConnectionEditor] = useState<{ connection?: ReleaseConnectionSummary } | null>(null)
  const [review, setReview] = useState<{ pipeline: ProjectPipeline; revision?: string; connections: ReleaseConnectionSummary[]; urls: string[] } | null>(null), [showResult, setShowResult] = useState(false)
  const [portal, setPortal] = useState<HTMLDivElement | null>(null)
  useEffect(() => { void store.load() }, [store])
  const pipelines = state?.pipelines ?? [], connections = providers?.connections ?? [], runs = state?.runs ?? []
  const choices = (purpose: ProjectPipeline['purpose']) => pipelines.filter(pipeline => pipeline.purpose === purpose)
  const pick = (purpose: ProjectPipeline['purpose']) => choices(purpose).find(pipeline => pipeline.id === selected[purpose]) ?? choices(purpose)[0]
  const preview = pick('preview'), publish = pick('publish'), running = runs.some(run => run.status === 'running')
  const latest = [...runs].sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]
  const active = runs.find(run => run.status === 'running') ?? latest
  const result = latestProjectReleaseResult(runs, actions?.runs ?? [])
  const resultAction = result?.action, resultUrl = result?.url
  const hasFiles = !!resultAction?.artifacts.length || !!resultAction?.archive
  const hasResult = !!resultUrl || hasFiles
  const prepare = () => { const root = state?.projectRoot; if (root && setup) setup({ projectPath: root, projectName: root.split('/').filter(Boolean).at(-1) ?? scope.project, setupTitle: copy.setup, onClose: () => { void store.load() } }) }
  const ready = (pipeline?: ProjectPipeline) => !!pipeline && state?.readiness[pipeline.id]?.ready !== false
  const selector = (purpose: ProjectPipeline['purpose']) => choices(purpose).length > 1 ? <SelectField compact label={`${copy.selectFlow} · ${purpose === 'preview' ? copy.preview : copy.public}`} value={pick(purpose)!.id} disabled={busy || running} options={choices(purpose).map(pipeline => ({ value: pipeline.id, label: pipeline.name }))} onChange={id => setSelected({ ...selected, [purpose]: id })} /> : null
  const reviewConnections = review?.connections ?? []
  const reviewChanged = !!review && (state?.readiness[review.pipeline.id]?.revision !== review.revision || JSON.stringify(pipelines.find(pipeline => pipeline.id === review.pipeline.id)) !== JSON.stringify(review.pipeline))
  const openReview = (pipeline: ProjectPipeline) => setReview({ pipeline, revision: state?.readiness[pipeline.id]?.revision,
    connections: pipeline.steps.flatMap(step => step.type === 'provider' ? connections.filter(connection => connection.id === step.connectionId) : []),
    urls: [...new Set([pipeline.resultUrl, ...pipeline.steps.flatMap(step => step.type === 'action' ? actions?.actions.filter(action => action.id === step.actionId).map(action => action.previewUrl) ?? [] : [])].filter((url): url is string => !!url))],
  })
  return <>
    <DialogFrame labelledBy={title} onClose={onClose} className="max-h-[90dvh] max-w-2xl overflow-y-auto max-sm:max-w-[calc(100vw-16px)]">
      <HoverTipLayer portalTarget={portal}><div ref={setPortal} className="p-3" data-project-release-dialog>
        <header className="mb-3 flex items-center gap-2"><h2 id={title} className="min-w-0 flex-1 text-base font-semibold">{copy.title}</h2><button type="button" aria-label={copy.refresh} data-tip={copy.refresh} disabled={busy || loading} className="rounded p-1.5 text-ink-secondary hover:bg-surface-hover disabled:opacity-40" onClick={() => void store.load()}><RefreshDouble width={16} height={16} aria-hidden="true" /></button><PanelCloseButton aria-label={copy.close} onClick={onClose} /></header>
        {loading && !state && <div role="status" aria-label={copy.loading} className="flex justify-center py-3"><LoadingIndicator /></div>}
        {error && <div role="alert" className="mb-2 flex min-w-0 items-start gap-2 rounded border border-edge p-2"><p className="min-w-0 flex-1 select-text break-words text-xs text-danger-strong">{error}</p><button type="button" disabled={busy || loading} className="shrink-0 rounded border border-edge px-2 py-1 text-xs hover:bg-surface-hover disabled:opacity-40" onClick={() => void store.load()}>{copy.retry}</button></div>}
        {state && <>
          <div className="grid gap-2 sm:grid-cols-2">
            <section aria-label={copy.resultTitle} className="flex min-w-0 flex-col rounded-xl border border-edge bg-surface-raised/40 p-3">
              <div className="mb-2 flex items-center gap-2"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent"><Eye width={19} height={19} aria-hidden="true" /></span><h3 className="text-sm font-semibold">{copy.resultTitle}</h3></div>
              <p className="mb-2 text-xs leading-relaxed text-ink-secondary">{hasResult ? copy.resultReady : copy.resultEmpty}</p>
              <div className="mt-auto space-y-2">{selector('preview')}<div className="flex flex-wrap items-center gap-2">
                {hasResult && <button type="button" disabled={!browser && !hasFiles} data-tip={!browser && !hasFiles ? actionCopy.previewUnavailable : undefined} className="inline-flex items-center gap-1.5 rounded bg-accent px-2.5 py-2 text-xs font-medium text-ink-on-accent hover:bg-accent-strong disabled:opacity-40" onClick={() => { if (resultUrl && browser) browser(resultUrl); else setShowResult(value => !value) }}><Eye width={15} height={15} aria-hidden="true" />{copy.viewResult}</button>}
                {preview && ready(preview) ? <button type="button" disabled={busy || running} className={`inline-flex items-center gap-1.5 rounded px-2.5 py-2 text-xs ${hasResult ? 'border border-edge hover:bg-surface-hover' : 'bg-accent font-medium text-ink-on-accent hover:bg-accent-strong'} disabled:opacity-40`} onClick={() => void store.run(preview.id)}><Play width={14} height={14} aria-hidden="true" />{running && active?.purpose === 'preview' ? copy.creating : copy.create}</button>
                  : <button type="button" disabled={busy || !setup} className="rounded border border-edge px-2.5 py-2 text-xs hover:bg-surface-hover disabled:opacity-40" onClick={prepare}>{copy.prepare}</button>}
              </div></div>
            </section>
            <section aria-label={copy.publishTitle} className="flex min-w-0 flex-col rounded-xl border border-edge bg-surface-raised/40 p-3">
              <div className="mb-2 flex items-center gap-2"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent"><CloudUpload width={19} height={19} aria-hidden="true" /></span><h3 className="text-sm font-semibold">{copy.publishTitle}</h3></div>
              <p className="mb-2 text-xs leading-relaxed text-ink-secondary">{publish ? ready(publish) ? copy.publishReady : copy.setupRequired : copy.publishEmpty}</p>
              {publish && <p className="mb-2 break-words text-xs font-medium">{publish.name}</p>}
              <div className="mt-auto space-y-2">{selector('publish')}{publish && ready(publish) ? <button type="button" disabled={busy || running} className="inline-flex items-center gap-1.5 rounded bg-accent px-2.5 py-2 text-xs font-medium text-ink-on-accent hover:bg-accent-strong disabled:opacity-40" onClick={() => openReview(publish)}><CloudUpload width={15} height={15} aria-hidden="true" />{running && active?.purpose === 'publish' ? copy.publishing : copy.publish}</button>
                : <div className="flex flex-wrap gap-2">{!publish && <button type="button" disabled={busy} className="rounded bg-accent px-2.5 py-2 text-xs font-medium text-ink-on-accent hover:bg-accent-strong disabled:opacity-40" onClick={() => setConnectionEditor({})}>{copy.addConnection}</button>}<button type="button" disabled={busy || !setup} className="rounded border border-edge px-2.5 py-2 text-xs hover:bg-surface-hover disabled:opacity-40" onClick={prepare}>{copy.setup}</button></div>}</div>
            </section>
          </div>
          {showResult && resultAction && <ProjectActionsResults runs={[resultAction]} copy={actionCopy} onPreview={browser} artifactUrl={store.artifactUrl} archiveUrl={store.archiveUrl} />}
          {active && <section className="mt-3"><ProjectReleaseRun run={active} copy={copy} store={store} onPreview={browser} /></section>}
          {runs.length > 1 && <details className="mt-3"><summary className="cursor-pointer text-xs text-ink-secondary">{copy.history}</summary><div className="mt-2 space-y-2">{runs.filter(run => run.id !== active?.id).slice(0, 9).map(run => <ProjectReleaseRun key={run.id} run={run} copy={copy} store={store} onPreview={browser} />)}</div></details>}
          <details className="mt-3 border-t border-edge pt-2"><summary className="cursor-pointer py-1 text-xs text-ink-secondary">{copy.details}</summary>
            <section className="mt-2"><div className="mb-1 flex items-center gap-2"><h3 className="min-w-0 flex-1 text-xs font-medium">{copy.pipelines}</h3><button type="button" aria-label={copy.addPipeline} data-tip={copy.addPipeline} disabled={busy || running} className="rounded p-1.5 hover:bg-surface-hover disabled:opacity-40" onClick={() => setEditing({ isNew: true, pipeline: { id: uuid(), name: '', purpose: 'preview', steps: [] } })}><Plus width={15} height={15} aria-hidden="true" /></button></div>
              <div className="space-y-1">{pipelines.map(pipeline => <div key={pipeline.id} className="flex min-w-0 items-center gap-2 rounded border border-edge px-2 py-1"><div className="min-w-0 flex-1"><div className="break-words text-xs font-medium">{pipeline.name}</div><div className="text-[11px] text-ink-secondary">{pipeline.steps.length} · {pipeline.purpose === 'preview' ? copy.preview : copy.public}</div>{state.readiness[pipeline.id]?.issues.map(issue => <p key={issue} className="select-text break-words text-[11px] text-danger-strong">{issue}</p>)}</div><button type="button" disabled={busy || running} aria-label={`${copy.editPipeline} ${pipeline.name}`} data-tip={copy.editPipeline} className="rounded p-1.5 text-ink-secondary hover:bg-surface-hover disabled:opacity-40" onClick={() => setEditing({ pipeline, isNew: false })}><EditPencil width={15} height={15} aria-hidden="true" /></button></div>)}</div>
            </section>
            <section className="mt-3"><div className="mb-1 flex items-center gap-2"><h3 className="min-w-0 flex-1 text-xs font-medium">{copy.connections}</h3><button type="button" disabled={busy || running} className="inline-flex items-center gap-1 rounded border border-edge px-2 py-1.5 text-xs hover:bg-surface-hover disabled:opacity-40" onClick={() => setConnectionEditor({})}><Plus width={14} height={14} aria-hidden="true" />{copy.addConnection}</button></div>
              {!connections.length && <p className="text-xs text-ink-secondary">{copy.noConnections}</p>}
              <div className="space-y-1">{connections.map(connection => <div key={connection.id} className="flex min-w-0 items-center gap-2 rounded border border-edge px-2 py-2"><Globe width={16} height={16} className="shrink-0 text-ink-secondary" aria-hidden="true" /><div className="min-w-0 flex-1"><div className="break-words text-xs font-medium">{connection.label}</div><div className="break-words text-[11px] text-ink-secondary">{destination(connection)}</div><div className="text-[11px] text-ink-secondary">{connection.connected ? copy.credentialsSaved : copy.credentialsNeeded}</div></div><button type="button" disabled={busy || running} aria-label={`${copy.editConnection} ${connection.label}`} data-tip={copy.editConnection} className="rounded p-1.5 text-ink-secondary hover:bg-surface-hover disabled:opacity-40" onClick={() => setConnectionEditor({ connection })}><EditPencil width={15} height={15} aria-hidden="true" /></button></div>)}</div>
            </section>
            <div className="mt-3 flex flex-wrap items-center gap-2">{onAdvanced && <>{(['build', 'deploy'] as const).map(kind => <button key={kind} type="button" className="rounded border border-edge px-2 py-1.5 text-xs hover:bg-surface-hover" onClick={() => onAdvanced(kind)}>{kind === 'build' ? copy.commands : copy.deployment}</button>)}</>}<button type="button" disabled={busy || !setup} className="rounded border border-edge px-2 py-1.5 text-xs hover:bg-surface-hover disabled:opacity-40" onClick={prepare}>{copy.setup}</button></div>
            {state.warnings.map((warning, index) => <p key={index} className="mt-2 select-text break-words text-xs text-ink-secondary">{warning}</p>)}
          </details>
        </>}
      </div></HoverTipLayer>
    </DialogFrame>
    {review && <DialogFrame labelledBy={reviewTitle} onClose={() => setReview(null)} className="max-h-[90dvh] max-w-md overflow-y-auto max-sm:max-w-[calc(100vw-16px)]"><HoverTipLayer><div className="p-3">
      <header className="mb-2 flex items-center gap-2"><h2 id={reviewTitle} className="min-w-0 flex-1 text-base font-semibold">{copy.reviewTitle}</h2><PanelCloseButton aria-label={copy.close} onClick={() => setReview(null)} /></header>
      <p className="text-xs leading-relaxed text-ink-secondary">{copy.reviewHint}</p>
      <section className="mt-3 rounded-lg border border-edge p-2"><h3 className="mb-1 text-xs font-medium text-ink-secondary">{copy.target}</h3>{reviewConnections.length ? reviewConnections.map(connection => <div key={connection.id} className="mb-1 text-sm"><div className="font-medium">{connection.label}</div><div className="break-words text-xs text-ink-secondary">{destination(connection)}</div></div>) : <div className="text-sm"><p className="font-medium">{review.pipeline.name}</p><p className="text-xs text-ink-secondary">{copy.local}</p>{review.urls.map(url => <p key={url} className="mt-1 break-all text-xs text-ink-secondary">{url}</p>)}</div>}</section>
      {reviewConnections.length > 0 && <p className="mt-2 text-xs leading-relaxed text-ink-secondary">{copy.remoteVersion}</p>}
      <ol aria-label={copy.steps} className="mt-2 space-y-1">{review.pipeline.steps.map((step, index) => <li key={step.id} className="flex gap-2 text-xs"><span className="text-ink-secondary">{index + 1}</span><span className="break-words">{step.name}</span></li>)}</ol>
      {reviewChanged && <p role="alert" className="mt-2 text-xs text-danger-strong">{copy.reviewChanged}</p>}
      <footer className="mt-3 flex justify-end gap-2"><button type="button" className="rounded border border-edge px-2.5 py-2 text-xs hover:bg-surface-hover" onClick={() => setReview(null)}>{copy.cancel}</button><button type="button" disabled={busy || running || reviewChanged} className="rounded bg-accent px-3 py-2 text-xs font-medium text-ink-on-accent hover:bg-accent-strong disabled:opacity-40" onClick={() => { setReview(null); void store.run(review.pipeline.id, review.revision) }}>{copy.reviewPublish}</button></footer>
    </div></HoverTipLayer></DialogFrame>}
    {editing && <ProjectReleasePipelineEditor key={editing.pipeline.id} pipeline={editing.pipeline} actions={actions?.actions ?? []} connections={connections} copy={copy} onClose={() => setEditing(null)}
      onSave={pipeline => store.save(editing.isNew ? [...pipelines, pipeline] : pipelines.map(item => item.id === pipeline.id ? pipeline : item))}
      onDelete={editing.isNew ? undefined : () => store.save(pipelines.filter(pipeline => pipeline.id !== editing.pipeline.id))} />}
    {connectionEditor && <ProjectReleaseConnectionEditor connection={connectionEditor.connection} copy={copy} onClose={() => setConnectionEditor(null)} onSave={store.saveConnection} onDelete={connectionEditor.connection ? () => store.removeConnection(connectionEditor.connection!.id) : undefined} />}
  </>
}
