import { useId, useState } from 'react'
import { DialogFrame, HoverTipLayer, SelectField } from '@mew/ui'
import { ArrowDown, ArrowUp, Plus, Trash } from 'iconoir-react'
import type { ProjectPipeline, ProjectPipelineStep } from '../../shared/project-pipelines'
import type { ProjectAction } from '../../shared/project-actions'
import type { ReleaseConnectionSummary } from '../../shared/release-providers'
import type { ProjectReleaseCopy } from './project-release-copy'
import { uuid } from '../utils/uuid'
import { PanelCloseButton } from './panel-close-button'

export function ProjectReleasePipelineEditor({ pipeline, actions, connections, copy, onSave, onDelete, onClose }: {
  pipeline: ProjectPipeline
  actions: ProjectAction[]
  connections: ReleaseConnectionSummary[]
  copy: ProjectReleaseCopy
  onSave: (pipeline: ProjectPipeline) => Promise<void>
  onDelete?: () => Promise<void>
  onClose: () => void
}) {
  const title = useId()
  const [draft, setDraft] = useState(pipeline), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const options = [...actions.map(action => ({ value: `action:${action.id}`, label: action.name })), ...connections.map(connection => ({ value: `provider:${connection.id}`, label: connection.label }))]
  const choose = (value: string, id: string): ProjectPipelineStep => value.startsWith('action:')
    ? { id, type: 'action', actionId: value.slice(7), name: options.find(option => option.value === value)?.label ?? '' }
    : { id, type: 'provider', connectionId: value.slice(9), name: options.find(option => option.value === value)?.label ?? '' }
  const replace = (index: number, step: ProjectPipelineStep) => setDraft({ ...draft, steps: draft.steps.map((item, i) => i === index ? step : item) })
  const move = (index: number, offset: number) => {
    const steps = [...draft.steps]
    ;[steps[index], steps[index + offset]] = [steps[index + offset], steps[index]]
    setDraft({ ...draft, steps })
  }
  const mutate = async (operation: () => Promise<void>) => {
    setBusy(true); setError('')
    try { await operation(); onClose() }
    catch (failure) { setError(failure instanceof Error ? failure.message : copy.pipelineError) }
    finally { setBusy(false) }
  }
  const fieldClass = 'min-h-9 w-full min-w-0 rounded border border-edge bg-surface px-2 text-sm focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50'
  return <DialogFrame labelledBy={title} busy={busy} onClose={onClose} className="max-h-[90dvh] max-w-lg overflow-y-auto max-sm:max-w-[calc(100vw-16px)]">
    <HoverTipLayer><form className="p-3" onSubmit={event => { event.preventDefault(); void mutate(() => onSave(draft)) }}>
      <header className="mb-3 flex items-center gap-2"><h2 id={title} className="min-w-0 flex-1 text-base font-semibold">{copy.editPipeline}</h2><PanelCloseButton disabled={busy} aria-label={copy.close} onClick={onClose} /></header>
      <div className="space-y-2">
        <label className="block text-xs text-ink-secondary"><span className="mb-1 block">{copy.name}</span><input required disabled={busy} className={fieldClass} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
        <label className="block text-xs text-ink-secondary"><span className="mb-1 block">{copy.purpose}</span><SelectField label={copy.purpose} value={draft.purpose} disabled={busy} options={[{ value: 'preview', label: copy.preview }, { value: 'publish', label: copy.public }]} onChange={value => setDraft({ ...draft, purpose: value as ProjectPipeline['purpose'] })} /></label>
        <fieldset className="space-y-2"><legend className="mb-1 text-xs font-medium text-ink-secondary">{copy.steps}</legend>
          {draft.steps.map((step, index) => {
            const stepLabel = copy.step.replace('{number}', String(index + 1))
            return <div key={step.id} className="min-w-0 rounded-lg border border-edge p-2">
              <div className="mb-1 flex items-center gap-1"><span className="min-w-0 flex-1 text-xs font-medium text-ink-secondary">{stepLabel}</span>
                {([{ label: copy.moveUp, icon: ArrowUp, disabled: index === 0, click: () => move(index, -1) }, { label: copy.moveDown, icon: ArrowDown, disabled: index === draft.steps.length - 1, click: () => move(index, 1) }, { label: copy.removeStep, icon: Trash, disabled: false, click: () => setDraft({ ...draft, steps: draft.steps.filter(item => item.id !== step.id) }) }]).map(({ label, icon: Icon, disabled, click }) => <button key={label} type="button" aria-label={`${label} ${stepLabel}`} data-tip={label} disabled={busy || disabled} className="rounded p-1.5 text-ink-secondary hover:bg-surface-hover disabled:opacity-40" onClick={click}><Icon width={15} height={15} aria-hidden="true" /></button>)}
              </div>
              <SelectField label={stepLabel} disabled={busy} options={options} value={step.type === 'action' ? `action:${step.actionId}` : `provider:${step.connectionId}`} onChange={value => replace(index, choose(value, step.id))} />
              <label className="mt-1 block"><span className="sr-only">{copy.name} · {stepLabel}</span><input required disabled={busy} className={fieldClass} value={step.name} onChange={event => replace(index, { ...step, name: event.target.value })} /></label>
            </div>
          })}
          <button type="button" disabled={busy || !options.length} className="inline-flex items-center gap-1 rounded border border-edge px-2 py-1.5 text-xs hover:bg-surface-hover disabled:opacity-40" onClick={() => setDraft({ ...draft, steps: [...draft.steps, choose(options[0].value, uuid())] })}><Plus width={14} height={14} aria-hidden="true" />{copy.addStep}</button>
        </fieldset>
        <label className="block text-xs text-ink-secondary"><span className="mb-1 block">{copy.resultUrl}</span><input type="url" disabled={busy} className={fieldClass} value={draft.resultUrl ?? ''} onChange={event => setDraft({ ...draft, resultUrl: event.target.value || undefined })} /><span className="mt-1 block">{copy.resultUrlHint}</span></label>
        {error && <p role="alert" className="select-text break-words text-xs text-danger-strong">{error}</p>}
      </div>
      <footer className="mt-3 flex flex-wrap items-center justify-end gap-2">
        {onDelete && <button type="button" disabled={busy} className="mr-auto rounded border border-edge px-2.5 py-2 text-xs text-danger-strong hover:bg-surface-hover disabled:opacity-40" onClick={() => void mutate(onDelete)}>{copy.delete}</button>}
        <button type="button" disabled={busy} className="rounded border border-edge px-2.5 py-2 text-xs hover:bg-surface-hover disabled:opacity-40" onClick={onClose}>{copy.cancel}</button>
        <button type="submit" disabled={busy || !draft.steps.length} className="rounded bg-accent px-3 py-2 text-xs font-medium text-ink-on-accent hover:bg-accent-strong disabled:opacity-40">{copy.save}</button>
      </footer>
    </form></HoverTipLayer>
  </DialogFrame>
}
