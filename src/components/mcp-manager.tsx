import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, Cloud, EditPencil, Folder, NavArrowRight, Plus, PlugTypeA, RefreshDouble, Settings, Trash, Xmark } from 'iconoir-react'
import { canAutoFocusInput, SelectField, useOverlayDismiss } from '@mew/ui'
import { uiText } from '@mew/ui/i18n-core'
import { useUiLocale } from '@mew/ui/i18n'
import { fetchMcpManagement, mutateMcpManagement } from '../api/mcp-management'
import { SharedMcpConnection } from './shared-mcp-connection'
import { mcpManagerCopy } from './mcp-manager-copy'
import { McpCloudflareFields, McpConnectionFields, McpGroupFields } from './mcp-manager-fields'
import type { McpManagedGroup, McpManagedServer, McpManagementInventory, McpManagementMutation, McpUsageScope, McpUsageState } from '../../shared/mcp-management'
import type { SharedMcpConnectionStatus } from '../../shared/shared-mcp'

const button = 'inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded px-2 text-xs text-ink-secondary hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40'
const input = 'min-h-9 min-w-0 rounded border border-edge-strong bg-surface px-2 text-xs text-ink placeholder:text-ink-secondary focus:outline-2 focus:outline-accent'
const primary = `${button} bg-accent text-ink-on-accent hover:bg-accent/90`
type Selection = { kind: 'server'; id: string } | { kind: 'group'; id: string } | null
type Draft = 'connection' | 'group' | 'rename' | 'cloudflare' | null
type MutationInput = McpManagementMutation extends infer M ? M extends McpManagementMutation ? Omit<M, 'cwd' | 'revision'> : never : never

function enabledIn(usage: McpUsageState, scope: McpUsageScope) { return scope === 'common' ? usage.common : usage.project ?? usage.common }

