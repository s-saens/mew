import { useEffect, useId, useState } from 'react'
import { SelectField } from '@mew/ui'
import { useI18n } from '../i18n'
import { AGENT_BUILD_COMMAND_MAX_LENGTH, agentBuildVerificationValidationError, defaultAgentBuildVerificationSettings, type AgentBuildVerificationSettings, type AgentBuildVerificationSnapshot } from '../../shared/agent-build-verification'
import { GuidanceRow } from './agent-guidance-row'

const copy = {
  ko: { title: '빌드 검증', required: '필수 실행', project: '프로젝트 지침에 따름', custom: '직접 편집한 지침', customHint: '실행 방식을 선택하면 직접 편집한 빌드 지침을 바꿉니다.', details: '빌드 세부 설정', command: '빌드 명령어', automatic: '프로젝트 빌드 명령 자동 선택', scope: '실행 대상', implementation: '구현 변경 후', all: '모든 변경 후', failure: '빌드 실패 시', fix: '수정 후 다시 빌드', report: '실패 보고', invalid: '빌드 명령어는 제어 문자나 지침 구간 표시 없이 한 줄로 입력하세요 (최대 1,000자).' },
  en: { title: 'Build verification', required: 'Required', project: 'Follow project instructions', custom: 'Custom instructions', customHint: 'Selecting a mode replaces the custom build instructions.', details: 'Build details', command: 'Build command', automatic: 'Use the project build command', scope: 'Run after', implementation: 'Implementation changes', all: 'All changes', failure: 'On build failure', fix: 'Fix and rebuild', report: 'Report failure', invalid: 'Use a single-line build command without control characters or instruction markers (up to 1,000 characters).' },
  ja: { title: 'ビルド検証', required: '必須', project: 'プロジェクトの指針に従う', custom: '直接編集した指針', customHint: '実行方法を選ぶと、直接編集したビルド指針が置き換わります。', details: 'ビルドの詳細設定', command: 'ビルドコマンド', automatic: 'プロジェクトのビルドコマンドを使用', scope: '実行対象', implementation: '実装の変更後', all: 'すべての変更後', failure: 'ビルド失敗時', fix: '修正して再ビルド', report: '失敗を報告', invalid: '制御文字や指針の区切りを含まない1行のビルドコマンドを入力してください（最大1,000文字）。' },
  'zh-CN': { title: '构建验证', required: '必须执行', project: '遵循项目指引', custom: '自定义指引', customHint: '选择执行方式将替换自定义构建指引。', details: '构建详细设置', command: '构建命令', automatic: '使用项目构建命令', scope: '执行范围', implementation: '实现变更后', all: '所有变更后', failure: '构建失败时', fix: '修复并重新构建', report: '报告失败', invalid: '请输入不含控制字符或指引区段标记的单行构建命令（最多 1,000 个字符）。' },
}
const inputClass = 'min-h-8 w-full min-w-0 rounded border border-edge-strong bg-surface px-2.5 text-xs text-ink placeholder:text-ink-secondary focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-60 pointer-coarse:min-h-9'

export function AgentBuildVerificationFields({ buildVerification, disabled, saveBlocked = false, portalContainer, onSave, onDirtyChange, onEdit }: { buildVerification: AgentBuildVerificationSnapshot; disabled: boolean; saveBlocked?: boolean; portalContainer?: HTMLElement | null; onSave: (value: AgentBuildVerificationSettings) => void; onDirtyChange: (dirty: boolean) => void; onEdit?: () => void }) {
  const { locale } = useI18n(), text = copy[locale]
  const id = useId()
  const [draft, setDraft] = useState(buildVerification.value)
  const [custom, setCustom] = useState(buildVerification.custom)
  const [invalid, setInvalid] = useState(false)
  const saved = JSON.stringify(buildVerification)
  const [baseline, setBaseline] = useState(saved)
  if (baseline !== saved) {
    setBaseline(saved)
    setDraft(buildVerification.value); setCustom(buildVerification.custom); setInvalid(false)
  }
  const dirty = !custom && (buildVerification.custom || JSON.stringify(draft) !== JSON.stringify(buildVerification.value))
  useEffect(() => { onDirtyChange(dirty) }, [dirty, onDirtyChange])
  useEffect(() => {
    if (disabled || saveBlocked || !dirty) return
    const timer = window.setTimeout(() => {
      if (agentBuildVerificationValidationError(draft)) { setInvalid(true); return }
      onSave(draft)
    }, 400)
    return () => window.clearTimeout(timer)
  }, [draft, dirty, disabled, saveBlocked, onSave])
  const change = (value: Partial<AgentBuildVerificationSettings>) => { setDraft(current => ({ ...current, ...value })); setInvalid(false); onEdit?.() }
  const detailsDisabled = disabled || custom || draft.mode !== 'required'
  return <div>
    <GuidanceRow label={text.title} hint={custom ? text.customHint : undefined}>
      <SelectField compact portalContainer={portalContainer} label={text.title} value={custom ? 'custom' : draft.mode} disabled={disabled} onChange={mode => {
        const valid = custom ? defaultAgentBuildVerificationSettings : agentBuildVerificationValidationError(draft) ? buildVerification.value : draft
        setDraft({ ...valid, mode: mode as AgentBuildVerificationSettings['mode'] })
        setCustom(false); setInvalid(false); onEdit?.()
      }} options={[
        ...(custom ? [{ value: 'custom', label: text.custom, disabled: true }] : []),
        { value: 'required', label: text.required }, { value: 'project', label: text.project },
      ]} />
    </GuidanceRow>
    <details className="mt-1">
      <summary tabIndex={disabled ? -1 : 0} aria-disabled={disabled || undefined} onClick={event => { if (disabled) event.preventDefault() }} className="min-h-8 cursor-pointer content-center rounded text-xs text-ink-secondary hover:text-ink focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-9">{text.details}</summary>
      <div className="pb-1 pt-1">
        <GuidanceRow label={text.command} inputId={`${id}-command`}><input id={`${id}-command`} className={inputClass} value={draft.command} placeholder={text.automatic} maxLength={AGENT_BUILD_COMMAND_MAX_LENGTH} disabled={detailsDisabled} autoComplete="off" spellCheck={false} aria-invalid={invalid || undefined} aria-describedby={invalid ? `${id}-error` : undefined} onChange={event => change({ command: event.target.value })} /></GuidanceRow>
        <GuidanceRow label={text.scope}><SelectField compact portalContainer={portalContainer} label={text.scope} value={draft.scope} disabled={detailsDisabled} onChange={scope => change({ scope: scope as AgentBuildVerificationSettings['scope'] })} options={[{ value: 'implementation', label: text.implementation }, { value: 'all', label: text.all }]} /></GuidanceRow>
        <GuidanceRow label={text.failure}><SelectField compact portalContainer={portalContainer} label={text.failure} value={draft.fixFailures ? 'fix' : 'report'} disabled={detailsDisabled} onChange={failure => change({ fixFailures: failure === 'fix' })} options={[{ value: 'fix', label: text.fix }, { value: 'report', label: text.report }]} /></GuidanceRow>
        {invalid && <p id={`${id}-error`} role="alert" className="mt-1 text-xs text-danger">{text.invalid}</p>}
      </div>
    </details>
  </div>
}
