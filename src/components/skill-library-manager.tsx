import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, Download, EditPencil, Plus, RefreshDouble, Trash, Xmark } from 'iconoir-react'
import { canAutoFocusInput, SelectField, useOverlayDismiss } from '@mew/ui'
import { uiText } from '@mew/ui/i18n-core'
import { useUiLocale } from '@mew/ui/i18n'
import { fetchSkillLibrary, fetchSkillLibraryDetail, mutateSkillLibrary } from '../api/skill-library'
import { skillLibraryCopy } from './skill-library-copy'
import type { SkillLibraryDetail, SkillLibraryInventory, SkillLibraryItem, SkillLibraryMutation, SkillScope } from '../../shared/skill-library'

const button = 'inline-flex min-h-9 items-center justify-center gap-1.5 rounded px-2 text-xs text-ink-secondary hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40'
const input = 'min-h-9 min-w-0 rounded border border-edge-strong bg-surface px-2 text-xs text-ink placeholder:text-ink-secondary focus:outline-2 focus:outline-accent'
const initialContent = '---\nname: my-skill\ndescription: Describe when to use this skill.\n---\n\n# Instructions\n'
type View = 'installed' | 'external' | 'defaults'

export function SkillLibraryManager({ cwd, onClose, onSwitchMcp }: { cwd: string; onClose: () => void; onSwitchMcp: () => void }) {
  const copy = skillLibraryCopy[useUiLocale()]
  const [inventory, setInventory] = useState<SkillLibraryInventory | null>(null)
  const [view, setView] = useState<View>('installed'), [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null), [detail, setDetail] = useState<SkillLibraryDetail | null>(null)
  const [creating, setCreating] = useState(false), [editing, setEditing] = useState(false)
  const [name, setName] = useState(''), [content, setContent] = useState(''), [scope, setScope] = useState<SkillScope>('common')
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [reload, setReload] = useState(0)
  const [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [confirmation, setConfirmation] = useState<{ text: string; label: string; action: () => void } | null>(null)
  const dialog = useRef<HTMLDivElement>(null), searchRef = useRef<HTMLInputElement>(null), confirmRef = useRef<HTMLButtonElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null), editorRef = useRef<HTMLTextAreaElement>(null), hadDetail = useRef(false)
  const confirmationId = useId()
  const dirty = creating || editing && content !== detail?.content
  const showingDetail = !!selectedId || creating
  const selected = inventory?.items.find(item => item.id === selectedId)
  const otherOrigins = selected?.origins.filter(origin => origin.path !== selected.path) ?? []
  const candidate = inventory?.candidates.find(item => item.id === selectedId)
  const scopeLabel = (value: SkillScope) => value === 'common' ? copy.common : copy.project
  const scopeOptions = [{ value: 'common', label: copy.common }, { value: 'project', label: copy.project }]
  const reset = () => { setSelectedId(null); setDetail(null); setCreating(false); setEditing(false); setContent(''); setError('') }
  const guarded = (action: () => void) => {
    if (busy) return
    if (dirty) setConfirmation({ text: uiText('저장하지 않은 변경사항을 버릴까요?'), label: uiText('변경 버리기'), action })
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
    if (!dirty) return
    const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', prevent)
    return () => window.removeEventListener('beforeunload', prevent)
  }, [dirty])
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError('')
    fetchSkillLibrary(cwd, controller.signal).then(setInventory)
      .catch(error => { if (!controller.signal.aborted) setError(error.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [cwd, reload])
  useEffect(() => {
    if (!selectedId) return
    const controller = new AbortController()
    setDetail(null); setError('')
    fetchSkillLibraryDetail(cwd, selectedId, controller.signal).then(value => {
      setDetail(value); setContent(value.content)
      setScope(value.item?.enabledScope ?? value.candidate?.scope ?? 'common')
    }).catch(error => { if (!controller.signal.aborted) setError(error.message) })
    return () => controller.abort()
  }, [cwd, selectedId, reload])
  useEffect(() => {
    if (showingDetail && (creating || window.matchMedia('(max-width: 767px)').matches)) headingRef.current?.focus()
    else if (!showingDetail && hadDetail.current && canAutoFocusInput()) searchRef.current?.focus()
    hadDetail.current = showingDetail
  }, [showingDetail, selectedId, creating])
  useEffect(() => { if (editing && canAutoFocusInput()) editorRef.current?.focus() }, [editing])

  async function mutate(input: Omit<SkillLibraryMutation, 'cwd'>, preserveSelection = false) {
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      await mutateSkillLibrary({ cwd, ...input })
      if (!preserveSelection) reset()
      setEditing(false); setReload(value => value + 1)
      setNotice(input.action === 'delete' ? copy.removed : input.action === 'import' ? copy.imported : input.action === 'toggle' || input.action === 'reset' ? copy.updated : copy.saved)
      window.dispatchEvent(new Event('mew:harness-changed'))
    } catch (error) { setError(error instanceof Error ? error.message : uiText('변경하지 못했습니다')) }
    finally { setBusy(false) }
  }
  function create() {
    reset(); setView('installed'); setCreating(true); setName(''); setScope('common'); setContent(initialContent)
  }
  function toggle(item: SkillLibraryItem, enabled: boolean, applyScope = item.enabledScope) {
    guarded(() => { void mutate({ action: 'toggle', id: item.id, revision: item.revision, scope: applyScope, enabled }, selectedId === item.id) })
  }
  const matches = (item: { name: string; description: string }) => `${item.name} ${item.description}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())
  const items = inventory?.items.filter(matches) ?? []
  const candidates = inventory?.candidates.filter(matches) ?? []
  const defaults = inventory?.defaults.filter(matches) ?? []
  const switchControl = (item: SkillLibraryItem, applyScope = item.enabledScope) => {
    const enabled = applyScope === 'common' ? item.commonEnabled ?? item.enabled : item.enabled
    return <button type="button" role="switch" aria-checked={enabled} aria-label={`${item.name} ${copy.enabled}`} disabled={busy || loading || !!confirmation} onClick={() => toggle(item, !enabled, applyScope)} className={`${button} shrink-0 gap-1.5 px-1.5`}>
      <span aria-hidden className={`flex h-4 w-7 shrink-0 items-center rounded-full px-0.5 ${enabled ? 'justify-end bg-accent' : 'justify-start bg-edge-strong'}`}><span className="h-3 w-3 rounded-full bg-surface" /></span><span className="min-w-6 text-left">{enabled ? copy.enabled : copy.disabled}</span>
    </button>
  }

  return createPortal(<div data-cmd-overlay className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/40 p-2 sm:p-5" onMouseDown={event => { if (event.target === event.currentTarget) close() }}>
    <div ref={dialog} role="dialog" aria-modal="true" aria-label={uiText('에이전트 확장 관리')} className="flex h-[90dvh] w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-edge-bright bg-surface text-ink shadow-xl" onKeyDown={event => {
      if (event.key !== 'Tab') return
      const focusRoot = confirmation ? dialog.current?.querySelector('[role="alertdialog"]') : dialog.current
      const nodes = Array.from(focusRoot?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]') ?? []).filter(node => node.getClientRects().length && !node.closest('[inert]'))
      const first = nodes[0], last = nodes.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }}>
      <header inert={confirmation ? true : undefined} className="flex shrink-0 items-center gap-3 border-b border-edge px-3 py-2">
        <h2 className="text-sm font-semibold">{uiText('에이전트 확장')}</h2>
        <div className="flex gap-1" role="group" aria-label={uiText('확장 종류')}><button type="button" aria-pressed="true" className={`${button} bg-surface-hover font-semibold text-ink`}>Skills</button><button type="button" aria-pressed="false" className={button} onClick={() => guarded(onSwitchMcp)}>MCP</button></div>
        <button type="button" className={`${button} ml-auto`} aria-label={uiText('닫기')} data-tip={uiText('닫기')} disabled={busy} onClick={close}><Xmark width={18} height={18} aria-hidden /></button>
      </header>
      {confirmation && <div role="alertdialog" aria-label={uiText('변경 확인')} aria-describedby={confirmationId} className="flex flex-wrap items-center gap-2 border-b border-edge bg-surface-raised px-3 py-2">
        <p id={confirmationId} className="min-w-0 flex-1 text-sm">{confirmation.text}</p><button type="button" className={button} onClick={() => setConfirmation(null)}>{uiText('취소')}</button><button ref={confirmRef} type="button" className={`${button} text-danger-strong`} onClick={() => { const action = confirmation.action; setConfirmation(null); action() }}>{confirmation.label}</button>
      </div>}
      {error && <div role="alert" className="shrink-0 border-b border-edge px-3 py-2 text-xs text-danger-strong">{error}<button type="button" className={`${button} ml-2`} disabled={busy} onClick={() => guarded(() => { reset(); setReload(value => value + 1) })}>{uiText('다시 불러오기')}</button></div>}
      {notice && <p role="status" className="shrink-0 border-b border-edge px-3 py-2 text-xs text-ink-secondary">{notice}</p>}
      <div className="flex min-h-0 flex-1" inert={confirmation ? true : undefined}>
        <aside className={`${showingDetail ? 'hidden md:flex' : 'flex'} min-h-0 w-full flex-col border-r border-edge md:w-96 md:shrink-0`}>
          <div className="flex gap-1 border-b border-edge p-2"><input ref={searchRef} className={`${input} w-full`} value={search} aria-label={copy.search} placeholder={copy.search} onChange={event => setSearch(event.target.value)} /><button type="button" className={button} aria-label={uiText('새로고침')} data-tip={uiText('새로고침')} disabled={busy || loading} onClick={() => guarded(() => { reset(); setReload(value => value + 1) })}><RefreshDouble width={16} height={16} aria-hidden /></button><button type="button" className={button} aria-label={copy.add} data-tip={copy.add} disabled={busy || loading} onClick={() => guarded(create)}><Plus width={16} height={16} aria-hidden /></button></div>
          <nav aria-label={copy.title} className="flex shrink-0 flex-wrap gap-1 border-b border-edge p-1">{(['installed', 'external', 'defaults'] as const).map(value => <button key={value} type="button" aria-pressed={view === value} onClick={() => guarded(() => { reset(); setView(value) })} className={`${button} ${view === value ? 'bg-surface-hover font-semibold text-ink' : ''}`}>{copy[value]}</button>)}</nav>
          <div aria-label={copy[view]} aria-busy={loading} className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1">
            {loading && !inventory ? <p role="status" className="px-3 py-4 text-xs text-ink-secondary">{uiText('불러오는 중…')}</p> : view === 'installed' ? <>
              {!items.length && <p className="px-3 py-4 text-xs text-ink-secondary">{search ? uiText('검색 결과가 없습니다.') : copy.empty}</p>}
              {items.map(item => <div key={item.id} className={`flex min-h-10 items-center gap-1 px-2 ${selectedId === item.id ? 'bg-surface-hover' : ''}`}><button type="button" aria-pressed={selectedId === item.id} aria-label={item.name} onClick={() => guarded(() => { reset(); setSelectedId(item.id) })} className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded px-1 text-left text-sm hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"><span className="min-w-0 flex-1 truncate">{item.name}</span><span className="shrink-0 text-[11px] text-ink-secondary">{scopeLabel(item.enabledScope)}</span></button>{switchControl(item)}</div>)}
            </> : view === 'external' ? <>
              <p className="px-3 py-2 text-xs leading-relaxed text-ink-secondary">{copy.externalHint}</p>
              {!candidates.length && <p className="px-3 py-4 text-xs text-ink-secondary">{search ? uiText('검색 결과가 없습니다.') : copy.externalEmpty}</p>}
              {candidates.map(item => <button key={item.id} type="button" aria-pressed={selectedId === item.id} aria-label={`${item.name} ${item.label}`} onClick={() => guarded(() => { reset(); setSelectedId(item.id) })} className={`flex min-h-10 w-full items-center gap-2 px-3 text-left text-sm hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent ${selectedId === item.id ? 'bg-surface-hover' : ''}`}><span className="min-w-0 flex-1 truncate">{item.name}</span><span className="shrink-0 text-[11px] text-ink-secondary">{item.label}</span></button>)}
            </> : <>
              {!defaults.length && search && <p className="px-3 py-4 text-xs text-ink-secondary">{uiText('검색 결과가 없습니다.')}</p>}
              {defaults.length > 0 && defaults.every(item => item.installed) && <p className="px-3 py-2 text-xs text-ink-secondary">{copy.builtinEmpty}</p>}
              {defaults.map(item => <div key={item.name} className="flex min-h-10 items-center gap-2 px-3"><span className="min-w-0 flex-1 truncate text-sm" title={item.description}>{item.name}</span>{item.installed ? <span className="text-xs text-ink-secondary">{copy.installedLabel}</span> : <button type="button" className={button} aria-label={`${item.name} ${copy.restore}`} disabled={busy} onClick={() => void mutate({ action: 'restore', name: item.name })}><RefreshDouble width={14} height={14} aria-hidden />{copy.restore}</button>}</div>)}
            </>}
          </div>
          {!!inventory?.warnings.length && <details className="max-h-36 shrink-0 overflow-auto border-t border-edge px-3 py-2 text-xs text-ink-secondary"><summary className="cursor-pointer">{uiText('확인이 필요한 위치')}{inventory.warnings.length}{uiText('개')}</summary>{inventory.warnings.map(warning => <p key={warning} className="mt-2 select-text break-all">{warning}</p>)}</details>}
          <footer className="space-y-1 border-t border-edge px-3 py-2 text-[11px] leading-relaxed text-ink-secondary"><p>{copy.sessionHint}</p><p>{copy.nativeHint}</p></footer>
        </aside>
        <main className={`${showingDetail ? 'flex' : 'hidden md:flex'} min-h-0 min-w-0 flex-1 flex-col`}>
          {!showingDetail ? <p className="m-auto max-w-sm px-5 text-center text-sm leading-relaxed text-ink-secondary">{copy.select}</p> : <>
            <div className="shrink-0 space-y-2 border-b border-edge p-3">
              <div className="flex items-center gap-1"><button type="button" className={`${button} -ml-1 md:hidden`} aria-label={uiText('목록으로')} data-tip={uiText('목록으로')} onClick={() => guarded(reset)}><ArrowLeft width={16} height={16} aria-hidden /></button><h3 ref={headingRef} tabIndex={-1} className="min-w-0 flex-1 break-words text-sm font-semibold outline-none">{creating ? copy.newSkill : selected?.name ?? candidate?.name}</h3>
                {selected && !editing && <><button type="button" className={button} aria-label={copy.editing} data-tip={copy.editing} disabled={busy || !detail || !selected.editable} onClick={() => setEditing(true)}><EditPencil width={16} height={16} aria-hidden /></button><button type="button" className={`${button} text-danger-strong`} aria-label={uiText('삭제')} data-tip={uiText('삭제')} disabled={busy || !detail} onClick={() => setConfirmation({ text: selected.source === 'builtin' ? copy.removeBuiltin : copy.removeManaged, label: uiText('삭제'), action: () => { void mutate({ action: 'delete', id: selected.id, revision: detail?.revision }) } })}><Trash width={16} height={16} aria-hidden /></button></>}
              </div>
              {!creating && <p aria-label={copy.description} className="text-xs leading-relaxed text-ink-secondary">{selected?.description ?? candidate?.description}</p>}
              {selected && !editing && <div className="flex flex-wrap items-center gap-2"><SelectField label={copy.scope} value={scope} disabled={busy || !detail} className="min-w-0 flex-1" onChange={value => setScope(value as SkillScope)} options={selected.scope === 'project' ? [scopeOptions[1]] : scopeOptions} />{switchControl(selected, scope)}{selected.enabledScope === 'project' && selected.scope === 'common' && <button type="button" className={button} disabled={busy} onClick={() => void mutate({ action: 'reset', id: selected.id, scope: 'project', revision: selected.revision }, true)}>{copy.reset}</button>}</div>}
              {(creating || candidate) && <div className="flex items-center gap-2"><SelectField label={copy.storageScope} value={scope} disabled={busy} className="min-w-0 flex-1" onChange={value => setScope(value as SkillScope)} options={scopeOptions} />{candidate && <button type="button" className={`${button} bg-accent text-ink-on-accent hover:bg-accent/90`} disabled={busy || !detail || !candidate.importable} title={candidate.reason} onClick={() => void mutate({ action: 'import', id: candidate.id, revision: detail?.revision, scope })}><Download width={14} height={14} aria-hidden />{copy.import}</button>}</div>}
              {candidate?.reason && <p className="text-xs text-ink-secondary">{candidate.reason}</p>}
              {creating && <label className="block space-y-1 text-xs text-ink-secondary"><span>{copy.name}</span><input aria-label={copy.name} className={`${input} w-full`} value={name} disabled={busy} onChange={event => { const next = event.target.value; setContent(value => value.replace(`\nname: ${name || 'my-skill'}\n`, `\nname: ${next || 'my-skill'}\n`)); setName(next) }} placeholder="my-skill" /></label>}
            </div>
            {!creating && !detail ? <p role="status" className="p-3 text-xs text-ink-secondary">{error ? uiText('내용을 불러오지 못했습니다.') : uiText('내용을 불러오는 중…')}</p> : <>
              {editing || creating ? <textarea ref={editorRef} aria-label={copy.content} spellCheck={false} disabled={busy} value={content} onChange={event => setContent(event.target.value)} className="min-h-32 min-w-0 flex-1 resize-none bg-surface-deep p-3 font-mono text-xs leading-relaxed text-ink outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent" /> : <pre tabIndex={0} aria-label={copy.content} className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words bg-surface-deep p-3 font-mono text-xs leading-relaxed text-ink focus-visible:outline-2 focus-visible:outline-accent">{detail?.content}</pre>}
              {!creating && !editing && <details className="max-h-48 shrink-0 overflow-auto border-t border-edge px-3 py-2 text-xs text-ink-secondary"><summary className="cursor-pointer focus-visible:outline-2 focus-visible:outline-accent">{copy.sources}</summary><div className="space-y-2 py-2"><p className="font-medium text-ink">{candidate ? copy.externalSource : copy.currentSource} · {selected?.source === 'builtin' ? copy.defaultSource : candidate?.label ?? copy.managedSource}</p><p className="select-text break-all">{selected?.path ?? candidate?.path}</p>{!!otherOrigins.length && <><p className="pt-1 font-medium text-ink">{copy.duplicateSources}</p>{otherOrigins.map(origin => <p key={origin.id} className="select-text break-all">{origin.label} · {origin.path}</p>)}</>}{!!detail?.files.length && <><p className="pt-1 font-medium text-ink">{copy.included}</p>{detail.files.map(file => <p key={file} className="select-text break-all">{file}</p>)}</>}</div></details>}
              {(creating || editing) && <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-edge p-2"><button type="button" className={button} disabled={busy} onClick={() => guarded(() => { if (creating) reset(); else { setEditing(false); setContent(detail?.content ?? '') } })}>{uiText('취소')}</button><button type="button" className={`${button} bg-accent text-ink-on-accent hover:bg-accent/90`} disabled={busy || creating && !name.trim() || editing && !dirty} onClick={() => void mutate(creating ? { action: 'create', name: name.trim(), scope, content } : { action: 'save', id: selectedId!, revision: detail?.revision, content }, !creating)}>{busy ? uiText('저장 중…') : uiText('저장')}</button></footer>}
            </>}
          </>}
        </main>
      </div>
    </div>
  </div>, document.body)
}
