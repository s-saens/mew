import { useEffect, useId, useRef, useState } from 'react'
import { ArrowLeft, Check, Folder, FolderPlus, GitBranch, Link, Lock, NavArrowRight, Plus, RefreshDouble, Spark, Xmark } from 'iconoir-react'
import { canAutoFocusInput, DialogFrame, HoverTipLayer, LoadingIndicator } from '@mew/ui'
import { cloneManagedProject, fetchConnectedGitRepositories, registerProject, type RegisteredProject } from '../api/client'
import { GIT_CONNECTION_CHANGED } from '../api/git-auth-request'
import { useI18n } from '../i18n'
import { GitHubAccount } from './github-account'
import { LinkProjectDialog } from './LinkProjectDialog'
import { projectAddCopy } from './project-add-copy'
import { ProjectCatalogPanel } from './project-catalog-panel'

type Mode = 'clone' | 'create' | 'import' | 'workspace'
const emptyPaths: string[] = []
type Repository = Awaited<ReturnType<typeof fetchConnectedGitRepositories>>['repositories'][number]

const iconButton = 'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded text-ink-secondary hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40'
const field = 'h-10 w-full min-w-0 rounded-lg border border-edge-strong bg-surface-deep px-2.5 text-sm text-ink placeholder:text-ink-secondary focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-60'

export interface ProjectAddInlineProps {
  basePath: string
  paths?: string[]
  onOpen: (path: string) => Promise<boolean | void> | boolean | void
  onProjectsChanged?: () => Promise<void> | void
  onCreateWithAgent?: (project: RegisteredProject) => Promise<void> | void
  canUseAgent?: boolean
  canManageFolders?: boolean
  beforeMutation?: () => Promise<unknown>
  openRequested?: boolean
  onOpenRequestHandled?: () => void
  onboarding?: boolean
}

