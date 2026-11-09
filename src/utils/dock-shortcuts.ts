import type { MobileDockPanel } from './mobile-dock'

export function handleDockShortcut(event: KeyboardEvent, panels: readonly MobileDockPanel[], select: (panel: MobileDockPanel) => void) {
  const match = /^F([1-9]|1[0-2])$/.exec(event.key)
  if (!match || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.isComposing) return
  const target = event.target
  if (target instanceof Element && target.closest('[role="dialog"], [aria-modal="true"], [data-login-desktop], [data-dom-browser], [data-browser-desktop]')) return
  event.preventDefault()
  event.stopImmediatePropagation()
  const panel = panels[Number(match[1]) - 1]
  if (panel && !event.repeat) select(panel)
}
