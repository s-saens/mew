import { useEffect, useId, useRef, useState } from 'react'
import { Check, NavArrowDown, Plus, RefreshDouble, Search } from 'iconoir-react'
import { HoverTipLayer, LoadingIndicator } from '@mew/ui'
import { addMyProject, fetchProjectRegistry, type RegisteredProject } from '../api/client'
import { useI18n } from '../i18n'
import { projectHierarchy } from '../utils/project-hierarchy'
import { ProjectIcon } from './ProjectIcon'

export function ProjectCatalogPanel({ paths, onOpen, onProjectsChanged, beforeMutation }: {
  paths: string[]
  onOpen: (path: string) => Promise<boolean | void> | boolean | void
  onProjectsChanged?: () => Promise<void> | void
  beforeMutation?: () => Promise<unknown>
}) {
  const { t } = useI18n()
  const id = useId()
  const [expanded, setExpanded] = useState(false)
  const [projects, setProjects] = useState<RegisteredProject[] | null>(null)
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const pending = useRef(false)
  const content = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!expanded) return
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    fetchProjectRegistry(controller.signal).then(result => { if (!controller.signal.aborted) setProjects(result.projects) }).catch((err: unknown) => {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : String(err))
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [expanded, reload, paths])

  async function run(operation: () => Promise<unknown>, focusPath?: string) {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setError(null)
    try { await operation() }
    catch (err) { setError(err instanceof Error ? err.message : String(err)) }
    finally {
      pending.current = false
      setBusy(false)
      if (focusPath) requestAnimationFrame(() => {
        const row = Array.from(content.current?.querySelectorAll<HTMLElement>('[data-catalog-project]') ?? []).find(element => element.dataset.catalogProject === focusPath)
        row?.querySelector<HTMLButtonElement>('.mew-project-catalog-open')?.focus({ preventScroll: true })
      })
    }
  }

  const byPath = new Map(projects?.map(project => [project.path, project]))
  const matches = projects?.filter(project => project.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())) ?? []
  const visible = new Set(matches.map(project => project.path))
  const rows = projectHierarchy(projects?.map(project => project.path) ?? [])
  const parents = new Map(rows.map(row => [row.path, row.parentPath]))
  for (const match of matches) {
    let parent = parents.get(match.path)
    while (parent) { visible.add(parent); parent = parents.get(parent) }
  }
  const duplicates = new Set(projects?.filter((project, index, all) => all.some((other, otherIndex) => index !== otherIndex && other.name === project.name)).map(project => project.name))

  return <HoverTipLayer className="mew-project-catalog">
    <button type="button" aria-expanded={expanded} aria-controls={id} className="mew-project-catalog-toggle" onClick={() => setExpanded(value => !value)}>
      <NavArrowDown width={14} height={14} aria-hidden="true" className={expanded ? '' : '-rotate-90'} />
      <span>{t('project.all')}</span>
    </button>
    {expanded && <div ref={content} id={id} className="mew-project-catalog-content">
      <label className="mew-project-catalog-search"><Search width={14} height={14} aria-hidden="true" />
        <input value={search} onChange={event => setSearch(event.target.value)} aria-label={t('project.search')} placeholder={t('project.search')} />
      </label>
      <div className="mew-project-catalog-list" aria-busy={busy || loading || undefined}>
        {!projects && !error && <div role="status" aria-label={t('common.loading')} className="flex justify-center p-2"><LoadingIndicator /></div>}
        {rows.filter(row => visible.has(row.path)).map(row => {
          const project = byPath.get(row.path)!
          const mine = paths.includes(row.path)
          return <div key={row.path} data-catalog-project={row.path} data-project-depth={row.depth} className="mew-project-catalog-row" style={{ paddingLeft: Math.min(row.depth, 5) * 12 }}>
            <button type="button" disabled={busy} title={project.path} onClick={() => void run(async () => { await onOpen(project.path) })} className="mew-project-catalog-open">
              <ProjectIcon icon={project.icon ?? 'i:folder'} size={16} />
              <span className="min-w-0 flex-1"><span className="block truncate">{project.name}</span>{duplicates.has(project.name) && <span className="block truncate text-xs text-ink-secondary">{project.path}</span>}</span>
            </button>
            <button type="button" disabled={busy || mine} aria-label={`${project.name}${duplicates.has(project.name) ? ` (${project.path})` : ''} · ${t(mine ? 'project.inMine' : 'project.addToMine')}`}
              data-tip={t(mine ? 'project.inMine' : 'project.addToMine')} className="mew-project-catalog-pin" onClick={() => void run(async () => {
                await beforeMutation?.()
                await addMyProject(project.path)
                await onProjectsChanged?.()
              }, project.path)}>
              {mine ? <Check width={16} height={16} aria-hidden="true" /> : <Plus width={16} height={16} aria-hidden="true" />}
            </button>
          </div>
        })}
        {projects && !matches.length && <p className="px-2 py-3 text-xs text-ink-secondary">{t(projects.length ? 'project.noProjectMatches' : 'project.noProjects')}</p>}
      </div>
      {error && <div className="flex items-start gap-1 p-2"><p role="alert" className="min-w-0 flex-1 break-words text-xs text-danger-ink">{error}</p>
        <button type="button" className="mew-project-catalog-pin" aria-label={t('project.retry')} data-tip={t('project.retry')} onClick={() => setReload(value => value + 1)}><RefreshDouble width={16} height={16} aria-hidden="true" /></button>
      </div>}
    </div>}
  </HoverTipLayer>
}
