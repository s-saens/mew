import { useEffect, useRef, useState } from 'react'
import { Check, Plus, RefreshDouble, Search } from 'iconoir-react'
import { HoverTipLayer, LoadingIndicator } from '@mew/ui'
import { addMyProject, fetchProjectRegistry, type RegisteredProject } from '../api/client'
import { useI18n } from '../i18n'
import { projectHierarchy } from '../utils/project-hierarchy'
import { ProjectIcon } from './ProjectIcon'
import { projectAddCopy } from './project-add-copy'

export function ProjectCatalogPanel({ paths, onOpen, onProjectsChanged, beforeMutation, onBusyChange }: {
  paths: string[]
  onOpen: (path: string) => Promise<boolean | void> | boolean | void
  onProjectsChanged?: () => Promise<void> | void
  beforeMutation?: () => Promise<unknown>
  onBusyChange?: (busy: boolean) => void
}) {
  const { t, locale } = useI18n()
  const [projects, setProjects] = useState<RegisteredProject[] | null>(null)
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const pending = useRef(false)
  const [imported, setImported] = useState(() => new Set<string>())
  const content = useRef<HTMLDivElement>(null)
  const alive = useRef(true)
  const pathsKey = paths.join('\0')
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    fetchProjectRegistry(controller.signal).then(result => { if (!controller.signal.aborted) setProjects(result.projects) }).catch((err: unknown) => {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : String(err))
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [reload, pathsKey])

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
      if (alive.current) {
        onBusyChange?.(false)
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
  const rows = projectHierarchy(projects?.map(project => project.path) ?? [])
  const parents = new Map(rows.map(row => [row.path, row.parentPath]))
  for (const match of matches) {
    let parent = parents.get(match.path)
    while (parent) { visible.add(parent); parent = parents.get(parent) }
  }
  const duplicates = new Set(projects?.filter((project, index, all) => all.some((other, otherIndex) => index !== otherIndex && other.name === project.name)).map(project => project.name))

  return <HoverTipLayer className="mew-project-catalog">
    <div ref={content} className="mew-project-catalog-content" data-project-catalog>
      <label className="mew-project-catalog-search"><Search width={14} height={14} aria-hidden="true" />
        <input value={search} disabled={busy} onChange={event => setSearch(event.target.value)} aria-label={t('project.search')} placeholder={t('project.search')} />
      </label>
      <div className="mew-project-catalog-list" aria-busy={busy || loading || undefined}>
        {!projects && !error && <div role="status" aria-label={t('common.loading')} className="flex justify-center p-2"><LoadingIndicator /></div>}
        {rows.filter(row => visible.has(row.path)).map(row => {
          const project = byPath.get(row.path)!
          const mine = paths.includes(row.path) || imported.has(row.path)
          return <div key={row.path} data-catalog-project={row.path} data-project-depth={row.depth} className="mew-project-catalog-row" style={{ paddingLeft: Math.min(row.depth, 5) * 12 }}>
            <button type="button" disabled={busy} title={project.path} onClick={() => void importProject(project)} className="mew-project-catalog-open"
              aria-label={`${project.name}${duplicates.has(project.name) ? ` (${project.path})` : ''} · ${t(mine ? 'project.inMine' : 'project.addToMine')}`}>
              <ProjectIcon icon={project.icon ?? 'i:folder'} size={16} />
              <span className="min-w-0 flex-1"><span className="block truncate">{project.name}</span>{duplicates.has(project.name) && <span className="block truncate text-xs text-ink-secondary">{project.path}</span>}</span>
              {mine ? <Check width={16} height={16} className="shrink-0 text-ink-secondary" aria-hidden="true" /> : <Plus width={16} height={16} className="shrink-0 text-ink-secondary" aria-hidden="true" />}
            </button>
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
