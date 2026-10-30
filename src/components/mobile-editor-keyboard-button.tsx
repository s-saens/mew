import type { RefObject } from 'react'
import { useMobileLayout } from '@mew/mobile-keys'
import { uiText } from '@mew/ui/i18n-core'
import { useUiLocale } from '@mew/ui/i18n'
import { useMobileKeyboard } from '../hooks/use-mobile-keyboard'
import { DesktopIcon } from './desktop-stick'

export function MobileEditorKeyboardButton({ root, enabled }: {
  root: RefObject<HTMLDivElement | null>
  enabled: boolean
}) {
  useUiLocale()
  const mobile = useMobileLayout()
  const keyboardOpen = useMobileKeyboard()
  if (!enabled || !mobile || keyboardOpen) return null

  const showKeyboard = () => {
    const content = root.current?.querySelector<HTMLElement>('.ProseMirror[contenteditable="true"], .cm-content[contenteditable="true"]')
    if (!content) return
    const keyboard = (navigator as Navigator & { virtualKeyboard?: { show?: () => void } }).virtualKeyboard
    // Explicit typing also releases the hint used while selecting text by touch.
    if (content.getAttribute('inputmode') === 'none') content.removeAttribute('inputmode')
    const policy = content.getAttribute('virtualkeyboardpolicy')
    if (keyboard?.show) content.setAttribute('virtualkeyboardpolicy', 'manual')
    else if (content.ownerDocument.activeElement === content) content.blur()
    content.focus({ preventScroll: true })
    let failed = false
    try { keyboard?.show?.() } catch { failed = true }
    finally {
      if (policy === null) content.removeAttribute('virtualkeyboardpolicy')
      else content.setAttribute('virtualkeyboardpolicy', policy)
    }
    if (failed) {
      content.blur()
      content.focus({ preventScroll: true })
    }
  }

  const label = uiText('키보드 열기')
  return <button type="button" aria-label={label} data-tip={label}
    className="absolute bottom-3 left-1/2 z-20 flex size-11 -translate-x-1/2 items-center justify-center rounded-full bg-surface/70 text-ink shadow-md backdrop-blur-sm hover:bg-surface/90 active:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    onPointerDown={event => event.preventDefault()}
    onClick={showKeyboard}>
    <DesktopIcon kind="keyboard" />
  </button>
}
