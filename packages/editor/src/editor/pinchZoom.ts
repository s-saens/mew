import type { EditorView } from '@tiptap/pm/view'
import { materializeVirtualPosition } from './virtualBlocks'

/** Resize only this rendered document; source, selection and undo stay untouched. */
export function attachMarkdownPinchZoom(view: EditorView, scroller: HTMLElement): () => void {
  const root = view.dom
  const win = root.ownerDocument.defaultView!
  const previousSize = scroller.style.getPropertyValue('--mew-markdown-zoom-size')
  const previousLineHeight = scroller.style.getPropertyValue('--mew-markdown-zoom-line-height')
  let active = false
  let frame = 0
  let gesture: { distance: number; size: number; lineHeight: number; pos: number | null; offset: number } | null = null
  const pair = (event: TouchEvent) => {
    if (event.touches.length !== 2) return null
    const [a, b] = Array.from(event.touches)
    if (!root.contains(a.target as Node) || !root.contains(b.target as Node)) return null
    const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
    return distance ? { distance, left: (a.clientX + b.clientX) / 2, top: (a.clientY + b.clientY) / 2 } : null
  }
  const consume = (event: TouchEvent) => {
    if (event.cancelable) event.preventDefault()
    event.stopPropagation()
  }
  const start = (event: TouchEvent) => {
    if (active) { gesture = null; consume(event); return }
    const point = pair(event)
    if (!point) return
    const pos = view.posAtCoords(point)?.pos ?? null
    const coords = pos === null ? null : view.coordsAtPos(pos)
    const style = win.getComputedStyle(root)
    gesture = { distance: point.distance, size: parseFloat(style.fontSize), lineHeight: parseFloat(style.lineHeight), pos, offset: coords ? point.top - coords.top : 0 }
    active = true
    scroller.dataset.markdownPinching = 'true'
    consume(event)
  }
  const move = (event: TouchEvent) => {
    if (!active) return
    consume(event)
    const point = pair(event), initial = gesture
    if (!point || !initial) return
    const size = Math.max(8, Math.min(40, initial.size * point.distance / initial.distance))
    scroller.style.setProperty('--mew-markdown-zoom-size', `${size}px`)
    scroller.style.setProperty('--mew-markdown-zoom-line-height', `${initial.lineHeight * size / initial.size}px`)
    if (initial.pos !== null) materializeVirtualPosition(view, initial.pos)
    win.cancelAnimationFrame(frame)
    // Let virtual blocks remeasure their typography before correcting the reading anchor.
    frame = win.requestAnimationFrame(() => {
      frame = win.requestAnimationFrame(() => {
        frame = 0
        if (view.isDestroyed || initial.pos === null) return
        materializeVirtualPosition(view, initial.pos)
        const coords = view.coordsAtPos(initial.pos)
        scroller.scrollTop += coords.top + initial.offset * size / initial.size - point.top
      })
    })
  }
  const end = (event: TouchEvent) => {
    if (!active) return
    consume(event)
    gesture = null
    if (!event.touches.length) { active = false; delete scroller.dataset.markdownPinching }
  }
  const cancel = (event: TouchEvent) => { if (active) consume(event); active = false; gesture = null; delete scroller.dataset.markdownPinching }
  const options = { passive: false, capture: true }
  scroller.addEventListener('touchstart', start, options)
  scroller.addEventListener('touchmove', move, options)
  scroller.addEventListener('touchend', end, options)
  scroller.addEventListener('touchcancel', cancel, options)
  return () => {
    win.cancelAnimationFrame(frame)
    delete scroller.dataset.markdownPinching
    scroller.removeEventListener('touchstart', start, true)
    scroller.removeEventListener('touchmove', move, true)
    scroller.removeEventListener('touchend', end, true)
    scroller.removeEventListener('touchcancel', cancel, true)
    if (previousSize) scroller.style.setProperty('--mew-markdown-zoom-size', previousSize)
    else scroller.style.removeProperty('--mew-markdown-zoom-size')
    if (previousLineHeight) scroller.style.setProperty('--mew-markdown-zoom-line-height', previousLineHeight)
    else scroller.style.removeProperty('--mew-markdown-zoom-line-height')
  }
}
