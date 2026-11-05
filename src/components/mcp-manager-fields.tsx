import type { McpCloudflarePreview, McpManagedServer, McpUsageScope } from '../../shared/mcp-management'
import type { McpManagerCopy } from './mcp-manager-copy'

const input = 'min-h-9 min-w-0 rounded border border-edge-strong bg-surface px-2 text-xs text-ink placeholder:text-ink-secondary focus:outline-2 focus:outline-accent'
const button = 'inline-flex min-h-9 items-center justify-center gap-1.5 rounded px-2 text-xs text-ink-secondary hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40'

interface ConnectionFieldsProps {
  copy: McpManagerCopy
  name: string
  url: string
  json: string
  advanced: boolean
  scope: McpUsageScope
  busy: boolean
  onName: (value: string) => void
  onUrl: (value: string) => void
  onJson: (value: string) => void
  onToggleAdvanced: () => void
}

export function McpConnectionFields({ copy, name, url, json, advanced, scope, busy, onName, onUrl, onJson, onToggleAdvanced }: ConnectionFieldsProps) {
  return <div className="space-y-3 p-3">
    <label className="block space-y-1 text-xs text-ink-secondary"><span>{copy.connectionName}</span><input aria-label={copy.connectionName} className={`${input} w-full`} value={name} disabled={busy} onChange={event => onName(event.target.value)} autoComplete="off" placeholder="my-server" /></label>
    {advanced
      ? <label className="block space-y-1 text-xs text-ink-secondary"><span>{copy.config}</span><textarea aria-label={copy.config} spellCheck={false} className="min-h-56 w-full resize-y rounded border border-edge-strong bg-surface-deep p-2 font-mono text-xs leading-relaxed text-ink focus:outline-2 focus:outline-accent" value={json} disabled={busy} onChange={event => onJson(event.target.value)} /></label>
      : <label className="block space-y-1 text-xs text-ink-secondary"><span>{copy.url}</span><input type="url" aria-label={copy.url} className={`${input} w-full`} value={url} disabled={busy} onChange={event => onUrl(event.target.value)} autoComplete="off" placeholder="https://mcp.example.com/mcp" /></label>}
    {!advanced && <button type="button" className={`${button} -ml-2`} disabled={busy} onClick={onToggleAdvanced}>{copy.advanced}</button>}
    <p className="text-xs text-ink-secondary">{copy.authHint}</p>
    <p className="text-xs text-ink-secondary">{copy.scope}: {scope === 'common' ? copy.common : copy.project}</p>
  </div>
}

interface GroupFieldsProps {
  copy: McpManagerCopy
  name: string
  busy: boolean
  servers?: McpManagedServer[]
  selectedMembers: Set<string>
  onName: (value: string) => void
  onToggleMember: (name: string) => void
}

export function McpGroupFields({ copy, name, busy, servers, selectedMembers, onName, onToggleMember }: GroupFieldsProps) {
  return <div className="space-y-3 p-3">
    <label className="block space-y-1 text-xs text-ink-secondary"><span>{copy.groupName}</span><input className={`${input} w-full`} aria-label={copy.groupName} value={name} disabled={busy} onChange={event => onName(event.target.value)} /></label>
    <p className="text-xs leading-relaxed text-ink-secondary">{copy.groupStructureHint}</p>
    {servers && <fieldset className="space-y-1"><legend className="mb-1 text-xs text-ink-secondary">{copy.members}</legend>{servers.map(item => <label key={item.name} className="flex min-h-10 items-center gap-2 rounded px-1 text-xs hover:bg-surface-hover"><input type="checkbox" className="h-4 w-4 accent-accent" checked={selectedMembers.has(item.name)} disabled={busy} onChange={() => onToggleMember(item.name)} /><span className="min-w-0 truncate">{item.name}</span></label>)}</fieldset>}
  </div>
}

interface CloudflareFieldsProps {
  copy: McpManagerCopy
  preview: McpCloudflarePreview
  name: string
  scope: McpUsageScope
  busy: boolean
  ready: boolean
  selectedMembers: Set<string>
  onName: (value: string) => void
  onToggleMember: (name: string) => void
}

export function McpCloudflareFields({ copy, preview, name, scope, busy, ready, selectedMembers, onName, onToggleMember }: CloudflareFieldsProps) {
  const candidates = preview.candidates.filter(item => !item.unified)
  return <div className="space-y-3 p-3">
    <p className="select-text break-all text-xs text-ink-secondary">{preview.url}</p>
    {preview.existingUnified
      ? <p className="text-xs">{copy.cloudflareExisting}: <strong className="font-medium">{preview.existingUnified}</strong></p>
      : <label className="block space-y-1 text-xs text-ink-secondary"><span>{copy.connectionName}</span><input className={`${input} w-full`} aria-label={copy.connectionName} value={name} disabled={busy} onChange={event => onName(event.target.value)} /></label>}
    <p className="text-xs leading-relaxed text-ink-secondary">{copy.cloudflareAuth}</p>
    <fieldset className="space-y-1">
      <legend className="mb-1 text-xs font-medium">{copy.cloudflareDisable}</legend>
      {!candidates.length && <p className="text-xs text-ink-secondary">{copy.cloudflareNoCandidates}</p>}
      {candidates.map(item => <label key={item.name} className="flex min-h-11 items-center gap-2 rounded px-1 hover:bg-surface-hover"><input type="checkbox" className="h-4 w-4 shrink-0 accent-accent" checked={selectedMembers.has(item.name)} disabled={busy || !ready} onChange={() => onToggleMember(item.name)} /><span className="min-w-0 flex-1"><span className="block truncate text-xs">{item.name}</span><span className="block truncate text-[11px] text-ink-secondary">{item.endpoint}</span></span></label>)}
    </fieldset>
    <p className="text-xs leading-relaxed text-ink-secondary">{copy.cloudflareNativeHint}</p>
    <p className="text-xs text-ink-secondary">{copy.scope}: {scope === 'common' ? copy.common : copy.project}</p>
  </div>
}
