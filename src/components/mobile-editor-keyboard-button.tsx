import { useMobileLayout } from '@mew/mobile-keys'
import { uiText } from '@mew/ui/i18n-core'
import { useUiLocale } from '@mew/ui/i18n'
import { useMobileKeyboard } from '../hooks/use-mobile-keyboard'
import { DesktopIcon } from './desktop-stick'

export function MobileEditorKeyboardButton({ enabled, onActivate }: {
  enabled: boolean
  onActivate: () => void
}) {
  useUiLocale()
  const mobile = useMobileLayout()
  const keyboardOpen = useMobileKeyboard()
  if (!enabled || !mobile || keyboardOpen) return null

  const label = uiText('키보드 열기')
  return <button type="button" aria-label={label} data-tip={label} data-mobile-editor-keyboard-button
    className="absolute bottom-3 left-1/2 z-20 flex size-11 -translate-x-1/2 items-center justify-center rounded-full bg-surface/70 text-ink shadow-md backdrop-blur-sm hover:bg-surface/90 active:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    onPointerDown={event => event.preventDefault()}
    onClick={onActivate}>
    <DesktopIcon kind="keyboard" />
  </button>
}