export function ProjectAddInline({ basePath, paths = emptyPaths, onOpen, onProjectsChanged, onCreateWithAgent, canUseAgent = true, canManageFolders = true, beforeMutation, openRequested = false, onOpenRequestHandled, onboarding = false }: ProjectAddInlineProps) {
  const { t, locale } = useI18n()
  const copy = projectAddCopy(locale)
  const id = useId()
  const [expanded, setExpanded] = useState(false)
  const [mode, setMode] = useState<Mode | null>(null)
  const [linkOpen, setLinkOpen] = useState(false)
  const [name, setName] = useState('')
  const [git, setGit] = useState(true)
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [repositories, setRepositories] = useState<Repository[] | null>(null)
  const [connected, setConnected] = useState(false)
  const [repositoryError, setRepositoryError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const openRequestConsumed = useRef(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const modeTriggers = useRef<Partial<Record<Mode, HTMLButtonElement | null>>>({})
  const browseTrigger = useRef<HTMLButtonElement>(null)
  const restoreFocus = useRef<Mode | 'browse' | null>(null)
  const backTrigger = useRef<HTMLButtonElement>(null)
  const [createdMode, setCreatedMode] = useState<Mode | null>(null)
  const busyRef = useRef(false)
  const alive = useRef(true)
  const workspace = useRef<HTMLDivElement>(null)
  const linked = useRef(new Map<string, RegisteredProject>())
  const [created, setCreated] = useState<RegisteredProject | null>(null)

  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => {
    if (!openRequested) { openRequestConsumed.current = false; return }
    if (openRequestConsumed.current) return
    openRequestConsumed.current = true
    if (!expanded) {
      trigger.current?.focus({ preventScroll: true })
      setMode(createdMode)
      setExpanded(true)
    }
    onOpenRequestHandled?.()
  }, [openRequested, onOpenRequestHandled, createdMode, expanded])
  useEffect(() => {
    if (!expanded) return
    if (linkOpen) return
    const restore = restoreFocus.current
    if (restore) {
      (restore === 'browse' ? browseTrigger.current : modeTriggers.current[restore])?.focus()
      restoreFocus.current = null
    } else if (mode === 'create' || mode === 'clone') {
      if (canAutoFocusInput()) input.current?.focus()
      else backTrigger.current?.focus()
    } else if (mode) {
      (mode === 'workspace' && canAutoFocusInput() ? workspace.current?.querySelector<HTMLInputElement>('input') : backTrigger.current)?.focus()
    }
  }, [expanded, mode, linkOpen])
  useEffect(() => {
    if (!expanded || mode !== 'clone') return
    const controller = new AbortController()
    setRepositories(null)
    setRepositoryError(null)
    fetchConnectedGitRepositories(controller.signal).then(result => {
      if (controller.signal.aborted) return
      setConnected(result.connected)
      setRepositories(result.repositories)
    }).catch((err: unknown) => {
      if (!controller.signal.aborted) setRepositoryError(err instanceof Error ? err.message : String(err))
    })
    return () => controller.abort()
  }, [expanded, mode, reload])
  useEffect(() => {
    const changed = () => setReload(value => value + 1)
    window.addEventListener(GIT_CONNECTION_CHANGED, changed)
    return () => window.removeEventListener(GIT_CONNECTION_CHANGED, changed)
  }, [])

  function back() {
    if (busyRef.current) return
    setError(null)
    if (mode) {
      restoreFocus.current = mode
      setMode(mode === 'workspace' ? 'import' : null)
    }
  }
  function close() {
    if (busyRef.current) return
    setExpanded(false)
    requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true }))
  }

  const validName = !!name.trim() && name.trim() !== '.' && name.trim() !== '..' && !/[\\/\p{Cc}]/u.test(name.trim()) && !name.trim().startsWith('.')
  const invalidName = !!name.trim() && !validName
  const locked = busy || !!created

  async function run(operation: () => Promise<void>) {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError(null)
    try { await operation() }
    catch (err) {
      if (alive.current) setError(err instanceof Error ? err.message : String(err))
      throw err
    } finally {
      busyRef.current = false
      if (alive.current) setBusy(false)
    }
  }
  async function finish(project: RegisteredProject, withAgent = false) {
    await onProjectsChanged?.()
    if (withAgent && onCreateWithAgent) await onCreateWithAgent(project)
    else if (await onOpen(project.path) === false) throw new Error(copy.openFailed)
    if (!alive.current) return
    setCreated(null)
    linked.current.clear()
    setCreatedMode(null)
    setExpanded(false)
    setMode(null)
    setName('')
    setUrl('')
    setGit(true)
    setLinkOpen(false)
  }
  function submit(withAgent = false, repositoryUrl = url.trim()) {
    if (mode === 'create' ? !validName && !created : !repositoryUrl && !created) return
    void run(async () => {
      await beforeMutation?.()
      const project = created ?? (mode === 'create'
        ? (await registerProject({ name: name.trim(), git })).project
        : (await cloneManagedProject(repositoryUrl)).project)
      setCreatedMode(mode)
      setCreated(project)
      await finish(project, withAgent)
    }).catch(() => {})
  }
  function choose(next: Mode) {
    if (busyRef.current || created && next !== createdMode) return
    setMode(next)
    setError(null)
  }

  const choices = mode === 'import' ? (['workspace', 'browse'] as const) : (['create', 'clone', 'import'] as const)
  const title = mode === 'workspace' ? copy.workspace : mode ? copy[mode] : copy.add

  return <HoverTipLayer className={`mew-project-add${onboarding ? ' mew-project-add-onboarding' : ''}`}><div className="min-w-0" data-project-add-inline data-project-add-step={!expanded ? 'closed' : mode ?? 'choices'}>
    {onboarding && <h2 className="mew-project-add-heading text-center text-base font-medium text-ink">{copy.heading}</h2>}
    <button ref={trigger} type="button" aria-label={copy.add} data-tip={copy.add} aria-haspopup="dialog" aria-expanded={expanded} aria-controls={expanded ? `${id}-setup` : undefined}
      onClick={() => { trigger.current?.focus({ preventScroll: true }); setMode(createdMode); setError(null); setExpanded(true) }}
      className="mew-project-add-trigger inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-secondary hover:bg-surface-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-accent">
      <Plus width={18} height={18} aria-hidden="true" />
    </button>
    {expanded && <DialogFrame labelledBy={`${id}-title`} onClose={close} busy={busy} className="mew-project-add-dialog flex max-w-[26rem] flex-col">
      <HoverTipLayer className="flex min-h-0 flex-col">
      <header className="mew-project-add-header flex shrink-0 items-center gap-2 border-b border-edge px-3 py-2">
        {mode ? <button ref={backTrigger} type="button" data-project-add-back aria-label={copy.back} data-tip={copy.back} disabled={busy} onClick={back} className={iconButton}><ArrowLeft width={18} height={18} aria-hidden="true" /></button>
          : <span className="mew-project-add-title-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-accent"><FolderPlus width={19} height={19} aria-hidden="true" /></span>}
        <h2 id={`${id}-title`} className="min-w-0 flex-1 text-sm font-semibold text-ink">{title}</h2>
        <button type="button" data-project-add-close aria-label={t('common.close')} data-tip={t('common.close')} disabled={busy} onClick={close} className={iconButton}><Xmark width={18} height={18} aria-hidden="true" /></button>
      </header>
      <div id={`${id}-setup`} className="mew-project-add-body min-h-0 overflow-y-auto p-3">
      {(mode === null || mode === 'import') && <nav aria-label={title} className="mew-project-add-choices flex min-w-0 flex-col gap-1.5">
        {choices.map((next, index) => <button key={next} ref={element => { if (next === 'browse') browseTrigger.current = element; else modeTriggers.current[next] = element }} type="button"
          data-project-add-choice={next} data-dialog-autofocus={index === 0 || undefined} aria-label={copy[next]} disabled={busy || !!created && next !== createdMode}
          onClick={() => next === 'browse' ? setLinkOpen(true) : choose(next)}
          className="mew-project-add-choice flex min-w-0 items-center gap-3 rounded-lg border border-edge px-3 py-2.5 text-left text-ink hover:border-edge-strong hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40">
          <span className="mew-project-add-choice-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-accent">
            {next === 'clone' ? <GitBranch width={20} height={20} aria-hidden="true" /> : next === 'create' ? <FolderPlus width={20} height={20} aria-hidden="true" /> : next === 'browse' ? <Folder width={20} height={20} aria-hidden="true" /> : <Link width={20} height={20} aria-hidden="true" />}
          </span>
          <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{copy[next]}</span><span className="mt-0.5 block text-xs leading-4 text-ink-secondary">{copy[`${next}Hint`]}</span></span>
          <NavArrowRight width={16} height={16} className="shrink-0 text-ink-secondary" aria-hidden="true" />
        </button>)}
      </nav>}
      {mode === 'workspace' && <div ref={workspace}><ProjectCatalogPanel paths={paths} beforeMutation={beforeMutation} onProjectsChanged={onProjectsChanged}
        onBusyChange={value => { busyRef.current = value; setBusy(value) }} onOpen={async path => {
          try {
            const result = await onOpen(path)
            if (result !== false && alive.current) { setExpanded(false); setMode(null) }
            return result
          } finally {
            busyRef.current = false
            if (alive.current) setBusy(false)
          }
        }} /></div>}
      {mode === 'create' && <form className="min-w-0" noValidate onSubmit={event => { event.preventDefault(); submit() }}>
        <label className="mb-1.5 block text-xs font-medium text-ink-secondary" htmlFor={`${id}-name`}>{t('project.name')}</label>
        <div className="relative min-w-0">
          <input ref={input} id={`${id}-name`} value={name} disabled={locked} onChange={event => setName(event.target.value)}
            placeholder={t('project.namePlaceholder')} autoComplete="off" spellCheck={false} className={`${field} pr-11`}
            aria-invalid={invalidName || undefined} aria-describedby={invalidName ? `${id}-invalid` : undefined} />
          <button type="button" aria-pressed={git} aria-label={t('project.createGit')} data-tip={t('project.createGit')} disabled={locked} onClick={() => setGit(value => !value)}
            className={`${iconButton} mew-project-add-git absolute top-1 right-1 ${git ? '!text-accent' : ''}`}><GitBranch width={16} height={16} aria-hidden="true" /></button>
        </div>
        {invalidName && <p id={`${id}-invalid`} className="mt-1 break-words text-xs text-danger-ink">{t('project.invalidName')}</p>}
        <div className="mew-project-add-actions mt-3 flex flex-wrap items-center justify-end gap-1.5">
          {canUseAgent && onCreateWithAgent && <button type="button" disabled={busy || !validName && !created} onClick={() => submit(true)}
            className="mew-project-add-secondary inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs text-ink-secondary hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40"><Spark width={15} height={15} aria-hidden="true" />{t('project.createWithAgent')}</button>}
          <button type="submit" disabled={busy || !validName && !created} className="mew-project-add-primary inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-accent px-3 text-sm font-medium text-ink-on-accent hover:bg-accent-strong focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40"><Check width={16} height={16} aria-hidden="true" />{copy.confirmCreate}</button>
        </div>
      </form>}
      {mode === 'clone' && <div className="min-w-0">
        <form className="min-w-0" onSubmit={event => { event.preventDefault(); submit() }}>
          <label className="mb-1.5 block text-xs font-medium text-ink-secondary" htmlFor={`${id}-url`}>{t('project.repositoryUrl')}</label>
          <input ref={input} id={`${id}-url`} type="text" value={url} disabled={locked} onChange={event => setUrl(event.target.value)}
            placeholder="https://github.com/owner/repository" autoComplete="off" spellCheck={false} className={`${field} flex-1`} />
          <div className="mt-3 flex justify-end"><button type="submit" disabled={busy || !url.trim() && !created} className="mew-project-add-primary inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-accent px-3 text-sm font-medium text-ink-on-accent hover:bg-accent-strong focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40"><GitBranch width={16} height={16} aria-hidden="true" />{copy.confirmClone}</button></div>
        </form>
        <div className="mt-3 flex min-w-0 items-center justify-between gap-1 border-t border-edge pt-2"><GitHubAccount project="" />
          <button type="button" disabled={busy || repositories === null && !repositoryError} className={iconButton} onClick={() => setReload(value => value + 1)} aria-label={t('project.retry')} data-tip={t('project.retry')}><RefreshDouble width={15} height={15} aria-hidden="true" /></button>
        </div>
        {repositories === null && !repositoryError && <span role="status" aria-label={t('common.loading')} className="flex justify-center py-1"><LoadingIndicator /></span>}
        {repositoryError && <p role="alert" className="mt-1 break-words text-xs text-danger-ink">{repositoryError}</p>}
        {connected && repositories && <div role="group" aria-label={copy.repositories} className="max-h-52 min-w-0 overflow-y-auto">
          {repositories.map(repository => <button key={repository.fullName} type="button" disabled={locked} onClick={() => { setUrl(repository.url); submit(false, repository.url) }}
            className="flex min-h-8 w-full min-w-0 items-center gap-1 rounded px-1.5 py-1 text-left text-xs text-ink hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40">
            <GitBranch width={14} height={14} className="shrink-0" aria-hidden="true" /><span className="min-w-0 flex-1 break-all">{repository.fullName}</span>
            {repository.private && <Lock width={13} height={13} className="shrink-0 text-ink-secondary" role="img" aria-label={copy.privateRepository} />}
          </button>)}
          {repositories.length === 0 && <p className="px-1.5 py-1 text-xs text-ink-secondary">{copy.noRepositories}</p>}
        </div>}
      </div>}
      {error && <p role="alert" className="mt-1 whitespace-pre-wrap break-words text-xs text-danger-ink">{error}</p>}
      {busy && <span role="status" className="mt-1 flex items-center gap-1.5 text-xs text-ink-secondary"><LoadingIndicator />{t(mode === 'clone' ? 'project.cloning' : 'project.working')}</span>}
      </div>
      </HoverTipLayer>
    </DialogFrame>}
    {linkOpen && <LinkProjectDialog basePath={basePath} canManageFolders={canManageFolders} onClose={() => { restoreFocus.current = 'browse'; setLinkOpen(false) }} onOpen={async path => {
      await run(async () => {
        let project = linked.current.get(path)
        if (!project) {
          await beforeMutation?.()
          project = (await registerProject({ path })).project
          linked.current.set(path, project)
        }
        await finish(project)
      })
    }} />}
  </div></HoverTipLayer>
}
