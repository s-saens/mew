import { lazy, Suspense, useId, type ComponentProps } from 'react'
import { DialogFrame, HoverTipLayer, LoadingIndicator } from '@mew/ui'
import { useUiLocale } from '@mew/ui/i18n'
import { uiText } from '@mew/ui/i18n-core'
import { AppErrorBoundary, ErrorRecovery } from '../app-error-boundary'
import { PanelCloseButton } from '../panel-close-button'
import type { DrawingEditor } from './DrawingEditor'

const LazyDrawingEditor = lazy(() => import('./DrawingEditor').then(module => ({ default: module.DrawingEditor })))

function DrawingStatus({ onClose, failed = false }: { onClose: () => void; failed?: boolean }) {
  useUiLocale()
  const titleId = useId()
  return <DialogFrame labelledBy={titleId} onClose={onClose} className="max-w-md">
    <HoverTipLayer>
      <header className="flex items-center justify-between border-b border-edge px-3 py-2 text-sm text-ink">
        <h2 id={titleId}>{uiText('그림판')}</h2>
        <PanelCloseButton aria-label={uiText('닫기')} onClick={onClose} />
      </header>
      {failed ? <div role="alert" className="flex flex-col gap-3 p-3 text-sm text-ink">
        <p>{uiText('그림판을 불러오지 못했습니다.')}</p>
        <ErrorRecovery />
      </div> : <div role="status" aria-label={uiText('불러오는 중…')} aria-busy="true" className="flex justify-center p-3 text-ink-secondary">
        <LoadingIndicator />
      </div>}
    </HoverTipLayer>
  </DialogFrame>
}

export function DeferredDrawingEditor(props: ComponentProps<typeof DrawingEditor>) {
  return <AppErrorBoundary fallback={<DrawingStatus onClose={props.onClose} failed />}>
    <Suspense fallback={<DrawingStatus onClose={props.onClose} />}>
      <LazyDrawingEditor {...props} />
    </Suspense>
  </AppErrorBoundary>
}