export function McpManager({ cwd, onClose, onSwitchSkills, onOpenSources }: { cwd: string; onClose: () => void; onSwitchSkills: () => void; onOpenSources: () => void }) {
  const copy = mcpManagerCopy[useUiLocale()]
  const [inventory, setInventory] = useState<McpManagementInventory | null>(null)
  const [scope, setScope] = useState<McpUsageScope>('project'), [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set()), [selection, setSelection] = useState<Selection>(null)
  const [draft, setDraft] = useState<Draft>(null), [name, setName] = useState(''), [url, setUrl] = useState(''), [json, setJson] = useState(''), [advanced, setAdvanced] = useState(false)
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(() => new Set())
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [reload, setReload] = useState(0)
  const [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [confirmation, setConfirmation] = useState<{ text: string; label: string; action: () => void } | null>(null)
  const [statuses, setStatuses] = useState<Record<string, Pick<SharedMcpConnectionStatus, 'status' | 'error'>>>({})
  const dialog = useRef<HTMLDivElement>(null), searchRef = useRef<HTMLInputElement>(null), headingRef = useRef<HTMLHeadingElement>(null), confirmRef = useRef<HTMLButtonElement>(null)
  const listId = useId(), confirmationId = useId()
  const canManage = inventory?.canManage === true
  const canChangeUsage = scope === 'project' || canManage
  const showingDetail = !!selection || !!draft
  const server = selection?.kind === 'server' ? inventory?.servers.find(item => item.name === selection.id) : undefined
  const group = selection?.kind === 'group' ? inventory?.groups.find(item => item.id === selection.id) : undefined
  const selectedGroup = server?.groupId ? inventory?.groups.find(group => group.id === server.groupId) : undefined
  const groupGate = selectedGroup ? enabledIn(selectedGroup.usage, scope) : true
  const reset = () => { setSelection(null); setDraft(null); setName(''); setUrl(''); setJson(''); setAdvanced(false); setSelectedMembers(new Set()); setError('') }
  const guarded = (action: () => void) => {
    if (busy) return
    if (draft) setConfirmation({ text: copy.dirty, label: copy.discard, action })
    else action()
  }
  const close = () => { if (confirmation) setConfirmation(null); else guarded(onClose) }
  useOverlayDismiss(close)
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (canAutoFocusInput()) searchRef.current?.focus()
    return () => { if (opener?.isConnected) opener.focus() }
  }, [])
  useEffect(() => {
    if (!confirmation) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    confirmRef.current?.focus()
    return () => { if (previous?.isConnected) previous.focus() }
  }, [confirmation])
  useEffect(() => {
    if (!draft) return
    const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', prevent)
    return () => window.removeEventListener('beforeunload', prevent)
  }, [draft])
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError('')
    fetchMcpManagement(cwd, controller.signal).then(next => {
      if (controller.signal.aborted) return
      setInventory(next); setStatuses({})
    }).catch(cause => { if (!controller.signal.aborted) setError(cause.message) }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [cwd, reload])
  useEffect(() => { if (showingDetail && window.matchMedia('(max-width: 767px)').matches) headingRef.current?.focus() }, [showingDetail, selection?.id, draft])

  async function run(action: () => Promise<unknown>, after?: () => void) {
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      await action()
      const next = await fetchMcpManagement(cwd)
      setInventory(next); setStatuses({}); setDraft(null)
      after?.(); setNotice(copy.saved)
      window.dispatchEvent(new Event('mew:harness-changed'))
    } catch (cause) { setError(cause instanceof Error ? cause.message : uiText('변경하지 못했습니다')) }
    finally { setBusy(false) }
  }
  function mutate(value: MutationInput, after?: () => void) {
    if (!inventory) return
    void run(() => mutateMcpManagement({ ...value, cwd, revision: inventory.revision } as McpManagementMutation), after)
  }
  function usage(target: 'server' | 'group', id: string, enabled: boolean | null) { guarded(() => mutate({ action: 'usage', scope, target, id, enabled })) }
  function startDraft(value: Draft) {
    guarded(() => {
      reset(); setDraft(value)
      if (value === 'connection') { setJson('{\n  "type": "http",\n  "url": ""\n}') }
      if (value === 'cloudflare') setName(inventory?.cloudflare.existingUnified ?? inventory?.cloudflare.suggestedName ?? 'cloudflare')
    })
  }
  function openServer(item: McpManagedServer) { guarded(() => { reset(); setSelection({ kind: 'server', id: item.name }) }) }
  function openGroup(item: McpManagedGroup) { guarded(() => { reset(); setSelection({ kind: 'group', id: item.id }) }) }
  function toggleMember(value: string) { setSelectedMembers(previous => { const next = new Set(previous); if (next.has(value)) next.delete(value); else next.add(value); return next }) }
  function saveDraft() {
    if (draft === 'group') mutate({ action: 'create-group', name, members: [...selectedMembers] }, reset)
    if (draft === 'rename' && group) mutate({ action: 'rename-group', id: group.id, name })
    if (draft === 'cloudflare') mutate({ action: 'consolidate-cloudflare', name, disable: cloudflareReady ? [...selectedMembers] : [], scope }, () => { reset(); if (!cloudflareReady) setSelection({ kind: 'server', id: name }) })
    if (draft === 'connection') mutate({ action: 'create-server', scope, name, content: advanced ? json : JSON.stringify({ type: 'http', url }) }, () => { reset(); setSelection({ kind: 'server', id: name }) })
  }
  const matches = (item: McpManagedServer) => `${item.name} ${item.endpoint}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())
  const grouped = inventory?.groups.filter(group => !search || group.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()) || inventory.servers.some(server => server.groupId === group.id && matches(server))) ?? []
  const ungrouped = inventory?.servers.filter(server => !server.groupId && matches(server)) ?? []
  const unifiedName = inventory?.cloudflare.existingUnified
  const unifiedServer = inventory?.servers.find(server => server.name === unifiedName)
  const cloudflareReady = (unifiedName ? statuses[unifiedName] ?? unifiedServer?.connection : undefined)?.status === 'connected'
  const scopeOptions = [{ value: 'common', label: copy.common }, { value: 'project', label: copy.project }]
  function readiness(item: McpManagedServer) {
    const connection = statuses[item.name] ?? item.connection
    return !connection ? copy.unknown : connection.status === 'connected' ? copy.ready : connection.status === 'needs_auth' ? copy.login : connection.status === 'error' ? copy.error : connection.status === 'connecting' ? copy.connecting : copy.disconnected
  }
  function switchControl(target: 'server' | 'group', id: string, state: McpUsageState, label = id) {
    const enabled = enabledIn(state, scope)
    return <button type="button" role="switch" aria-checked={enabled} aria-label={`${label} ${target === 'group' ? copy.groupUse : copy.use}`} disabled={busy || loading || !canChangeUsage} onClick={() => usage(target, id, !enabled)} className={`${button} gap-1.5 px-1.5`}>
      <span aria-hidden className={`flex h-4 w-7 items-center rounded-full px-0.5 ${enabled ? 'justify-end bg-accent' : 'justify-start bg-edge-strong'}`}><span className="h-3 w-3 rounded-full bg-surface" /></span><span className="min-w-6 text-left">{enabled ? copy.enabled : copy.disabled}</span>
    </button>
  }
  function serverRow(item: McpManagedServer, gate = true, indent = false) {
    const status = statuses[item.name] ?? item.connection
    return <div key={item.name} className={`flex min-h-11 items-center gap-1 px-2 ${indent ? 'pl-6' : ''} ${selection?.kind === 'server' && selection.id === item.name ? 'bg-surface-hover' : ''}`}>
      <button type="button" aria-label={item.name} aria-pressed={selection?.kind === 'server' && selection.id === item.name} className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded px-1 text-left hover:text-accent focus-visible:outline-2 focus-visible:outline-accent" onClick={() => openServer(item)}>
        {!indent && <PlugTypeA width={16} height={16} aria-hidden className="shrink-0 text-ink-secondary" />}
        <span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">{item.name}</span><span className={`block truncate text-[11px] ${status?.status === 'error' ? 'text-danger-ink' : status?.status === 'connected' ? 'text-success-ink' : 'text-ink-secondary'}`}>{!gate ? copy.groupOff : readiness(item)}</span></span>
      </button>{switchControl('server', item.name, item.usage)}
    </div>
  }
  const title = draft === 'connection' ? copy.add : draft === 'group' ? copy.createGroup : draft === 'rename' ? copy.rename : draft === 'cloudflare' ? copy.cloudflareTitle : server?.name ?? group?.name ?? ''
  const currentUsage = server?.usage ?? group?.usage

  return createPortal(<div data-cmd-overlay className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/40 p-2 sm:p-5" onMouseDown={event => { if (event.target === event.currentTarget) close() }}>
    <div ref={dialog} role="dialog" aria-modal="true" aria-label={uiText('에이전트 확장 관리')} className="flex h-[90dvh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-edge-bright bg-surface text-ink shadow-xl" onKeyDown={event => {
      if (event.key !== 'Tab') return
      const root = confirmation ? dialog.current?.querySelector('[role="alertdialog"]') : dialog.current
      const nodes = Array.from(root?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]') ?? []).filter(node => node.getClientRects().length && !node.closest('[inert]'))
      const first = nodes[0], last = nodes.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }}>
      <header inert={confirmation ? true : undefined} className="flex shrink-0 items-center gap-3 border-b border-edge px-3 py-2">
        <h2 className="text-sm font-semibold">{uiText('에이전트 확장')}</h2>
        <div className="flex gap-1" role="group" aria-label={uiText('확장 종류')}><button type="button" aria-pressed="false" className={button} onClick={() => guarded(onSwitchSkills)}>Skills</button><button type="button" aria-pressed="true" className={`${button} bg-surface-hover font-semibold text-ink`}>MCP</button></div>
        <button type="button" className={`${button} ml-auto`} aria-label={copy.close} data-tip={copy.close} disabled={busy} onClick={close}><Xmark width={18} height={18} aria-hidden /></button>
      </header>
      {confirmation && <div role="alertdialog" aria-label={uiText('변경 확인')} aria-describedby={confirmationId} className="flex flex-wrap items-center gap-2 border-b border-edge bg-surface-raised px-3 py-2"><p id={confirmationId} className="min-w-0 flex-1 text-sm">{confirmation.text}</p><button type="button" className={button} onClick={() => setConfirmation(null)}>{copy.confirmCancel}</button><button ref={confirmRef} type="button" className={`${button} text-danger-ink`} onClick={() => { const action = confirmation.action; setConfirmation(null); action() }}>{confirmation.label}</button></div>}
      {error && <div role="alert" className="shrink-0 border-b border-edge px-3 py-2 text-xs text-danger-ink">{error}<button type="button" className={`${button} ml-1`} disabled={busy} onClick={() => guarded(() => setReload(value => value + 1))}>{uiText('다시 불러오기')}</button></div>}
      {notice && <p role="status" className="shrink-0 border-b border-edge px-3 py-2 text-xs text-ink-secondary">{notice}</p>}
      <div className="flex min-h-0 flex-1" inert={confirmation ? true : undefined}>
        <aside className={`${showingDetail ? 'hidden md:flex' : 'flex'} min-h-0 w-full flex-col border-r border-edge md:w-96 md:shrink-0`}>
          <div className="flex gap-1 border-b border-edge p-2"><input ref={searchRef} className={`${input} w-full`} value={search} aria-label={copy.search} placeholder={copy.search} onChange={event => setSearch(event.target.value)} /><button type="button" className={button} aria-label={uiText('새로고침')} data-tip={uiText('새로고침')} disabled={busy || loading} onClick={() => guarded(() => setReload(value => value + 1))}><RefreshDouble width={16} height={16} aria-hidden /></button><button type="button" className={button} aria-label={copy.add} data-tip={copy.add} disabled={busy || loading || !canManage} onClick={() => startDraft('connection')}><Plus width={16} height={16} aria-hidden /></button></div>
          <div className="flex items-center gap-2 border-b border-edge px-2 py-1.5"><SelectField label={copy.scope} value={scope} disabled={busy || loading} className="min-w-0 flex-1" onChange={value => guarded(() => setScope(value as McpUsageScope))} options={scopeOptions} /><button type="button" className={button} aria-label={copy.createGroup} data-tip={copy.createGroup} disabled={!canManage || loading || busy} onClick={() => startDraft('group')}><Folder width={16} height={16} aria-hidden /><Plus width={12} height={12} aria-hidden /></button></div>
          <div aria-label="MCP" aria-busy={loading} className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1">
            {loading && !inventory ? <p role="status" className="px-3 py-4 text-xs text-ink-secondary">{uiText('불러오는 중…')}</p> : <>
              {!grouped.length && !ungrouped.length && <p className="px-3 py-4 text-xs leading-relaxed text-ink-secondary">{search ? copy.noResults : copy.empty}</p>}
              {grouped.map((item, index) => {
                const allMembers = inventory!.servers.filter(server => server.groupId === item.id)
                const members = !search || item.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()) ? allMembers : allMembers.filter(matches)
                const isExpanded = expanded.has(item.id) || !!search
                const gate = enabledIn(item.usage, scope)
                const enabledCount = gate ? allMembers.filter(server => enabledIn(server.usage, scope)).length : 0
                const Icon = item.id === 'cloudflare' ? Cloud : Folder
                return <section key={item.id} aria-label={item.name} className="border-b border-edge last:border-b-0">
                  <div className="flex min-h-12 items-center gap-0.5 px-2">
                    <button type="button" aria-label={`${item.name} ${isExpanded ? uiText('접기') : uiText('펼치기')}`} aria-expanded={isExpanded} aria-controls={`${listId}-${index}`} className="flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded px-1 text-left hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent" onClick={() => setExpanded(previous => { const next = new Set(previous); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next })}>
                      <NavArrowRight width={12} height={12} aria-hidden className={`shrink-0 transition-transform duration-150 motion-reduce:transition-none ${isExpanded ? 'rotate-90' : ''}`} /><Icon width={18} height={18} aria-hidden className="shrink-0 text-ink-secondary" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{item.name}</span><span className="block text-[11px] text-ink-secondary tabular-nums">{enabledCount}/{allMembers.length} {copy.used}</span></span>
                    </button><button type="button" className={`${button} px-1.5`} aria-label={`${item.name} ${copy.manage}`} data-tip={copy.manage} disabled={busy} onClick={() => openGroup(item)}><Settings width={15} height={15} aria-hidden /></button>{switchControl('group', item.id, item.usage, item.name)}
                  </div>
                  <div id={`${listId}-${index}`} hidden={!isExpanded}>{members.length ? members.map(member => serverRow(member, gate, true)) : <p className="px-8 pb-3 text-xs text-ink-secondary">{copy.emptyGroup}</p>}</div>
                </section>
              })}
              {ungrouped.map(item => serverRow(item))}
            </>}
          </div>
          <footer className="shrink-0 space-y-1 border-t border-edge px-2 py-2">
            <button type="button" className={`${button} w-full justify-start`} disabled={busy || loading || !canManage} onClick={() => startDraft('cloudflare')}><Cloud width={16} height={16} aria-hidden />{copy.addCloudflare}</button>
            <button type="button" className={`${button} w-full justify-between`} disabled={busy} onClick={() => guarded(onOpenSources)}><span>{copy.external}</span><NavArrowRight width={14} height={14} aria-hidden /></button>
            <p className="px-1 text-[11px] leading-relaxed text-ink-secondary">{copy.sessionHint}</p>
          </footer>
        </aside>
        <main className={`${showingDetail ? 'flex' : 'hidden md:flex'} min-h-0 min-w-0 flex-1 flex-col`}>
          {!showingDetail ? <div className="m-auto max-w-sm space-y-2 px-5 text-center"><PlugTypeA width={28} height={28} aria-hidden className="mx-auto mb-3 text-ink-secondary" /><h3 className="text-sm font-medium">{copy.select}</h3><p className="text-xs leading-relaxed text-ink-secondary">{copy.selectHint}</p><p className="text-[11px] leading-relaxed text-ink-secondary">{copy.sharedHint}</p></div> : <>
            <div className="shrink-0 space-y-2 border-b border-edge p-3">
              <div className="flex items-center gap-1"><button type="button" className={`${button} -ml-1 md:hidden`} aria-label={uiText('목록으로')} data-tip={uiText('목록으로')} disabled={busy} onClick={() => guarded(reset)}><ArrowLeft width={16} height={16} aria-hidden /></button><h3 ref={headingRef} tabIndex={-1} className="min-w-0 flex-1 break-words text-sm font-semibold outline-none">{title}</h3>
                {group && !group.suggested && !draft && canManage && <><button type="button" className={button} aria-label={copy.rename} data-tip={copy.rename} disabled={busy} onClick={() => { setName(group.name); setDraft('rename') }}><EditPencil width={16} height={16} aria-hidden /></button><button type="button" className={`${button} text-danger-ink`} aria-label={copy.removeGroup} data-tip={copy.removeGroup} disabled={busy} onClick={() => setConfirmation({ text: copy.removeGroupConfirm, label: copy.remove, action: () => mutate({ action: 'remove-group', id: group.id }, reset) })}><Trash width={16} height={16} aria-hidden /></button></>}
              </div>
              {currentUsage && !draft && <><div className="flex flex-wrap items-center gap-2"><span className="min-w-0 flex-1 text-xs text-ink-secondary">{scope === 'common' ? copy.common : currentUsage.project === null ? copy.inherited : copy.overridden}</span>{group ? switchControl('group', group.id, group.usage, group.name) : server ? switchControl('server', server.name, server.usage) : null}{scope === 'project' && currentUsage.project !== null && <button type="button" className={button} disabled={busy} onClick={() => usage(server ? 'server' : 'group', server?.name ?? group!.id, null)}>{copy.reset}</button>}</div>{server && !groupGate && <p className="text-xs text-ink-secondary">{copy.groupOff}. {copy.groupHint}</p>}</>}
              {group && !draft && <><p className="text-xs leading-relaxed text-ink-secondary">{copy.groupHint}</p><p className="text-[11px] leading-relaxed text-ink-secondary">{copy.groupStructureHint}</p></>}
              {draft === 'cloudflare' && <p className="text-xs leading-relaxed text-ink-secondary">{copy.cloudflareHint}</p>}
              {!canManage && <p className="text-xs text-ink-secondary">{copy.readonly}</p>}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {draft === 'connection' ? <McpConnectionFields copy={copy} name={name} url={url} json={json} advanced={advanced} scope={scope} busy={busy} onName={setName} onUrl={setUrl} onJson={setJson} onToggleAdvanced={() => { setJson(JSON.stringify({ type: 'http', url }, null, 2)); setAdvanced(true) }} />
                : draft === 'group' || draft === 'rename' ? <McpGroupFields copy={copy} name={name} busy={busy} onName={setName} servers={draft === 'group' ? inventory?.servers : undefined} selectedMembers={selectedMembers} onToggleMember={toggleMember} />
                : draft === 'cloudflare' && inventory ? <McpCloudflareFields copy={copy} preview={inventory.cloudflare} name={name} scope={scope} busy={busy} ready={cloudflareReady} selectedMembers={selectedMembers} onName={setName} onToggleMember={toggleMember} />
                  : server ? <>
                    <SharedMcpConnection key={`${server.name}:${reload}`} name={server.name} canManage={canManage} logoutLabel={copy.logout} onStatusChange={value => setStatuses(previous => ({ ...previous, [server.name]: { status: value.status, error: value.error } }))} />
                    <div className="space-y-3 p-3"><SelectField label={copy.group} value={server.groupId ?? ''} disabled={busy || !canManage} onChange={value => mutate({ action: 'assign', names: [server.name], groupId: value || null })} options={[{ value: '', label: copy.ungrouped }, ...(inventory?.groups.map(group => ({ value: group.id, label: group.name })) ?? [])]} />
                      <dl className="space-y-1 text-xs"><dt className="text-ink-secondary">{copy.endpoint}</dt><dd className="select-text break-all leading-relaxed">{server.endpoint}</dd></dl><p className="text-[11px] leading-relaxed text-ink-secondary">{copy.sharedHint}</p><button type="button" className={`${button} -ml-2`} disabled={busy} onClick={() => guarded(onOpenSources)}><Settings width={14} height={14} aria-hidden />{copy.sources}</button><p className="text-[11px] leading-relaxed text-ink-secondary">{copy.externalHint}</p>
                    </div>
                  </> : group ? <div className="space-y-1 py-2"><h4 className="px-3 py-1 text-xs font-medium text-ink-secondary">{copy.members}</h4>{!group.members.length && <p className="px-3 py-2 text-xs leading-relaxed text-ink-secondary">{copy.membersEmpty}</p>}{inventory?.servers.filter(server => server.groupId === group.id).map(item => serverRow(item, enabledIn(group.usage, scope)))}{group.id === 'cloudflare' && canManage && <div className="border-t border-edge px-3 pt-2"><button type="button" className={button} disabled={busy} onClick={() => startDraft('cloudflare')}><Cloud width={16} height={16} aria-hidden />{copy.cloudflare}</button></div>}</div> : null}
            </div>
            {draft && <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-edge p-2"><button type="button" className={button} disabled={busy} onClick={() => guarded(() => { setDraft(null); if (draft !== 'rename') reset() })}>{uiText('취소')}</button><button type="button" className={primary} disabled={busy || !name.trim() || !canManage || draft === 'connection' && !(advanced ? json.trim() : url.trim())} onClick={saveDraft}>{busy ? uiText('저장 중…') : draft === 'cloudflare' ? cloudflareReady ? copy.cloudflareApply : unifiedName ? copy.cloudflareConnect : copy.cloudflareStart : uiText('저장')}</button></footer>}
          </>}
        </main>
      </div>
    </div>
  </div>, document.body)
}
