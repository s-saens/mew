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
      sizes.disconnect()
      mutations.disconnect()
      element.removeEventListener('scroll', update)
      stopAutoScroll?.()
      viewport.current = null
    }
  }, [autoScroll])
  const move = (direction: -1 | 1) => {
    const element = viewport.current
    if (!element) return
    element.scrollBy({
      left: direction * element.clientWidth * 0.5,
      behavior: element.ownerDocument.defaultView!.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    })
  }

  return <HoverTipLayer className={`mew-tab-scroll-area ${className}`}>
    <div {...props} ref={bind} className={`mew-tab-scroll-viewport ${viewportClassName}`}>{children}</div>
    {([-1, 1] as const).map(direction => {
      const Icon = direction === -1 ? NavArrowLeft : NavArrowRight
      const label = uiText(direction === -1 ? '탭을 왼쪽으로 스크롤' : '탭을 오른쪽으로 스크롤')
      return <button key={direction} type="button" className="mew-tab-scroll-button"
        data-tab-scroll-direction={direction === -1 ? 'left' : 'right'} hidden={direction === -1 ? !edges.left : !edges.right}
        aria-label={label} data-tip={label} onPointerDown={event => event.preventDefault()}
        onClick={event => { event.stopPropagation(); move(direction) }} onDoubleClick={event => event.stopPropagation()}>
        <Icon width={18} height={18} aria-hidden="true" />
      </button>
    })}
  </HoverTipLayer>
}
