import { LOCAL_BROWSER_OPEN_EVENT, localBrowserUrl } from '@mew/ui/local-browser'
import { localAppPreviewUrl } from './port-preview-url.ts'

export function openLocalPortPreview(raw: string): void {
  window.open(localAppPreviewUrl(raw), '_blank', 'noopener,noreferrer')
}

export function captureLocalBrowserLinks(onOpen: (url: string) => void): () => void {
  const onRequest = (event: Event) => {
    const raw = (event as CustomEvent<{ url?: unknown }>).detail?.url
    const url = typeof raw === 'string' ? localBrowserUrl(raw) : null
    if (url) onOpen(url)
  }
  const onClick = (event: MouseEvent) => {
    if (event.defaultPrevented || (event.type === 'click' ? event.button !== 0 : event.button !== 1)) return
    if (document.getSelection()?.toString()) return
    const anchor = event.composedPath().find((target): target is HTMLAnchorElement =>
      target instanceof window.HTMLAnchorElement)
    const raw = anchor?.getAttribute('href')
    const url = raw ? localBrowserUrl(raw) : null
    if (!url) return
    event.preventDefault()
    event.stopImmediatePropagation()
    onOpen(url)
  }
  window.addEventListener(LOCAL_BROWSER_OPEN_EVENT, onRequest)
  document.addEventListener('click', onClick, true)
  document.addEventListener('auxclick', onClick, true)
  return () => {
    window.removeEventListener(LOCAL_BROWSER_OPEN_EVENT, onRequest)
    document.removeEventListener('click', onClick, true)
    document.removeEventListener('auxclick', onClick, true)
  }
}
