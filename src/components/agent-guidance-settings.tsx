import { mewFetch } from '../utils/remote-transport.ts'
import { useEffect, useId, useRef, useState } from 'react'
import { Settings, Xmark, PageEdit, RefreshDouble, Globe, Folder } from 'iconoir-react'
import { ConfirmDialog, DialogFrame, HoverTipLayer, SelectField } from '@mew/ui'
import { useI18n } from '../i18n'
import { documentationGuidanceKeys, guidanceOptions, type GuidanceKey, type GuidanceSnapshot } from '../../shared/agent-guidance'
import type { BranchGuidanceSettings } from '../../shared/branch-guidance'
import { BranchGuidanceFields } from './agent-branch-guidance'
import { GuidanceRow } from './agent-guidance-row'
import { guidanceScopeCopy } from './agent-guidance-scope-copy'
import { documentationGuidanceCopy } from './agent-documentation-guidance-copy'
import { fetchProjectSetup, saveProjectGuidance } from '../api/project-setup'
import type { ProjectGuidanceSnapshot } from '../../shared/project-agent-context'
import './agent-guidance-settings.css'

const copy = {
  ko: { title: '에이전트 기본 지침', scope: '모든 프로젝트에 공통으로 적용됩니다. 변경 내용은 다음 요청부터 반영됩니다.', file: '파일 보기', close: '닫기', reload: '다시 불러오기', loading: '불러오는 중…', saving: '저장 중…', saved: '저장했습니다.', error: '지침을 불러오지 못했습니다. 다시 시도하세요.', custom: '직접 편집한 지침', inherit: '별도 지정 안 함', commit: '커밋 방식', commitLanguage: '커밋 언어', agent: '에이전트 응답 설정 따르기', always: '매 변경 완료 후 커밋', requested: '요청할 때만 커밋', mew: 'mew 언어 설정에 따름', language: '응답 언어', testing: '테스트 작성', required: '필수 작성', project: '프로젝트 지침에 따름', debugger: '디버거 활용', enabled: '활성화', disabled: '비활성화', subagents: '서브에이전트 위임', automatic: '필요할 때 자동 위임', explicit: '요청할 때만 위임', never: '사용 안 함', detail: '답변 길이', concise: '간결하게', detailed: '자세하게', customHint: '직접 편집한 항목에서 다른 값을 선택하면 해당 지침을 바꿉니다.' },
  en: { title: 'Agent instructions', scope: 'Shared by all projects. Changes apply from the next request.', file: 'View file', close: 'Close', reload: 'Reload', loading: 'Loading…', saving: 'Saving…', saved: 'Saved.', error: 'Could not load instructions. Try again.', custom: 'Custom instructions', inherit: 'Not specified', commit: 'Git commits', commitLanguage: 'Commit language', agent: 'Follow agent response settings', always: 'Commit after each completed change', requested: 'Commit only when requested', mew: 'Follow mew language settings', language: 'Response language', testing: 'Test writing', required: 'Required', project: 'Follow project instructions', debugger: 'Debugger use', enabled: 'Enabled', disabled: 'Disabled', subagents: 'Subagent delegation', automatic: 'Delegate when useful', explicit: 'Delegate only when requested', never: 'Do not use', detail: 'Response length', concise: 'Concise', detailed: 'Detailed', customHint: 'Choosing another value replaces the custom instructions for that setting.' },
  ja: { title: 'エージェントの基本指針', scope: 'すべてのプロジェクトに共通です。変更は次のリクエストから適用されます。', file: 'ファイルを表示', close: '閉じる', reload: '再読み込み', loading: '読み込み中…', saving: '保存中…', saved: '保存しました。', error: '指針を読み込めませんでした。再試行してください。', custom: '直接編集した指針', inherit: '指定なし', commit: 'コミット方法', commitLanguage: 'コミット言語', agent: 'エージェントの応答設定に従う', always: '変更完了ごとにコミット', requested: '依頼時のみコミット', mew: 'mewの言語設定に従う', language: '応答言語', testing: 'テスト作成', required: '必須', project: 'プロジェクトの指針に従う', debugger: 'デバッガーの活用', enabled: '有効', disabled: '無効', subagents: 'サブエージェントへの委任', automatic: '必要に応じて自動で委任', explicit: '依頼時のみ委任', never: '使用しない', detail: '回答の長さ', concise: '簡潔に', detailed: '詳しく', customHint: '別の値を選ぶと、その項目の直接編集した指針が置き換わります。' },
  'zh-CN': { title: '代理默认指引', scope: '适用于所有项目。更改从下一次请求开始生效。', file: '查看文件', close: '关闭', reload: '重新加载', loading: '加载中…', saving: '保存中…', saved: '已保存。', error: '无法加载指引，请重试。', custom: '自定义指引', inherit: '不指定', commit: '提交方式', commitLanguage: '提交语言', agent: '跟随代理回复设置', always: '每次完成更改后提交', requested: '仅在请求时提交', mew: '跟随 mew 语言设置', language: '回复语言', testing: '测试编写', required: '必须编写', project: '遵循项目指引', debugger: '调试器使用', enabled: '启用', disabled: '禁用', subagents: '子代理委派', automatic: '需要时自动委派', explicit: '仅在请求时委派', never: '不使用', detail: '回复长度', concise: '简洁', detailed: '详细', customHint: '选择其他值将替换该项的自定义指引。' },
}
const button = 'inline-flex min-h-7 shrink-0 items-center justify-center gap-1.5 rounded px-2 text-xs text-ink-secondary hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40 pointer-coarse:min-h-9'
const generalCopy = { ko: '일반', en: 'General', ja: '一般', 'zh-CN': '常规' }
const documentationKeys = new Set<GuidanceKey>(documentationGuidanceKeys)
const managedCommitCopy = {
  ko: '자동 처리에 커밋이 포함됩니다. 수동 모드에서 바꿀 수 있습니다.',
  en: 'Automation includes commits. Change this setting in manual mode.',
  ja: '自動処理にコミットを含みます。手動モードで変更できます。',
  'zh-CN': '自动处理包含提交，可在手动模式下更改此设置。',
}

