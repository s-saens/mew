import { canAutoFocusInput } from '@mew/ui'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { ArrowLeft, Check, Folder, FolderPlus, GitBranch, NavArrowRight } from 'iconoir-react'
import { ConfirmDialog, DialogFrame } from '@mew/ui'
import { browseDirs, browseExternalEntries, cloneExternalGit, createExternalDirectory, createExternalFolder, initializeExternalGit, MissingDirectoryError, type ExternalEntriesResult } from '../api/client'
import type { MissingDirectory } from '../../shared/external-path'
import { useI18n } from '../i18n'
import { FileBrowser, FileBrowserHeader, fileBrowserButton as button, fileBrowserInput as input } from './file-browser'
import { resolveFileBrowserDraft } from './file-browser-path-suggestions'

type Action = 'folder' | 'clone' | 'init'

export function LinkProjectDialog({ basePath, onOpen, onClose, canManageFolders = true }: {
  basePath: string
  canManageFolders?: boolean
  onOpen: (path: string) => Promise<void> | void
  onClose: () => void
}) {
  const { t } = useI18n()
  const id = useId()
  const [path, setPath] = useState(basePath)
  const [draft, setDraft] = useState(basePath)
  const [result, setResult] = useState<ExternalEntriesResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [action, setAction] = useState<Action | null>(null)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [notice, setNotice] = useState('')
  const [missing, setMissing] = useState<MissingDirectory | null>(null)
  const requestSeq = useRef(0)
  const draftRevision = useRef(0)
  const busyRef = useRef(false)
  const actionInput = useRef<HTMLInputElement>(null)
  const actionBack = useRef<HTMLButtonElement>(null)
  const actionTriggers = useRef<Partial<Record<Action, HTMLButtonElement | null>>>({})
  const restoreActionFocus = useRef<Action | null>(null)

  const browse = useCallback(async (target: string): Promise<ExternalEntriesResult> => {
    if (canManageFolders) return browseExternalEntries(target)
    const result = await browseDirs(target)
    return { ...result, entries: result.dirs.map(entry => ({ ...entry, type: 'dir', size: null })) }
  }, [canManageFolders])
  const load = useCallback((nextPath: string, offerCreation = false) => {
    const seq = ++requestSeq.current
    setResult(null)
    setError(null)
    setMissing(null)
    setDraft(nextPath)
    const revision = ++draftRevision.current
    browse(nextPath).then((next) => {
      if (requestSeq.current !== seq) return
      setResult(next)
      setPath(next.path)
      if (draftRevision.current === revision) setDraft(next.path)
    }).catch((err: unknown) => {
      if (requestSeq.current !== seq) return
      setError(err instanceof Error ? err.message : String(err))
      if (offerCreation && err instanceof MissingDirectoryError) setMissing(err.missing)
    })
  }, [browse])

  const invalidateRequests = useCallback(() => { requestSeq.current++ }, [])
  useEffect(() => { load(basePath); return invalidateRequests }, [basePath, load, invalidateRequests])
  useEffect(() => { if (action) (canAutoFocusInput() ? actionInput.current ?? actionBack.current : actionBack.current)?.focus() }, [action])

  useEffect(() => {
    const target = restoreActionFocus.current
    if (action || busy || !result || !target) return
    const trigger = actionTriggers.current[target]
    // Git initialization disables its trigger; focus an available action instead.
    if (trigger?.disabled) actionTriggers.current.folder?.focus()
    else trigger?.focus()
    restoreActionFocus.current = null
  }, [action, busy, result])

  const back = () => {
    setAction(null)
    setError(null)
  }
  const begin = (next: Action) => {
    restoreActionFocus.current = next
    setName('')
    setUrl('')
    setError(null)
    setNotice('')
    setAction(next)
  }
  const run = async (operation: () => Promise<unknown>, after?: (value: unknown) => void) => {
    if (busyRef.current) return
    const seq = requestSeq.current
    busyRef.current = true
    setBusy(true)
    setError(null)
    try { const value = await operation(); if (requestSeq.current === seq) after?.(value) }
    catch (err) {
      if (requestSeq.current === seq) {
        setError(err instanceof Error ? err.message : String(err))
        if (err instanceof MissingDirectoryError) { setMissing(err.missing); setResult(null) }
      }
    }
    finally { busyRef.current = false; setBusy(false) }
  }

  const suggested = url.trim().replace(/[\\/]+$/, '').split(/[/:]/).at(-1)?.replace(/\.git$/i, '') ?? ''
  const folderName = name.trim() || (action === 'clone' ? suggested : '')
  const validName = !!folderName && !/[\\/]/.test(folderName) && !Array.from(folderName).some((char) => char.charCodeAt(0) < 32) && folderName !== '.' && folderName !== '..'
  const invalidName = !!name.trim() && !validName
  const submitAction = () => {
    if (!action || !result || (action !== 'init' && !validName) || (action === 'clone' && !url.trim())) return
    const operation = action === 'folder' ? () => createExternalFolder(path, folderName)
      : action === 'clone' ? () => cloneExternalGit(path, url.trim(), folderName)
      : () => initializeExternalGit(path)
    void run(operation, (created) => {
      setNotice(t(action === 'init' ? 'project.initialized' : 'project.created', { name: folderName }))
      back()
      const target = action !== 'init' && created && typeof created === 'object' && 'path' in created && typeof created.path === 'string' ? created.path : path
      load(target)
    })
  }
  const currentIsGit = result?.entries.some((entry) => entry.name === '.git') ?? false
  const actionTitle = action === 'folder' ? t('sidebar.newFolder') : action === 'clone' ? t('project.clone') : t('project.init')
  const targetPath = resolveFileBrowserDraft(draft, path)
  const openFolder = () => void run(async () => {
    if (!targetPath) return
    const selected = targetPath === path ? result : await browse(targetPath)
    if (selected) await onOpen(selected.path)
  })

  return <DialogFrame labelledBy={id} busy={busy} onClose={action ? back : onClose} className="flex h-[min(600px,90dvh)] max-w-2xl flex-col">
    <FileBrowserHeader id={id} title={t('project.link')} busy={busy} onClose={onClose} initialFocus />

    {action ? <form noValidate className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => { event.preventDefault(); submitAction() }}>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 sm:px-4">
        <button ref={actionBack} type="button" disabled={busy} onClick={back} className={`${button} -ml-2 mb-2`}><ArrowLeft width={16} height={16} />{t('project.backToFolders')}</button>
        <h3 className="text-base font-semibold text-ink">{actionTitle}</h3>
        <p className="mt-1 text-sm leading-relaxed text-ink-secondary">{t(action === 'init' ? 'project.initHint' : 'project.createHint')}</p>
        <div className="select-text mt-3 flex items-start gap-2 rounded-lg bg-surface-deep p-3 text-xs text-ink-secondary"><Folder width={16} height={16} className="shrink-0" /><span className="break-all font-mono">{path}</span></div>
        {action === 'clone' && <div className="mt-3">
          <label htmlFor={`${id}-url`} className="mb-1 block text-sm font-medium text-ink">{t('project.repositoryUrl')}</label>
          <input ref={actionInput} id={`${id}-url`} value={url} disabled={busy} onChange={(event) => setUrl(event.target.value)} className={input} placeholder="https://github.com/team/project.git" autoComplete="off" spellCheck={false} />
        </div>}
        {action !== 'init' && <div className="mt-3">
          <label htmlFor={`${id}-name`} className="mb-1 block text-sm font-medium text-ink">{t('project.folderName')}</label>
          <input ref={action === 'folder' ? actionInput : undefined} id={`${id}-name`} value={name} disabled={busy} onChange={(event) => setName(event.target.value)} className={input} placeholder={action === 'clone' ? suggested || 'project' : 'my-project'} autoComplete="off" spellCheck={false} aria-invalid={invalidName || undefined} aria-describedby={invalidName ? `${id}-name-error` : undefined} />
          {invalidName && <p id={`${id}-name-error`} className="mt-2 text-xs text-danger-ink">{t('project.invalidName')}</p>}
        </div>}
        {error && <p role="alert" className="mt-4 whitespace-pre-wrap break-words rounded-lg bg-danger-surface p-3 text-sm text-danger-ink">{error}</p>}
        {busy && <p role="status" className="mt-4 text-sm text-ink-secondary">{t(action === 'clone' ? 'project.cloning' : 'project.working')}</p>}
      </div>
      <footer className="flex shrink-0 justify-end gap-2 border-t border-edge px-3 py-2 sm:px-4">
        <button type="button" disabled={busy} onClick={back} className={button}>{t('common.cancel')}</button>
        <button type="submit" disabled={busy || (action !== 'init' && !validName) || (action === 'clone' && !url.trim())} className={`${button} bg-accent !text-ink-on-accent hover:bg-accent-strong`}>{busy ? t('project.working') : actionTitle}</button>
      </footer>
    </form> : <FileBrowser
      onFilesChanged={() => load(path)} allowFileActions={canManageFolders} showFavorites={canManageFolders}
      result={result} error={error} draft={draft} onDraftChange={(value) => { draftRevision.current++; setDraft(value) }}
      onNavigate={(nextPath) => { setNotice(''); load(nextPath, true) }} busy={busy} foldersOnly autocomplete={canManageFolders} autoFocusPath={false}
      selectedPath={targetPath || undefined}
      toolbar={canManageFolders && <>
      <div className="flex shrink-0 flex-wrap gap-1">
        <button type="button" disabled={!result || busy} ref={(element) => { actionTriggers.current.folder = element }} onClick={() => begin('folder')} className={button}><FolderPlus width={17} height={17} />{t('sidebar.newFolder')}</button>
        <button type="button" disabled={!result || busy} ref={(element) => { actionTriggers.current.clone = element }} onClick={() => begin('clone')} className={button}><GitBranch width={17} height={17} />{t('project.clone')}</button>
        <button type="button" disabled={!result || busy || currentIsGit} ref={(element) => { actionTriggers.current.init = element }} onClick={() => begin('init')} className={button}>{currentIsGit ? <><Check width={16} height={16} />{t('project.gitRepository')}</> : t('project.init')}</button>
      </div>
      </>}
      notice={notice && <p role="status" className="mx-3 mt-2 flex items-center gap-2 text-xs text-success-ink sm:mx-4"><Check width={16} height={16} />{notice}</p>}
      footerActions={<button type="button" disabled={busy || !result || !targetPath} onClick={openFolder} className={`${button} min-h-9 bg-accent px-3 !text-ink-on-accent hover:bg-accent-strong`}>{busy ? t('project.working') : t('project.linkHere')}<NavArrowRight width={16} height={16} /></button>}
    />}
    {missing && <ConfirmDialog message={t('project.createMissingPath', { parent: missing.existingPath, name: missing.missingName })}
      detail={t('project.createPathDetail', { path: missing.path })} confirmLabel={t('project.createPath')} cancelLabel={t('common.cancel')}
      onCancel={() => setMissing(null)} onConfirm={() => {
        const target = missing.path
        setMissing(null)
        void run(() => createExternalDirectory(target), () => load(target))
      }} />}
  </DialogFrame>
}
