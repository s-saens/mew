const keyboardWindows = new WeakSet<Window>()

/** Observe keyboard use before shortcut handlers open inputs, including on touch devices. */
export function startInputFocusTracking(target: Window = window): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (!event.isTrusted || event.isComposing || event.keyCode === 229
      || !event.key || ['Process', 'Unidentified', 'Dead'].includes(event.key)) return

    const shortcut = event.ctrlKey || event.metaKey || event.altKey
    // Software keyboards can send coded Enter/Backspace events as well as IME input.
    if (!shortcut && (event.key === 'Enter' || event.key === 'Backspace')) return
    if (shortcut || event.code && event.code !== 'Unidentified') keyboardWindows.add(target)
  }
  target.addEventListener('keydown', onKeyDown, true)
  return () => {
    target.removeEventListener('keydown', onKeyDown, true)
    keyboardWindows.delete(target)
  }
}

/** Keep touch-only opening quiet; observed keyboard use also allows autofocus. */
export function canAutoFocusInput(): boolean {
  return typeof window !== 'undefined'
    && (keyboardWindows.has(window)
      || typeof window.matchMedia === 'function'
        && window.matchMedia('(min-width: 768px) and (hover: hover) and (pointer: fine)').matches)
}
