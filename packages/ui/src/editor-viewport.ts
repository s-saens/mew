import { getVirtualKeyboard, usesTouchKeyboard, viewportZoomRatio, virtualKeyboardViewportBottom } from './virtual-keyboard'

const CARET_MARGIN = 12

/** Intersection of the editor, visible viewport and optional fixed key bar. */
export function visibleEditorBounds(container: HTMLElement) {
  const win = container.ownerDocument.defaultView!
  const viewport = win.visualViewport
  const box = container.getBoundingClientRect()
  const viewportTop = viewport?.offsetTop ?? 0
  const viewportBottom = Math.min(viewportTop + (viewport?.height ?? win.innerHeight), virtualKeyboardViewportBottom(win))
  const bar = container.querySelector<HTMLElement>('[data-mobile-key-bar]')?.getBoundingClientRect()
  return {
    top: Math.max(box.top, viewportTop) + CARET_MARGIN,
    bottom: Math.min(box.bottom, viewportBottom, bar && bar.height > 0 ? bar.top : Infinity) - CARET_MARGIN,
  }
}

/** Keep a mobile editor inside the keyboard-adjusted viewport, including hosts with a fixed height. */
export function observeEditorViewport(container: HTMLElement, onResize: () => void, reserveKeyBar = false) {
  const win = container.ownerDocument.defaultView!
  const viewport = win.visualViewport
  const keyboard = getVirtualKeyboard(win)
  const originalMaxHeight = container.style.maxHeight
  const reservationProperties = ['--editor-key-bar-height', '--editor-status-bar-height'] as const
  const originalReservations = reservationProperties.map(name => container.style.getPropertyValue(name))
  const restoreReservations = () => {
    if (reserveKeyBar) reservationProperties.forEach((name, index) => {
      if (originalReservations[index]) container.style.setProperty(name, originalReservations[index])
      else container.style.removeProperty(name)
    })
  }
  let measuredBar: HTMLElement | null = null, measuredStatus: HTMLElement | null = null
  let frame: number | null = null
  const update = () => {
    frame = null
    if (!usesTouchKeyboard(win)) {
      container.style.maxHeight = originalMaxHeight
      restoreReservations()
      return
    }
    const bottom = Math.min((viewport?.offsetTop ?? 0) + (viewport?.height ?? win.innerHeight), virtualKeyboardViewportBottom(win))
    const bar = reserveKeyBar ? container.querySelector<HTMLElement>('[data-mobile-key-bar]') : null
    const status = reserveKeyBar ? container.querySelector<HTMLElement>('[data-editor-status-bar]') : null
    if (bar !== measuredBar) {
      if (measuredBar) observer.unobserve(measuredBar)
      if (bar) observer.observe(bar)
      measuredBar = bar
    }
    if (status !== measuredStatus) {
      if (measuredStatus) observer.unobserve(measuredStatus)
      if (status) observer.observe(status)
      measuredStatus = status
    }
    const fixedBar = bar && win.getComputedStyle(bar).position === 'fixed' && bar.getBoundingClientRect().height > 0
    const statusHeight = fixedBar && status ? status.getBoundingClientRect().height : 0
    if (reserveKeyBar) {
      container.style.setProperty('--editor-status-bar-height', `${statusHeight}px`)
      container.style.setProperty('--editor-key-bar-height', `${status && fixedBar ? bar.getBoundingClientRect().height : 0}px`)
    }
    if (viewportZoomRatio(win) !== 1) {
      container.style.maxHeight = originalMaxHeight
      return
    }
    // Reserve the keys before the status row; both must fit above the keyboard or Dock.
    const availableBottom = fixedBar ? status ? bar.getBoundingClientRect().bottom + statusHeight : bar.getBoundingClientRect().top : bottom
    const height = Math.max(0, Math.min(bottom, availableBottom) - container.getBoundingClientRect().top)
    const maxHeight = `${height}px`
    if (container.style.maxHeight !== maxHeight) container.style.maxHeight = maxHeight
    onResize()
    // Property/search inputs also live in the editor, outside the rich-text selection.
    const active = container.ownerDocument.activeElement
    if (active instanceof HTMLElement && container.contains(active) && active.matches('input, textarea') && active.getBoundingClientRect().height > 0) {
      const bounds = visibleEditorBounds(container)
      const caret = active.getBoundingClientRect()
      if (bounds.bottom > bounds.top) {
        if (caret.bottom > bounds.bottom) container.scrollTop += caret.bottom - bounds.bottom
        else if (caret.top < bounds.top) container.scrollTop -= bounds.top - caret.top
      }
    }
  }
  const schedule = () => {
    if (frame !== null) win.cancelAnimationFrame(frame)
    frame = win.requestAnimationFrame(update)
  }
  const observer = new ResizeObserver(schedule)
  observer.observe(container)
  const mutations = reserveKeyBar ? new MutationObserver(schedule) : null
  mutations?.observe(container, { childList: true, subtree: true })
  const workspace = container.closest('.mew-workspace')
  if (workspace) mutations?.observe(workspace, { attributes: true, attributeFilter: ['data-mobile-keyboard', 'style'] })
  viewport?.addEventListener('resize', schedule)
  viewport?.addEventListener('scroll', schedule)
  keyboard?.addEventListener('geometrychange', schedule)
  win.document.addEventListener('fullscreenchange', schedule)
  win.addEventListener('resize', schedule)
  container.addEventListener('focusin', schedule)
  schedule()
  return () => {
    observer.disconnect()
    mutations?.disconnect()
    viewport?.removeEventListener('resize', schedule)
    viewport?.removeEventListener('scroll', schedule)
    keyboard?.removeEventListener('geometrychange', schedule)
    win.document.removeEventListener('fullscreenchange', schedule)
    win.removeEventListener('resize', schedule)
    container.removeEventListener('focusin', schedule)
    if (frame !== null) win.cancelAnimationFrame(frame)
    container.style.maxHeight = originalMaxHeight
    restoreReservations()
  }
}
