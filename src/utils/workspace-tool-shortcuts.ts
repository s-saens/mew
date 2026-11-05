/** Reserve workspace tools before editor and terminal input handlers. */
export function captureWorkspaceToolShortcuts({ openExplorer, openSchedules }: {
  openExplorer?: () => void
  openSchedules?: () => void
}): () => void {
  const keyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || !event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.isComposing) return
    const key = event.code || `Key${event.key.toUpperCase()}`
    const open = key === 'KeyE' ? openExplorer : key === 'KeyS' ? openSchedules : undefined
    if (!open) return
    event.preventDefault()
    event.stopImmediatePropagation()
    if (!event.repeat) open()
  }
  window.addEventListener('keydown', keyDown, true)
  return () => window.removeEventListener('keydown', keyDown, true)
}
