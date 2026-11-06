import { numberedTabIndex, adjacentPanelTabDirection } from '@mew/shortcuts'
import { scopedBrowserStorage } from '@mew/ui/browser-storage-scope'
import { activateNumberedPanelTab, activateAdjacentPanelTab, numberedTabPanel } from '../utils/numbered-panel-tabs'
import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react'
import { useWorkspaceDesktop, useWorkspaceView } from '../workspace/workspace-view-context'

const focusKey = (account: string, viewId?: string) => `mew:desktop-panel-focus:${encodeURIComponent(account)}${viewId ? `:view:${encodeURIComponent(viewId)}` : ''}`
function restorePanel(account: string | undefined, persistent: boolean, viewId?: string): string | null {
  if (!account || !persistent) return null
  try { return scopedBrowserStorage().getItem(focusKey(account, viewId)) || null } catch { return null }
}

/** Track the working surface across portals, keyboard navigation and iframe focus. */
export function useFocusedWorkspacePanel(account?: string) {
  const view = useWorkspaceView(), desktop = useWorkspaceDesktop()
  const viewId = view?.compact ? view.id : undefined
  const owner = `${account ?? ''}\0${viewId ?? ''}`
  const persistent = desktop || !!view?.compact
  const active = view?.active ?? true
  const root = view?.root
  const [selection, setSelection] = useState(() => ({ owner, panel: restorePanel(account, persistent, viewId) }))
  const focusedPanel = selection.owner === owner ? selection.panel : restorePanel(account, persistent, viewId)
  const lastFocus = useRef(new Map<string, HTMLElement>())
  const focusOwner = useRef(owner)
  const setFocusedPanel = useCallback((next: SetStateAction<string | null>) => {
    setSelection(previous => {
      const panel = typeof next === 'function' ? next(previous.owner === owner ? previous.panel : restorePanel(account, persistent, viewId)) : next
      if (account && persistent) {
        try {
          if (panel) scopedBrowserStorage().setItem(focusKey(account, viewId), panel)
          else scopedBrowserStorage().removeItem(focusKey(account, viewId))
        } catch { /* Focus remains available when browser storage is restricted. */ }
      }
      return previous.owner === owner && previous.panel === panel ? previous : { owner, panel }
    })
  }, [account, owner, persistent, viewId])
  useEffect(() => {
    const ownerChanged = focusOwner.current !== owner
    if (ownerChanged) lastFocus.current.clear()
    focusOwner.current = owner
    if (!active) return
    const scope = root ? root.current : document
    if (!scope) return
    const owns = (element: Element) => !root || !!root.current?.contains(element)
    let lastSurface: HTMLElement | null = null
    const record = (target: EventTarget | null) => {
      if (!(target instanceof Element) || !owns(target) || target.closest('.mobile-dock')) return
      const panel = target.closest<HTMLElement>('[data-workspace-panel]')?.dataset.workspacePanel
      if (panel) {
        lastSurface = target.closest<HTMLElement>('[data-workspace-panel]')
        setFocusedPanel(panel)
        if (target instanceof HTMLElement && target === document.activeElement) lastFocus.current.set(panel, target)
      }
    }
    const focus = (event: Event) => record(event.target)
    const selectTab = (event: KeyboardEvent) => {
      const index = numberedTabIndex(event)
      const direction = adjacentPanelTabDirection(event)
      if (index === null && direction === null) return
      const consume = () => { event.preventDefault(); event.stopImmediatePropagation() }
      const browserShortcut = event.ctrlKey || event.metaKey
      const target = event.target instanceof Element ? event.target : document.activeElement
      if (target?.closest('[data-project-panel]') && !owns(target)) return
      if (target?.closest('[data-login-desktop], [data-dom-browser]')) return
      // A modal has its own keyboard scope; do not switch the panel behind it.
      if (target?.closest('[role="dialog"], [aria-modal="true"]')) { if (browserShortcut) consume(); return }
      const surface = target?.closest<HTMLElement>('[data-workspace-panel]') ?? lastSurface
      const panel = surface && numberedTabPanel(surface, scope)
      if (!surface?.isConnected || surface.closest('[inert]') || !panel?.isConnected || panel.closest('[inert]') || !panel.checkVisibility({ visibilityProperty: true })) { if (browserShortcut) consume(); return }
      lastSurface = panel
      consume()
      if (index !== null) activateNumberedPanelTab(panel, index)
      else if (direction !== null) activateAdjacentPanelTab(panel, direction)
    }
    let frameFocus: ReturnType<typeof setTimeout> | undefined
    const blur = () => {
      clearTimeout(frameFocus)
      frameFocus = setTimeout(() => {
        if (document.activeElement instanceof HTMLIFrameElement) record(document.activeElement)
      }, 0)
    }
    window.addEventListener('keydown', selectTab, true)
    scope.addEventListener('pointerdown', focus, true)
    scope.addEventListener('focusin', focus, true)
    window.addEventListener('blur', blur)
    if ((!account && !ownerChanged) || root) record(document.activeElement)
    return () => {
      clearTimeout(frameFocus)
      window.removeEventListener('keydown', selectTab, true)
      scope.removeEventListener('pointerdown', focus, true)
      scope.removeEventListener('focusin', focus, true)
      window.removeEventListener('blur', blur)
    }
  }, [account, owner, active, root, setFocusedPanel])
  const focusPanel = useCallback((panel: string) => {
    if (!active) return
    setFocusedPanel(panel)
    const visible = (element: HTMLElement) => element.isConnected && !element.closest('[inert]') && !element.matches(':disabled') && element.checkVisibility({ visibilityProperty: true })
    const previous = lastFocus.current.get(panel)
    if (previous && visible(previous)) { previous.focus({ preventScroll: true }); return }
    const scope = root ? root.current : document
    const surfaces = Array.from(scope?.querySelectorAll<HTMLElement>('[data-workspace-panel]') ?? [])
      .filter(element => element.dataset.workspacePanel === panel && visible(element))
    for (const selector of ['[contenteditable="true"], textarea, input:not([type="hidden"]), iframe', 'button, [tabindex]']) {
      for (const surface of surfaces) {
        const target = Array.from(surface.querySelectorAll<HTMLElement>(selector)).find(visible)
        if (target) { target.focus({ preventScroll: true }); return }
      }
    }
    const surface = surfaces[0]
    if (surface) { surface.tabIndex = -1; surface.focus({ preventScroll: true }) }
  }, [active, root, setFocusedPanel])
  return [focusedPanel, setFocusedPanel, focusPanel] as const
}
