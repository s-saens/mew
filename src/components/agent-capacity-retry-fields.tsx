import { useId, useState } from 'react'
import { useI18n } from '../i18n'
import { agentCapacityRetryValidationError, type AgentCapacityRetrySettings } from '../../shared/agent-capacity-retry'
import { GuidanceRow } from './agent-guidance-row'

const capacityRetryCopy = {
  ko: { title: '모델 혼잡 시 자동 재시도', delay: '재시도 간격 (초)', attempts: '최대 재시도 횟수', disabled: '0이면 자동으로 재시도하지 않습니다.', save: '재시도 설정 저장', invalid: '간격은 1~3,600초, 횟수는 0~100 사이의 정수로 입력하세요.' },
  en: { title: 'Retry when the model is at capacity', delay: 'Retry interval (seconds)', attempts: 'Maximum retries', disabled: 'Set to 0 to disable automatic retries.', save: 'Save retry settings', invalid: 'Use whole numbers: 1–3,600 seconds and 0–100 retries.' },
  ja: { title: 'モデル混雑時に自動再試行', delay: '再試行の間隔（秒）', attempts: '再試行の上限回数', disabled: '0にすると自動再試行しません。', save: '再試行設定を保存', invalid: '間隔は1〜3,600秒、回数は0〜100の整数で入力してください。' },
  'zh-CN': { title: '模型繁忙时自动重试', delay: '重试间隔（秒）', attempts: '最大重试次数', disabled: '设为 0 时不自动重试。', save: '保存重试设置', invalid: '请输入整数：间隔为 1–3,600 秒，次数为 0–100。' },
}

export type CapacityRetryDraft = { delaySeconds: string; maxRetries: string }
const inputClass = 'min-h-8 w-full min-w-0 rounded border border-edge-strong bg-surface px-2.5 text-xs tabular-nums text-ink focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-60 pointer-coarse:min-h-9'

export function AgentCapacityRetryFields({ draft, dirty, disabled, onChange, onSave }: { draft: CapacityRetryDraft; dirty: boolean; disabled: boolean; onChange: (value: CapacityRetryDraft) => void; onSave: (value: AgentCapacityRetrySettings) => void }) {
  const { locale } = useI18n(), text = capacityRetryCopy[locale]
  const id = useId()
  const [invalid, setInvalid] = useState(false)
  const change = (value: Partial<CapacityRetryDraft>) => { onChange({ ...draft, ...value }); setInvalid(false) }
  return <form className="mt-2 border-t border-edge pt-2" aria-label={text.title} onSubmit={event => {
    event.preventDefault()
    if (disabled || !dirty) return
    const value = { delaySeconds: Number(draft.delaySeconds), maxRetries: Number(draft.maxRetries) }
    if (!draft.delaySeconds.trim() || !draft.maxRetries.trim() || agentCapacityRetryValidationError(value)) { setInvalid(true); return }
    onSave(value)
  }}>
    <h4 className="mb-1 text-xs font-semibold">{text.title}</h4>
    <GuidanceRow label={text.delay} inputId={`${id}-delay`}><input id={`${id}-delay`} type="number" inputMode="numeric" min={1} max={3600} step={1} required className={inputClass} value={draft.delaySeconds} disabled={disabled} onChange={event => change({ delaySeconds: event.target.value })} /></GuidanceRow>
    <GuidanceRow label={text.attempts} inputId={`${id}-attempts`} hint={text.disabled}><input id={`${id}-attempts`} type="number" inputMode="numeric" min={0} max={100} step={1} required className={inputClass} value={draft.maxRetries} disabled={disabled} onChange={event => change({ maxRetries: event.target.value })} /></GuidanceRow>
    {invalid && <p role="alert" className="mt-1 text-xs text-danger">{text.invalid}</p>}
    <div className="mt-1 flex justify-end"><button type="submit" disabled={disabled || !dirty} className="min-h-8 rounded border border-edge-strong px-2.5 text-xs text-ink hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40 pointer-coarse:min-h-9">{text.save}</button></div>
  </form>
}
