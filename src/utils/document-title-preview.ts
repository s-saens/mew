import { useSyncExternalStore } from 'react'
import { parseDocument } from 'yaml'
import { remapPagePath, type DocumentPageMove } from '../../shared/document-pages.ts'

type Preview = { title: string; source: 'editor' | 'task' | 'database' }
let previews: Readonly<Record<string, Preview>> = {}
const databasePreviewOrigins = new Map<string, Preview>()
const listeners = new Set<() => void>()
export const titlePreviews = () => previews
export const subscribeTitlePreviews = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
const publish = (next: typeof previews) => {
  previews = next
  const retained = new Set(Object.values(next))
  for (const [path, preview] of databasePreviewOrigins) if (!retained.has(preview)) databasePreviewOrigins.delete(path)
  for (const listener of listeners) listener()
}
export const useTitlePreviews = () => useSyncExternalStore(subscribeTitlePreviews, titlePreviews, titlePreviews)

export function previewDocumentTitle(path: string, title: string, source: Preview['source']): void {
  if (previews[path]?.title === title && previews[path]?.source === source) return
  publish({ ...previews, [path]: { title, source } })
}

export function previewDatabaseDocumentTitle(path: string, title: string): (confirmedTitle?: string) => void {
  const previous = databasePreviewOrigins.get(path) ?? previews[path]
  const currentPath = Object.entries(previews).find(([, value]) => value === previous)?.[0] ?? path
  const origins = [...databasePreviewOrigins].filter(([, value]) => value === previous).map(([origin]) => origin)
  previewDocumentTitle(currentPath, title, 'database')
  const preview = previews[currentPath]
  for (const origin of new Set([path, ...origins])) databasePreviewOrigins.set(origin, preview)
  return confirmedTitle => {
    // Moves retain the preview object, while newer typing replaces it.
    const current = Object.entries(previews).find(([, value]) => value === preview)
    if (!current) return
    const [currentPath] = current
    if (confirmedTitle !== undefined && confirmedTitle !== title) publish({ ...previews, [currentPath]: { title: confirmedTitle, source: 'database' } })
    const next = { ...previews }
    delete next[currentPath]
    publish(next)
  }
}

export function remapTitlePreviews(moves: DocumentPageMove[]): void {
  if (!moves.length) return
  const next = Object.fromEntries(Object.entries(previews).map(([path, preview]) => [remapPagePath(path, moves), preview]))
  if (Object.keys(previews).some(path => previews[path] !== next[path])) publish(next)
}

export function clearTitlePreviews(root: string, confirmedTitle?: string): void {
  const next = Object.fromEntries(Object.entries(previews).filter(([path, preview]) => !(path === root || path.startsWith(`${root}/`)) || confirmedTitle !== undefined && preview.title !== confirmedTitle))
  if (Object.keys(next).length !== Object.keys(previews).length) publish(next)
}

/** Change the title and an untouched generated description without rewriting the body. */
export function withDocumentTitle(content: string, title: string): string {
  const header = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content)
  if (!header) return content
  const yaml = parseDocument(header[1])
  if (yaml.errors.length || !yaml.has('title')) return content
  const previous = yaml.get('title')
  if (previous === title) return content
  yaml.set('title', title)
  if (typeof previous === 'string' && yaml.get('description') === `태스크: ${previous.trim() || '제목 없음'}`) yaml.set('description', `태스크: ${title.trim() || '제목 없음'}`)
  const newline = header[0].startsWith('---\r\n') ? '\r\n' : '\n'
  return `---${newline}${yaml.toString().replace(/\n/g, newline)}---${header[0].endsWith('\n') ? newline : ''}${content.slice(header[0].length)}`
}

export function documentAbsolutePath(workspace: string, docs: string | undefined, project: string, path: string): string {
  return `${project === 'docs' ? docs ?? `${workspace}/docs` : project === '.workspace' ? workspace : `${workspace}/${project}`}/${path}`
}
