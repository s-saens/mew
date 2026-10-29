import { canAutoFocusInput, HoverTipLayer, useDialog } from '@mew/ui'
import { uiText } from '@mew/ui/i18n-core'
import { useUiLocale } from '@mew/ui/i18n'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { replaceInProjectFile, searchFileNames, searchProjectStream, type SearchFileResult, type SearchMatch, type SearchOptions } from '../api/client'
import type { ExplorerSearch } from '../utils/explorer-search'
import { ProjectIcon } from './ProjectIcon'
import { PanelCloseButton } from './panel-close-button'
import { useI18n } from '../i18n'

export interface SearchScopeOption { id: string; label: string; icon: string }

export function SearchPanel({ focusSignal, readOnly, project, scope, scopes, mode, onModeChange, onOpenResult, onReplaced, registerSearchCancel, refreshSignal = 0, clearSignal = 0, onClose, actions, children }: {
  focusSignal: number
  readOnly: boolean
  project: string
  scope: 'docs' | 'root'
  scopes: SearchScopeOption[]
  mode: 'files' | 'content'
  onModeChange: (mode: 'files' | 'content') => void
  onOpenResult: (path: string, match: SearchMatch, query: string, opts: SearchOptions, project?: string) => void
  onReplaced: () => void
  registerSearchCancel?: (cancel: (() => boolean) | null) => void
  refreshSignal?: number
  clearSignal?: number
  onClose?: () => void
  actions?: ReactNode
  children: (search: ExplorerSearch | undefined) => ReactNode
}) {
  useUiLocale()
  const { t } = useI18n()
  const dialogs = useDialog()
  const [query, setQuery] = useState('')
  const [replace, setReplace] = useState('')
  const [showReplace, setShowReplace] = useState(false)
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [regex, setRegex] = useState(false)
  const [selectedScopes, setSelectedScopes] = useState<string[]>([])
  const [scopeMenuOpen, setScopeMenuOpen] = useState(false)
  const [results, setResults] = useState<SearchFileResult[]>([])
  const [filePaths, setFilePaths] = useState<string[]>([])
  const [truncated, setTruncated] = useState(false)
  const [indexState, setIndexState] = useState<'ready' | 'building' | 'stale' | 'disabled'>('ready')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const reqId = useRef(0)
  const streamAbort = useRef<AbortController | null>(null)
  const activeScopes = scope === 'docs' ? ['docs'] : selectedScopes.length ? selectedScopes : ['root']
  const opts: SearchOptions = { regex, caseSensitive, scopes: activeScopes }

  const run = useCallback((q: string, options: SearchOptions) => {
    streamAbort.current?.abort()
    const id = ++reqId.current
    if (!q) return
    const controller = new AbortController()
    streamAbort.current = controller
    setLoading(true)
    setResults([])
    setFilePaths([])
    setError(null)
    setTruncated(false)
    let pending: SearchFileResult[] = []
    let timer: ReturnType<typeof setTimeout> | undefined
    const flush = () => {
      clearTimeout(timer)
      timer = undefined
      const batch = pending
      pending = []
      if (id === reqId.current && batch.length) setResults(current => id === reqId.current ? [...current, ...batch] : current)
    }
    const request = mode === 'files' ? searchFileNames(q, options, controller.signal) : searchProjectStream(q, options, project, file => {
      if (id !== reqId.current) return
      pending.push(file)
      if (pending.length >= 20) flush()
      else if (!timer) timer = setTimeout(flush, 50)
    }, controller.signal)
    void request.then(response => {
      if (id !== reqId.current) return
      flush()
      if ('results' in response) setFilePaths(response.results.map(file => file.path))
      else setTruncated(response.truncated)
      setIndexState(response.state)
    }).catch(err => {
      if (id !== reqId.current) return
      setResults([])
      setFilePaths([])
      setError(err instanceof Error ? err.message : uiText('검색 실패'))
    }).finally(() => {
      clearTimeout(timer)
      if (id === reqId.current) { streamAbort.current = null; setLoading(false) }
    })
  }, [mode, project])

  useEffect(() => {
    setResults([])
    setFilePaths([])
    setError(null)
    setTruncated(false)
    setIndexState('ready')
    setLoading(!!query)
    const timer = setTimeout(() => run(query, { regex, caseSensitive, scopes: scope === 'docs' ? ['docs'] : selectedScopes.length ? selectedScopes : ['root'] }), 250)
    return () => { clearTimeout(timer); reqId.current++; streamAbort.current?.abort() }
  }, [query, regex, caseSensitive, selectedScopes, scope, run, refreshSignal])

  useEffect(() => {
    if (canAutoFocusInput() && focusSignal) { inputRef.current?.focus(); inputRef.current?.select() }
  }, [focusSignal])
  useEffect(() => {
    registerSearchCancel?.(() => {
      if (scopeMenuOpen) { setScopeMenuOpen(false); return true }
      if (!query) return false
      setQuery('')
      return true
    })
    return () => registerSearchCancel?.(null)
  }, [registerSearchCancel, scopeMenuOpen, query])
  useEffect(() => { setScopeMenuOpen(false) }, [scope])
  useEffect(() => { setQuery(''); setScopeMenuOpen(false) }, [clearSignal])

  const paths = useMemo(() => mode === 'content' ? results.map(file => file.path) : filePaths, [mode, results, filePaths])
  const matches = useMemo(() => new Map(results.map(file => [file.path, file.matches])), [results])
  const totalMatches = results.reduce((count, file) => count + file.matches.length, 0)
  async function replaceFiles(files: SearchFileResult[], confirm: boolean) {
    if (busy || !files.length) return
    if (confirm && !(await dialogs.confirm({ message: uiText('모두 바꾸고 커밋할까요?'), detail: uiText('{p0}개 파일에서 {p1}개 매치를 "{p2}"(으)로 바꿉니다.', { p0: files.length, p1: totalMatches, p2: replace }), confirmLabel: uiText('모두 바꾸기'), danger: true }))) return
    setBusy(true)
    const currentId = reqId.current
    try {
      for (const file of files) await replaceInProjectFile(file.path, query, replace, opts, file.project?.id ?? project)
      onReplaced()
      if (currentId === reqId.current) run(query, opts)
    } catch (err) { setError(err instanceof Error ? err.message : uiText('바꾸기 실패')) }
    finally { setBusy(false) }
  }
  const search: ExplorerSearch | undefined = query ? {
    query, paths, matches, onClear: () => setQuery(''),
    onOpenMatch: (path, match) => onOpenResult(path, match, query, opts, results.find(file => file.path === path)?.project?.id ?? project),
    onReplaceFile: mode === 'content' && showReplace && !readOnly && !busy ? path => { const file = results.find(file => file.path === path); if (file) void replaceFiles([file], false) } : undefined,
  } : undefined
  const optionClass = (pressed: boolean) => `flex h-6 w-6 shrink-0 items-center justify-center rounded text-xs focus-visible:outline-2 focus-visible:outline-accent ${pressed ? 'bg-accent text-ink-on-accent' : 'text-ink-muted hover:bg-surface-hover'}`

  return <div className="flex h-full min-h-0 min-w-0 flex-col text-sm">
    {dialogs.dialog}
    <HoverTipLayer className="shrink-0 border-b border-edge p-1.5" placement="bottom">
      <div data-explorer-search-bar className="flex min-w-0 items-center gap-1">
      <div className="relative flex min-w-0 flex-1 items-center gap-0.5 rounded border border-edge-strong bg-surface-deep px-1 focus-within:border-accent">
        <input ref={inputRef} value={query} onChange={event => setQuery(event.target.value)}
          placeholder={mode === 'files' ? t('search.fileNamePlaceholder') : t('search.fileContentPlaceholder')}
          aria-label={uiText(mode === 'files' ? '파일명 검색' : '파일 내용 검색')}
          onKeyDown={event => {
            if (event.key === '@' && scope === 'root' && scopes.length) { event.preventDefault(); setScopeMenuOpen(true) }
            if (event.key === 'Escape' && (query || scopeMenuOpen)) { event.preventDefault(); event.stopPropagation(); if (scopeMenuOpen) setScopeMenuOpen(false); else setQuery('') }
          }}
          className="w-0 min-w-0 flex-1 bg-transparent px-1 py-1.5 text-sm text-ink outline-none placeholder:text-ink-faint" spellCheck={false} />
        {query && <button type="button" className={optionClass(false)} onClick={() => { setQuery(''); inputRef.current?.focus() }} aria-label={uiText('검색 지우기')} data-tip={uiText('검색 지우기')}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
        </button>}
        <button type="button" onClick={() => setCaseSensitive(value => !value)} className={optionClass(caseSensitive)} aria-label={uiText('대소문자 구분')} data-tip={uiText('대소문자 구분')} aria-pressed={caseSensitive}>Aa</button>
        <button type="button" onClick={() => setRegex(value => !value)} className={optionClass(regex)} aria-label={uiText('정규식 사용')} data-tip={uiText('정규식 사용')} aria-pressed={regex}>.*</button>
        <button type="button" onClick={() => onModeChange(mode === 'files' ? 'content' : 'files')} className={optionClass(mode === 'content')} aria-label={uiText('파일 내용 검색')} data-tip={uiText('파일 내용 검색')} aria-pressed={mode === 'content'}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6M14 3v6h6M14 3l6 6M8 13h4M8 17h3" /><circle cx="17" cy="17" r="3.5" /><path d="m19.5 19.5 2 2" /></svg>
        </button>
        {!readOnly && mode === 'content' && <button type="button" onClick={() => setShowReplace(value => !value)} className={optionClass(showReplace)} aria-label={uiText('바꾸기 토글')} data-tip={uiText(showReplace ? '바꾸기 접기' : '바꾸기 펼치기')} aria-expanded={showReplace}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M5 5h12l-3-3M19 19H7l3 3M17 5l-3 3M7 19l3-3M5 10V5M19 14v5" /></svg>
        </button>}
        {scopeMenuOpen && <div className="absolute left-0 top-full z-30 mt-1 max-h-64 w-full overflow-y-auto rounded border border-edge-bright bg-surface-raised py-1 shadow-lg" role="group" aria-label={uiText('검색할 범위 · 여러 개를 골라 OR로 검색')}>
          {scopes.map(item => <button key={item.id} type="button" aria-pressed={selectedScopes.includes(item.id)} onClick={() => setSelectedScopes(values => values.includes(item.id) ? values.filter(value => value !== item.id) : [...values, item.id])} className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs text-ink-secondary hover:bg-surface-hover">
            <ProjectIcon icon={item.icon} size={14} /><span className="flex-1 truncate">{item.label}</span>{selectedScopes.includes(item.id) && <span aria-hidden="true">✓</span>}
          </button>)}
          <button type="button" onClick={() => setScopeMenuOpen(false)} className="w-full px-2 py-1 text-left text-xs text-ink-muted hover:bg-surface-hover">{uiText('완료')}</button>
        </div>}
      </div>
      {onClose && <PanelCloseButton onClick={onClose} aria-label={uiText('파일 탐색기 닫기')} />}
      </div>
      {scope === 'root' && selectedScopes.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{selectedScopes.map(id => <button key={id} type="button" onClick={() => setSelectedScopes(values => values.filter(value => value !== id))} className="flex min-w-0 items-center gap-1 rounded bg-accent/15 px-1 text-xs text-ink" aria-label={uiText('{p0} 범위 제거', { p0: scopes.find(item => item.id === id)?.label ?? id })}><span className="truncate">{scopes.find(item => item.id === id)?.label}</span><span aria-hidden="true">×</span></button>)}</div>}
      {mode === 'content' && showReplace && !readOnly && <div className="mt-1 flex items-center gap-1">
        <input value={replace} onChange={event => setReplace(event.target.value)} placeholder={uiText('바꾸기')} aria-label={uiText('바꾸기')} spellCheck={false} className="min-w-0 flex-1 rounded border border-edge-strong bg-surface-deep px-2 py-1 text-sm text-ink outline-none focus:border-accent" />
        <button type="button" onClick={() => void replaceFiles(results, true)} disabled={busy || loading || !results.length} className="shrink-0 rounded px-1.5 py-1 text-xs text-ink-muted enabled:hover:bg-surface-hover disabled:opacity-40" data-tip={uiText('모든 파일에서 모두 바꾸기 (커밋)')}>{uiText('모두')}</button>
      </div>}
    </HoverTipLayer>
    {actions}
    {error && <div role="alert" className="select-text px-2 py-1 text-xs text-danger-strong">{error}</div>}
    {query && <div role="status" className="shrink-0 px-2 py-1 text-xs text-ink-muted">
      {loading ? uiText('검색 중…') : !paths.length ? uiText('결과 없음') : mode === 'content' ? uiText('검색 결과 {matches}개 · 파일 {files}개', { matches: totalMatches, files: paths.length }) : uiText('파일 {files}개', { files: paths.length })}
      {truncated ? uiText(' (일부만 표시)') : ''}
      {mode === 'content' && indexState !== 'ready' && <div>{indexState === 'building' ? uiText('색인 준비 중 — 정확 검색으로 보완 중') : indexState === 'disabled' ? uiText('정확 검색 색인 꺼짐 — 원문 검색 중') : uiText('색인 복구 중 — 원문 검색으로 보완 중')}</div>}
    </div>}
    <div className="min-h-0 flex-1">{children(search)}</div>
  </div>
}
