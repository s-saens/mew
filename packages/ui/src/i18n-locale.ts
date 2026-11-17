export type UiLocale = 'ko' | 'en' | 'zh-CN' | 'ja'

let locale: UiLocale = 'ko'
const listeners = new Set<() => void>()

export function getUiLocale(): UiLocale { return locale }

/** The lightweight startup and full UI catalogs share one locale and subscriber set. */
export function setUiLocale(next: UiLocale): void {
  if (locale === next) return
  locale = next
  for (const listener of listeners) listener()
}

export function subscribeUiLocale(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
