import { useEffect, useId, useRef, useState } from 'react'
import { Check, GitBranch, Lock, Plus, RefreshDouble, Spark, Xmark } from 'iconoir-react'
import { canAutoFocusInput, HoverTipLayer, LoadingIndicator, useOverlayDismiss } from '@mew/ui'
import { cloneManagedProject, fetchConnectedGitRepositories, registerProject, type RegisteredProject } from '../api/client'
import { GIT_CONNECTION_CHANGED } from '../api/git-auth-request'
import { useI18n } from '../i18n'
import { GitHubAccount } from './github-account'
import { LinkProjectDialog } from './LinkProjectDialog'
import { projectAddCopy } from './project-add-copy'

type Mode = 'clone' | 'create' | 'existing'
type Repository = Awaited<ReturnType<typeof fetchConnectedGitRepositories>>['repositories'][number]

const iconButton = 'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded text-ink-secondary hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40'
const field = 'h-8 w-full min-w-0 rounded border border-edge-strong bg-surface-deep px-2 text-sm text-ink placeholder:text-ink-secondary focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-60'

export interface ProjectAddInlineProps {
  basePath: string
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

export function ProjectAddInline({ basePath, onOpen, onProjectsChanged, onCreateWithAgent, canUseAgent = true, canManageFolders = true, beforeMutation, openRequested = false, onOpenRequestHandled, onboarding = false }: ProjectAddInlineProps) {
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
  const trigger = useRef<HTMLButtonElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const modeTriggers = useRef<Partial<Record<Mode, HTMLButtonElement | null>>>({})
  const busyRef = useRef(false)
  const alive = useRef(true)
  const [created, setCreated] = useState<RegisteredProject | null>(null)

  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => {
    if (!openRequested) return
    setExpanded(true)
    onOpenRequestHandled?.()
  }, [openRequested, onOpenRequestHandled])
  useEffect(() => {
    if (!expanded || !mode || linkOpen) return
    if (canAutoFocusInput()) input.current?.focus()
    else modeTriggers.current[mode]?.focus()
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

  function close() {
    if (busyRef.current) return
    setExpanded(false)
    trigger.current?.focus()
  }
  useOverlayDismiss(expanded && !linkOpen && close, { closeOnEscape: () => !busyRef.current, closeOnBack: () => !busyRef.current })

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
      setCreated(project)
      await finish(project, withAgent)
    }).catch(() => {})
  }
  function choose(next: Mode) {
    if (busyRef.current || created && next !== mode) return
    setMode(next)
    setError(null)
    if (next === 'existing') setLinkOpen(true)
  }

  return <HoverTipLayer className="max-h-[min(420px,55dvh)] min-w-0 overflow-y-auto"><div className="min-w-0" data-project-add-inline>
    <div className="flex min-w-0 items-center gap-1">
      <button ref={trigger} type="button" aria-expanded={expanded} aria-controls={`${id}-setup`} disabled={busy}
        onClick={() => expanded ? close() : setExpanded(true)}
        className="flex min-h-8 min-w-0 flex-1 items-center gap-1.5 rounded px-1.5 text-left text-xs text-ink-secondary hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40">
        <Plus width={16} height={16} aria-hidden="true" />{copy.add}
      </button>
      {expanded && <button type="button" onClick={close} disabled={busy} className={iconButton} aria-label={t('common.close')} data-tip={t('common.close')}><Xmark width={16} height={16} aria-hidden="true" /></button>}
    </div>
    {onboarding && (!expanded || mode !== 'clone') && <GitHubAccount project="" />}
    {expanded && <div id={`${id}-setup`} className="min-w-0 pb-1">
      <nav aria-label={t('project.add')} className="flex min-w-0 items-stretch gap-0.5 py-1">
        {(['clone', 'create', 'existing'] as const).map(next => <button key={next} ref={element => { modeTriggers.current[next] = element }} type="button"
          aria-label={next === 'existing' ? copy.existingLabel : copy[next]} aria-pressed={mode === next} disabled={busy || !!created && next !== mode} onClick={() => choose(next)}
          className={`min-h-8 min-w-0 whitespace-nowrap rounded px-0.5 text-xs leading-4 text-ink-secondary hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40 ${next === 'create' ? 'flex-[1.25]' : 'flex-1'} ${mode === next ? 'bg-surface-raised !text-ink' : ''}`}>{copy[next]}</button>)}
      </nav>
      {mode === 'create' && <form className="min-w-0" noValidate onSubmit={event => { event.preventDefault(); submit() }}>
        <div className="flex min-w-0 items-center gap-1">
          <div className="relative min-w-0 flex-1">
            <label className="sr-only" htmlFor={`${id}-name`}>{t('project.name')}</label>
            <input ref={input} id={`${id}-name`} value={name} disabled={locked} onChange={event => setName(event.target.value)}
              placeholder={t('project.name')} autoComplete="off" spellCheck={false} className={`${field} pr-9`}
              aria-invalid={invalidName || undefined} aria-describedby={invalidName ? `${id}-invalid` : undefined} />
            <button type="button" aria-pressed={git} aria-label={t('project.createGit')} data-tip={t('project.createGit')} disabled={locked} onClick={() => setGit(value => !value)}
              className={`${iconButton} absolute top-0 right-0 ${git ? '!text-accent' : ''}`}><GitBranch width={16} height={16} aria-hidden="true" /></button>
          </div>
          <button type="submit" disabled={busy || !validName && !created} aria-label={copy.confirmCreate} data-tip={copy.confirmCreate} className={`${iconButton} bg-accent !text-ink-on-accent hover:bg-accent-strong`}><Check width={17} height={17} aria-hidden="true" /></button>
        </div>
        {invalidName && <p id={`${id}-invalid`} className="mt-1 break-words text-xs text-danger-ink">{t('project.invalidName')}</p>}
        {canUseAgent && onCreateWithAgent && <button type="button" disabled={busy || !validName && !created} onClick={() => submit(true)}
          className="mt-1 flex min-h-8 items-center gap-1.5 rounded px-1.5 text-xs text-ink-secondary hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40"><Spark width={15} height={15} aria-hidden="true" />{t('project.createWithAgent')}</button>}
      </form>}
      {mode === 'clone' && <div className="min-w-0">
        <form className="flex min-w-0 items-center gap-1" onSubmit={event => { event.preventDefault(); submit() }}>
          <label className="sr-only" htmlFor={`${id}-url`}>{t('project.repositoryUrl')}</label>
          <input ref={input} id={`${id}-url`} type="text" value={url} disabled={locked} onChange={event => setUrl(event.target.value)}
            placeholder={t('project.repositoryUrl')} autoComplete="off" spellCheck={false} className={`${field} flex-1`} />
          <button type="submit" disabled={busy || !url.trim() && !created} aria-label={copy.confirmClone} data-tip={copy.confirmClone} className={`${iconButton} bg-accent !text-ink-on-accent hover:bg-accent-strong`}><Check width={17} height={17} aria-hidden="true" /></button>
        </form>
        <div className="mt-1 flex min-w-0 items-center justify-between gap-1"><GitHubAccount project="" />
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
    </div>}
    {linkOpen && <LinkProjectDialog basePath={basePath} canManageFolders={canManageFolders} onClose={() => setLinkOpen(false)} onOpen={async path => {
      await run(async () => {
        await beforeMutation?.()
        const { project } = await registerProject({ path })
        await finish(project)
      })
    }} />}
  </div></HoverTipLayer>
}
