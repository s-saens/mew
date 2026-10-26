import { useCallback } from 'react'
import { reorderLayoutRect } from './reorder-animation'
import './tab-auto-scroll.css'

const TAB = '[role="tab"], [data-tab-scroll-active]'
const SELECTED_TAB = '[role="tab"][aria-selected="true"]'

/** Reveal tabs inside their own horizontal strip without moving the page or input focus. */
export function useTabAutoScroll() {
  return useCallback((container: HTMLElement | null) => {
    if (!container) return
    const win = container.ownerDocument.defaultView!
    const hadMarker = container.hasAttribute('data-mew-tab-auto-scroll')
    container.setAttribute('data-mew-tab-auto-scroll', '')
    let frame: number | null = null
    let focusedTab: HTMLElement | null = null
    let previousTab: HTMLElement | null = null

    const reveal = () => {
      frame = null
      if (!container.clientWidth || container.querySelector('[data-tab-drag-placeholder]')) return
      const tab = focusedTab?.isConnected && container.contains(focusedTab)
        ? focusedTab
        : container.querySelector<HTMLElement>('[data-tab-scroll-active="true"]') ?? container.querySelector<HTMLElement>(SELECTED_TAB)
      if (!tab) return
      const viewport = container.getBoundingClientRect()
      const box = reorderLayoutRect(tab)
      const left = viewport.left + container.clientLeft
      const right = left + container.clientWidth
      // A tab wider than the strip is already revealed when it covers the viewport.
      const delta = box.left < left && (box.width <= container.clientWidth || box.right < right)
        ? Math.max(box.left - left, box.right - right)
        : box.right > right && (box.width <= container.clientWidth || box.left > left)
          ? Math.min(box.right - right, box.left - left)
          : 0
      if (Math.abs(delta) > 1) {
        container.scrollTo({
          left: container.scrollLeft + delta,
          behavior: win.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
        })
      } else if (previousTab && previousTab !== tab) {
        // A quick switch to an already visible tab must cancel the old destination.
        container.scrollTo({ left: container.scrollLeft, behavior: 'instant' })
      }
      previousTab = tab
    }
    const schedule = () => {
      if (frame === null) frame = win.requestAnimationFrame(reveal)
    }
    const focus = (event: Event) => {
      focusedTab = (event.target as Element | null)?.closest<HTMLElement>(TAB) ?? null
      if (focusedTab && container.contains(focusedTab)) schedule()
    }
    const blur = () => { focusedTab = null }
    const sizes = new ResizeObserver(schedule)
    const observed = new Set<Element>()
    const observeSizes = () => {
      const children = new Set(container.children)
      for (const child of observed) {
        if (!children.has(child)) { sizes.unobserve(child); observed.delete(child) }
      }
      for (const child of children) {
        if (!observed.has(child)) { sizes.observe(child); observed.add(child) }
      }
    }
    const mutations = new MutationObserver(records => {
      if (records.some(record => record.type === 'attributes' || record.target === container)) {
        focusedTab = null
        observeSizes()
        schedule()
      }
    })
    mutations.observe(container, {
      subtree: true, childList: true, attributes: true,
      attributeFilter: ['aria-selected', 'data-tab-scroll-active', 'data-tab-drag-placeholder'],
    })
    sizes.observe(container)
    observeSizes()
    container.addEventListener('focusin', focus)
    container.addEventListener('focusout', blur)
    container.addEventListener('click', focus, true)
    schedule()

    return () => {
      mutations.disconnect()
      sizes.disconnect()
      container.removeEventListener('focusin', focus)
      container.removeEventListener('focusout', blur)
      container.removeEventListener('click', focus, true)
      if (frame !== null) win.cancelAnimationFrame(frame)
      if (!hadMarker) container.removeAttribute('data-mew-tab-auto-scroll')
    }
  }, [])
}
