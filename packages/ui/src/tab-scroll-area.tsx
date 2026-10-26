import { useCallback, useRef, useState, type ComponentPropsWithoutRef } from 'react'
import { NavArrowLeft, NavArrowRight } from 'iconoir-react'
import { HoverTipLayer } from './HoverTipLayer'
import { useUiLocale } from './i18n'
import { uiText } from './i18n-core'
import { useTabAutoScroll } from './use-tab-auto-scroll'
import './tab-scroll-area.css'

type TabScrollAreaProps = ComponentPropsWithoutRef<'div'> & { viewportClassName?: string }

/** Tabs retain the whole strip width; navigation overlays only the overflowing edges. */
export function TabScrollArea({ children, className = '', viewportClassName = '', ...props }: TabScrollAreaProps) {
  useUiLocale()
  const autoScroll = useTabAutoScroll()
  const viewport = useRef<HTMLDivElement | null>(null)
  const stopScrolling = useRef<(() => void) | null>(null)
  const [edges, setEdges] = useState({ left: false, right: false })
  const bind = useCallback((element: HTMLDivElement | null) => {
    viewport.current = element
    if (!element) return
    const stopAutoScroll = autoScroll(element)
    const win = element.ownerDocument.defaultView!
    const update = () => {
      const maximum = Math.max(0, element.scrollWidth - element.clientWidth)
      const offset = element.scrollLeft
      const rtl = win.getComputedStyle(element).direction === 'rtl'
      const left = element.clientWidth > 0 && (rtl ? offset > -maximum + 1 : offset > 1)
      const right = element.clientWidth > 0 && (rtl ? offset < -1 : offset < maximum - 1)
      setEdges(previous => previous.left === left && previous.right === right ? previous : { left, right })
    }
    const stop = () => stopScrolling.current?.()
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.defaultPrevented) return
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientWidth : 1
      const before = element.scrollLeft
      element.scrollBy({ left: delta * unit, behavior: 'instant' })
      if (element.scrollLeft !== before) {
        stop()
        event.preventDefault()
      }
    }
    const wrapper = element.parentElement!
    wrapper.addEventListener('wheel', wheel, { passive: false })
    win.addEventListener('blur', stop)
    win.addEventListener('pointerup', stop)
    win.addEventListener('pointercancel', stop)
    element.ownerDocument.addEventListener('visibilitychange', stop)
    const sizes = new ResizeObserver(update)
    const observed = new Set<Element>()
    const observeChildren = () => {
      const children = new Set(element.children)
      for (const child of observed) {
        if (!children.has(child)) { sizes.unobserve(child); observed.delete(child) }
      }
      for (const child of children) {
        if (!observed.has(child)) { sizes.observe(child); observed.add(child) }
      }
      update()
    }
    const mutations = new MutationObserver(observeChildren)
    mutations.observe(element, { childList: true, subtree: true, characterData: true })
    sizes.observe(element)
    observeChildren()
    element.addEventListener('scroll', update, { passive: true })
    return () => {
      stop()
      wrapper.removeEventListener('wheel', wheel)
      win.removeEventListener('blur', stop)
      win.removeEventListener('pointerup', stop)
      win.removeEventListener('pointercancel', stop)
      element.ownerDocument.removeEventListener('visibilitychange', stop)
      sizes.disconnect()
      mutations.disconnect()
      element.removeEventListener('scroll', update)
      stopAutoScroll?.()
      viewport.current = null
    }
  }, [autoScroll])
  const startScrolling = (direction: -1 | 1) => {
    stopScrolling.current?.()
    const element = viewport.current
    if (!element) return
    const win = element.ownerDocument.defaultView!
    let previous = win.performance.now()
    let position = element.scrollLeft
    let frame = 0
    const stop = () => {
      win.cancelAnimationFrame(frame)
      stopScrolling.current = null
    }
    const tick = (now: number) => {
      const before = element.scrollLeft
      position += direction * 320 * Math.max(0, Math.min(now - previous, 50)) / 1000
      element.scrollTo({ left: position, behavior: 'instant' })
      previous = now
      if (element.scrollLeft === before && Math.abs(position - before) >= 1) { stop(); return }
      frame = win.requestAnimationFrame(tick)
    }
    stopScrolling.current = stop
    frame = win.requestAnimationFrame(tick)
  }

  return <HoverTipLayer className={`mew-tab-scroll-area ${className}`}>
    <div {...props} ref={bind} className={`mew-tab-scroll-viewport ${viewportClassName}`}>{children}</div>
    {([-1, 1] as const).map(direction => {
      const Icon = direction === -1 ? NavArrowLeft : NavArrowRight
      const label = uiText(direction === -1 ? '탭을 왼쪽으로 스크롤' : '탭을 오른쪽으로 스크롤')
      return <button key={direction} type="button" className="mew-tab-scroll-button"
        data-tab-scroll-direction={direction === -1 ? 'left' : 'right'} hidden={direction === -1 ? !edges.left : !edges.right}
        aria-label={label} data-tip={label} onPointerDown={event => {
          if (event.button !== 0) return
          event.preventDefault()
          event.stopPropagation()
          event.currentTarget.setPointerCapture(event.pointerId)
          startScrolling(direction)
        }}
        onLostPointerCapture={() => stopScrolling.current?.()}
        onBlur={() => stopScrolling.current?.()}
        onKeyDown={event => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          event.stopPropagation()
          if (!event.repeat) startScrolling(direction)
        }}
        onKeyUp={event => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          event.stopPropagation()
          stopScrolling.current?.()
        }}
        onClick={event => {
          event.stopPropagation()
          if (event.detail === 0) viewport.current?.scrollBy({ left: direction * 40, behavior: 'instant' })
        }} onDoubleClick={event => event.stopPropagation()}>
        <Icon width={18} height={18} aria-hidden="true" />
      </button>
    })}
  </HoverTipLayer>
}
