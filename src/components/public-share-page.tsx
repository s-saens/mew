import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Editor, type EditorApi } from '@mew/editor'
import { Download, FloppyDisk, Folder, NavArrowDown, NavArrowRight, Page, Refresh } from 'iconoir-react'
import { HoverTipLayer, LoadingIndicator } from '@mew/ui'
import { fetchPublicShare, fetchPublicShareFile, fetchPublicShareTree, publicShareApiPath, PublicShareError, savePublicShareFile, type PublicShareIdentity, type PublicShareMetadata } from '../api/public-share-content.ts'
import type { TreeNode } from '../api/client.ts'
import { useI18n } from '../i18n.tsx'
import { appResourceUrl } from '../runtime/app-runtime.ts'
import { mediaKind } from '../utils/media.ts'
import { PublicShareDocument } from '../utils/public-share-document.ts'
import { publicShareRelativePath } from '../utils/public-share-route.ts'
import { CodePane } from './CodePane.tsx'
import { MarkdownErrorBoundary } from './markdown-error-boundary.tsx'
import { publicSharePageCopy } from './public-share-page-copy.ts'

function PublicFolder({ share, path = '', selected, onSelect }: {
  share: PublicShareIdentity; path?: string; selected: string | null; onSelect: (path: string) => void
}) {
  const { locale } = useI18n(), copy = publicSharePageCopy(locale)
  const [nodes, setNodes] = useState<TreeNode[] | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    void fetchPublicShareTree(share, path, controller.signal).then(result => setNodes(result.tree), () => {
      if (!controller.signal.aborted) setFailed(true)
    })
    return () => controller.abort()
  }, [share, path, attempt])
  if (failed) return <button type="button" className="px-2 py-1 text-sm text-danger" onClick={() => { setFailed(false); setNodes(null); setAttempt(value => value + 1) }}>{copy.retry}</button>
  if (!nodes) return <div className="p-2" role="status"><LoadingIndicator size={16} /></div>
  if (!nodes.length) return <p className="px-2 py-1 text-xs text-ink-muted">{copy.empty}</p>
  return <ul className="min-w-0" role={path ? 'group' : 'tree'} aria-label={path || copy.files}>
    {nodes.map(node => <li role="treeitem" key={node.path} aria-selected={node.type === 'file' ? selected === node.path : undefined} aria-expanded={node.type === 'dir' ? expanded.has(node.path) : undefined}>
      <button type="button" className={`flex w-full min-w-0 items-center gap-1 rounded px-2 py-1 text-left text-sm hover:bg-surface-hover focus-visible:outline focus-visible:outline-accent ${selected === node.path ? 'bg-accent/15 text-accent' : ''}`}
        onClick={() => node.type === 'file' ? onSelect(node.path) : setExpanded(previous => {
          const next = new Set(previous); if (next.has(node.path)) next.delete(node.path); else next.add(node.path); return next
        })}>
        {node.type === 'dir' ? <>{expanded.has(node.path) ? <NavArrowDown width={12} height={12} aria-hidden /> : <NavArrowRight width={12} height={12} aria-hidden />}<Folder width={14} height={14} aria-hidden /></> : <Page width={14} height={14} aria-hidden className="ml-4 shrink-0" />}
        <span className="truncate" data-tip={node.name}>{node.name}</span>
      </button>
      {node.type === 'dir' && expanded.has(node.path) && <div className="pl-3"><PublicFolder share={share} path={node.path} selected={selected} onSelect={onSelect} /></div>}
    </li>)}
  </ul>
}

