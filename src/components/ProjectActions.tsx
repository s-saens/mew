import { useEffect, useId, useMemo, useState, useSyncExternalStore } from 'react'
import { DialogFrame, HoverTipLayer, LoadingIndicator } from '@mew/ui'
import { useUiLocale } from '@mew/ui/i18n'
import { EditPencil, Plus, RefreshDouble } from 'iconoir-react'
import type { ProjectAction } from '../../shared/project-actions'
import { useWorkspaceApi } from '../api/workspace-api-context'
import { uuid } from '../utils/uuid'
import { useWorkspaceBrowser } from '../workspace/workspace-browser-context'
import { useProjectSetup } from '../workspace/project-setup-context'
import { PanelCloseButton } from './panel-close-button'
import { ProjectActionsEditor } from './ProjectActionsEditor'
import { ProjectActionsResults } from './ProjectActionsResults'
import { projectActionsStore, recentProjectActionRuns, type ProjectActionsScope } from './ProjectActionsState'
import { projectActionsCopy } from './project-actions-copy'

export function ProjectActions({ project, directory = '', workspacePath, inline = false }: Partial<Pick<ProjectActionsScope, 'directory' | 'workspacePath'>> & { project: string; inline?: boolean }) {
  const api = useWorkspaceApi(), browser = useWorkspaceBrowser()
  const setup = useProjectSetup()
  const copy = projectActionsCopy(useUiLocale()), title = useId()
  const store = useMemo(() => projectActionsStore(api, { project, directory, workspacePath }), [api, project, directory, workspacePath])
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const { state, error, loading, busy } = snapshot
  const [kind, setKind] = useState<ProjectAction['kind'] | null>(null)
  const [editing, setEditing] = useState<{ action: ProjectAction; isNew: boolean } | null>(null)
  const [portal, setPortal] = useState<HTMLDivElement | null>(null)
  useEffect(() => { if (kind) void store.load() }, [kind, store])
  const actions = state?.actions.filter(action => action.kind === kind) ?? []
  const runs = recentProjectActionRuns(state?.runs ?? [])
  return <>
    <span data-project-actions className={`inline-flex shrink-0 items-center gap-0.5 ${inline ? 'mb-1 w-full border-b border-edge pb-1' : ''}`}>
      {(['build', 'deploy'] as const).map(value => <button type="button" key={value} data-header-menu-trigger data-project-action-trigger={value}
        aria-haspopup="dialog" aria-expanded={kind === value} onClick={event => { event.stopPropagation(); setKind(value) }}
        className="rounded px-1.5 py-1 text-xs text-ink-secondary hover:bg-surface-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-ink">{copy[value]}</button>)}
    </span>
    {kind && <DialogFrame labelledBy={title} onClose={() => setKind(null)} className="max-h-[90dvh] max-w-lg overflow-y-auto max-sm:max-w-[calc(100vw-16px)]">
      <HoverTipLayer portalTarget={portal}><div ref={setPortal} className="p-3" data-project-actions-dialog>
        <header className="mb-2 flex items-center gap-2">
          <h2 id={title} className="min-w-0 flex-1 text-sm font-medium">{copy[kind]}</h2>
          <button type="button" disabled={loading || busy} aria-label={copy.discover} data-tip={copy.discover} onClick={() => void store.discover()}
            className="rounded p-1 text-ink-secondary hover:bg-surface-hover disabled:opacity-40"><RefreshDouble width={16} height={16} aria-hidden="true" /></button>
          <PanelCloseButton aria-label={copy.close} onClick={() => setKind(null)} />
        </header>
        {loading && !state && <div role="status" aria-label={copy.loading} className="flex justify-center py-2"><LoadingIndicator /></div>}
        {error && <div role="alert" className="mb-2 flex min-w-0 items-center gap-2 text-xs text-danger-strong">
          <span className="min-w-0 flex-1 select-text break-words">{error}</span>
          <button type="button" disabled={loading || busy} className="shrink-0 rounded border border-edge px-2 py-1 text-ink hover:bg-surface-hover disabled:opacity-40" onClick={() => void store.load()}>{copy.retry}</button>
        </div>}
        {state?.warnings.map((warning, index) => <p key={index} className="mb-2 select-text break-words text-xs text-ink-secondary">{warning}</p>)}
        {state && <>
          {actions.length ? <div className="space-y-1">
            {actions.map(action => {
              const running = state.runs.some(run => run.actionId === action.id && run.status === 'running')
              return <div key={action.id} className="flex min-w-0 items-center gap-1 rounded bg-surface-raised px-1">
                <button type="button" disabled={busy || running} onClick={() => void store.run(action.id)}
                  className="min-w-0 flex-1 rounded px-2 py-2 text-left text-sm hover:bg-surface-hover disabled:opacity-50">
                  <span className="block truncate">{action.name}</span>
                </button>
                {action.variant && <span className="text-[11px] text-ink-muted">{copy[action.variant]}</span>}
                <button type="button" disabled={busy} aria-label={copy.editName.replace('{name}', action.name)} data-tip={copy.edit}
                  className="shrink-0 rounded p-2 text-ink-secondary hover:bg-surface-hover disabled:opacity-40" onClick={() => setEditing({ action, isNew: false })}>
                  <EditPencil width={14} height={14} aria-hidden="true" />
                </button>
              </div>
            })}
          </div> : <p className="py-2 text-xs text-ink-secondary">{copy.empty}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" disabled={busy} onClick={() => setEditing({ isNew: true, action: { id: uuid(), name: '', kind, variant: 'custom', command: '' } })}
              className="inline-flex items-center gap-1 rounded border border-edge px-2 py-1.5 text-xs hover:bg-surface-hover disabled:opacity-40"><Plus width={14} height={14} aria-hidden="true" />{copy.add}</button>
            <button type="button" disabled={busy || !state.projectRoot || !setup} onClick={() => setup?.({
              projectPath: state.projectRoot, projectName: state.projectRoot.split('/').filter(Boolean).at(-1) ?? project,
              setupTitle: copy.setup, onClose: () => { void store.load() },
            })}
              className="rounded border border-edge px-2 py-1.5 text-xs hover:bg-surface-hover disabled:opacity-40">{copy.setup}</button>
          </div>
          {state.needsAgent && <p className="mt-2 text-xs text-ink-secondary">{copy.agent}</p>}
        </>}
        <ProjectActionsResults runs={runs} copy={copy} onPreview={browser} artifactUrl={store.artifactUrl} />
      </div></HoverTipLayer>
    </DialogFrame>}
    {editing && state && <ProjectActionsEditor key={editing.action.id} action={editing.action} isNew={editing.isNew} copy={copy}
      onClose={() => setEditing(null)}
      onSave={action => store.save(editing.isNew ? [...state.actions, action] : state.actions.map(item => item.id === action.id ? action : item))}
      onDelete={editing.isNew ? undefined : () => store.save(state.actions.filter(item => item.id !== editing.action.id))} />}
  </>
}
