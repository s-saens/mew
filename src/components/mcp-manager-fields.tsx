import { SelectField } from '@mew/ui'
import type { McpCloudflarePreview, McpManagedServer, McpUsageScope } from '../../shared/mcp-management'
import type { McpManagerCopy } from './mcp-manager-copy'

const input = 'min-h-9 min-w-0 rounded border border-edge-strong bg-surface px-2 text-xs text-ink placeholder:text-ink-secondary focus:outline-2 focus:outline-accent'
const button = 'inline-flex min-h-9 items-center justify-center gap-1.5 rounded px-2 text-xs text-ink-secondary hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40'
const chip = 'inline-flex min-h-7 items-center rounded border border-edge-strong bg-surface-raised px-2 text-[11px] text-ink-secondary hover:bg-surface-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40'

export type McpConnectionMode = 'url' | 'stdio' | 'json'

export interface McpRemotePreset {
  id: string
  label: string
  name: string
  url: string
}

export const MCP_REMOTE_PRESETS: readonly McpRemotePreset[] = [
  { id: 'github', label: 'GitHub', name: 'github', url: 'https://api.githubcopilot.com/mcp/' },
  { id: 'supabase', label: 'Supabase', name: 'supabase', url: 'https://mcp.supabase.com/mcp' },
  { id: 'linear', label: 'Linear', name: 'linear', url: 'https://mcp.linear.app/mcp' },
  { id: 'notion', label: 'Notion', name: 'notion', url: 'https://mcp.notion.com/mcp' },
  { id: 'sentry', label: 'Sentry', name: 'sentry', url: 'https://mcp.sentry.dev/mcp' },
  { id: 'cloudflare', label: 'Cloudflare', name: 'cloudflare', url: 'https://mcp.cloudflare.com/mcp' },
]

export function parseEnvLines(text: string): Record<string, string> {
  const env: Record<string, string> = {}
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const idx = line.indexOf('=')
    if (idx <= 0) continue
    const key = line.slice(0, idx).trim()
    const value = line.slice(idx + 1).trim()
    if (key) env[key] = value
  }
  return env
}

export function buildMcpConnectionConfig({
  mode,
  url,
  json,
  command,
  argsText,
  cwdText,
  envText,
}: {
  mode: McpConnectionMode
  url: string
  json: string
  command: string
  argsText: string
  cwdText: string
  envText: string
}): string {
  if (mode === 'json') return json
  if (mode === 'stdio') {
    const args = argsText.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
    const env = parseEnvLines(envText)
    return JSON.stringify({
      type: 'stdio',
      command: command.trim(),
      args,
      ...(cwdText.trim() ? { cwd: cwdText.trim() } : {}),
      ...(Object.keys(env).length ? { env } : {}),
    }, null, 2)
  }
  return JSON.stringify({ type: 'http', url: url.trim() }, null, 2)
}

interface ConnectionFieldsProps {
  copy: McpManagerCopy
  mode: McpConnectionMode
  name: string
  url: string
  json: string
  command: string
  argsText: string
  cwdText: string
  envText: string
  scope: McpUsageScope
  busy: boolean
  onMode: (value: McpConnectionMode) => void
  onName: (value: string) => void
  onUrl: (value: string) => void
  onJson: (value: string) => void
  onCommand: (value: string) => void
  onArgsText: (value: string) => void
  onCwdText: (value: string) => void
  onEnvText: (value: string) => void
}

export function McpConnectionFields({
  copy, mode, name, url, json, command, argsText, cwdText, envText, scope, busy,
  onMode, onName, onUrl, onJson, onCommand, onArgsText, onCwdText, onEnvText,
}: ConnectionFieldsProps) {
  const modeOptions = [
    { value: 'url', label: copy.typeUrl },
    { value: 'stdio', label: copy.typeStdio },
    { value: 'json', label: copy.typeJson },
  ]
  return <div className="space-y-3 p-3">
    <SelectField label={copy.connectionType} value={mode} disabled={busy} onChange={value => onMode(value as McpConnectionMode)} options={modeOptions} />
    {mode === 'url' && <div className="space-y-1">
      <span className="block text-xs text-ink-secondary">{copy.presets}</span>
      <div className="flex flex-wrap gap-1">
        {MCP_REMOTE_PRESETS.map(preset => <button key={preset.id} type="button" className={chip} disabled={busy} onClick={() => { onName(preset.name); onUrl(preset.url) }}>{preset.label}</button>)}
      </div>
    </div>}
    <label className="block space-y-1 text-xs text-ink-secondary"><span>{copy.connectionName}</span><input aria-label={copy.connectionName} className={`${input} w-full`} value={name} disabled={busy} onChange={event => onName(event.target.value)} autoComplete="off" placeholder="my-server" /></label>
    {mode === 'json'
      ? <label className="block space-y-1 text-xs text-ink-secondary"><span>{copy.config}</span><textarea aria-label={copy.config} spellCheck={false} className="min-h-56 w-full resize-y rounded border border-edge-strong bg-surface-deep p-2 font-mono text-xs leading-relaxed text-ink focus:outline-2 focus:outline-accent" value={json} disabled={busy} onChange={event => onJson(event.target.value)} /></label>
      : mode === 'stdio' ? <>
        <label className="block space-y-1 text-xs text-ink-secondary"><span>{copy.command}</span><input aria-label={copy.command} className={`${input} w-full font-mono`} value={command} disabled={busy} onChange={event => onCommand(event.target.value)} autoComplete="off" placeholder="npx" /></label>
        <label className="block space-y-1 text-xs text-ink-secondary"><span>{copy.args}</span><textarea aria-label={copy.args} spellCheck={false} className="min-h-20 w-full resize-y rounded border border-edge-strong bg-surface-deep p-2 font-mono text-xs leading-relaxed text-ink focus:outline-2 focus:outline-accent" value={argsText} disabled={busy} onChange={event => onArgsText(event.target.value)} placeholder={'-y\n@modelcontextprotocol/server-filesystem\n/path/to/dir'} /></label>
        <label className="block space-y-1 text-xs text-ink-secondary"><span>{copy.cwd}</span><input aria-label={copy.cwd} className={`${input} w-full font-mono`} value={cwdText} disabled={busy} onChange={event => onCwdText(event.target.value)} autoComplete="off" placeholder="/path/to/workspace" /></label>
        <label className="block space-y-1 text-xs text-ink-secondary"><span>{copy.env}</span><textarea aria-label={copy.env} spellCheck={false} className="min-h-16 w-full resize-y rounded border border-edge-strong bg-surface-deep p-2 font-mono text-xs leading-relaxed text-ink focus:outline-2 focus:outline-accent" value={envText} disabled={busy} onChange={event => onEnvText(event.target.value)} placeholder={'API_TOKEN=${MY_API_TOKEN}'} /></label>
        <p className="text-[11px] text-ink-secondary">{copy.envHint}</p>
      </>
      : <>
        <label className="block space-y-1 text-xs text-ink-secondary"><span>{copy.url}</span><input type="url" aria-label={copy.url} className={`${input} w-full`} value={url} disabled={busy} onChange={event => onUrl(event.target.value)} autoComplete="off" placeholder="https://mcp.example.com/mcp" /></label>
        <button type="button" className={`${button} -ml-2`} disabled={busy} onClick={() => onMode('json')}>{copy.advanced}</button>
      </>}
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
