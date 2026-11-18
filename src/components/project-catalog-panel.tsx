import { useWorkspaceApi } from '../api/workspace-api-context'
import { useEffect, useRef, useState } from 'react'
import { Check, Plus, RefreshDouble, Search, Star, NavArrowDown, NavArrowRight } from 'iconoir-react'
import { HoverTipLayer, LoadingIndicator, MenuReorderHandle, useDragReorder } from '@mew/ui'
import { type RegisteredProject } from '../api/client'
import { useI18n } from '../i18n'
import { projectHierarchy } from '../utils/project-hierarchy'
import { ProjectIcon } from './ProjectIcon'
import { projectAddCopy } from './project-add-copy'

export function ProjectCatalogPanel({ paths, onOpen, onProjectsChanged, beforeMutation, onBusyChange, selection = false, onFavoritesChange, activePath, onContextMenu, renderActions, deletedProject }: {
  paths: string[]
  selection?: boolean
  activePath?: string | null
  deletedProject?: { path: string } | null
  onContextMenu?: (path: string, event: React.MouseEvent<HTMLButtonElement>) => void
  renderActions?: (path: string) => React.ReactNode
  onFavoritesChange?: (paths: string[]) => void
  onOpen: (path: string) => Promise<boolean | void> | boolean | void
  onProjectsChanged?: () => Promise<void> | void
  beforeMutation?: () => Promise<unknown>
  onBusyChange?: (busy: boolean) => void
}) {
  const { fetchProjectRegistry, addMyProject } = useWorkspaceApi()
  const { t, locale } = useI18n()
  const [projects, setProjects] = useState<RegisteredProject[] | null>(null)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [otherOrder, setOtherOrder] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const pending = useRef(false)
  const discoveryRequest = useRef<AbortController | null>(null)
  const [imported, setImported] = useState(() => new Set<string>())
  const content = useRef<HTMLDivElement>(null)
  const alive = useRef(true)
  const pathsKey = paths.join('\0')
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => {
    if (!deletedProject) return
    const root = deletedProject.path.replace(/\\/g, '/').replace(/\/+$/, '')
    setProjects(previous => previous?.filter(project => {
      const candidate = project.path.replace(/\\/g, '/').replace(/\/+$/, '')
      return candidate !== root && !candidate.startsWith(`${root}/`)
    }) ?? previous)
  }, [deletedProject])
  useEffect(() => {
    const controller = new AbortController()
    discoveryRequest.current = controller
    setLoading(true)
    setError(null)
    let complete = false
    // Show the registered catalog while the full discovery runs. A late snapshot
    // must never replace a completed discovery response.
    void fetchProjectRegistry(controller.signal, true).then(result => {
      if (!controller.signal.aborted && !complete) setProjects(result.projects)
    }).catch(() => {})
    fetchProjectRegistry(controller.signal).then(result => { complete = true; if (!controller.signal.aborted) setProjects(result.projects) }).catch((err: unknown) => {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : String(err))
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => { controller.abort(); if (discoveryRequest.current === controller) discoveryRequest.current = null }
  }, [reload, pathsKey, fetchProjectRegistry, deletedProject])

  async function importProject(project: RegisteredProject) {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    onBusyChange?.(true)
    setError(null)
    try {
      if (!paths.includes(project.path) && !imported.has(project.path)) {
        await beforeMutation?.()
        await addMyProject(project.path)
        setImported(previous => new Set(previous).add(project.path))
      }
      await onProjectsChanged?.()
      if (await onOpen(project.path) === false) throw new Error(projectAddCopy(locale).openFailed)
    } catch (err) {
      if (alive.current) setError(err instanceof Error ? err.message : String(err))
    } finally {
      pending.current = false
      onBusyChange?.(false)
      if (alive.current) {
        setBusy(false)
        requestAnimationFrame(() => {
          const row = Array.from(content.current?.querySelectorAll<HTMLElement>('[data-catalog-project]') ?? []).find(element => element.dataset.catalogProject === project.path)
          row?.querySelector<HTMLButtonElement>('.mew-project-catalog-open')?.focus({ preventScroll: true })
        })
      }
    }
  }

  const byPath = new Map(projects?.map(project => [project.path, project]))
  const query = search.toLocaleLowerCase()
  const matches = projects?.filter(project => project.name.toLocaleLowerCase().includes(query) || project.path.toLocaleLowerCase().includes(query)) ?? []
  const visible = new Set(matches.map(project => project.path))
  const allPaths = projects?.map(project => project.path) ?? []
  const favoriteSet = new Set(paths)
  const otherPaths = [...otherOrder.filter(path => allPaths.includes(path) && !favoriteSet.has(path)), ...allPaths.filter(path => !favoriteSet.has(path) && !otherOrder.includes(path))]
  const rows = projectHierarchy(selection ? [...paths.filter(path => allPaths.includes(path)), ...otherPaths] : allPaths)
  const parents = new Map(rows.map(row => [row.path, row.parentPath]))
  for (const match of matches) {
    let parent = parents.get(match.path)
    while (parent) { visible.add(parent); parent = parents.get(parent) }
  }
  const renderedRows = rows.filter(row => {
    if (!visible.has(row.path)) return false
    if (!selection || search) return true
    let parent = parents.get(row.path)
    while (parent) {
      if (!expanded.has(parent)) return false
      parent = parents.get(parent)
    }
    return true
  })
  function canReorder(from: number, to: number) {
    const source = renderedRows[from], target = renderedRows[to]
    return !!(selection && !search && source && target && from !== to
      && (!favoriteSet.has(source.path) || onFavoritesChange)
      && favoriteSet.has(source.path) === favoriteSet.has(target.path) && source.parentPath === target.parentPath)
  }
  function reorder(from: number, to: number) {
    if (!canReorder(from, to)) return
    const source = renderedRows[from], target = renderedRows[to]
    const list = favoriteSet.has(source.path) ? rows.filter(row => favoriteSet.has(row.path)).map(row => row.path) : rows.filter(row => !favoriteSet.has(row.path)).map(row => row.path)
    const sourceIndex = list.indexOf(source.path), targetIndex = list.indexOf(target.path)
    list.splice(targetIndex, 0, list.splice(sourceIndex, 1)[0])
    const orderedPaths = favoriteSet.has(source.path) ? [...list, ...otherPaths] : [...paths.filter(path => allPaths.includes(path)), ...list]
    const renderedPaths = new Set(renderedRows.map(row => row.path))
    const movedIndex = projectHierarchy(orderedPaths).filter(row => renderedPaths.has(row.path)).findIndex(row => row.path === source.path)
    if (favoriteSet.has(source.path)) onFavoritesChange?.(list)
    else setOtherOrder(list)
    return movedIndex
  }
  function moveSibling(from: number, direction: -1 | 1) {
    for (let to = from + direction; to >= 0 && to < renderedRows.length; to += direction) {
      if (canReorder(from, to)) { reorder(from, to); return }
    }
  }
  const drag = useDragReorder({ axis: 'y', handleOnly: true, canReorder, onReorder: reorder })
  const duplicates = new Set(projects?.filter((project, index, all) => all.some((other, otherIndex) => index !== otherIndex && other.name === project.name)).map(project => project.name))

  return <HoverTipLayer className="mew-project-catalog">
    <div ref={content} className="mew-project-catalog-content" data-project-catalog>
      <label className="mew-project-catalog-search"><Search width={14} height={14} aria-hidden="true" />
        <input value={search} disabled={busy} onChange={event => setSearch(event.target.value)} aria-label={t('project.search')} placeholder={t('project.search')} />
      </label>
      <div className="mew-project-catalog-list" aria-busy={busy || loading || undefined}>
        {!projects && !error && <div role="status" aria-label={t('common.loading')} className="flex justify-center p-2"><LoadingIndicator /></div>}
        {renderedRows.map((row, visualIndex) => {
          const { ref, ...handleProps } = drag.getItemProps(visualIndex)
          const hasChildren = rows.some(child => child.parentPath === row.path)
          const isExpanded = !!search || expanded.has(row.path)
          const project = byPath.get(row.path)!
          const mine = paths.includes(row.path) || imported.has(row.path)
          const showPath = !project.inManagedRoot || duplicates.has(project.name)
          const indent = Math.min(row.depth, 5)
          return <div key={row.path} ref={selection ? ref : undefined} data-catalog-project={row.path} data-project-depth={row.depth} data-active={row.path === activePath || undefined} className="mew-project-catalog-row">
            {selection && <MenuReorderHandle {...handleProps}
              aria-label={`${project.name} · ${hasChildren ? isExpanded ? '−' : '+' : t('project.reorder')}`}
              aria-expanded={hasChildren ? isExpanded : undefined}
              onMove={direction => moveSibling(visualIndex, direction)}
              onPointerDown={event => {
                if (event.isPrimary && event.button === 0) drag.consumeClick()
                handleProps.onPointerDown(event)
              }}
              onClick={event => {
                if (event.detail > 0 && drag.consumeClick()) return
                if (!hasChildren || search) return
                setExpanded(previous => {
                  const next = new Set(previous)
                  if (next.has(row.path)) next.delete(row.path)
                  else next.add(row.path)
                  return next
                })
              }}>
              {hasChildren ? (isExpanded ? <NavArrowDown width={14} aria-hidden="true" /> : <NavArrowRight width={14} aria-hidden="true" />) : undefined}
            </MenuReorderHandle>}
            {indent > 0 && <span aria-hidden="true" className="mew-project-catalog-indent" style={{ width: indent * 14 }}>
              {Array.from({ length: indent }, (_, index) => <span key={index} data-project-tree-guide className="mew-project-catalog-guide" style={{ left: index * 14 + 7 }} />)}
            </span>}
            <button type="button" disabled={busy} title={project.path} onClick={() => { discoveryRequest.current?.abort(); setLoading(false); if (selection) void onOpen(project.path); else void importProject(project) }} onContextMenu={event => onContextMenu?.(project.path, event)} className="mew-project-catalog-open"
              aria-label={`${project.name}${showPath ? ` (${project.path})` : ''} · ${t(mine ? 'project.inMine' : 'project.addToMine')}`}>
              <ProjectIcon icon={project.icon ?? 'i:folder'} size={16} />
              <span className="flex min-w-0 flex-1 items-baseline gap-2"><span className="min-w-0 truncate">{project.name}</span>{showPath && <span className="min-w-0 truncate text-xs text-ink-secondary">{project.path}</span>}</span>
              {!selection && (mine ? <Check width={16} height={16} className="shrink-0 text-ink-secondary" aria-hidden="true" /> : <Plus width={16} height={16} className="shrink-0 text-ink-secondary" aria-hidden="true" />)}
            </button>
            {selection && renderActions?.(row.path)}
            {selection && <button type="button" className="mew-project-catalog-pin" aria-pressed={mine} aria-label={mine ? t('favorites.remove', { name: project.name }) : `${project.name} · ${t('favorites.add')}`} onClick={() => onFavoritesChange?.(mine ? paths.filter(path => path !== row.path) : [...paths, row.path])}><Star width={16} height={16} fill={mine ? 'currentColor' : 'none'} /></button>}
          </div>
        })}
        {projects && !matches.length && <p className="px-2 py-3 text-xs text-ink-secondary">{t(projects.length ? 'project.noProjectMatches' : 'project.noProjects')}</p>}
      </div>
      {error && <div className="flex items-start gap-1 p-2"><p role="alert" className="min-w-0 flex-1 break-words text-xs text-danger-ink">{error}</p>
        <button type="button" disabled={busy} className="mew-project-catalog-pin" aria-label={t('project.retry')} data-tip={t('project.retry')} onClick={() => setReload(value => value + 1)}><RefreshDouble width={16} height={16} aria-hidden="true" /></button>
      </div>}
    </div>
  </HoverTipLayer>
}
