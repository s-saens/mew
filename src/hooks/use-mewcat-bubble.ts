import { useLayoutEffect, useRef, type RefObject } from 'react'

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

/** Follow the moving character without rerendering the app on every animation frame. */
export function useMewcatBubble(anchor: RefObject<HTMLDivElement | null> | undefined, enabled: boolean, preferredWidth = 340, constrainHeight = true) {
  const ref = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    const bubble = ref.current
    if (!enabled || !anchor || !bubble) return
    let frame = 0
    let previous = ''
    let dirty = true
    let previousCat: HTMLDivElement | null = null
    let previousTransform = ''
    const invalidate = () => { dirty = true }
    const sizes = new ResizeObserver(invalidate)
    sizes.observe(bubble)
    if (bubble.firstElementChild) sizes.observe(bubble.firstElementChild)
    const viewport = window.visualViewport
    window.addEventListener('resize', invalidate)
    window.addEventListener('scroll', invalidate, true)
    viewport?.addEventListener('resize', invalidate)
    viewport?.addEventListener('scroll', invalidate)
    const place = () => {
      const cat = anchor.current
      if (cat !== previousCat) {
        if (previousCat) sizes.unobserve(previousCat)
        if (cat) sizes.observe(cat)
        previousCat = cat
        dirty = true
      }
      const transform = cat?.style.transform ?? ''
      if (cat && transform && (dirty || transform !== previousTransform)) {
        dirty = false
        previousTransform = transform
        const viewport = window.visualViewport
        const left = (viewport?.offsetLeft ?? 0) + 12
        const top = (viewport?.offsetTop ?? 0) + 12
        const width = Math.max(0, (viewport?.width ?? window.innerWidth) - 24)
        const bottom = top + (viewport?.height ?? window.innerHeight) - 24
        const box = cat.getBoundingClientRect()
        const above = Math.max(0, box.top - top - 10)
        const below = Math.max(0, bottom - box.bottom - 10)
        const naturalHeight = (bubble.firstElementChild?.scrollHeight ?? bubble.scrollHeight) + 2
        const side = naturalHeight <= above || above >= below ? 'above' : 'below'
        const available = side === 'above' ? above : below
        const bubbleWidth = Math.min(preferredWidth, width)
        const widthStyle = `${bubbleWidth}px`
        const heightStyle = constrainHeight ? `${Math.max(0, available - 2)}px` : 'none'
        if (bubble.style.width !== widthStyle) bubble.style.width = widthStyle
        if (bubble.style.maxHeight !== heightStyle) bubble.style.maxHeight = heightStyle
        const center = box.left + box.width / 2
        const x = clamp(center - bubbleWidth / 2, left, left + width - bubbleWidth)
        const preferredY = side === 'above' ? box.top - 10 - bubble.offsetHeight : box.bottom + 10
        const y = constrainHeight ? preferredY : clamp(preferredY, top, Math.max(top, bottom - bubble.offsetHeight))
        const tail = clamp(center - x - 1, 18, bubbleWidth - 20)
        const next = `${x}:${y}:${tail}:${side}`
        if (next !== previous) {
          bubble.style.left = `${x}px`
          bubble.style.top = `${y}px`
          bubble.style.right = 'auto'
          bubble.style.bottom = 'auto'
          bubble.style.setProperty('--mewcat-tail-x', `${tail}px`)
          bubble.dataset.placement = side
          bubble.style.visibility = 'visible'
          previous = next
        }
      }
      frame = requestAnimationFrame(place)
    }
    place()
    return () => {
      cancelAnimationFrame(frame)
      sizes.disconnect()
      window.removeEventListener('resize', invalidate)
      window.removeEventListener('scroll', invalidate, true)
      viewport?.removeEventListener('resize', invalidate)
      viewport?.removeEventListener('scroll', invalidate)
      for (const name of ['left', 'top', 'right', 'bottom', 'width', 'max-height', 'visibility', '--mewcat-tail-x']) bubble.style.removeProperty(name)
      delete bubble.dataset.placement
    }
  }, [anchor, enabled, preferredWidth, constrainHeight])
  return ref
}
