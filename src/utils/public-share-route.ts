import type { PublicShareIdentity } from '../api/public-share-content.ts'

export function parsePublicSharePath(path: string): PublicShareIdentity | null {
  const match = /^\/share\/(f|d)\/([A-Za-z0-9_-]{43})\/?$/.exec(path)
  return match ? { type: match[1] as 'f' | 'd', id: match[2]! } : null
}

/** Resolve document links inside the capability's root, without workspace aliases. */
export function publicShareRelativePath(documentPath: string, href: string): string | null {
  if (!href || /^(?:[a-z][a-z\d+.-]*:|\/\/|#|\?)/i.test(href)) return null
  let value: string
  try { value = decodeURIComponent(href.split(/[?#]/, 1)[0]!) } catch { return null }
  if (/[\\\0:]/.test(value)) return null
  const parts = value.startsWith('/') ? [] : documentPath.split('/').slice(0, -1)
  for (const part of value.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') { if (!parts.length) return null; parts.pop() }
    else parts.push(part)
  }
  return parts.join('/')
}