function PublicDocument({ share, metadata, path, onSelect, onSession }: {
  share: PublicShareIdentity; metadata: PublicShareMetadata; path: string; onSelect: (path: string) => void
  onSession: (session: PublicShareDocument | null) => void
}) {
  const { locale } = useI18n(), copy = publicSharePageCopy(locale)
  const [session, setSession] = useState<PublicShareDocument | null>(null)
  const [downloadOnly, setDownloadOnly] = useState(false)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const name = path || metadata.name
  const media = mediaKind(name)
  useEffect(() => {
    const controller = new AbortController()
    if (!media || media === 'sheet' && /\.(csv|tsv)$/i.test(name)) {
      void fetchPublicShareFile(share, path, controller.signal).then(file => {
        if (controller.signal.aborted) return
        const next = new PublicShareDocument(file, (content, version) => savePublicShareFile(share, path, content, version))
        setSession(next); onSession(next)
      }, error => {
        if (controller.signal.aborted) return
        if (error instanceof PublicShareError && [413, 415].includes(error.status)) setDownloadOnly(true)
        else setFailed(true)
      })
    }
    return () => { controller.abort(); onSession(null) }
  }, [share, path, name, media, attempt, onSession])
  const reload = () => { setSession(null); onSession(null); setFailed(false); setDownloadOnly(false); setAttempt(value => value + 1) }
  const raw = appResourceUrl(publicShareApiPath(share, 'raw', path))
  if (downloadOnly || media && !(media === 'sheet' && /\.(csv|tsv)$/i.test(name))) {
    return <div className="flex h-full min-h-0 flex-col items-center justify-center overflow-auto p-2">
      {media === 'image' ? <img src={raw} alt={name} className="max-h-full max-w-full object-contain" />
        : media === 'audio' ? <audio src={raw} controls aria-label={name} />
        : media === 'video' ? <video src={raw} controls aria-label={name} className="max-h-full max-w-full" />
        : <a href={raw} download={name} className="flex items-center gap-2 rounded px-2 py-1 text-accent"><Download width={16} height={16} aria-hidden />{copy.download}</a>}
    </div>
  }
  if (failed) return <div role="alert" className="flex items-center justify-center gap-2 p-3 text-sm"><span>{copy.unavailable}</span><button type="button" onClick={reload} className="rounded px-2 py-1 text-accent">{copy.retry}</button></div>
  if (!session) return <div className="flex h-full items-center justify-center" role="status"><LoadingIndicator size={20} /></div>
  return <LoadedPublicDocument session={session} share={share} metadata={metadata} name={name} onSelect={onSelect} onReload={reload} />
}

function LoadedPublicDocument({ session, share, metadata, name, onSelect, onReload }: {
  session: PublicShareDocument; share: PublicShareIdentity; metadata: PublicShareMetadata; name: string
  onSelect: (path: string) => void; onReload: () => void
}) {
  const { locale } = useI18n(), copy = publicSharePageCopy(locale)
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot)
  const [plain, setPlain] = useState(false)
  const editable = metadata.mode === 'edit'
  const markdown = /\.mdx?$/i.test(name)
  useEffect(() => {
    if (!editable || state.saving || state.error || !session.dirty) return
    const timer = setTimeout(() => { void session.save() }, 650)
    return () => clearTimeout(timer)
  }, [session, state, editable])
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (session.dirty) { event.preventDefault(); event.returnValue = '' } }
    const save = (event: KeyboardEvent) => {
      if (editable && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void session.save() }
    }
    window.addEventListener('beforeunload', beforeUnload); window.addEventListener('keydown', save)
    return () => { window.removeEventListener('beforeunload', beforeUnload); window.removeEventListener('keydown', save) }
  }, [session, editable])
  const api = useMemo<EditorApi>(() => {
    const unavailable = () => Promise.reject(new Error(publicSharePageCopy(locale).unsupported))
    return {
      fetchFile: async path => {
        const file = await fetchPublicShareFile(share, path)
        return { ...file, editable }
      },
      resolveImageUrl: (src, documentPath) => {
        if (/^https?:\/\//i.test(src) || /^data:image\/(?:png|jpeg|gif|webp|avif|bmp);/i.test(src)) return src
        const path = share.type === 'd' ? publicShareRelativePath(documentPath, src) : null
        return path === null ? 'data:,' : appResourceUrl(publicShareApiPath(share, 'raw', path))
      },
      uploadAsset: unavailable,
      fetchLinkPreview: async () => ({ title: null, description: null }),
      db: {
        list: async () => [], create: unavailable, attachExternal: unavailable, getView: unavailable, remove: unavailable,
        rename: unavailable, insertRow: unavailable, updateCell: unavailable, deleteRow: unavailable,
        addColumn: unavailable, renameColumn: unavailable, changeColumnType: unavailable, updateColumnOptions: unavailable,
        deleteColumn: unavailable, subscribe: () => () => {},
      },
    }
  }, [share, editable, locale])
  return <div className="flex h-full min-h-0 flex-col">
    {(editable || markdown) && <div className="flex min-h-8 shrink-0 items-center justify-end gap-2 border-b border-edge px-2 py-1 text-xs">
      {markdown && <button type="button" aria-pressed={plain} className="rounded px-2 py-1 hover:bg-surface-hover" onClick={() => setPlain(value => !value)}>{plain ? copy.rendered : copy.plain}</button>}
      {editable && <><span role="status" className="text-ink-muted">{state.saving ? copy.saving : session.dirty ? copy.unsaved : copy.saved}</span><button type="button" aria-label={copy.save} data-tip={copy.save} disabled={state.saving || !session.dirty} className="rounded p-1.5 hover:bg-surface-hover disabled:opacity-40" onClick={() => { void session.save() }}><FloppyDisk width={16} height={16} aria-hidden /></button></>}
    </div>}
    {!!state.error && <div role="alert" className="flex flex-wrap items-center gap-2 border-b border-edge px-2 py-1 text-sm">
      <span>{state.error instanceof PublicShareError && state.error.status === 409 ? copy.conflict : copy.saveFailed}</span>
      <button type="button" className="rounded p-1.5 text-accent" onClick={() => { if (window.confirm(copy.discard)) onReload() }}>{copy.latest}</button>
    </div>}
    <div className="relative min-h-0 flex-1 overflow-hidden" data-public-share-editor>
      {markdown && !plain ? <MarkdownErrorBoundary resetKey={name} onOpenPlain={() => setPlain(true)}>
        <Editor key={name} value={state.draft} onChange={session.change} api={api} path={state.file.path || name} readOnly={!editable}
          onOpenLink={href => {
            if (share.type !== 'd') return
            const path = publicShareRelativePath(state.file.path, href)
            if (path !== null) onSelect(path)
          }} />
      </MarkdownErrorBoundary> : <CodePane path={name} value={state.draft} onChange={session.change} readOnly={!editable} serverLint={false} />}
    </div>
  </div>
}

