import { useLayoutEffect, useRef, type RefObject } from 'react'

type SelectionPoint = { x: number; y: number; selectionX: number; selectionY: number }

/** Observe native touch selection without cancelling the gesture that creates it. */
export function useEditorTouchSelection({ root, scope, enabled, onSelect, onDismiss }: {
  root: RefObject<HTMLDivElement | null>
  scope: string
  enabled: boolean
  onSelect: (point: SelectionPoint) => void
  onDismiss: () => void
}) {
  const callbacks = useRef({ onSelect, onDismiss })
  useLayoutEffect(() => { callbacks.current = { onSelect, onDismiss } })
  const touchInput = useRef(false)

  useLayoutEffect(() => {
    touchInput.current = false
    if (!enabled) return
    let timer: ReturnType<typeof setTimeout> | undefined
    let pressed = false
    let touching = false
    let shown: Range | null = null
    let keyboard: { content: HTMLElement; attribute: string; previous: string | null; show?: () => void } | null = null
    const releaseKeyboard = (show = false) => {
      if (!keyboard) return
      const { content, attribute, previous, show: showKeyboard } = keyboard
      keyboard = null
      const activate = show && document.activeElement === content && previous !== 'manual' && previous !== 'none'
      // Chromium requires manual policy while show() is called.
      if (activate && showKeyboard) {
        try { showKeyboard() } catch { /* Policy restoration must also work when keyboard control is unavailable. */ }
      }
      if (previous === null) content.removeAttribute(attribute)
      else content.setAttribute(attribute, previous)
    }
    const suppressKeyboard = (content: Element | null, selecting = false) => {
      if (!(content instanceof HTMLElement) || keyboard?.content === content) return
      releaseKeyboard()
      const virtualKeyboard = (navigator as Navigator & { virtualKeyboard?: { show?: () => void } }).virtualKeyboard
      const manual = typeof virtualKeyboard?.show === 'function'
      // Unsupported browsers keep the native first gesture and use the input hint once selected.
      if (!manual && !selecting) return
      const attribute = manual ? 'virtualkeyboardpolicy' : 'inputmode'
      keyboard = { content, attribute, previous: content.getAttribute(attribute),
        show: manual ? () => virtualKeyboard!.show!() : undefined }
      content.setAttribute(attribute, manual ? 'manual' : 'none')
    }
    const cancel = () => { clearTimeout(timer); timer = undefined }
    const contentAt = (node: Node | null) => {
      const element = node instanceof Element ? node : node?.parentElement
      if (element?.closest('input, textarea, select, button, [role="menu"], [role="listbox"], [inert]')) return null
      const content = element?.closest('.ProseMirror, .cm-content')
      return content && root.current?.contains(content) ? content : null
    }
    const selectedRange = () => {
      const selection = document.getSelection()
      if (!selection || selection.isCollapsed || !selection.rangeCount) return null
      const range = selection.getRangeAt(0)
      const content = contentAt(range.startContainer)
      return content && content === contentAt(range.endContainer) ? range : null
    }
    const sameRange = (a: Range, b: Range) => a.startContainer === b.startContainer && a.startOffset === b.startOffset
      && a.endContainer === b.endContainer && a.endOffset === b.endOffset
    const schedule = () => {
      cancel()
      if (!touchInput.current) return
      const range = selectedRange()
      if (!range) {
        shown = null
        callbacks.current.onDismiss()
        if (!pressed && !touching) timer = setTimeout(() => releaseKeyboard(true), 250)
        return
      }
      suppressKeyboard(contentAt(range.startContainer), true)
      if (shown && sameRange(shown, range)) return
      if (shown) callbacks.current.onDismiss()
      if (pressed || touching) return
      timer = setTimeout(() => {
        const current = selectedRange()
        if (!current || !sameRange(range, current)) return
        const rects = Array.from(current.getClientRects()).filter(rect => rect.width > 0 && rect.height > 0)
        const first = rects[0], last = rects.at(-1)
        if (!first || !last) return
        shown = current.cloneRange()
        callbacks.current.onSelect({ x: first.left, y: last.bottom + 8,
          selectionX: first.left + first.width / 2, selectionY: first.top + first.height / 2 })
      }, 250)
    }
    const down = (event: PointerEvent) => {
      cancel()
      if (event.target instanceof Element && event.target.closest('[role="menu"]')) return
      const content = contentAt(event.target as Node)
      // Restore the fallback before the browser handles an ordinary editing tap.
      if (keyboard?.attribute === 'inputmode') releaseKeyboard()
      touchInput.current = event.pointerType === 'touch' && !!content
      pressed = touchInput.current
      shown = null
      if (touchInput.current) suppressKeyboard(content)
      else releaseKeyboard()
      callbacks.current.onDismiss()
    }
    const up = () => { pressed = false; schedule() }
    const pointerCancel = () => {
      pressed = false
      cancel()
      if (!selectedRange()) releaseKeyboard()
    }
    const touchStart = () => { touching = true; cancel() }
    const touchEnd = (event: TouchEvent) => { touching = event.touches.length > 0; if (!touching) up() }
    const touchCancel = () => { touching = false; pointerCancel(); releaseKeyboard() }
    const dismiss = () => { cancel(); releaseKeyboard(); touchInput.current = false; callbacks.current.onDismiss() }
    const keydown = (event: KeyboardEvent) => {
      if (event.target instanceof Element && event.target.closest('[role="menu"]')) { cancel(); touchInput.current = false; return }
      dismiss()
    }
    const scroll = (event: Event) => {
      if (event.target instanceof Element && event.target.closest('[role="menu"]')) return
      cancel()
      callbacks.current.onDismiss()
    }
    document.addEventListener('pointerdown', down, true)
    document.addEventListener('pointerup', up, true)
    document.addEventListener('pointercancel', pointerCancel, true)
    document.addEventListener('touchstart', touchStart, { capture: true, passive: true })
    document.addEventListener('touchend', touchEnd, true)
    document.addEventListener('touchcancel', touchCancel, true)
    document.addEventListener('selectionchange', schedule)
    document.addEventListener('keydown', keydown, true)
    document.addEventListener('scroll', scroll, true)
    window.addEventListener('blur', dismiss)
    return () => {
      cancel()
      releaseKeyboard()
      document.removeEventListener('pointerdown', down, true)
      document.removeEventListener('pointerup', up, true)
      document.removeEventListener('pointercancel', pointerCancel, true)
      document.removeEventListener('touchstart', touchStart, true)
      document.removeEventListener('touchend', touchEnd, true)
      document.removeEventListener('touchcancel', touchCancel, true)
      document.removeEventListener('selectionchange', schedule)
      document.removeEventListener('keydown', keydown, true)
      document.removeEventListener('scroll', scroll, true)
      window.removeEventListener('blur', dismiss)
    }
  }, [enabled, root, scope])

  return (event: MouseEvent) => {
    const pointerType = 'pointerType' in event ? event.pointerType : undefined
    const capabilities = (event as MouseEvent & { sourceCapabilities?: { firesTouchEvents: boolean } }).sourceCapabilities
    // Touch compatibility events can report "mouse"; a real mouse down resets touchInput.
    return pointerType === 'touch' || capabilities?.firesTouchEvents === true
      || touchInput.current && (event.clientX !== 0 || event.clientY !== 0)
  }
}
