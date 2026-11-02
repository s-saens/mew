import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useUiLocale } from '@mew/ui/i18n'
import { uiText } from '@mew/ui/i18n-core'

export class AppErrorBoundary extends Component<{ children: ReactNode; fallback?: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() { return { failed: true } }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[mew:ui] Screen failed', error, info.componentStack)
  }

  render() {
    return this.state.failed ? this.props.fallback ?? <WorkspaceErrorScreen /> : this.props.children
  }
}

export function ErrorRecovery() {
  useUiLocale()
  return <>
    <p className="text-ink-secondary">{uiText('업데이트 후 발생했다면 서버를 재시작한 뒤 새로고침해 주세요.')}</p>
    <button type="button" onClick={() => window.location.reload()} className="self-start rounded bg-accent px-3 py-2 text-ink-on-accent hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
      {uiText('새로고침')}
    </button>
  </>
}

export function WorkspaceErrorScreen() {
  useUiLocale()
  return <main role="alert" className="mew-workspace flex h-dvh items-center justify-center overflow-auto p-4 text-sm text-ink">
    <div className="flex max-w-md flex-col gap-3">
      <p>{uiText('작업 화면을 불러오지 못했습니다. 페이지를 다시 열어 주세요.')}</p>
      <ErrorRecovery />
    </div>
  </main>
}