export function PublicSharePage({ share }: { share: PublicShareIdentity }) {
  const { locale } = useI18n(), copy = publicSharePageCopy(locale)
  const [metadata, setMetadata] = useState<PublicShareMetadata | null>(null)
  const [failed, setFailed] = useState(false)
  const [selected, setSelected] = useState<string | null>(share.type === 'f' ? '' : null)
  const [attempt, setAttempt] = useState(0)
  const session = useRef<PublicShareDocument | null>(null)
  const metadataRef = useRef(metadata)
  useEffect(() => { metadataRef.current = metadata }, [metadata])
  const onSession = useMemo(() => (value: PublicShareDocument | null) => { session.current = value }, [])
  useEffect(() => {
    const controller = new AbortController()
    let pending = false
    const refresh = async () => {
      if (pending || controller.signal.aborted) return
      pending = true
      try { const next = await fetchPublicShare(share, controller.signal); if (!controller.signal.aborted) { setMetadata(next); setFailed(false) } }
      catch (error) {
        if (!controller.signal.aborted && (error instanceof PublicShareError && [403, 404, 410].includes(error.status) || !metadataRef.current)) {
          setMetadata(null); setFailed(true)
        }
      } finally { pending = false }
    }
    void refresh()
    const interval = setInterval(() => { if (document.visibilityState !== 'hidden') void refresh() }, 15_000)
    const focus = () => { void refresh() }
    window.addEventListener('focus', focus); document.addEventListener('visibilitychange', focus)
    return () => { controller.abort(); clearInterval(interval); window.removeEventListener('focus', focus); document.removeEventListener('visibilitychange', focus) }
  }, [share, attempt])
  const select = async (path: string) => {
    if (path === selected) return
    if (session.current?.dirty && !await session.current.save()) return
    setSelected(path)
  }
  if (failed) return <main className="mew-workspace flex h-dvh items-center justify-center gap-2 px-3 text-sm text-ink" role="alert"><span>{copy.unavailable}</span><button type="button" aria-label={copy.retry} className="rounded p-2 hover:bg-surface-hover" onClick={() => setAttempt(value => value + 1)}><Refresh width={16} height={16} aria-hidden /></button></main>
  if (!metadata) return <main className="mew-workspace flex h-dvh items-center justify-center text-ink" role="status"><LoadingIndicator size={20} /></main>
  return <HoverTipLayer className="mew-workspace flex h-dvh min-w-0 overflow-hidden text-ink" data-public-share={share.type}>
    {share.type === 'd' && <aside className="flex w-[min(38vw,240px)] min-w-28 shrink-0 flex-col border-r border-edge bg-surface" aria-label={copy.files}>
      <div className="truncate border-b border-edge px-2 py-2 text-sm font-medium" data-tip={metadata.name}>{metadata.name}</div>
      <div className="min-h-0 flex-1 overflow-auto py-1"><PublicFolder share={share} selected={selected} onSelect={path => { void select(path) }} /></div>
    </aside>}
    <main className="min-h-0 min-w-0 flex-1 bg-surface" aria-label={selected || metadata.name}>
      {selected !== null ? <PublicDocument key={selected} share={share} metadata={metadata} path={selected} onSelect={path => { void select(path) }} onSession={onSession} />
        : <p className="p-3 text-sm text-ink-muted">{copy.select}</p>}
    </main>
  </HoverTipLayer>
}
