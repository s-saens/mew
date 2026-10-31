export const LOCAL_BROWSER_OPEN_EVENT = 'mew:open-local-browser'

export function localBrowserUrl(raw: string): string | null {
  const value = raw.trim()
  if (!value || /\s/.test(value)) return null
  const input = /^https?:\/\//i.test(value) ? value
    : /^(?:localhost|127(?:\.\d{1,3}){3}|\[::1\])(?::\d+)?(?:[/?#]|$)/i.test(value) ? `http://${value}` : null
  if (!input) return null
  try {
    const url = new URL(input)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    const authority = input.slice(input.indexOf('//') + 2).split(/[/?#]/, 1)[0]
    if (authority.includes('@') || authority.endsWith(':') || url.username || url.password || url.port === '0') return null
    if (url.hostname !== 'localhost' && url.hostname !== '[::1]' && !/^127(?:\.\d{1,3}){3}$/.test(url.hostname)) return null
    return url.href
  } catch {
    return null
  }
}

export function requestLocalBrowser(raw: string): boolean {
  const url = localBrowserUrl(raw)
  if (!url || typeof window === 'undefined') return false
  window.dispatchEvent(new CustomEvent(LOCAL_BROWSER_OPEN_EVENT, { detail: { url } }))
  return true
}
