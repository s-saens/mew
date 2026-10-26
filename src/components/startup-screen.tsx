import { LoadingIndicator } from '@mew/ui/loading-indicator'
import { uiText } from '@mew/ui/i18n-core'

export function PanelLoading() {
  return <div role="status" aria-label={uiText('불러오는 중…')} aria-busy="true" className="mew-panel-surface flex h-full min-h-0 flex-1 items-center justify-center bg-surface text-ink-secondary">
    <LoadingIndicator size={20} />
  </div>
}

export function StartupScreen() {
  return <div data-startup-screen role="status" aria-label={uiText('접속 중…')} aria-busy="true" className="mew-workspace flex h-dvh items-center justify-center overflow-hidden px-4 text-center text-sm text-ink">
    <span className="mew-loading-logo-shadow"><LoadingIndicator variant="logo" size={56} /></span>
    <span className="sr-only">{uiText('접속 중…')}</span>
  </div>
}
