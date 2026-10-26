import { Xmark } from 'iconoir-react'
import { useI18n } from '../i18n'
import type { SessionMeta } from '../utils/agentFold'

const copy = {
  ko: { waiting: '모델 혼잡', countdown: (seconds: number) => `${seconds}초 뒤 재시도`, cancel: '재시도 중단' },
  en: { waiting: 'Model at capacity', countdown: (seconds: number) => `Retrying in ${seconds}s`, cancel: 'Stop retrying' },
  ja: { waiting: 'モデルが混雑中', countdown: (seconds: number) => `${seconds}秒後に再試行`, cancel: '再試行を中止' },
  'zh-CN': { waiting: '模型繁忙', countdown: (seconds: number) => `${seconds}秒后重试`, cancel: '停止重试' },
}

export function AgentCapacityRetryNotice({ state, now, onCancel }: {
  state: NonNullable<SessionMeta['capacityRetry']>
  now: number
  onCancel: () => void
}) {
  const { locale } = useI18n(), text = copy[locale]
  const seconds = Math.max(0, Math.ceil((state.retryAt - now) / 1000))
  return <div data-agent-capacity-retry className="flex shrink-0 items-center gap-2 border-t border-edge px-3 py-1 text-xs text-ink-secondary">
    <div role="status" className="min-w-0 flex-1 leading-5">
      {text.waiting} · <span aria-live="off">{text.countdown(seconds)}</span> <span className="tabular-nums">({state.attempt}/{state.maxRetries})</span>
    </div>
    <button type="button" aria-label={text.cancel} data-tip={text.cancel} onClick={onCancel}
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded hover:bg-surface-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-8 pointer-coarse:w-8">
      <Xmark width={14} height={14} aria-hidden="true" />
    </button>
  </div>
}
