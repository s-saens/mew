import { useEffect, useId, useRef, useState } from 'react'
import { ArrowUpRight, Check, Copy, EditPencil, Eye, Lock, Refresh, Xmark } from 'iconoir-react'
import { DialogFrame, LoadingIndicator } from '@mew/ui'
import type { PublicShare, PublicShareMode, PublicShareSetting } from '../../shared/public-share'
import { fetchPublicShare, setPublicShare } from '../api/public-shares'
import { useI18n } from '../i18n'
import { publicShareUrl } from '../utils/public-share-url'
import { publicShareCopy } from './public-share-copy'

const iconButton = 'flex h-8 w-8 shrink-0 items-center justify-center rounded text-ink-secondary hover:bg-surface-raised hover:text-ink disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-accent'

export function PublicShareBadge({ mode, className = '' }: { mode?: PublicShareMode; className?: string }) {
  const { locale } = useI18n()
  if (!mode) return null
  const copy = publicShareCopy[locale]
  const Icon = mode === 'edit' ? EditPencil : Eye
  const label = mode === 'edit' ? copy.editBadge : copy.viewBadge
  return <span role="img" aria-label={label} data-tip={label} data-public-share={mode} className={`inline-flex shrink-0 items-center text-ink-secondary ${className}`}>
    <Icon width={13} height={13} aria-hidden="true" />
  </span>
}

export function PublicShareDialog({ project, path, onChanged, onClose }: {
  project: string
  path: string
  onChanged: (share: PublicShare | null) => void
  onClose: () => void
}) {
  const { locale } = useI18n()
  const copy = publicShareCopy[locale]
  const id = useId()
  const [share, setShare] = useState<PublicShare | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<'load' | 'save' | 'copy' | null>(null)
  const [copied, setCopied] = useState(false)
  const [reload, setReload] = useState(0)
  const savingRef = useRef(false)
  const controllerRef = useRef<AbortController | null>(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; controllerRef.current?.abort() }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void fetchPublicShare(project, path, controller.signal).then(value => {
      if (!controller.signal.aborted) setShare(value)
    }).catch(() => { if (!controller.signal.aborted) setError('load') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [project, path, reload])

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  async function change(mode: PublicShareSetting) {
    if (savingRef.current || loading || error === 'load' || mode === (share?.mode ?? 'off')) return
    savingRef.current = true
    setSaving(true)
    setError(null)
    setCopied(false)
    const controller = new AbortController()
    controllerRef.current = controller
    try {
      const value = await setPublicShare(project, path, mode, controller.signal)
      if (!mounted.current) return
      setShare(value)
      onChanged(value)
    } catch { if (mounted.current) setError('save') }
    finally {
      savingRef.current = false
      if (mounted.current) setSaving(false)
    }
  }

  let url: string | null = null
  let linkUnavailable = false
  if (share) {
    try { url = publicShareUrl(share.type, share.id) }
    catch { linkUnavailable = true }
  }
  async function copyLink() {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      if (mounted.current) { setCopied(true); setError(null) }
    } catch { if (mounted.current) setError('copy') }
  }
  return <DialogFrame labelledBy={id} onClose={onClose} busy={saving} className="max-w-sm max-h-[90dvh] overflow-y-auto">
    <div className="flex items-center gap-2 px-3 py-2">
      <h2 id={id} className="text-sm font-semibold text-ink">{copy.title}</h2>
      <span className="min-w-0 flex-1 truncate text-xs text-ink-secondary" data-tip={path}>{path.split('/').pop() || path}</span>
      <button type="button" aria-label={copy.close} data-tip={copy.close} onClick={onClose} disabled={saving} className={iconButton}><Xmark width={16} height={16} aria-hidden="true" /></button>
    </div>
    <fieldset className="space-y-0.5 px-2 pb-2" disabled={loading || saving || error === 'load'}>
      <legend className="sr-only">{copy.title}</legend>
      {(['off', 'view', 'edit'] as const).map(mode => {
        const Icon = mode === 'off' ? Lock : mode === 'view' ? Eye : EditPencil
        return <label key={mode} className={`flex min-h-10 cursor-pointer items-center gap-2 rounded px-2 text-sm text-ink hover:bg-surface-raised focus-within:outline-2 focus-within:outline-accent ${loading || saving || error === 'load' ? 'cursor-default opacity-50' : ''}`}>
          <input type="radio" name={id} value={mode} checked={!loading && mode === (share?.mode ?? 'off')} onChange={() => void change(mode)} className="h-3.5 w-3.5 shrink-0 accent-accent" />
          <Icon width={16} height={16} aria-hidden="true" />
          <span>{copy[mode]}</span>
        </label>
      })}
    </fieldset>
    {(loading || saving) && <div role="status" className="flex items-center gap-2 px-4 pb-3 text-xs text-ink-secondary"><LoadingIndicator size={14} />{loading ? copy.loading : copy.saving}</div>}
    {(error || linkUnavailable) && <div role="alert" className="flex items-center gap-2 px-4 pb-3 text-xs text-danger">
      <span className="min-w-0 flex-1">{error === 'load' ? copy.loadFailed : error === 'save' ? copy.saveFailed : error === 'copy' ? copy.copyFailed : copy.linkUnavailable}</span>
      {error === 'load' && <button type="button" aria-label={copy.retry} data-tip={copy.retry} onClick={() => { setLoading(true); setError(null); setReload(value => value + 1) }} className={iconButton}><Refresh width={15} height={15} aria-hidden="true" /></button>}
    </div>}
    {url && <div className="flex items-center gap-1 border-t border-edge px-3 py-2">
      <input aria-label={copy.link} value={url} readOnly onFocus={event => event.currentTarget.select()} className="min-w-0 flex-1 rounded bg-surface-deep px-2 py-1.5 text-xs text-ink selection:bg-accent/30 focus-visible:outline-2 focus-visible:outline-accent" />
      <button type="button" aria-label={copied ? copy.copied : copy.copy} data-tip={copied ? copy.copied : copy.copy} className={iconButton} onClick={() => void copyLink()}>{copied ? <Check width={16} height={16} aria-hidden="true" /> : <Copy width={16} height={16} aria-hidden="true" />}</button>
      <a href={url} target="_blank" rel="noopener noreferrer" aria-label={copy.open} data-tip={copy.open} className={iconButton}><ArrowUpRight width={17} height={17} aria-hidden="true" /></a>
    </div>}
  </DialogFrame>
}
