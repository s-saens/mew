import { useEffect, useLayoutEffect, useRef } from 'react'
import type { DockDirection } from '../utils/mobile-dock'

type TabbedPanel = 'sidebar' | 'editor' | 'agent' | 'terminal' | 'git' | 'tasks'
const tabbedPanels: readonly string[] = ['sidebar', 'editor', 'agent', 'terminal', 'git', 'tasks']
const excluded = '.mobile-dock, [data-dock-tab-bar], [role="dialog"], [role="menu"], [role="listbox"], input, textarea, select, [role="slider"], [data-attachment-token], .task-swipe, [data-gantt-grab], .task-gantt-scroller, [data-popup-resize]'

function swipePanel(target: Element): TabbedPanel | null {
  if (target.closest(excluded)) return null
  const panelElement = target.closest<HTMLElement>('[data-workspace-panel]')
  const panel = panelElement?.dataset.workspacePanel
  if (!panel || !tabbedPanels.includes(panel)) return null
  if (panel === 'editor') {
    const area = target.closest<HTMLElement>('[data-mobile-tab-swipe]')?.dataset.mobileTabSwipe
    if (area !== 'content' && !(area === 'key-bar' && target.closest('[data-mobile-key-bar]'))) return null
    if (area === 'key-bar') return 'editor'
  }
  // Reserve the whole gesture for native scrolling, including at either edge.
  for (let node: Element | null = target; node; node = node.parentElement) {
    if (node.scrollWidth > node.clientWidth && /^(auto|scroll|overlay)$/.test(getComputedStyle(node).overflowX)) return null
    if (node === panelElement) break
  }
  return panel as TabbedPanel
}

/** Panel bodies own tab swipes; editor source text keeps native horizontal scrolling. */
export function useMobilePanelSwipe(onSwipe: (panel: TabbedPanel, direction: DockDirection) => void) {
  const root = useRef<HTMLDivElement>(null)
  const callback = useRef(onSwipe)
  useLayoutEffect(() => { callback.current = onSwipe }, [onSwipe])
  useEffect(() => {
    const element = root.current
    if (!element) return
    let gesture: { panel: TabbedPanel; target: Element; id: number; x: number; y: number; lastX: number; lastY: number } | null = null
    let suppressClick = false
    const cancel = () => { gesture = null; suppressClick = false }
    const pointer = (event: PointerEvent) => { if (event.pointerType !== 'touch') cancel() }
    const start = (event: TouchEvent) => {
      cancel()
      if (window.matchMedia('(min-width: 768px)').matches || event.touches.length !== 1 || !(event.target instanceof Element)) return
      const panel = swipePanel(event.target)
      if (!panel) return
      const touch = event.touches[0]
      gesture = { panel, target: event.target, id: touch.identifier, x: touch.clientX, y: touch.clientY, lastX: touch.clientX, lastY: touch.clientY }
    }
    const move = (event: TouchEvent) => {
      const current = gesture
      if (!current) return
      if (event.touches.length !== 1 || event.touches[0].identifier !== current.id) { cancel(); return }
      const touch = event.touches[0]
      current.lastX = touch.clientX
      current.lastY = touch.clientY
      const dx = current.lastX - current.x, dy = current.lastY - current.y
      if (Math.hypot(dx, dy) < 10) return
      if (Math.abs(dy) > Math.abs(dx) * 0.6) { cancel(); return }
      // A recognized horizontal gesture must not scroll the key bar or press its keys.
      suppressClick = true
      if (event.cancelable) event.preventDefault()
    }
    const end = (event: TouchEvent) => {
      const current = gesture
      gesture = null
      if (!current || event.touches.length || !current.target.isConnected || swipePanel(current.target) !== current.panel) return
      const touch = Array.from(event.changedTouches).find(touch => touch.identifier === current.id)
      const dx = (touch?.clientX ?? current.lastX) - current.x
      const dy = (touch?.clientY ?? current.lastY) - current.y
      if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx) * 0.6) return
      suppressClick = true
      callback.current(current.panel, dx < 0 ? 1 : -1)
    }
    const click = (event: MouseEvent) => {
      if (!suppressClick || event.detail === 0) return
      suppressClick = false
      event.preventDefault()
      event.stopImmediatePropagation()
    }
    element.addEventListener('touchstart', start, { capture: true, passive: true })
    element.addEventListener('touchmove', move, { capture: true, passive: false })
    element.addEventListener('touchend', end, { capture: true, passive: true })
    element.addEventListener('touchcancel', cancel, true)
    element.addEventListener('click', click, true)
    element.addEventListener('pointerdown', pointer, true)
    window.addEventListener('resize', cancel)
    window.addEventListener('blur', cancel)
    document.addEventListener('visibilitychange', cancel)
    return () => {
      element.removeEventListener('touchstart', start, true)
      element.removeEventListener('touchmove', move, true)
      element.removeEventListener('touchend', end, true)
      element.removeEventListener('touchcancel', cancel, true)
      element.removeEventListener('click', click, true)
      element.removeEventListener('pointerdown', pointer, true)
      window.removeEventListener('resize', cancel)
      window.removeEventListener('blur', cancel)
      document.removeEventListener('visibilitychange', cancel)
    }
  }, [])
  return root
}
