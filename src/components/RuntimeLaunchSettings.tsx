import { useId, useState } from 'react'
import { Plus, Trash } from 'iconoir-react'
import { uiText } from '@mew/ui/i18n-core'
import type { RuntimeSettingInput, RuntimeSettingView } from '../api/client'

type EnvRow = { id: number; key: string; value: string; originalKey?: string }
const field = 'min-w-0 w-full rounded-md border border-edge bg-surface px-2.5 py-2 font-mono text-xs text-ink placeholder:text-ink-muted'
const fieldLabel = 'mb-1.5 block text-xs font-medium text-ink-secondary'
const iconButton = 'grid size-8 shrink-0 place-items-center rounded-md text-ink-secondary hover:bg-surface-hover hover:text-ink'

export function RuntimeLaunchSettings({ runtimeId, settings, busy, onSave }: {
  runtimeId: string
  settings: RuntimeSettingView | null
  busy: boolean
  onSave: (settings: RuntimeSettingInput) => void
}) {
  const id = useId()
  const [cmd, setCmd] = useState(settings?.cmd ?? '')
  const [args, setArgs] = useState((settings?.extraArgs ?? []).join(' '))
  const [rows, setRows] = useState<EnvRow[]>(() => Object.entries(settings?.env ?? {}).map(([key, value], i) => ({ id: i, key, value, originalKey: key })))
  const hasCommand = runtimeId !== 'antigravity'
  const hasArgs = hasCommand && runtimeId !== 'claude'
  const commandLabel = runtimeId === 'claude' ? uiText('Claude CLI 실행 파일') : runtimeId === 'codex' ? uiText('Codex 연결 프로그램 실행 파일') : uiText('실행 파일')
  const extraArgs = args.split(' ').filter(Boolean)
  const env = Object.fromEntries(rows.filter(row => row.key.trim() && row.value.trim() && !row.value.startsWith('****')).map(row => [row.key.trim(), row.value.trim()]))
  const removed = Object.keys(settings?.env ?? {}).filter(key => !rows.some(row => row.originalKey === key) && !Object.hasOwn(env, key))
  const changed = (hasCommand && cmd.trim() !== (settings?.cmd ?? '')) ||
    (hasArgs && extraArgs.join(' ') !== (settings?.extraArgs ?? []).join(' ')) || Object.keys(env).length > 0 || removed.length > 0

  function updateRow(id: number, patch: Partial<EnvRow>) {
    setRows(prev => prev.map(row => row.id === id ? { ...row, ...patch } : row))
  }

  return <form className="flex min-h-0 flex-col" onSubmit={event => {
    event.preventDefault()
    if (!changed || busy) return
    onSave({
      ...(hasCommand && { cmd: cmd.trim() || null }),
      ...(hasArgs && { extraArgs }),
      ...(Object.keys(env).length > 0 && { env }),
      ...(removed.length > 0 && { removeEnv: removed }),
    })
  }}>
    <fieldset disabled={busy} className="min-h-0 min-w-0 space-y-4 overflow-y-auto px-4 py-4">
      {hasCommand && <div>
        <label htmlFor={id + '-command'} className={fieldLabel}>{commandLabel}</label>
        <input id={id + '-command'} value={cmd} onChange={event => setCmd(event.target.value)} placeholder={uiText('기본값 사용')} className={field} spellCheck={false} />
      </div>}
      {hasArgs && <div>
        <label htmlFor={id + '-args'} className={fieldLabel}>{uiText('추가 인자')}</label>
        <input id={id + '-args'} value={args} onChange={event => setArgs(event.target.value)} placeholder={uiText('공백으로 구분')} className={field} spellCheck={false} />
      </div>}
      {runtimeId === 'antigravity' && <p className="text-xs leading-relaxed text-ink-secondary">{uiText('Google 공식 ACP 서버를 사용합니다. Google 계정은 로그인 화면에서 연결하고, API 키는 아래 GEMINI_API_KEY 환경 변수로 설정하세요. 환경 변경은 새 탭부터 적용됩니다.')}</p>}
      {runtimeId === 'claude' && <p className="text-xs text-ink-secondary">{uiText('모델과 권한은 채팅 화면에서 선택합니다. 이전 터미널의 추가 인자는 적용되지 않습니다.')}</p>}
      <div className={hasCommand ? 'border-t border-edge pt-2' : ''}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-medium text-ink-secondary">{uiText('환경 변수 (API 키·엔드포인트)')}</h3>
          <button type="button" className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-md px-2 text-xs text-accent hover:bg-surface-hover" onClick={() => setRows(prev => [...prev, { id: (prev.at(-1)?.id ?? -1) + 1, key: '', value: '' }])}>
            <Plus aria-hidden width={14} height={14} />{uiText('추가')}
          </button>
        </div>
        <div className="space-y-1.5">
          {rows.map(row => <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-1.5">
            <input aria-label={uiText('환경 변수 이름')} value={row.key} readOnly={!!row.originalKey} required={!!row.value.trim()}
              onChange={event => updateRow(row.id, { key: event.target.value.toUpperCase() })} placeholder="KEY" className={field} spellCheck={false} />
            <input aria-label={uiText('환경 변수 값')} value={row.value} required={!!row.key.trim()}
              onChange={event => updateRow(row.id, { value: event.target.value })} placeholder={uiText('값')} type={row.value.startsWith('****') ? 'text' : 'password'} className={field} autoComplete="off" />
            <button type="button" className={iconButton} aria-label={uiText('줄 삭제')} data-tip={uiText('줄 삭제')} onClick={() => setRows(prev => prev.filter(item => item.id !== row.id))}><Trash aria-hidden width={15} height={15} /></button>
          </div>)}
        </div>
        {rows.some(row => row.originalKey && row.value.startsWith('****')) && <p className="mt-2 text-xs text-ink-muted">{uiText('키를 변경하려면 전체 값을 입력하세요.')}</p>}
      </div>
    </fieldset>
    <div className="flex shrink-0 items-center justify-between gap-2 border-t border-edge px-4 py-2.5">
      <span className="text-xs text-ink-secondary">{uiText('새 세션부터 적용')}</span>
      <button type="submit" disabled={!changed || busy} className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-ink-on-accent hover:bg-accent-strong disabled:opacity-40">{busy ? uiText('저장 중…') : uiText('저장')}</button>
    </div>
  </form>
}