async function request(init?: RequestInit): Promise<GuidanceSnapshot> {
  const response = await mewFetch('/api/fs/agent-guidance', { cache: 'no-store', ...init })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`)
  return body
}

export function AgentGuidanceButton({ onOpenFile, workspacePath }: { onOpenFile: (path: string) => void; workspacePath?: string | null }) {
  const { locale } = useI18n(), text = copy[locale]
  const [open, setOpen] = useState(false)
  return <>
    <button type="button" aria-label={text.title} title={text.title} data-tip={text.title} onClick={() => setOpen(true)} className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-ink-secondary hover:bg-surface-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"><Settings width={14} height={14} aria-hidden /></button>
    {open && <AgentGuidanceSettings key={workspacePath} workspacePath={workspacePath} onClose={() => setOpen(false)} onOpenFile={onOpenFile} />}
  </>
}

export function AgentGuidanceSettings({ onClose, onOpenFile, workspacePath }: { onClose: () => void; onOpenFile: (path: string) => void; workspacePath?: string | null }) {
  const { locale } = useI18n(), text = copy[locale], scopeText = guidanceScopeCopy[locale], docText = documentationGuidanceCopy[locale]
  const titleId = useId()
  const [data, setData] = useState<GuidanceSnapshot | null>(null)
  const [scope, setScope] = useState<'global' | 'project'>('global')
  const [globalDraft, setGlobalDraft] = useState('')
  const [projectData, setProjectData] = useState<ProjectGuidanceSnapshot | null>(null)
  const [projectDraft, setProjectDraft] = useState(''), [projectEnabled, setProjectEnabled] = useState(true)
  const [discardAction, setDiscardAction] = useState<(() => void) | null>(null)
  const [reloadVersion, setReloadVersion] = useState(0)
  const [busy, setBusy] = useState(true), [saving, setSaving] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [panel, setPanel] = useState<HTMLDivElement | null>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const pending = useRef(false), generation = useRef(0)
  const restoreFocus = useRef<HTMLElement | null>(null)
  const parkFocus = () => {
    const focused = document.activeElement
    if (focused instanceof HTMLElement && panel?.contains(focused) && focused !== closeButton.current) {
      restoreFocus.current = focused
      closeButton.current?.focus()
    }
  }
  useEffect(() => {
    if (busy) return
    const previous = restoreFocus.current
    restoreFocus.current = null
    if (document.activeElement === closeButton.current && previous?.isConnected && !previous.matches(':disabled')) previous.focus()
  }, [busy])
  const globalDirty = !!data && globalDraft !== (data.instructions ?? '')
  const projectDirty = !!projectData && (projectDraft !== projectData.settings.instructions || projectEnabled !== projectData.settings.enabled)
  const guard = (action: () => void) => { if (!pending.current) { if (globalDirty || projectDirty) setDiscardAction(() => action); else action() } }
  const close = () => guard(onClose)
  const load = async (target = scope) => {
    const version = ++generation.current
    parkFocus()
    setBusy(true); setError(''); setNotice('')
    try {
      if (target === 'project') {
        const next = await fetchProjectSetup()
        if (workspacePath && next.projectRoot !== workspacePath) throw new Error(scopeText.changed)
        if (generation.current === version) { setProjectData(next); setProjectDraft(next.settings.instructions); setProjectEnabled(next.settings.enabled) }
      } else {
        const next = await request()
        if (generation.current === version) {
          setData(next); setGlobalDraft(next.instructions ?? '')
          setReloadVersion(current => current + 1)
          window.dispatchEvent(new CustomEvent('mew:external-file-updated', { detail: { path: next.path, content: next.content } }))
        }
      }
    }
    catch (cause) { if (generation.current === version) setError(`${text.error} ${cause instanceof Error ? cause.message : ''}`) }
    finally { if (generation.current === version) setBusy(false) }
  }
  useEffect(() => {
    void load()
    const requests = generation
    return () => { requests.current++ }
    // Read current account guidance on every open; project guidance loads on selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  async function update(key: GuidanceKey | 'branch' | 'instructions', value: string | BranchGuidanceSettings) {
    if (!data || pending.current || busy) return
    pending.current = true
    parkFocus()
    setBusy(true); setSaving(true); setError(''); setNotice('')
    const version = ++generation.current
    try {
      const next = await request({ method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, value, revision: data.revision }) })
      window.dispatchEvent(new CustomEvent('mew:external-file-updated', { detail: { path: next.path, content: next.content } }))
      if (generation.current === version) { setData(next); if (key === 'instructions') setGlobalDraft(next.instructions ?? ''); setNotice(text.saved) }
    } catch (cause) { if (generation.current === version) setError(cause instanceof Error ? cause.message : text.error) }
    finally { pending.current = false; if (generation.current === version) { setBusy(false); setSaving(false) } }
  }
  const selectScope = (next: 'global' | 'project') => {
    if (pending.current || busy || next === scope) return
    setScope(next); setError(''); setNotice('')
    if ((next === 'project' && !projectData) || (next === 'global' && !data)) void load(next)
  }
  const saveProject = async () => {
    if (!projectData || pending.current || busy) return
    pending.current = true
    parkFocus(); setBusy(true); setSaving(true); setError(''); setNotice('')
    const version = ++generation.current
    try {
      const next = await saveProjectGuidance({ projectRoot: projectData.projectRoot, revision: projectData.revision, instructions: projectDraft, enabled: projectEnabled })
      if (generation.current === version) { setProjectData(next); setProjectDraft(next.settings.instructions); setProjectEnabled(next.settings.enabled); setNotice(text.saved) }
    } catch (cause) { if (generation.current === version) setError(cause instanceof Error ? cause.message : text.error) }
    finally { pending.current = false; if (generation.current === version) { setBusy(false); setSaving(false) } }
  }
  const labels: Record<string, string> = { ...text, ko: '한국어', en: 'English', ja: '日本語', zh: '简体中文' }
  const managedCommit = data && data.settings.commit !== 'custom' && !data.branch.custom && data.branch.value.strategy !== 'inherit' && data.branch.value.workflow !== 'manual'
  const settingLabels: Record<GuidanceKey, string> = { ...text, ...docText }
  const guidanceField = (key: GuidanceKey) => data && <GuidanceRow key={key} label={settingLabels[key]} hint={key === 'commit' && (managedCommit ? managedCommitCopy[locale] : data.settings.commit === 'custom' ? text.customHint : undefined)}>
    <SelectField compact portalContainer={panel} popupWidth={key === 'commitLanguage' ? 280 : undefined} label={settingLabels[key]} value={data.settings[key]} disabled={busy || !!error || (key === 'commit' && !!managedCommit)} onChange={value => void update(key, value)}
      options={[
        ...(data.settings[key] === 'custom' ? [{ value: 'custom', label: text.custom, disabled: true }] : []),
        ...Object.keys(guidanceOptions[key]).map(value => ({ value, label: value === 'required' && documentationKeys.has(key) ? docText.required : labels[value] })),
      ]} />
  </GuidanceRow>
  return <DialogFrame labelledBy={titleId} onClose={close} busy={saving} size="settings" className="agent-guidance-dialog flex flex-col text-ink">
    <div ref={setPanel} data-cmd-overlay className="flex min-h-0 flex-1 flex-col">
      <HoverTipLayer className="contents" portalTarget={panel}>
        <header className="agent-guidance-header">
          <h2 id={titleId} className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-xs font-semibold"><Settings width={14} height={14} aria-hidden />{text.title}</h2>
          <button ref={closeButton} type="button" className="agent-guidance-close" aria-label={text.close} data-tip={text.close} aria-disabled={saving} onClick={close}><Xmark width={14} height={14} aria-hidden /></button>
        </header>
        <div className="agent-guidance-body">
          <nav className="agent-guidance-nav" aria-label={scopeText.scope}>
            <button type="button" aria-pressed={scope === 'global'} disabled={busy} onClick={() => selectScope('global')}><Globe width={14} height={14} aria-hidden />{scopeText.global}</button>
            <button type="button" aria-pressed={scope === 'project'} disabled={busy || !workspacePath} onClick={() => selectScope('project')}><Folder width={14} height={14} aria-hidden />{scopeText.project}</button>
          </nav>
          <div className="agent-guidance-content" aria-busy={busy}>
          <p className="mb-2 text-xs leading-5 text-ink-secondary">{scope === 'global' ? scopeText.globalHint : scopeText.projectHint}</p>
          <div hidden={scope !== 'global'}>
          {data && <section role="group" aria-label={generalCopy[locale]}>
            <h3 className="mb-1 text-xs font-semibold">{generalCopy[locale]}</h3>
            {(Object.keys(guidanceOptions) as GuidanceKey[]).filter(key => key !== 'commit' && key !== 'commitLanguage' && !documentationKeys.has(key)).map(guidanceField)}
          </section>}
          {data && Object.entries(data.settings).some(([key, value]) => key !== 'commit' && key !== 'commitLanguage' && !documentationKeys.has(key as GuidanceKey) && value === 'custom') && <p className="mt-1 text-xs leading-4 text-ink-secondary">{text.customHint}</p>}
          {data && <section role="group" aria-label="Git" className="mt-2 border-t border-edge pt-2">
            <h3 className="mb-1 text-xs font-semibold">Git</h3>
            <BranchGuidanceFields key={reloadVersion} branch={data.branch} disabled={busy || !!error} portalContainer={panel} onSave={value => void update('branch', value)} commitField={<>{guidanceField('commit')}{guidanceField('commitLanguage')}</>} />
          </section>}
          {data && <details className="agent-guidance-extra"><summary>{docText.title}</summary>
            <section role="group" aria-label={docText.title}>{documentationGuidanceKeys.map(guidanceField)}</section>
            {documentationGuidanceKeys.some(key => data.settings[key] === 'custom') && <p className="mt-1 text-xs leading-4 text-ink-secondary">{text.customHint}</p>}
          </details>}
          {data && <details className="agent-guidance-extra"><summary>{scopeText.instructions}</summary>
            <textarea aria-label={`${scopeText.global} ${scopeText.instructions}`} className="agent-guidance-text" rows={5} maxLength={8000} disabled={busy} value={globalDraft} onChange={event => { setGlobalDraft(event.target.value); setNotice('') }} />
            <div className="mt-1 flex justify-end"><button type="button" className={button} disabled={busy || !globalDirty} onClick={() => void update('instructions', globalDraft)}>{scopeText.save}</button></div>
          </details>}
          </div>
          {scope === 'project' && projectData && <section aria-label={scopeText.project}>
            <p className="mb-2 truncate text-xs text-ink-secondary" title={projectData.projectRoot}>{projectData.projectRoot.split('/').filter(Boolean).at(-1)}</p>
            <label className="mb-2 flex min-h-8 items-center gap-2 text-xs text-ink"><input type="checkbox" className="accent-accent" checked={projectEnabled} disabled={busy} onChange={event => { setProjectEnabled(event.target.checked); setNotice('') }} />{scopeText.enabled}</label>
            {!projectEnabled && <p className="mb-2 text-xs leading-5 text-ink-secondary">{scopeText.disabled}</p>}
            <label className="mb-1 block text-xs font-medium" htmlFor={`${titleId}-project-instructions`}>{scopeText.instructions}</label>
            <textarea id={`${titleId}-project-instructions`} aria-label={`${scopeText.project} ${scopeText.instructions}`} className="agent-guidance-text" rows={9} maxLength={8000} disabled={busy} value={projectDraft} onChange={event => { setProjectDraft(event.target.value); setNotice('') }} />
          </section>}
          {error && <p role="alert" className="mt-2 select-text text-sm text-danger">{error}</p>}
          </div>
        </div>
        <footer className="flex shrink-0 items-center gap-2 border-t border-edge px-3 py-1.5">
          {scope === 'global' ? <button type="button" className={button} disabled={busy || !data} onClick={() => { if (data) guard(() => { onClose(); onOpenFile(data.path) }) }}><PageEdit width={14} height={14} aria-hidden />{text.file}</button>
            : <button type="button" className={`${button} agent-guidance-save`} disabled={busy || !projectDirty} onClick={() => void saveProject()}>{scopeText.save}</button>}
          <p role="status" className="min-w-0 flex-1 text-right text-xs text-ink-secondary">{busy ? saving ? text.saving : text.loading : notice}</p>
          <button type="button" className="agent-guidance-close" aria-label={text.reload} data-tip={text.reload} disabled={busy} onClick={() => guard(() => void load())}><RefreshDouble width={14} height={14} aria-hidden /></button>
        </footer>
      </HoverTipLayer>
      {discardAction && <ConfirmDialog message={scopeText.unsaved} confirmLabel={scopeText.discard} cancelLabel={scopeText.cancel} danger onCancel={() => setDiscardAction(null)} onConfirm={() => { const action = discardAction; setDiscardAction(null); action() }} />}
    </div>
  </DialogFrame>
}
