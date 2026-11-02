import { useEffect, useId, useRef, useState } from 'react'
import { Check, Folder, Link, Plus, RefreshDouble, Search, Spark, Xmark } from 'iconoir-react'
import { DialogFrame, LoadingIndicator } from '@mew/ui'
import { addMyProject, fetchProjectRegistry, registerProject, type RegisteredProject } from '../api/client'
import { useI18n } from '../i18n'
import { LinkProjectDialog } from './LinkProjectDialog'
import { ProjectIcon } from './ProjectIcon'
import { fileBrowserButton as button, fileBrowserInput as input } from './file-browser'

export function OpenProjectDialog({ basePath, onOpen, onClose, onProjectsChanged, onCreateWithAgent, canUseAgent = true, canManageFolders = true, beforeMutation }: {
  basePath: string
  onOpen: (path: string) => Promise<boolean | void> | boolean | void
  onClose: () => void
  onProjectsChanged?: () => Promise<void> | void
  onCreateWithAgent?: (project: RegisteredProject) => Promise<void> | void
  canUseAgent?: boolean
  canManageFolders?: boolean
  beforeMutation?: () => Promise<unknown>
}) {
  const { t } = useI18n()
  const id = useId()
  const [view, setView] = useState<'create' | 'all' | 'link'>('create')
  const [name, setName] = useState('')
  const [git, setGit] = useState(true)
  const [projects, setProjects] = useState<RegisteredProject[] | null>(null)
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [reload, setReload] = useState(0)
  const busyRef = useRef(false)
  const alive = useRef(true)
  const created = useRef<RegisteredProject | null>(null)

  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => {
    if (view !== 'all') return
    const controller = new AbortController()
    setError(null)
    setProjects(null)
    fetchProjectRegistry(controller.signal).then(result => setProjects(result.projects)).catch((err: unknown) => {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : String(err))
    })
    return () => controller.abort()
  }, [view, reload])

  const validName = !!name.trim() && name.trim() !== '.' && name.trim() !== '..' && !/[\\/\p{Cc}]/u.test(name.trim()) && !name.trim().startsWith('.')
  async function run(operation: () => Promise<void>) {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError(null)
    try { await operation() }
    catch (err) { if (alive.current) setError(err instanceof Error ? err.message : String(err)) }
    finally { busyRef.current = false; if (alive.current) setBusy(false) }
  }
  async function create(withAgent: boolean) {
    if (!validName && !created.current) return
    await run(async () => {
      await beforeMutation?.()
      const project = created.current ?? (await registerProject({ name: name.trim(), git })).project
      created.current = project
      await onProjectsChanged?.()
      if (withAgent && onCreateWithAgent) await onCreateWithAgent(project)
      else await onOpen(project.path)
    })
  }
  function changeView(next: 'create' | 'all' | 'link') { setView(next); setError(null) }

  if (view === 'link') return <LinkProjectDialog basePath={basePath} canManageFolders={canManageFolders}
    onClose={() => changeView('create')} onOpen={async path => {
      await beforeMutation?.()
      const { project } = await registerProject({ path })
      await onProjectsChanged?.()
      await onOpen(project.path)
    }} />

  const duplicateNames = new Set(projects?.filter((project, index, all) => all.some((other, otherIndex) => otherIndex !== index && other.name === project.name)).map(project => project.name))
  const filtered = projects?.filter(project => project.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
  return <DialogFrame labelledBy={id} busy={busy} onClose={onClose} className="flex max-h-[90dvh] max-w-lg flex-col">
    <header className="flex shrink-0 items-center gap-2 px-4 pt-3 pb-2">
      <h2 id={id} className="min-w-0 flex-1 text-base font-semibold text-ink-bright">{t('project.add')}</h2>
      <button type="button" disabled={busy} onClick={onClose} aria-label={t('common.close')} data-tip={t('common.close')} className={button}><Xmark width={18} height={18} /></button>
    </header>
    <nav aria-label={t('project.choose')} className="flex shrink-0 gap-1 border-b border-edge px-3 pb-2">
      {(['create', 'all'] as const).map(tab => <button key={tab} type="button" disabled={busy} aria-pressed={view === tab}
        onClick={() => changeView(tab)} className={`${button} ${view === tab ? 'bg-surface-raised !text-ink' : ''}`}>
        {tab === 'create' ? <Plus width={16} height={16} /> : <Folder width={16} height={16} />}{t(tab === 'create' ? 'project.new' : 'project.all')}
      </button>)}
    </nav>

    {view === 'create' ? <form className="min-h-0 overflow-y-auto p-4" onSubmit={event => { event.preventDefault(); void create(false) }}>
      <label htmlFor={`${id}-name`} className="mb-1.5 block text-sm font-medium text-ink">{t('project.name')}</label>
      <input id={`${id}-name`} data-dialog-autofocus value={name} disabled={busy || !!created.current} onChange={event => setName(event.target.value)}
        placeholder={t('project.namePlaceholder')} autoComplete="off" className={input}
        aria-invalid={!!name.trim() && !validName || undefined} aria-describedby={!!name.trim() && !validName ? `${id}-invalid` : undefined} />
      {!!name.trim() && !validName && <p id={`${id}-invalid`} className="mt-1 text-xs text-danger-ink">{t('project.invalidName')}</p>}
      <label className="mt-3 flex w-fit cursor-pointer items-center gap-2 text-sm text-ink-secondary">
        <input type="checkbox" checked={git} disabled={busy || !!created.current} onChange={event => setGit(event.target.checked)} className="h-4 w-4 accent-accent" />{t('project.createGit')}
      </label>
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="submit" disabled={busy || (!validName && !created.current)} className={`${button} border border-edge-strong !text-ink`}><Plus width={16} height={16} />{t('project.createEmpty')}</button>
        {canUseAgent && onCreateWithAgent && <button type="button" disabled={busy || (!validName && !created.current)} onClick={() => void create(true)}
          className={`${button} bg-accent !text-ink-on-accent hover:bg-accent-strong`}><Spark width={16} height={16} />{t('project.createWithAgent')}</button>}
      </div>
    </form> : <div className="flex min-h-0 flex-col">
      <div className="relative m-3 shrink-0"><Search width={16} height={16} aria-hidden="true" className="pointer-events-none absolute top-2.5 left-2 text-ink-muted" />
        <input value={search} onChange={event => setSearch(event.target.value)} aria-label={t('project.search')} placeholder={t('project.search')} className={`${input} !pl-8`} />
      </div>
      <div className="min-h-0 overflow-y-auto px-3 pb-3" aria-busy={projects === null && !error || undefined}>
        {!projects && !error && <div role="status" aria-label={t('common.loading')} className="flex justify-center p-4"><LoadingIndicator /></div>}
        {filtered?.map(project => <div key={project.path} className="flex items-center gap-1 rounded-md hover:bg-surface-hover">
          <button type="button" disabled={busy} onClick={() => void run(async () => { await onOpen(project.path) })}
            className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left text-sm text-ink focus-visible:outline-2 focus-visible:outline-accent">
            <ProjectIcon icon={project.icon ?? 'i:folder'} size={18} /><span className="min-w-0 flex-1"><span className="block truncate">{project.name}</span>
              {duplicateNames.has(project.name) && <span className="block truncate text-xs text-ink-soft">{project.path}</span>}
            </span>
          </button>
          <button type="button" disabled={busy || project.mine} aria-label={`${project.name}${duplicateNames.has(project.name) ? ` (${project.path})` : ''} · ${t(project.mine ? 'project.inMine' : 'project.addToMine')}`}
            data-tip={t(project.mine ? 'project.inMine' : 'project.addToMine')} className={button}
            onClick={() => void run(async () => { await beforeMutation?.(); await addMyProject(project.path); setProjects(previous => previous?.map(item => item.path === project.path ? { ...item, mine: true } : item) ?? null); await onProjectsChanged?.() })}>
            {project.mine ? <Check width={18} height={18} /> : <Plus width={18} height={18} />}
          </button>
        </div>)}
        {filtered?.length === 0 && <p className="py-4 text-center text-sm text-ink-muted">{t(projects?.length ? 'project.noProjectMatches' : 'project.noProjects')}</p>}
      </div>
    </div>}
    {error && <div className="mx-4 mb-3 flex items-start gap-2"><p role="alert" className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm text-danger-ink">{error}</p>
      {view === 'all' && <button type="button" className={button} onClick={() => setReload(value => value + 1)} aria-label={t('project.retry')}><RefreshDouble width={16} height={16} /></button>}
    </div>}
    <footer className="flex shrink-0 items-center gap-2 border-t border-edge px-3 py-2">
      <button type="button" disabled={busy || !!created.current} onClick={() => changeView('link')} className={button}><Link width={16} height={16} />{t('project.link')}</button>
      {busy && <span role="status" className="ml-auto flex items-center gap-2 text-xs text-ink-muted"><LoadingIndicator />{t('project.working')}</span>}
    </footer>
  </DialogFrame>
}
