import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'

type Direction = 'up' | 'down' | 'left' | 'right'
const REPEAT_DELAY = 350
const REPEAT_INTERVAL = 60

export function useArrowKeyPress(barRef: RefObject<HTMLDivElement | null>, onArrow: (direction: Direction) => void, placement: string) {
  const callback = useRef(onArrow)
  useLayoutEffect(() => { callback.current = onArrow }, [onArrow])
  useEffect(() => {
    const bar = barRef.current
    if (!bar) return
    const doc = bar.ownerDocument, win = doc.defaultView!
    let pointer: number | null = null
    let key: HTMLElement | null = null
    let timer: number | undefined
    let suppressClick = false
    let blocked = false
    const pointers = new Set<number>()
    const pause = () => {
      win.clearTimeout(timer)
      timer = undefined
      key?.removeAttribute('data-held')
      key = null
    }
    const cancel = () => { pause(); pointer = null }
    const repeat = () => {
      if (!key?.isConnected || !bar.isConnected) { cancel(); return }
      callback.current(key.dataset.mobileArrow as Direction)
      timer = win.setTimeout(repeat, REPEAT_INTERVAL)
    }
    const enter = (event: PointerEvent) => {
      const hit = doc.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-mobile-arrow]')
      const next = hit && bar.contains(hit) ? hit : null
      if (next) event.preventDefault()
      if (next === key) return
      pause()
      if (!next) return
      key = next
      key.setAttribute('data-held', '')
      suppressClick = true
      callback.current(key.dataset.mobileArrow as Direction)
      timer = win.setTimeout(repeat, REPEAT_DELAY)
    }
    const down = (event: PointerEvent) => {
      if (event.button !== 0) return
      pointers.add(event.pointerId)
      if (!event.isPrimary || pointers.size > 1) { blocked = true; cancel(); return }
      if (blocked) return
      suppressClick = false
      pointer = event.pointerId
      enter(event)
    }
    const move = (event: PointerEvent) => {
      if (event.pointerId !== pointer) return
      if (!(event.buttons & 1)) { cancel(); return }
      enter(event)
    }
    const end = (event: PointerEvent) => {
      pointers.delete(event.pointerId)
      if (event.pointerId === pointer) cancel()
      if (!pointers.size) blocked = false
    }
    const click = (event: MouseEvent) => {
      if (!suppressClick || event.detail === 0) return
      suppressClick = false
      event.preventDefault()
      event.stopImmediatePropagation()
    }
    const reset = () => { cancel(); pointers.clear(); blocked = false }
    doc.addEventListener('pointerdown', down, true)
    doc.addEventListener('pointermove', move, true)
    doc.addEventListener('pointerup', end, true)
    doc.addEventListener('pointercancel', end, true)
    doc.addEventListener('lostpointercapture', end, true)
    doc.addEventListener('click', click, true)
    doc.addEventListener('visibilitychange', reset)
    win.addEventListener('blur', reset)
    return () => {
      reset()
      doc.removeEventListener('pointerdown', down, true)
      doc.removeEventListener('pointermove', move, true)
      doc.removeEventListener('pointerup', end, true)
      doc.removeEventListener('pointercancel', end, true)
      doc.removeEventListener('lostpointercapture', end, true)
      doc.removeEventListener('click', click, true)
      doc.removeEventListener('visibilitychange', reset)
      win.removeEventListener('blur', reset)
    }
  }, [barRef, placement])
}
