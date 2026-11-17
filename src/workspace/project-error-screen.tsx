import { RefreshDouble, WarningTriangle } from 'iconoir-react'
import { uiText } from '@mew/ui/i18n-core'

export function ProjectErrorScreen({ onRecover }: { onRecover: () => void }) {
  return <div role="alert" className="flex h-full min-h-0 min-w-0 items-safe-center justify-center overflow-auto p-4">
    <div className="flex w-full max-w-sm flex-col items-center rounded-2xl border border-edge bg-surface p-6 text-center shadow-lg">
      <div className="mb-4 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-surface-raised text-ink-secondary">
        <WarningTriangle width={24} height={24} strokeWidth={1.5} aria-hidden="true" />
      </div>
      <p className="text-sm font-medium leading-6 text-ink">{uiText('프로젝트를 불러오지 못했습니다. 다른 프로젝트를 선택하거나 패널을 닫아 주세요.')}</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <button type="button" onClick={() => window.location.reload()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-ink-on-accent hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          <RefreshDouble width={16} height={16} aria-hidden="true" />{uiText('새로고침')}
        </button>
        <button type="button" onClick={onRecover} className="min-h-10 rounded-lg border border-edge px-4 text-sm font-medium text-ink hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">{uiText('프로젝트 선택')}</button>
      </div>
    </div>
  </div>
}
