import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { DialogFrame, useToast } from '@mew/ui'
import { scopedBrowserStorage } from '@mew/ui/browser-storage-scope'
import { uiText } from '@mew/ui/i18n-core'
import { useI18n } from '../i18n'
import { createWorkspaceClient, workspaceClient, type WorkspaceInfo } from '../api/client'
import { WorkspaceApiProvider } from '../api/workspace-api-context'
import { ProjectBoard } from '../components/project-board'
import { ProjectDraftSelector } from '../components/project-draft-selector'
import { DeferredProjectCatalogPanel as ProjectCatalogPanel } from '../components/deferred-project-catalog'
import { ProjectIcon } from '../components/ProjectIcon'
import { CommandButtonMenu } from '../components/CommandButtonMenu'
import { PanelCloseButton } from '../components/panel-close-button'
import { AppErrorBoundary } from '../components/app-error-boundary'
import { StartupScreen } from '../components/startup-screen'
import { createProjectBoard, normalizeProjectBoard, projectBoardReducer, type ProjectBoardPanel, type ProjectBoardState } from '../utils/project-board'
import { uuid } from '../utils/uuid'
import { WorkspaceViewProvider, useWorkspaceDesktop } from './workspace-view-context'
import { BrowserContext, useWorkspaceAccount, useWorkspaceBrowser } from './workspace-account'
import { deferredComponent } from '../components/deferred-component'
import type { MewcatAction } from '../../shared/mewcat-assistant'
import { WORKSPACE_SCOPE_VERSION } from '../../shared/workspace-scope'


const BoardBrowser = deferredComponent(async () => ({ default: (await import('../components/BrowserDesktopPanel')).BrowserDesktopPanel }))

