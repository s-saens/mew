import { registerKeyboardCapture } from '@mew/shortcuts'
import { LOGIN_DESKTOP_LIMITS, type LoginDesktopInput } from '../../shared/login-desktop.ts'

export function bindBrowserDesktopInput({ stage, keyboard, size, ready, send }: {
  stage: HTMLElement; keyboard: HTMLTextAreaElement
  size: () => { width: number; height: number }; ready: () => boolean
  send: (message: LoginDesktopInput) => void
}) {
  const keys = new Map<string, string>(), buttons = new Set<number>()
  let gesture: { id: number; x: number; y: number; lastX: number; lastY: number; moved: boolean } | undefined
  let pendingMove: { type: 'pointer'; x: number; y: number } | undefined, animation = 0
  let wheelX = 0, wheelY = 0, composing = false, committed = '', compositionTimer: ReturnType<typeof setTimeout> | undefined
  let editKeys: Array<{ key: string; at: number }> = [], beforeEdit: { key: string; at: number } | undefined
  const controlKeys = new Set(['Enter', 'Backspace', 'Tab', 'Escape', 'Delete'])
  const inputKey = (type: string) => {
    if (type === 'deleteContentBackward') return 'Backspace'
    if (type === 'deleteContentForward') return 'Delete'
    if (type === 'insertLineBreak' || type === 'insertParagraph') return 'Enter'
  }
  const tapKey = (key: string) => { send({ type: 'key', key, code: key, down: true }); send({ type: 'key', key, code: key, down: false }) }
  const consumeEdit = (key: string) => {
    editKeys = editKeys.filter(value => performance.now() - value.at < 250)
    const index = editKeys.findIndex(value => value.key === key)
    if (index < 0) return false
    editKeys.splice(index, 1); return true
  }
  const point = (x: number, y: number, clamp = false) => {
    const bounds = stage.getBoundingClientRect(), dimensions = size()
    const scale = Math.min(bounds.width / dimensions.width, bounds.height / dimensions.height)
    if (!(scale > 0)) return
    const px = (x - bounds.left - (bounds.width - dimensions.width * scale) / 2) / scale
    const py = (y - bounds.top - (bounds.height - dimensions.height * scale) / 2) / scale
    if (!clamp && (px < 0 || py < 0 || px >= dimensions.width || py >= dimensions.height)) return
    return { x: Math.round(Math.max(0, Math.min(dimensions.width - 1, px))), y: Math.round(Math.max(0, Math.min(dimensions.height - 1, py))) }
  }
  const flush = () => {
    animation = 0
    if (!ready()) { pendingMove = undefined; wheelX = wheelY = 0; return }
    if (pendingMove) { send(pendingMove); pendingMove = undefined }
    if (wheelX || wheelY) { send({ type: 'wheel', deltaX: Math.max(-100000, Math.min(100000, wheelX)), deltaY: Math.max(-100000, Math.min(100000, wheelY)) }); wheelX = wheelY = 0 }
  }
  const schedule = () => { if (!animation) animation = requestAnimationFrame(flush) }
  const release = () => {
    for (const [code, key] of keys) send({ type: 'key', code, key, down: false })
    for (const button of buttons) send({ type: 'button', button, down: false })
    keys.clear(); buttons.clear(); gesture = undefined; pendingMove = undefined; wheelX = wheelY = 0; editKeys = []; beforeEdit = undefined
    cancelAnimationFrame(animation); animation = 0
    send({ type: 'release' })
  }
  const pointer = (event: PointerEvent) => {
    if (!ready() || !event.isTrusted || event.button > 2) return
    const position = point(event.clientX, event.clientY, event.type === 'pointerup')
    if (!position) return
    event.preventDefault(); event.stopPropagation()
    if (event.type === 'pointerdown') {
      stage.focus({ preventScroll: true }); stage.setPointerCapture(event.pointerId)
      if (event.pointerType === 'touch') {
        if (gesture) { release(); return }
        gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY, moved: false }
        send({ type: 'pointer', ...position }); return
      }
      flush(); buttons.add(event.button); send({ type: 'button', button: event.button, down: true, ...position })
    } else if (event.pointerType === 'touch') {
      if (!gesture || gesture.id !== event.pointerId) return
      if (event.type === 'pointermove') {
        if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 8) gesture.moved = true
        if (gesture.moved) {
          const bounds = stage.getBoundingClientRect(), dimensions = size(), scale = Math.min(bounds.width / dimensions.width, bounds.height / dimensions.height)
          wheelX += (gesture.lastX - event.clientX) / scale; wheelY += (gesture.lastY - event.clientY) / scale
          schedule()
        }
        gesture.lastX = event.clientX; gesture.lastY = event.clientY
      } else if (event.type === 'pointerup') {
        if (!gesture.moved) { send({ type: 'button', button: 0, down: true, ...position }); send({ type: 'button', button: 0, down: false, ...position }) }
        gesture = undefined
      }
    } else if (event.type === 'pointermove') { pendingMove = { type: 'pointer', ...position }; schedule() }
    else if (event.type === 'pointerup') { flush(); buttons.delete(event.button); send({ type: 'button', button: event.button, down: false, ...position }) }
  }
  const wheel = (event: WheelEvent) => {
    if (!ready()) return
    const position = point(event.clientX, event.clientY)
    if (!position) return
    event.preventDefault(); event.stopPropagation()
    const factor = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? size().height : 1
    pendingMove = { type: 'pointer', ...position }; wheelX += event.deltaX * factor; wheelY += event.deltaY * factor; schedule()
  }
  const paste = (text: string) => { if (ready() && text) { release(); send({ type: 'paste', text: text.slice(0, LOGIN_DESKTOP_LIMITS.pasteChars) }) } }
  const onPaste = (event: ClipboardEvent) => { if (!ready()) return; event.preventDefault(); event.stopPropagation(); paste(event.clipboardData?.getData('text/plain') || '') }
  const key = (event: KeyboardEvent) => {
    if (!ready() || !stage.contains(event.target as Node)) return false
    if (event.isComposing || composing || ['Process', 'Unidentified', 'Dead'].includes(event.key)) return false
    if (event.target === keyboard && !controlKeys.has(event.key) && (!event.code || event.key.length === 1 && !/^[\x20-\x7e]$/.test(event.key))) return false
    const down = event.type === 'keydown'
    if (!event.altKey && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') { if (down) release(); event.stopImmediatePropagation(); return true }
    event.preventDefault(); event.stopImmediatePropagation()
    const code = event.code || (controlKeys.has(event.key) ? event.key : '')
    if (down) {
      keys.set(code, event.key)
      if (['Enter', 'Backspace', 'Delete'].includes(event.key)) { editKeys.push({ key: event.key, at: performance.now() }); if (editKeys.length > 64) editKeys.shift() }
    } else keys.delete(code)
    send({ type: 'key', key: event.key, code, down })
    return true
  }
  const onBeforeInput = (event: Event) => {
    const input = event as InputEvent, key = inputKey(input.inputType)
    if (!ready() || composing || input.isComposing || !key) return
    event.preventDefault()
    if (!consumeEdit(key)) tapKey(key)
    beforeEdit = { key, at: performance.now() }; keyboard.value = ''
  }
  const onInput = (event: Event) => {
    const input = event as InputEvent
    if (composing || input.isComposing) return
    const key = inputKey(input.inputType)
    if (key) {
      const duplicate = beforeEdit?.key === key && performance.now() - beforeEdit.at < 250
      beforeEdit = undefined
      if (ready() && !duplicate && !consumeEdit(key)) tapKey(key)
      keyboard.value = ''; return
    }
    beforeEdit = undefined; editKeys = []
    if (committed && (input.data === committed || keyboard.value === committed)) { committed = ''; keyboard.value = ''; return }
    if (input.inputType !== 'insertFromComposition') paste(keyboard.value)
    keyboard.value = ''
  }
  const startComposition = () => { composing = true }
  const endComposition = (event: CompositionEvent) => {
    composing = false; committed = event.data || keyboard.value
    paste(committed); keyboard.value = ''
    clearTimeout(compositionTimer); compositionTimer = setTimeout(() => { committed = '' }, 0)
  }
  const blur = (event: FocusEvent) => { if (!stage.contains(event.relatedTarget as Node | null)) release() }
  const hidden = () => { if (document.hidden) release() }
  const lostCapture = () => { if (gesture) release() }
  const context = (event: Event) => event.preventDefault()
  const unbindKeyboard = registerKeyboardCapture(key)
  for (const name of ['pointerdown', 'pointermove', 'pointerup']) stage.addEventListener(name, pointer as EventListener)
  stage.addEventListener('pointercancel', release); stage.addEventListener('lostpointercapture', lostCapture)
  stage.addEventListener('wheel', wheel, { passive: false }); stage.addEventListener('contextmenu', context)
  stage.addEventListener('paste', onPaste); stage.addEventListener('focusout', blur)
  keyboard.addEventListener('beforeinput', onBeforeInput); keyboard.addEventListener('input', onInput); keyboard.addEventListener('compositionstart', startComposition); keyboard.addEventListener('compositionend', endComposition)
  window.addEventListener('blur', release); document.addEventListener('visibilitychange', hidden)
  return { release, close() {
    release(); unbindKeyboard(); clearTimeout(compositionTimer)
    for (const name of ['pointerdown', 'pointermove', 'pointerup']) stage.removeEventListener(name, pointer as EventListener)
    stage.removeEventListener('pointercancel', release); stage.removeEventListener('lostpointercapture', lostCapture); stage.removeEventListener('wheel', wheel); stage.removeEventListener('contextmenu', context)
    stage.removeEventListener('paste', onPaste); stage.removeEventListener('focusout', blur)
    keyboard.removeEventListener('beforeinput', onBeforeInput); keyboard.removeEventListener('input', onInput); keyboard.removeEventListener('compositionstart', startComposition); keyboard.removeEventListener('compositionend', endComposition)
    window.removeEventListener('blur', release); document.removeEventListener('visibilitychange', hidden)
  } }
}
