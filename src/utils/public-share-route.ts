export { parsePublicSharePath } from '../../shared/app-route.ts'

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
