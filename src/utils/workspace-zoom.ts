export const WORKSPACE_ZOOM_KEY = 'mew:workspace-zoom'
export const ZOOM_LEVELS = [50, 60, 70, 80, 90, 100, 110, 125, 150, 175, 200] as const

export function loadWorkspaceZoom(): number {
  try {
    const value = Number(localStorage.getItem(WORKSPACE_ZOOM_KEY))
    return ZOOM_LEVELS.find(level => level === value) ?? 100
  } catch { return 100 }
}

export function applyWorkspaceZoom(value: number) {
  document.documentElement.style.zoom = `${value}%`
}

export function setWorkspaceZoom(value: number) {
  applyWorkspaceZoom(value)
  try { localStorage.setItem(WORKSPACE_ZOOM_KEY, String(value)) } catch { /* Storage can be unavailable. */ }
}

export function stepWorkspaceZoom(value: number, direction: -1 | 1): number {
  const index = ZOOM_LEVELS.findIndex(level => level === value)
  return ZOOM_LEVELS[Math.max(0, Math.min(ZOOM_LEVELS.length - 1, index + direction))]
}
