/** Keep each native scrollbar's highlight aligned with its own scroll progress. */
export function startScrollbarGradientTracking() {
  const pending = new Set<HTMLElement>()
  let frame = 0

  const percentage = (offset: number, range: number) =>
    `${range > 0 ? Math.max(0, Math.min(1, offset / range)) * 100 : 0}%`

  const flush = () => {
    frame = 0
    const updates: { element: HTMLElement; y: string; x: string }[] = []
    for (const element of pending) {
      if (!element.isConnected) continue
      const y = percentage(element.scrollTop, element.scrollHeight - element.clientHeight)
      const range = element.scrollWidth - element.clientWidth
      const rtl = getComputedStyle(element).direction === 'rtl'
      updates.push({ element, y, x: percentage(rtl ? range + element.scrollLeft : element.scrollLeft, range) })
    }
    // Measure every scrolling region before invalidating styles in any of them.
    for (const { element, y, x } of updates) {
      if (element.style.getPropertyValue('--mew-scrollbar-y') !== y) element.style.setProperty('--mew-scrollbar-y', y)
      if (element.style.getPropertyValue('--mew-scrollbar-x') !== x) element.style.setProperty('--mew-scrollbar-x', x)
    }
    pending.clear()
  }

  const onScroll = (event: Event) => {
    const element = event.target === document ? document.scrollingElement : event.target
    if (!(element instanceof HTMLElement)) return
    pending.add(element)
    if (!frame) frame = requestAnimationFrame(flush)
  }

  document.addEventListener('scroll', onScroll, { capture: true, passive: true })
  return () => {
    document.removeEventListener('scroll', onScroll, true)
    cancelAnimationFrame(frame)
    pending.clear()
  }
}