export type WorkspaceMode = 'single' | 'multi'
export type ProjectWorkspaceHandle = {
  prepareClose: () => Promise<() => void>
  workspacePath?: string | null
  isReady?: () => boolean
  performAction?: (action: MewcatAction) => Promise<void>
}
export type ProjectWorkspaceHost = {
  id: string
  panel: ProjectBoardPanel
  active: boolean
  compact: boolean
  mode: WorkspaceMode
  headerHost: HTMLElement | null
  selectionSignal: number
  globalOwner: boolean
  onModeChange: (mode: WorkspaceMode) => void
  onProjectChange: (path: string) => Promise<boolean>
  onAction: (action: MewcatAction) => Promise<void>
  onScopeChanged: (info: WorkspaceInfo) => void
  register: (handle: ProjectWorkspaceHandle | null) => void
}
type Props = { account: string | null; guest: boolean; renderWorkspace: (host?: ProjectWorkspaceHost, onWorkspaceReady?: (info: WorkspaceInfo) => void) => ReactNode }
const label = (path: string) => path.replace(/[\\/]+$/, '').split(/[\\/]/).at(-1) ?? path
const panelFor = (info: WorkspaceInfo): ProjectBoardPanel => ({ id: uuid(), projectPath: info.projectPath ?? info.path, workingRoot: info.path })
const sameScope = (left: Pick<ProjectBoardPanel, 'projectPath' | 'workingRoot'>, right: Pick<ProjectBoardPanel, 'projectPath' | 'workingRoot'>) => left.projectPath === right.projectPath && left.workingRoot === right.workingRoot
const modeKey = (account: string) => `mew:workspace-mode:${encodeURIComponent(account)}`
const boardKey = (account: string) => `mew:project-board:${encodeURIComponent(account)}`
function readMode(account: string): WorkspaceMode {
  try { return scopedBrowserStorage().getItem(modeKey(account)) === 'multi' ? 'multi' : 'single' } catch { return 'single' }
}
async function waitForWorkspace<T>(read: () => T | undefined): Promise<T> {
  const deadline = performance.now() + 10_000
  while (performance.now() < deadline) {
    const value = read()
    if (value !== undefined) return value
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  throw new Error('MEWCAT_ACTION_FAILED')
}

function ProjectHost({ panel, compact, active, legacy, busy, onRecover, restoreFocus, children }: { panel: ProjectBoardPanel; compact: boolean; active: boolean; legacy: boolean; busy: boolean; onRecover: () => void; restoreFocus: () => HTMLElement | null; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null)
  const explicit = !legacy
  const client = useMemo(() => explicit ? createWorkspaceClient({ workspacePath: panel.workingRoot, projectPath: panel.projectPath }) : workspaceClient,
    [panel.workingRoot, panel.projectPath, explicit])
  const view = useMemo(() => ({ id: panel.id, compact, active: active && !busy, root, restoreFocus }), [panel.id, compact, active, busy, restoreFocus])
  return <WorkspaceApiProvider client={client}><WorkspaceViewProvider value={view}>
    <div ref={root} inert={busy || undefined} aria-busy={busy || undefined} data-workspace-view={panel.id} data-workspace-presentation={compact ? 'compact' : 'docked'} className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <AppErrorBoundary key={JSON.stringify([panel.workingRoot, panel.projectPath])} fallback={<div role="alert" className="flex flex-col gap-2 p-3 text-sm text-ink-secondary">
        <p>{uiText('프로젝트를 불러오지 못했습니다. 다른 프로젝트를 선택하거나 패널을 닫아 주세요.')}</p>
        <button type="button" className="self-start rounded border border-edge px-2 py-1" onClick={onRecover}>{uiText('프로젝트 선택')}</button>
      </div>}>{children}</AppErrorBoundary>
    </div>
  </WorkspaceViewProvider></WorkspaceApiProvider>
}

function ProjectHeaderCommands({ panel, active }: { panel: ProjectBoardPanel; active: boolean }) {
  const client = useMemo(() => createWorkspaceClient({ workspacePath: panel.workingRoot, projectPath: panel.projectPath }), [panel.workingRoot, panel.projectPath])
  return <WorkspaceApiProvider client={client}><CommandButtonMenu project=".workspace" workspacePath={panel.workingRoot} shortcutEnabled={active} className="mx-1 flex h-6 w-6 shrink-0 items-center justify-center rounded text-ink-secondary hover:bg-surface-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-ink" /></WorkspaceApiProvider>
}

/** Geometry owns panel slots; project views keep their own controllers and request scope. */
export function WorkspaceApplication({ account, guest, renderWorkspace }: Props) {
  const { t } = useI18n()
  const selectorTitle = useId()
  const services = useWorkspaceAccount()
  const fallbackBrowser = useWorkspaceBrowser()
  const [browserRequest, setBrowserRequest] = useState({ url: 'about:blank', request: 0 })
  const desktop = useWorkspaceDesktop()
  const [mode, setMode] = useState(() => readMode(account ?? 'guest'))
  const [initial, setInitial] = useState<WorkspaceInfo | null>(null)
  const [failed, setFailed] = useState('')
  const [board, setBoard] = useState<ProjectBoardState>(() => createProjectBoard())
  const [retained, setRetained] = useState<ProjectBoardPanel[]>([])
  const [draft, setDraft] = useState<{ panel: ProjectBoardPanel; board: ProjectBoardState } | null>(null)
  const draftRef = useRef(draft)
  const [singleId, setSingleId] = useState<string | null>(null)
  const [legacyScope, setLegacyScope] = useState<Pick<ProjectBoardPanel, 'projectPath' | 'workingRoot'> | null>(null)
  const [legacyReady, setLegacyReady] = useState(false)
  const [pendingPanels, setPendingPanels] = useState<Record<string, number>>({})
  const [headerHost, setHeaderHost] = useState<HTMLDivElement | null>(null)
  const [selection, setSelection] = useState<Record<string, number>>({})
  const [adding, setAdding] = useState(false)
  const [replacing, setReplacing] = useState<string | null>(null)
  const [opening, setOpening] = useState(false)
  const [boardInitialized, setBoardInitialized] = useState(false)
  const handles = useRef(new Map<string, ProjectWorkspaceHandle>())
  const panelElements = useRef(new Map<string, HTMLElement>())
  const selectionSequence = useRef(new Map<string, number>())
  const modeSequence = useRef(0)
  const legacyHandoffs = useRef(0)
  const { toast, showToast } = useToast()
  const multi = desktop && mode === 'multi' && !guest
  const current = useRef({ board, retained, singleId, multi, legacyScope })
  current.current = { board, retained, singleId, multi, legacyScope }
  const registerElement = useCallback((id: string, element: HTMLElement | null) => {
    if (element) panelElements.current.set(id, element)
    else panelElements.current.delete(id)
  }, [])
  const restoreActiveFocus = useCallback(() => {
    const state = current.current
    const id = state.multi ? state.board.activePanelId : state.singleId
    const element = id ? panelElements.current.get(id) : undefined
    return element?.querySelector<HTMLElement>(state.multi ? '.mew-project-board-name' : '[data-project-switcher]') ?? null
  }, [])

  const initialize = useCallback((info: WorkspaceInfo) => {
    setInitial({ ...info, hasProject: info.hasProject !== false })
    if (info.hasProject === false || info.workspaceScopeVersion !== WORKSPACE_SCOPE_VERSION) return
    const first = panelFor(info)
    setLegacyScope(first)
    setLegacyReady(true)
    let stored: unknown
    try { stored = JSON.parse(scopedBrowserStorage().getItem(boardKey(account ?? 'guest')) ?? 'null') } catch { /* Missing storage starts with one panel. */ }
    const saved = normalizeProjectBoard(stored, first)
    const same = saved.panels.find(panel => panel.projectPath === first.projectPath && panel.workingRoot === first.workingRoot)
    setBoard(saved); setRetained(same ? [] : [first]); setSingleId((same ?? first).id); setBoardInitialized(stored != null)
  }, [account])
  const acceptBootstrap = useCallback((info: WorkspaceInfo) => {
    if (info.hasProject !== false) initialize(info)
  }, [initialize])

  const beginPanelChange = (id: string) => {
    setPendingPanels(value => ({ ...value, [id]: (value[id] ?? 0) + 1 }))
    return () => setPendingPanels(value => {
      const next = { ...value }
      if (next[id] > 1) next[id]--
      else delete next[id]
      return next
    })
  }
  const preserveSingleSelection = (id: string, destination: Pick<ProjectBoardPanel, 'projectPath' | 'workingRoot'>) => {
    const state = current.current
    if (state.singleId !== id) return
    const panels = [...state.board.panels, ...state.retained], selected = panels.find(panel => panel.id === id)
    if (!selected || sameScope(selected, destination)) return
    const existing = panels.find(panel => panel.id !== id && sameScope(panel, selected))
    const preserved = existing ?? { ...selected, id: uuid() }
    if (!existing) setRetained(value => [...value, preserved])
    setSingleId(preserved.id)
    current.current = { ...state, singleId: preserved.id, retained: existing ? state.retained : [...state.retained, preserved] }
  }
  const acceptLegacySelection = useCallback((info: WorkspaceInfo) => {
    const state = current.current
    const existing = [...state.board.panels, ...state.retained].find(panel => panel.projectPath === (info.projectPath ?? info.path) && panel.workingRoot === info.path)
    const selected = existing ?? panelFor(info)
    if (!existing) setRetained(value => [...value, selected])
    setLegacyScope(selected)
    setSingleId(selected.id)
    current.current = { ...state, legacyScope: selected, singleId: selected.id, retained: existing ? state.retained : [...state.retained, selected] }
  }, [])
  const beginLegacyHandoff = useCallback(() => {
    legacyHandoffs.current++
    setLegacyReady(false)
    return async () => {
      if (--legacyHandoffs.current !== 0) return
      try {
        const confirmed = await workspaceClient.fetchWorkspace()
        if (legacyHandoffs.current !== 0) return
        acceptLegacySelection(confirmed)
        setLegacyReady(true)
      } catch (error) { showToast(error instanceof Error ? error.message : String(error)) }
    }
  }, [acceptLegacySelection, showToast])

  useEffect(() => {
    if (guest) return
    let alive = true
    void workspaceClient.fetchWorkspace().then(info => {
      if (!alive) return
      initialize(info)
    }).catch(error => { if (alive) setFailed(error instanceof Error ? error.message : String(error)) })
    return () => { alive = false }
  }, [initialize, guest])

  useEffect(() => {
    if (!initial?.hasProject || !account || !boardInitialized) return
    try { scopedBrowserStorage().setItem(boardKey(account), JSON.stringify(board)) } catch { /* In-memory layout remains usable. */ }
  }, [account, board, boardInitialized, initial?.hasProject])
  useEffect(() => {
    if (!services.capabilities) return
    setBoard(previous => previous.panels.reduce((state, panel) => panel.tool && !services.capabilities?.nativeBrowser ? projectBoardReducer(state, { type: 'remove', panelId: panel.id }) : state, previous))
  }, [services.capabilities, boardInitialized])
  useEffect(() => {
    if (multi || !legacyScope) return
    const panels = [...board.panels, ...retained]
    if (panels.some(panel => panel.id === singleId && sameScope(panel, legacyScope))) return
    const selected = panels.find(panel => sameScope(panel, legacyScope)) ?? { ...legacyScope, id: uuid() }
    if (!panels.some(panel => panel.id === selected.id)) setRetained(value => [...value, selected])
    setSingleId(selected.id)
  }, [multi, legacyScope, board.panels, retained, singleId])
  const changeMode = useCallback((next: WorkspaceMode) => {
    draftRef.current = null
    setDraft(null)
    const request = ++modeSequence.current
    const state = current.current
    if (next === 'multi') {
      if (!boardInitialized) {
        const first = [...state.board.panels, ...state.retained].find(panel => panel.id === state.singleId)
        setBoard(createProjectBoard(first)); setBoardInitialized(true)
      }
    } else {
      const active = state.board.panels.find(panel => panel.id === state.board.activePanelId && !panel.tool)
      const finish = beginLegacyHandoff()
      // Finish the account handoff before rendering a legacy single-project client.
      void (async () => {
        let info = active ? await workspaceClient.switchWorkspace(active.projectPath) : await workspaceClient.fetchWorkspace()
        if (active && active.workingRoot !== active.projectPath) info = await workspaceClient.switchWorkspace(active.workingRoot, active.projectPath)
        acceptLegacySelection(info)
        if (request !== modeSequence.current) return
        setMode('single')
        try { scopedBrowserStorage().setItem(modeKey(account ?? 'guest'), 'single') } catch { /* Keep the mode in memory. */ }
      })().catch(error => showToast(error instanceof Error ? error.message : String(error))).finally(finish)
      return
    }
    setMode(next)
    try { scopedBrowserStorage().setItem(modeKey(account ?? 'guest'), next) } catch { /* Keep the selected mode in memory. */ }
  }, [account, boardInitialized, showToast, acceptLegacySelection, beginLegacyHandoff])

  const navigate = async (panel: ProjectBoardPanel, path: string, exactRoot = false, workingRoot?: string) => {
    if (draftRef.current) { draftRef.current = null; setDraft(null) }
    const request = (selectionSequence.current.get(panel.id) ?? 0) + 1
    selectionSequence.current.set(panel.id, request)
    const state = current.current
    const duplicate = state.board.panels.find(candidate => exactRoot ? candidate.workingRoot === path : candidate.projectPath === path)
    if (state.multi && duplicate) { setBoard(value => projectBoardReducer(value, { type: 'focus', panelId: duplicate.id })); return true }
    let release: (() => void) | undefined
    let finishLegacy: (() => Promise<void>) | undefined
    const finish = beginPanelChange(panel.id)
    try {
      release = await handles.current.get(panel.id)?.prepareClose()
      if (!state.multi) finishLegacy = beginLegacyHandoff()
      const client = state.multi ? createWorkspaceClient({ workspacePath: path, projectPath: path }) : workspaceClient
      let info = await client.switchWorkspace(path)
      if (!state.multi && workingRoot && workingRoot !== path) info = await client.switchWorkspace(workingRoot, path)
      if (request !== selectionSequence.current.get(panel.id)) return false
      if (state.multi) {
        const destination = { projectPath: info.projectPath ?? info.path, workingRoot: info.path }
        preserveSingleSelection(panel.id, destination)
        setBoard(value => projectBoardReducer(value, { type: 'replace', panelId: panel.id, ...destination }))
      }
      else {
        acceptLegacySelection(info)
      }
      return true
    } catch (error) { showToast(error instanceof Error ? error.message : String(error)); return false }
    finally { await finishLegacy?.(); release?.(); finish() }
  }
  const closePanel = async (id: string) => {
    let release: (() => void) | undefined
    const finish = beginPanelChange(id)
    try {
      release = await handles.current.get(id)?.prepareClose()
      const pending = draftRef.current
      if (pending) updateBoard(projectBoardReducer(pending.board, { type: 'remove', panelId: id }))
      else setBoard(value => projectBoardReducer(value, { type: 'remove', panelId: id }))
      setRetained(value => value.filter(panel => panel.id !== id))
      if (current.current.singleId === id) setSingleId(null)
    } catch (error) { showToast(error instanceof Error ? error.message : String(error)) }
    finally { release?.(); finish() }
  }
  const cancelDraft = () => {
    draftRef.current = null
    setDraft(null)
  }
  const startDraft = () => {
    if (draftRef.current) return
    const id = uuid()
    const panel = { id, projectPath: `draft:${id}`, workingRoot: `draft:${id}` }
    const next = { panel, board: projectBoardReducer(current.current.board, { type: 'add', panel, availableWidth: headerHost?.clientWidth }) }
    draftRef.current = next
    setDraft(next)
  }
  const updateBoard = (next: ProjectBoardState) => {
    const pending = draftRef.current
    if (!pending) { setBoard(next); return }
    const updated = { ...pending, board: next }
    draftRef.current = updated
    setDraft(updated)
    setBoard(projectBoardReducer(next, { type: 'remove', panelId: pending.panel.id }))
  }
  const addProject = async (path: string) => {
    const pending = draftRef.current
    if (!pending) return false
    const focusExisting = (id: string) => {
      const next = projectBoardReducer(projectBoardReducer(pending.board, { type: 'remove', panelId: pending.panel.id }), { type: 'focus', panelId: id })
      draftRef.current = null; setDraft(null); setBoard(next)
      return true
    }
    const existing = current.current.board.panels.find(panel => panel.projectPath === path)
    if (existing) return focusExisting(existing.id)
    try {
      const client = createWorkspaceClient({ workspacePath: path, projectPath: path })
      const info = await client.fetchWorkspace()
      if (draftRef.current?.panel.id !== pending.panel.id) return false
      const latest = draftRef.current
      const duplicate = current.current.board.panels.find(panel => panel.projectPath === (info.projectPath ?? info.path))
      if (duplicate) {
        const next = projectBoardReducer(projectBoardReducer(latest.board, { type: 'remove', panelId: pending.panel.id }), { type: 'focus', panelId: duplicate.id })
        draftRef.current = null; setDraft(null); setBoard(next); return true
      }
      const selected = current.current.retained.find(panel => panel.projectPath === (info.projectPath ?? info.path) && panel.workingRoot === info.path) ?? { ...panelFor(info), id: pending.panel.id }
      const next: ProjectBoardState = { ...latest.board, panels: latest.board.panels.map(panel => panel.id === pending.panel.id ? selected : panel),
        columns: latest.board.columns.map(column => ({ ...column, rows: column.rows.map(row => row.panelId === pending.panel.id ? { ...row, panelId: selected.id } : row) })), activePanelId: selected.id }
      draftRef.current = null; setDraft(null); setRetained(value => value.filter(panel => panel.id !== selected.id)); setBoard(next)
      setBoardInitialized(true); return true
    } catch (error) { showToast(error instanceof Error ? error.message : String(error)); return false }
  }
  const routeAction = async (origin: ProjectBoardPanel, action: MewcatAction) => {
    if (draftRef.current) cancelDraft()
    const requestedRoot = action.kind === 'open_panel' ? null : action.kind === 'open_project' ? action.path : action.projectRoot
    const state = current.current
    const panels = [...state.board.panels, ...state.retained]
    let destination = requestedRoot
      ? panels.find(panel => panel.workingRoot === requestedRoot) ?? (action.kind === 'open_project' ? panels.find(panel => panel.projectPath === requestedRoot) : undefined)
      : panels.find(panel => panel.id === origin.id)
    const needsLegacyHandoff = !state.multi && (!destination || !state.legacyScope || !sameScope(destination, state.legacyScope))
    if (requestedRoot && (!destination || needsLegacyHandoff)) {
      const source = !state.multi ? panels.find(panel => panel.id === origin.id) : destination ?? panels.find(panel => panel.projectPath === requestedRoot) ?? panels.find(panel => panel.id === origin.id)
      const preserveWorktree = !state.multi && action.kind === 'open_project' && destination
      const actualRoot = preserveWorktree ? preserveWorktree.workingRoot : requestedRoot
      const logicalRoot = preserveWorktree ? preserveWorktree.projectPath : requestedRoot
      if (!source || !(await navigate(source, logicalRoot, action.kind !== 'open_project', preserveWorktree ? actualRoot : undefined))) throw new Error('MEWCAT_ACTION_FAILED')
      destination = await waitForWorkspace(() => [...current.current.board.panels, ...current.current.retained].find(panel => panel.workingRoot === actualRoot))
    }
    if (!destination) throw new Error('MEWCAT_ACTION_FAILED')
    const target = destination
    if (current.current.multi) setBoard(value => projectBoardReducer(value, { type: 'add', panel: target, availableWidth: headerHost?.clientWidth }))
    else setSingleId(target.id)
    const handle = await waitForWorkspace(() => {
      const handle = handles.current.get(target.id)
      return handle?.workspacePath === target.workingRoot && handle.isReady?.() && handle.performAction ? handle : undefined
    })
    if (action.kind !== 'open_project') await handle.performAction!(action)
  }
  if (guest || initial?.hasProject === false || initial && initial.workspaceScopeVersion !== WORKSPACE_SCOPE_VERSION) return <>{renderWorkspace(undefined, acceptBootstrap)}</>
  if (!initial) return failed ? <div role="alert" className="p-3 text-sm text-danger">{failed}</div> : <StartupScreen />
  const singlePanel = [...board.panels, ...retained].find(panel => panel.id === singleId && legacyScope && sameScope(panel, legacyScope))
  const activeId = multi ? board.activePanelId : singlePanel?.id ?? null
  const ownerId = board.panels.find(panel => !panel.tool)?.id ?? retained[0]?.id
  const openTool = (tool: 'browser') => {
    if (draftRef.current) cancelDraft()
    const id = `remote-tool:${tool}`
    setBoard(value => projectBoardReducer(value, { type: 'add', panel: { id, projectPath: id, workingRoot: id, tool }, availableWidth: headerHost?.clientWidth }))
  }
  const openBoardBrowser = (url = 'about:blank') => {
    setBrowserRequest(previous => ({ url, request: previous.request + 1 }))
    openTool('browser')
  }
  const closeTool = (id: string) => {
    const state = draftRef.current?.board ?? current.current.board
    updateBoard(projectBoardReducer(state, { type: 'remove', panelId: id }))
  }
  const renderPanel = (panel: ProjectBoardPanel) => {
    if (panel.tool && !multi) return null
    if (panel.tool === 'browser') return services.capabilities?.nativeBrowser ? <div data-dom-browser className="h-full min-h-0"><BoardBrowser url={browserRequest.url} navigationRequest={browserRequest.request} nativeAllowed={!!services.capabilities?.nativeBrowser} onClose={() => closeTool(panel.id)} /></div> : null
    if (draft?.panel.id === panel.id) return <ProjectDraftSelector paths={services.projects.paths} icons={services.projects.icons}
      basePath={initial.path} canUseAgent={!!services.capabilities?.agent} canManageFolders={services.role === 'owner' || services.role === 'manager'} onOpen={addProject} onClose={cancelDraft}
      beforeMutation={async () => { await services.projects.saveQueue.current }} restoreFocus={restoreActiveFocus}
      onProjectsChanged={async () => { const { state } = await workspaceClient.fetchRootProjectTabs(); services.projects.setPaths(state?.paths ?? []) }} />
    const host: ProjectWorkspaceHost = {
      id: panel.id, panel, active: panel.id === activeId, compact: multi, mode, headerHost,
      selectionSignal: selection[panel.id] ?? 0, globalOwner: panel.id === ownerId,
      onModeChange: changeMode, onProjectChange: path => navigate(panel, path),
      onAction: action => routeAction(panel, action),
      onScopeChanged: info => {
        const logical = info.projectPath ?? info.path
        if (logical === panel.projectPath && info.path === panel.workingRoot) return
        if (draftRef.current) cancelDraft()
        const destination = { projectPath: logical, workingRoot: info.path }
        const state = current.current
        if (!multi && panel.id === state.singleId) {
          setLegacyScope(destination)
          const existing = [...state.board.panels, ...state.retained].find(candidate => candidate.id !== panel.id && sameScope(candidate, destination))
          if (existing) { setSingleId(existing.id); return }
        } else preserveSingleSelection(panel.id, destination)
        setBoard(value => projectBoardReducer(value, { type: 'replace', panelId: panel.id, ...destination }))
        setRetained(value => value.map(candidate => candidate.id === panel.id ? { ...candidate, ...destination } : candidate))
      },
      register: handle => { if (handle) handles.current.set(panel.id, handle); else handles.current.delete(panel.id) },
    }
    return <ProjectHost panel={panel} compact={multi} active={panel.id === activeId} legacy={legacyReady && !multi && panel.id === activeId && !!legacyScope && sameScope(panel, legacyScope)} busy={!!pendingPanels[panel.id]} restoreFocus={restoreActiveFocus} onRecover={() => { setReplacing(panel.id); setAdding(true) }}>{renderWorkspace(host)}</ProjectHost>
  }
  return <div className="mew-workspace mew-workspace-shell flex flex-col overflow-hidden bg-surface text-ink" style={{ height: 'var(--app-height,100dvh)' }}>
    <div ref={setHeaderHost} className="shrink-0" />
    {!activeId && <div className="flex h-11 items-center justify-end border-b border-edge px-2">
      <button type="button" className="px-2 py-1 text-xs" onClick={() => changeMode('single')}>{uiText('싱글프로젝트모드')}</button>
    </div>}
    <BrowserContext.Provider value={multi ? openBoardBrowser : fallbackBrowser}><ProjectBoard value={draft?.board ?? board} retainedPanels={retained} singlePanelId={singleId} onChange={updateBoard} presentation={multi ? 'board' : 'single'}
      renderPanel={renderPanel} isDraft={panel => panel.id === draft?.panel.id} getPanelLabel={panel => panel.tool === 'browser' ? t('menu.remoteBrowser') : panel.id === draft?.panel.id ? uiText('프로젝트 선택') : label(panel.projectPath)} onPanelElement={registerElement}
      renderProjectIcon={panel => panel.tool ? null : <ProjectIcon icon={services.projects.icons[panel.projectPath] ?? 'i:folder'} size={14} />}
      renderHeaderActions={services.capabilities?.terminal ? panel => panel.tool || panel.id === draft?.panel.id ? null : <ProjectHeaderCommands panel={panel} active={multi && panel.id === activeId} /> : undefined}
      onSelectProject={id => setSelection(value => ({ ...value, [id]: (value[id] ?? 0) + 1 }))}
      onClosePanel={id => { if (draft?.panel.id === id) cancelDraft(); else if (board.panels.find(panel => panel.id === id)?.tool) closeTool(id); else void closePanel(id) }} onAdd={startDraft}
      labels={{ board: uiText('프로젝트 패널'), add: uiText('프로젝트 패널 추가'), select: uiText('프로젝트 선택'), close: uiText('프로젝트 패널 닫기'), move: uiText('프로젝트 패널 이동'), resizeColumn: uiText('프로젝트 패널 너비 조절'), resizeRow: uiText('프로젝트 패널 높이 조절') }} /></BrowserContext.Provider>
    {adding && <DialogFrame labelledBy={selectorTitle} busy={opening} restoreFocus={restoreActiveFocus} onClose={() => { if (!opening) setAdding(false) }} className="flex max-h-[80dvh] max-w-xl flex-col">
      <header className="flex h-9 items-center border-b border-edge px-2"><span id={selectorTitle} className="flex-1 text-sm">{uiText('프로젝트 선택패널')}</span><PanelCloseButton onClick={() => setAdding(false)} disabled={opening} aria-label={t('common.close')} /></header>
      <ProjectCatalogPanel paths={services.projects.paths} onOpen={async path => {
        const panel = replacing && [...current.current.board.panels, ...current.current.retained].find(candidate => candidate.id === replacing)
        if (!panel) return false
        const opened = await navigate(panel, path)
        if (opened) setAdding(false)
        return opened
      }} onBusyChange={setOpening} beforeMutation={async () => { await services.projects.saveQueue.current }}
        onProjectsChanged={async () => { const { state } = await workspaceClient.fetchRootProjectTabs(); services.projects.setPaths(state?.paths ?? []) }} />
    </DialogFrame>}
    {toast}
  </div>
}
