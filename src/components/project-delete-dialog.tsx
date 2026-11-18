import { useEffect, useId, useRef, useState } from 'react'
import { DialogFrame } from '@mew/ui'
import { Trash } from 'iconoir-react'
import { useI18n } from '../i18n'
import { ApiResponseError } from '../api/response'
import { useWorkspaceApi } from '../api/workspace-api-context'
import { projectDeleteCopy } from './project-delete-copy'

export function ProjectDeleteDialog({ path, onDelete, onClose }: {
  path: string
  onDelete: (path: string, deleteFiles: boolean) => Promise<void>
  onClose: () => void
}) {
  const { locale, t } = useI18n()
  const { fetchProjectRegistry } = useWorkspaceApi()
  const copy = projectDeleteCopy(locale)
  const id = useId()
  const [busy, setBusy] = useState(false)
  const [location, setLocation] = useState<'loading' | 'managed' | 'external' | 'unavailable'>('loading')
  const [alsoDeleteFiles, setAlsoDeleteFiles] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pending = useRef(false)
  const canConfirm = location === 'managed' || location === 'external'
  const deleteFiles = location === 'managed' || alsoDeleteFiles

  useEffect(() => {
    const controller = new AbortController()
    void fetchProjectRegistry(controller.signal, true).then(({ projects }) => {
      if (controller.signal.aborted) return
      const managed = projects.find(project => project.path === path)?.inManagedRoot
      setLocation(managed === true ? 'managed' : managed === false ? 'external' : 'unavailable')
    }).catch(() => {
      if (!controller.signal.aborted) setLocation('unavailable')
    })
    return () => controller.abort()
  }, [path, fetchProjectRegistry])

  async function confirm() {
    if (!canConfirm || pending.current) return
    pending.current = true
    setBusy(true)
    setError(null)
    try {
      await onDelete(path, deleteFiles)
      onClose()
    } catch (err) {
      const message = (err instanceof Error ? err.message : String(err ?? '')).trim()
      setError(err instanceof ApiResponseError && err.status === 404 && (message === 'HTTP 404' || message === 'Not Found')
        ? copy.serverUpdateRequired
        : message || copy.unavailable)
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  return <DialogFrame labelledBy={id} describedBy={`${id}-detail`} onClose={onClose} busy={busy}>
    <div data-project-delete-dialog className="p-5 sm:p-6">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-danger/10 text-danger-ink"><Trash width={22} height={22} aria-hidden="true" /></div>
      <h2 id={id} className="text-base font-semibold text-ink">{copy.title}</h2>
      <p id={`${id}-detail`} className={`mt-2 text-sm leading-relaxed ${location === 'managed' ? 'text-danger-ink' : 'text-ink-secondary'}`}
        role={location === 'loading' ? 'status' : location === 'unavailable' ? 'alert' : undefined}>
        {location === 'loading' ? t('common.loading') : location === 'unavailable' ? copy.locationUnavailable : location === 'managed' ? copy.managedDetail : copy.detail}
      </p>
      <p className="mt-3 break-all rounded-md border border-edge bg-surface-deep px-3 py-2 text-xs text-ink-secondary">{path}</p>
      {location === 'external' && <label className="mt-3 flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={alsoDeleteFiles} disabled={busy} onChange={event => setAlsoDeleteFiles(event.target.checked)} />{copy.deleteFiles}</label>}
      {location === 'external' && alsoDeleteFiles && <p className="mt-2 text-xs text-danger-ink">{copy.irreversible}</p>}
      {error && <p role="alert" className="mt-3 break-words text-sm text-danger-ink">{error}</p>}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button type="button" data-project-delete-cancel data-dialog-autofocus disabled={busy} onClick={onClose}
          className="rounded-md border border-edge px-3 py-2 text-sm text-ink hover:bg-surface-hover disabled:opacity-50">{copy.cancel}</button>
        {canConfirm && <button type="button" data-project-delete-confirm disabled={busy} onClick={() => void confirm()}
          className="rounded-md bg-danger-strong px-3 py-2 text-sm font-medium text-ink-on-danger hover:bg-danger disabled:opacity-50">{busy ? copy.deleting : deleteFiles ? copy.permanently : copy.remove}</button>}
      </div>
    </div>
  </DialogFrame>
}
