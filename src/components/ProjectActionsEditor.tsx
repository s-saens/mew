import { useId, useState } from 'react'
import { DialogFrame, SelectField } from '@mew/ui'
import type { ProjectAction } from '../../shared/project-actions'
import type { ProjectActionsCopy } from './project-actions-copy'
import { PanelCloseButton } from './panel-close-button'

const fieldClass = 'w-full min-w-0 rounded border border-edge-strong bg-surface px-2 py-1.5 text-sm text-ink outline-none focus:border-edge-bright'

export function ProjectActionsEditor({ action, isNew, copy, onSave, onDelete, onClose }: {
  action: ProjectAction
  isNew: boolean
  copy: ProjectActionsCopy
  onSave: (action: ProjectAction) => Promise<void>
  onDelete?: () => Promise<void>
  onClose: () => void
}) {
  const title = useId(), name = useId(), command = useId(), preview = useId(), artifacts = useId()
  const [draft, setDraft] = useState(action)
  const [artifactText, setArtifactText] = useState((action.artifacts ?? []).join('\n'))
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null)
  const [portal, setPortal] = useState<HTMLDivElement | null>(null)
  const run = async (operation: () => Promise<void>) => {
    if (busy) return
    setBusy(true); setError(null)
    try { await operation(); onClose() }
    catch (failure) { setError(failure instanceof Error ? failure.message : copy.saveError) }
    finally { setBusy(false) }
  }
  return <DialogFrame labelledBy={title} busy={busy} onClose={onClose} className="max-h-[90dvh] max-w-md overflow-y-auto max-sm:max-w-[calc(100vw-16px)]">
    <div ref={setPortal} className="p-3">
      <header className="mb-3 flex items-center gap-2">
        <h2 id={title} className="min-w-0 flex-1 text-sm font-medium">{isNew ? copy.add : copy.edit}</h2>
        <PanelCloseButton aria-label={copy.close} disabled={busy} onClick={onClose} />
      </header>
      <form className="space-y-3" onSubmit={event => {
        event.preventDefault()
        void run(() => onSave({ ...draft, name: draft.name.trim(), command: draft.command.trim(),
          previewUrl: draft.previewUrl?.trim() || undefined,
          artifacts: artifactText.split('\n').map(value => value.trim()).filter(Boolean),
        }))
      }}>
        <label className="block text-xs text-ink-secondary" htmlFor={name}>{copy.name}
          <input id={name} data-dialog-autofocus required className={`${fieldClass} mt-1`} value={draft.name} disabled={busy} onChange={event => setDraft({ ...draft, name: event.target.value })} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-xs text-ink-secondary">{copy.kind}
            <SelectField label={copy.kind} value={draft.kind} disabled={busy} portalContainer={portal}
              options={[{ value: 'build', label: copy.build }, { value: 'deploy', label: copy.deploy }]}
              onChange={value => setDraft({ ...draft, kind: value as ProjectAction['kind'] })} />
          </label>
          <label className="block text-xs text-ink-secondary">{copy.variant}
            <SelectField label={copy.variant} value={draft.variant ?? 'custom'} disabled={busy} portalContainer={portal}
              options={[{ value: 'debug', label: copy.debug }, { value: 'release', label: copy.release }, { value: 'custom', label: copy.custom }]}
              onChange={value => setDraft({ ...draft, variant: value as ProjectAction['variant'] })} />
          </label>
        </div>
        <details open className="rounded border border-edge p-2">
          <summary className="cursor-pointer text-xs text-ink-secondary">{copy.advanced}</summary>
          <div className="mt-2 space-y-3">
            <label htmlFor={command} className="block text-xs text-ink-secondary">{copy.command}
              <textarea id={command} required rows={3} spellCheck={false} autoCapitalize="off" autoCorrect="off" disabled={busy}
                className={`${fieldClass} mt-1 resize-y font-mono`} value={draft.command} onChange={event => setDraft({ ...draft, command: event.target.value })} />
            </label>
            <label htmlFor={preview} className="block text-xs text-ink-secondary">{copy.previewUrl}
              <input id={preview} type="url" disabled={busy} className={`${fieldClass} mt-1`} value={draft.previewUrl ?? ''}
                placeholder="http://localhost:3000" onChange={event => setDraft({ ...draft, previewUrl: event.target.value })} />
            </label>
            <label htmlFor={artifacts} className="block text-xs text-ink-secondary">{copy.artifacts}
              <textarea id={artifacts} rows={2} disabled={busy} className={`${fieldClass} mt-1 resize-y font-mono`} value={artifactText}
                onChange={event => setArtifactText(event.target.value)} />
              <span className="mt-1 block text-ink-muted">{copy.artifactHint}</span>
            </label>
          </div>
        </details>
        {error && <p role="alert" className="select-text break-words text-xs text-danger-strong">{error}</p>}
        <footer className="flex items-center justify-end gap-2">
          {onDelete && <button type="button" disabled={busy} className="mr-auto rounded px-2 py-1.5 text-sm text-danger-strong hover:bg-surface-hover disabled:opacity-40" onClick={() => void run(onDelete)}>{copy.delete}</button>}
          <button type="button" disabled={busy} className="rounded border border-edge px-2 py-1.5 text-sm hover:bg-surface-hover disabled:opacity-40" onClick={onClose}>{copy.cancel}</button>
          <button type="submit" disabled={busy || !draft.name.trim() || !draft.command.trim()} className="rounded bg-accent px-3 py-1.5 text-sm text-ink-on-accent hover:bg-accent-strong disabled:opacity-40">{copy.save}</button>
        </footer>
      </form>
    </div>
  </DialogFrame>
}
