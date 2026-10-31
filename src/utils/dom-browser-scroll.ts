export type DomBrowserScroll = { id: number; x: number; y: number; scrollRevision?: number }

/** Keep native viewer scrolling ahead of delayed host scroll echoes. */
export function bindDomBrowserScroll(doc: Document, idOf: (node: EventTarget | null) => number, relay: (scroll: DomBrowserScroll) => void) {
  const revisions = new Map<number, number>()
  const applied = new Map<number, string>()
  const timers = new Map<number, ReturnType<typeof setTimeout>>()
  const elementOf = (node: EventTarget | null) => node === doc ? doc.scrollingElement : node as Element | null
  const position = (element: Element) => ({ x: Math.round(element.scrollLeft), y: Math.round(element.scrollTop) })
  const signature = ({ x, y }: { x: number; y: number }) => `${x}:${y}`
  // Snapshot restoration can queue scroll events before listeners are attached.
  for (const element of doc.querySelectorAll('*')) {
    if (!element.scrollLeft && !element.scrollTop) continue
    const id = idOf(element)
    if (id >= 0) applied.set(id, signature(position(element)))
  }
  const scroll = (event: Event) => {
    const target = event.target, id = idOf(target), element = elementOf(target)
    if (id < 0 || !element) return
    if (applied.get(id) === signature(position(element))) return
    applied.delete(id)
    revisions.set(id, (revisions.get(id) ?? 0) + 1)
    // Throttle instead of waiting for touch momentum to stop before updating the host.
    if (timers.has(id)) return
    timers.set(id, setTimeout(() => {
      timers.delete(id)
      relay({ id, ...position(element), scrollRevision: revisions.get(id)! })
    }, 60))
  }
  doc.addEventListener('scroll', scroll, true)
  return {
    applyHostScroll(data: DomBrowserScroll, node: Node | null) {
      if ((data.scrollRevision ?? 0) < (revisions.get(data.id) ?? 0)) return
      const element = elementOf(node)
      if (!element || signature(position(element)) === signature(data)) return
      // Explicit instant scrolling bypasses both rrweb's smooth replay and app CSS.
      element.scrollTo({ left: data.x, top: data.y, behavior: 'instant' })
      applied.set(data.id, signature(position(element)))
    },
    dispose() {
      doc.removeEventListener('scroll', scroll, true)
      for (const timer of timers.values()) clearTimeout(timer)
    },
  }
}
