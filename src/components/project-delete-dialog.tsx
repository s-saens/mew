import { useId, useRef, useState } from 'react'
import { DialogFrame } from '@mew/ui'
import { Trash } from 'iconoir-react'
import { useI18n } from '../i18n'
import { projectDeleteCopy } from './project-delete-copy'

export function ProjectDeleteDialog({ path, onDelete, onClose }: {
  path: string
  onDelete: (path: string) => Promise<void>
  onClose: () => void
}) {
  const { locale } = useI18n()
  const copy = projectDeleteCopy(locale)
  const id = useId()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pending = useRef(false)

  async function confirm() {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setError(null)
    try {
      await onDelete(path)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  return <DialogFrame labelledBy={id} describedBy={`${id}-detail`} onClose={onClose} busy={busy}>
    <div data-project-delete-dialog className="p-5 sm:p-6">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-danger/10 text-danger-ink"><Trash width={22} height={22} aria-hidden="true" /></div>
      <h2 id={id} className="text-base font-semibold text-ink">{copy.title}</h2>
      <p id={`${id}-detail`} className="mt-2 text-sm leading-relaxed text-ink-secondary">{copy.detail}</p>
      <p className="mt-3 break-all rounded-md border border-edge bg-surface-deep px-3 py-2 text-xs text-ink-secondary">{path}</p>
      {error && <p role="alert" className="mt-3 break-words text-sm text-danger-ink">{error}</p>}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button type="button" data-project-delete-cancel data-dialog-autofocus disabled={busy} onClick={onClose}
          className="rounded-md border border-edge px-3 py-2 text-sm text-ink hover:bg-surface-hover disabled:opacity-50">{copy.cancel}</button>
        <button type="button" data-project-delete-confirm disabled={busy} onClick={() => void confirm()}
          className="rounded-md bg-danger-strong px-3 py-2 text-sm font-medium text-ink-on-danger hover:bg-danger disabled:opacity-50">{busy ? copy.deleting : copy.permanently}</button>
      </div>
    </div>
  </DialogFrame>
}
