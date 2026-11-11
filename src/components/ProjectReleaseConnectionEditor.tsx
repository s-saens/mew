import { useId, useState } from 'react'
import { DialogFrame, HoverTipLayer, SelectField } from '@mew/ui'
import type { ReleaseConnectionConfig, ReleaseConnectionSummary, ReleaseProviderId, SaveReleaseConnection } from '../../shared/release-providers'
import type { ProjectReleaseCopy } from './project-release-copy'
import { PanelCloseButton } from './panel-close-button'

const providerDefaults = (provider: ReleaseProviderId): ReleaseConnectionConfig => provider === 'github-actions'
  ? { provider, label: 'GitHub Actions', owner: '', repo: '', workflow: '', ref: 'main' }
  : provider === 'cloudflare-pages' ? { provider, label: 'Cloudflare Pages', accountId: '', projectName: '', branch: 'main' }
    : { provider, label: 'Google Cloud Build', projectId: '', location: 'global', triggerId: '', branch: 'main' }

export function ProjectReleaseConnectionEditor({ connection, copy, onClose, onSave, onDelete }: {
  connection?: ReleaseConnectionSummary
  copy: ProjectReleaseCopy
  onClose: () => void
  onSave: (input: SaveReleaseConnection) => Promise<void>
  onDelete?: () => Promise<void>
}) {
  const title = useId(), credentialHint = useId()
  const [config, setConfig] = useState<ReleaseConnectionConfig>(connection?.config ?? providerDefaults('cloudflare-pages'))
  const [token, setToken] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const inputClass = 'min-h-9 w-full min-w-0 rounded border border-edge bg-surface px-2 text-sm focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50'
  const field = (key: string, label: string, value: string) => <label key={key} className="block min-w-0 text-xs text-ink-secondary">
    <span className="mb-1 block">{label}</span><input required value={value} disabled={busy} className={inputClass}
      autoComplete="off" spellCheck={false} onChange={event => setConfig({ ...config, [key]: event.target.value } as ReleaseConnectionConfig)} />
  </label>
  const mutate = async (operation: () => Promise<void>) => {
    setBusy(true); setError('')
    try { await operation(); setToken(''); onClose() }
    catch (failure) { setError(failure instanceof Error ? failure.message : copy.connectionError) }
    finally { setBusy(false) }
  }
  return <DialogFrame labelledBy={title} busy={busy} onClose={onClose} className="max-h-[90dvh] max-w-md overflow-y-auto max-sm:max-w-[calc(100vw-16px)]">
    <HoverTipLayer><form className="p-3" onSubmit={event => { event.preventDefault(); void mutate(() => onSave({ ...(connection ? { id: connection.id } : {}), config, ...(token.trim() ? { token: token.trim() } : {}) })) }}>
      <header className="mb-3 flex items-center gap-2"><h2 id={title} className="min-w-0 flex-1 text-base font-semibold">{connection ? copy.editConnection : copy.addConnection}</h2><PanelCloseButton disabled={busy} aria-label={copy.close} onClick={onClose} /></header>
      <div className="space-y-2">
        <label className="block text-xs text-ink-secondary"><span className="mb-1 block">{copy.service}</span><SelectField label={copy.service} value={config.provider} disabled={busy}
          options={[{ value: 'cloudflare-pages', label: copy.cloudflare }, { value: 'github-actions', label: copy.github }, { value: 'google-cloud-build', label: copy.google }]}
          onChange={value => { setConfig(providerDefaults(value as ReleaseProviderId)); setToken('') }} /></label>
        {field('label', copy.name, config.label)}
        {config.provider === 'github-actions' && <>
          <div className="grid grid-cols-2 gap-2">{field('owner', copy.owner, config.owner)}{field('repo', copy.repository, config.repo)}</div>
          {field('workflow', copy.workflow, config.workflow)}{field('ref', copy.branch, config.ref)}
        </>}
        {config.provider === 'cloudflare-pages' && <>{field('accountId', copy.accountId, config.accountId)}{field('projectName', copy.projectName, config.projectName)}{field('branch', copy.branch, config.branch)}</>}
        {config.provider === 'google-cloud-build' && <>{field('projectId', copy.projectId, config.projectId)}{field('location', copy.location, config.location)}{field('triggerId', copy.triggerId, config.triggerId)}{field('branch', copy.branch, config.branch)}</>}
        <label className="block text-xs text-ink-secondary"><span className="mb-1 block">{copy.credential}</span><input type="password" aria-label={copy.credential} aria-describedby={credentialHint} autoComplete="new-password" spellCheck={false}
          required={!connection?.connected || connection.provider !== config.provider} value={token} disabled={busy} className={inputClass} onChange={event => setToken(event.target.value)} />
          <span id={credentialHint} className="mt-1 block leading-relaxed">{copy.credentialHint}</span></label>
        <p className="text-xs leading-relaxed text-ink-secondary">{copy.connectedHint}</p>
        {error && <p role="alert" className="select-text break-words text-xs text-danger-strong">{error}</p>}
      </div>
      <footer className="mt-3 flex flex-wrap items-center justify-end gap-2">
        {onDelete && <button type="button" disabled={busy} className="mr-auto rounded border border-edge px-2.5 py-2 text-xs text-danger-strong hover:bg-surface-hover disabled:opacity-40" onClick={() => void mutate(onDelete)}>{copy.delete}</button>}
        <button type="button" disabled={busy} className="rounded border border-edge px-2.5 py-2 text-xs hover:bg-surface-hover disabled:opacity-40" onClick={onClose}>{copy.cancel}</button>
        <button type="submit" disabled={busy} className="rounded bg-accent px-3 py-2 text-xs font-medium text-ink-on-accent hover:bg-accent-strong disabled:opacity-40">{copy.save}</button>
      </footer>
    </form></HoverTipLayer>
  </DialogFrame>
}
