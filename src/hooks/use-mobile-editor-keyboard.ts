import { useLayoutEffect, useRef, type RefObject } from 'react'
import { useMobileLayout } from '@mew/mobile-keys'

type OriginalInput = { policy: string | null; mode: string | null }

/** Own mobile body keyboard policy independently of native cursor/selection gestures. */
export function useMobileEditorKeyboard(root: RefObject<HTMLDivElement | null>, enabled: boolean, scope: string) {
  const mobile = useMobileLayout()
  const activate = useRef<(() => void) | null>(null)
  useLayoutEffect(() => {
    const host = root.current
    if (!enabled || !mobile || !host) return
    const doc = host.ownerDocument, win = doc.defaultView!
    const inputs = new Map<HTMLElement, OriginalInput>()
    let requested = false
    let target: HTMLElement | null = null
    const keyboard = () => (win.navigator as Navigator & { virtualKeyboard?: { show?: () => void; hide?: () => void } }).virtualKeyboard
    const attribute = (element: HTMLElement, name: string, value: string | null) => {
      if (value === null) element.removeAttribute(name)
      else if (element.getAttribute(name) !== value) element.setAttribute(name, value)
    }
    const restore = (element: HTMLElement, original: OriginalInput) => {
      attribute(element, 'virtualkeyboardpolicy', original.policy)
      attribute(element, 'inputmode', original.mode)
    }
    const sync = () => {
      for (const [element, original] of inputs) {
        if (!host.contains(element) || !element.isContentEditable) {
          restore(element, original)
          inputs.delete(element)
        }
      }
      for (const element of host.querySelectorAll<HTMLElement>('.ProseMirror[contenteditable="true"], .cm-content[contenteditable="true"]')) {
        if (!inputs.has(element)) inputs.set(element, { policy: element.getAttribute('virtualkeyboardpolicy'), mode: element.getAttribute('inputmode') })
        attribute(element, 'virtualkeyboardpolicy', 'manual')
        if (!requested || element !== target) attribute(element, 'inputmode', 'none')
      }
    }
    const dismiss = () => {
      const active = doc.activeElement
      const owned = active instanceof win.HTMLElement && inputs.has(active)
      // hide(), like show(), requires a focused manual host whose inputmode is not none.
      if (owned) {
        try { keyboard()?.hide?.() } catch { /* Blurring also dismisses keyboards without API control. */ }
      }
      requested = false
      sync()
      if (owned) active.blur()
      target = null
    }
    const down = (event: PointerEvent) => {
      const element = event.target instanceof win.Element ? event.target : null
      if (element?.closest('[data-mobile-editor-keyboard-button]') && host.contains(element)) return
      // Suppress before the browser handles the same tap's focus and selection.
      if (requested) dismiss()
      else sync()
    }
    const show = () => {
      sync()
      target = [...inputs.keys()].find(element => element === doc.activeElement) ?? inputs.keys().next().value ?? null
      if (!target) return
      const content = target, original = inputs.get(content)!
      requested = true
      attribute(content, 'inputmode', original.mode === 'none' ? null : original.mode)
      const nativeFocus = () => {
        // A failing Chromium API must not leave manual policy blocking fallback focus.
        attribute(content, 'virtualkeyboardpolicy', 'auto')
        if (doc.activeElement === content) content.blur()
        content.focus({ preventScroll: true })
        attribute(content, 'virtualkeyboardpolicy', 'manual')
      }
      const api = keyboard()
      if (!api?.show) { nativeFocus(); return }
      content.focus({ preventScroll: true })
      try { api.show() } catch { nativeFocus() }
    }
    sync()
    activate.current = show
    const observer = new MutationObserver(sync)
    observer.observe(host, { childList: true, subtree: true })
    doc.addEventListener('pointerdown', down, true)
    return () => {
      observer.disconnect()
      doc.removeEventListener('pointerdown', down, true)
      if (requested) dismiss()
      for (const [element, original] of inputs) restore(element, original)
      if (activate.current === show) activate.current = null
    }
  }, [root, enabled, mobile, scope])
  return () => activate.current?.()
}
