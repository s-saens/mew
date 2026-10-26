import type { CSSProperties } from 'react'

const fixedContainers = new Set(['transform', 'perspective', 'filter', 'backdrop-filter', 'translate', 'rotate', 'scale'])

function fixedContainingBlock(container: Element) {
  for (let element: Element | null = container; element && element !== element.ownerDocument.documentElement; element = element.parentElement) {
    const style = element.ownerDocument.defaultView!.getComputedStyle(element)
    const backdrop = style.backdropFilter || style.getPropertyValue('-webkit-backdrop-filter')
    if ([style.transform, style.perspective, style.filter, style.translate, style.rotate, style.scale, backdrop].some(value => value && value !== 'none') ||
      /\b(paint|layout|strict|content)\b/.test(style.contain) || style.contentVisibility === 'auto' ||
      style.willChange.split(',').some(value => fixedContainers.has(value.trim()))) return element as HTMLElement
  }
  return null
}

type PopupStyle = Partial<Record<'left' | 'top' | 'bottom' | 'width' | 'minWidth' | 'maxWidth' | 'maxHeight', number>>

/** Keep viewport placement and fixed CSS coordinates in the same space, including blurred, scrolling hosts. */
export function getFixedPopupLayout(container?: Element | null) {
  container ??= document.body
  const view = container.ownerDocument.defaultView!
  const viewport = view.visualViewport
  let left = viewport?.offsetLeft ?? 0, top = viewport?.offsetTop ?? 0
  let right = left + (viewport?.width ?? view.innerWidth), bottom = top + (viewport?.height ?? view.innerHeight)
  const host = fixedContainingBlock(container)
  const box = host?.getBoundingClientRect()
  const scaleX = host && host.offsetWidth ? box!.width / host.offsetWidth : 1
  const scaleY = host && host.offsetHeight ? box!.height / host.offsetHeight : 1
  const originLeft = host ? box!.left + (host.clientLeft - host.scrollLeft) * scaleX : 0
  const originTop = host ? box!.top + (host.clientTop - host.scrollTop) * scaleY : 0
  const originBottom = host ? originTop + host.clientHeight * scaleY : view.innerHeight
  // Fixed descendants escape ordinary overflow ancestors, but not their containing block's clip.
  for (let element = host; element; element = element.parentElement) {
    const style = view.getComputedStyle(element), rect = element.getBoundingClientRect()
    const x = element.offsetWidth ? rect.width / element.offsetWidth : 1
    const y = element.offsetHeight ? rect.height / element.offsetHeight : 1
    const paint = /\b(paint|strict|content)\b/.test(style.contain)
    if (paint || /hidden|clip|auto|scroll/.test(style.overflowX)) {
      left = Math.max(left, rect.left + element.clientLeft * x)
      right = Math.min(right, rect.left + (element.clientLeft + element.clientWidth) * x)
    }
    if (paint || /hidden|clip|auto|scroll/.test(style.overflowY)) {
      top = Math.max(top, rect.top + element.clientTop * y)
      bottom = Math.min(bottom, rect.top + (element.clientTop + element.clientHeight) * y)
    }
  }
  right = Math.max(left, right); bottom = Math.max(top, bottom)
  return {
    host,
    bounds: { left, top, right, bottom, width: right - left, height: bottom - top },
    toStyle(position: PopupStyle): CSSProperties {
      const style: CSSProperties = { position: 'fixed' }
      for (const key of ['width', 'minWidth', 'maxWidth'] as const) if (position[key] !== undefined) style[key] = position[key] / scaleX
      if (position.maxHeight !== undefined) style.maxHeight = position.maxHeight / scaleY
      if (position.left !== undefined) style.left = (position.left - originLeft) / scaleX
      if (position.top !== undefined) style.top = (position.top - originTop) / scaleY
      if (position.bottom !== undefined) style.bottom = (originBottom - view.innerHeight + position.bottom) / scaleY
      return style
    },
  }
}
