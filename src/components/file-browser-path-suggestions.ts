import type { ExternalEntriesResult } from '../api/client'

export type FileBrowserPathSuggestion = { name: string; path: string }

function normalizeAbsolutePath(value: string): string {
  const parts: string[] = []
  for (const part of value.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }
  return `/${parts.join('/')}`
}

/** Match the suggestion API's current-folder base while preserving server-side home expansion. */
export function resolveFileBrowserDraft(draft: string, base: string): string {
  const value = draft.trim()
  if (!value || value === '~' || value.startsWith('~/') || (!base && !value.startsWith('/'))) return value
  return normalizeAbsolutePath(value.startsWith('/') ? value : `${base}/${value}`)
}

/** null means another directory must be requested; an empty array is a known empty match. */
export function currentFolderPathSuggestions(draft: string, result: ExternalEntriesResult | null): FileBrowserPathSuggestion[] | null {
  if (!result || !draft.trim() || draft.trim() === '~' || draft.trim().startsWith('~/')) return null
  const candidate = resolveFileBrowserDraft(draft, result.path)
  const current = normalizeAbsolutePath(result.path)
  let prefix = ''
  if (candidate !== current) {
    if (draft.trim().endsWith('/')) return null
    const separator = candidate.lastIndexOf('/')
    if ((candidate.slice(0, separator) || '/') !== current) return null
    prefix = candidate.slice(separator + 1)
  }
  return result.entries.filter(entry => entry.type === 'dir' && entry.name.startsWith(prefix))
    .map(({ name, path }) => ({ name, path }))
}
