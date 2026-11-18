import { useEffect, useId, useState, type KeyboardEvent } from 'react'
import { Restart, Settings, Terminal, Trash, Xmark } from 'iconoir-react'
import { ConfirmDialog, DialogFrame, HoverTipLayer } from '@mew/ui'
import { uiText } from '@mew/ui/i18n-core'
import { useUiLocale } from '@mew/ui/i18n'
import { useWorkspaceApi } from '../api/workspace-api-context'
import type { AgentRuntimeStatus, RuntimeSettingInput, RuntimeSettingView } from '../api/client'
import { SUBSCRIPTION_URLS } from '../../shared/agent-access'
import { useRuntimeInstall } from '../hooks/use-runtime-install'
import { subscribeAgentRuntimes, updateAgentRuntimesCache } from '../utils/agentPickerCache'
import { AgentAccountCard } from './AgentAccountCard'
import { RUNTIMES } from './agentRuntimes'
import { RuntimeInstallAction } from './RuntimeInstallProgress'
import { RuntimeLaunchSettings } from './RuntimeLaunchSettings'

const iconButton = 'grid size-8 shrink-0 place-items-center rounded-md text-ink-secondary hover:bg-surface-hover hover:text-ink disabled:opacity-40'
const button = 'rounded-md border border-edge px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-hover disabled:opacity-40'
const views = ['overview', 'advanced', 'management'] as const
type View = typeof views[number]
type Action = 'reset' | 'uninstall' | 'logout'

export function RuntimeSettingsButton({ runtimeId, label }: { runtimeId: string; label: string }) {
  useUiLocale()
  const [open, setOpen] = useState(false)
  const title = uiText('{p0} 설정', { p0: label })
  return <>
    <HoverTipLayer className="flex shrink-0">
      <button type="button" aria-haspopup="dialog" aria-label={title} data-tip={title}
        onClick={event => { event.stopPropagation(); setOpen(true) }}
        className="grid size-6 place-items-center rounded text-ink-muted hover:bg-surface-hover hover:text-ink">
        <Settings aria-hidden width={15} height={15} />
      </button>
    </HoverTipLayer>
    {open && <RuntimeSettingsModal key={runtimeId} runtimeId={runtimeId} label={label} onClose={() => setOpen(false)} />}
  </>
}

function RuntimeSettingsModal({ runtimeId, label, onClose }: { runtimeId: string; label: string; onClose: () => void }) {
  const api = useWorkspaceApi()
  useUiLocale()
  const id = useId()
  const [view, setView] = useState<View>('overview')
  const [settings, setSettings] = useState<RuntimeSettingView | null>()
  const [settingsError, setSettingsError] = useState<string | null>(null)
  const [runtime, setRuntime] = useState<AgentRuntimeStatus | null>(null)
  const [runtimeLoadFailed, setRuntimeLoadFailed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<Action | null>(null)
  const [accountRevision, setAccountRevision] = useState(0)
  const installation = useRuntimeInstall()
  const installing = installation.installing === runtimeId || runtime?.installing
  const actionsDisabled = busy || !!installing
  const Glyph = RUNTIMES.find(item => item.id === runtimeId)?.Glyph ?? Terminal
  const title = uiText('{p0} 설정', { p0: label })
  const tabs = { overview: uiText('개요'), advanced: uiText('고급 실행 설정'), management: uiText('관리') }

  useEffect(() => {
    let alive = true
    void api.fetchAgentRuntimeSetting(runtimeId)
      .then(({ settings }) => { if (alive) setSettings(settings) })
      .catch(err => { if (alive) setSettingsError(err instanceof Error ? err.message : String(err)) })
    return () => { alive = false }
  }, [api, runtimeId])

  useEffect(() => {
    let initial = true
    const accept = (items: AgentRuntimeStatus[]) => {
      const item = items.find(item => item.id === runtimeId)
      setRuntime(item ?? null)
      setRuntimeLoadFailed(!item)
    }
    const unsubscribe = subscribeAgentRuntimes(items => { initial = false; accept(items) })
    void api.fetchAgentRuntimes().then(({ runtimes }) => { if (initial) accept(runtimes) })
      .catch(() => { if (initial) setRuntimeLoadFailed(true) })
    return () => { initial = false; unsubscribe() }
  }, [api, runtimeId])

  const refreshRuntime = async () => updateAgentRuntimesCache((await api.fetchAgentRuntimes()).runtimes)
  async function perform(operation: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try { await operation() }
    catch (err) { setError(err instanceof Error ? err.message : String(err)) }
    finally { setBusy(false) }
  }
  function save(input: RuntimeSettingInput) {
    void perform(async () => {
      await api.saveAgentRuntimeSetting(runtimeId, input)
      void refreshRuntime().catch(() => {})
      onClose()
    })
  }
  function applyAction(action: Action) {
    setConfirm(null)
    void perform(async () => {
      switch (action) {
        case 'reset':
          await api.deleteAgentRuntimeSetting(runtimeId)
          void refreshRuntime().catch(() => {})
          onClose()
          break
        case 'uninstall':
          await api.uninstallAgentRuntime(runtimeId)
          await refreshRuntime()
          break
        case 'logout':
          await api.logoutAgentRuntime(runtimeId)
          setAccountRevision(value => value + 1)
          break
      }
    })
  }
  function login() {
    onClose()
    window.dispatchEvent(new CustomEvent('mew:open-agent-runtime', { detail: runtimeId }))
  }
  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const targets: Record<string, number> = { Home: 0, End: views.length - 1, ArrowRight: (index + 1) % views.length, ArrowLeft: (index + views.length - 1) % views.length }
    const target = targets[event.key]
    if (target === undefined) return
    event.preventDefault()
    setView(views[target])
    event.currentTarget.ownerDocument.getElementById(id + views[target])?.focus()
  }
  const installedLabel = (installed: boolean) => installed ? uiText('설치됨') : uiText('설치되지 않음')
  const status = installing ? uiText('설치 중…') : runtime ? installedLabel(runtime.installed) : runtimeLoadFailed ? uiText('확인 불가') : uiText('설치 상태 확인 중…')
  const connector = runtimeId === 'codex' || runtimeId === 'claude'
  const connectorPresent = runtime?.connectorInstalled ?? runtime?.installed
  const hasAccountInfo = Object.hasOwn(SUBSCRIPTION_URLS, runtimeId)
  const confirmCopy = {
    reset: { label: uiText('초기화'), message: uiText('{p0} 실행 설정을 초기화할까요?', { p0: label }), detail: uiText('저장한 실행 파일, 추가 인자와 환경 변수를 지웁니다. 모델 기본값과 공급자 로그인은 유지됩니다.') },
    uninstall: { label: uiText('삭제'), message: uiText('{p0}을 삭제할까요?', { p0: label }), detail: uiText('등록된 삭제 명령을 실행합니다. 계정과 Mew 실행 설정은 유지됩니다.') },
    logout: { label: uiText('로그아웃'), message: uiText('{p0}에서 로그아웃할까요?', { p0: label }), detail: undefined },
  }

  return <DialogFrame labelledBy={id} onClose={onClose} busy={busy} overlayClassName="justify-start!" className="mt-[max(0px,calc(50dvh-15rem))] flex max-h-[min(90dvh,40rem)] max-w-lg flex-col">
    <HoverTipLayer className="flex min-h-0 flex-col">
      <header className="flex shrink-0 items-center gap-2.5 px-4 pb-2 pt-4">
        <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-lg border border-edge bg-surface-raised text-ink [&>span]:size-5 [&_svg]:size-5"><Glyph /></span>
        <h2 id={id} className="min-w-0 flex-1 break-words text-base font-semibold text-ink">{title}</h2>
        <span role="status" className="inline-flex items-center gap-1.5 text-xs text-ink-secondary">
          <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${installing ? 'bg-accent' : runtime?.installed ? 'bg-success' : 'bg-ink-muted'}`} />{status}
        </span>
        <button type="button" onClick={onClose} disabled={busy} aria-label={uiText('닫기')} data-tip={uiText('닫기')} className={iconButton}><Xmark aria-hidden width={18} height={18} /></button>
      </header>
      <div role="tablist" aria-label={title} className="flex shrink-0 gap-1 border-b border-edge px-3">
        {views.map((tab, index) => <button key={tab} type="button" role="tab" id={id + tab} aria-controls={id + tab + '-panel'} aria-selected={view === tab} tabIndex={view === tab ? 0 : -1}
          onClick={() => setView(tab)} onKeyDown={event => navigate(event, index)}
          className={`min-h-10 border-b-2 px-2 text-sm font-medium leading-tight sm:px-3 ${view === tab ? 'border-accent text-ink' : 'border-transparent text-ink-muted hover:text-ink'}`}>
          {tabs[tab]}
        </button>)}
      </div>
      {error && <p role="alert" className="shrink-0 break-words border-b border-danger/40 px-4 py-2 text-xs text-danger">{error}</p>}
      <div role="tabpanel" id={id + 'overview-panel'} aria-labelledby={id + 'overview'} hidden={view !== 'overview'} className="min-h-0 overflow-y-auto px-4 py-4">
        {runtimeLoadFailed && <p role="alert" className="text-sm text-danger">{uiText('설치 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.')}</p>}
        {runtime && <>
          <section className="rounded-lg border border-edge bg-surface-raised px-3">
            <div className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <h3 className="text-sm font-semibold text-ink">{uiText('설치 상태')}</h3>
              <RuntimeInstallAction runtimeId={runtimeId} label={label} status={runtime} disabled={busy} primary {...installation} />
            </div>
            <dl className="divide-y divide-edge border-t border-edge text-sm">
              <div className="flex justify-between gap-3 py-2"><dt className="text-ink-secondary">{connector ? uiText('연결 프로그램') : label}</dt><dd className="text-ink">{installedLabel(!!connectorPresent)}</dd></div>
              {runtimeId === 'codex' && <div className="flex justify-between gap-3 py-2"><dt className="text-ink-secondary">Codex CLI</dt><dd className="text-ink">{connectorPresent ? installedLabel(runtime.installed) : uiText('확인 불가')}</dd></div>}
            </dl>
            {runtimeId === 'claude' && <p className="border-t border-edge py-2 text-xs text-ink-secondary">{uiText('별도 Claude CLI가 없으면 포함된 CLI를 사용합니다.')}</p>}
          </section>
          {runtime.installed && (hasAccountInfo
            ? <AgentAccountCard key={accountRevision} runtime={runtimeId} settingsActions={{ onLogin: login, onLogout: runtime.logoutable ? () => setConfirm('logout') : undefined, disabled: actionsDisabled }} />
            : <section className="mt-4 flex flex-wrap items-center gap-2 border-t border-edge pt-3">
              <h3 className="mr-auto text-sm font-semibold text-ink">{uiText('계정')}</h3>
              <button type="button" disabled={actionsDisabled} className={button} onClick={login}>{uiText('로그인')}</button>
              {runtime.logoutable && <button type="button" disabled={actionsDisabled} className={button} onClick={() => setConfirm('logout')}>{uiText('로그아웃')}</button>}
            </section>)}
        </>}
      </div>
      <div role="tabpanel" id={id + 'advanced-panel'} aria-labelledby={id + 'advanced'} hidden={view !== 'advanced'} className={view === 'advanced' ? 'flex min-h-0 flex-col' : undefined}>
        {settingsError ? <p role="alert" className="p-4 text-sm text-danger">{settingsError}</p>
          : settings === undefined ? <p role="status" className="p-4 text-sm text-ink-secondary">{uiText('불러오는 중…')}</p>
          : <RuntimeLaunchSettings runtimeId={runtimeId} settings={settings} onSave={save} busy={busy} />}
      </div>
      <div role="tabpanel" id={id + 'management-panel'} aria-labelledby={id + 'management'} hidden={view !== 'management'} className="min-h-0 divide-y divide-edge overflow-y-auto px-4">
        <div className="flex items-start gap-3 py-4">
          <Restart aria-hidden className="mt-1 shrink-0 text-ink-muted" width={18} height={18} />
          <div className="min-w-0 flex-1"><h3 className="text-sm font-semibold text-ink">{uiText('실행 설정')}</h3>
            <p className="mt-1 text-xs leading-relaxed text-ink-secondary">{uiText('저장한 실행 설정을 기본값으로 되돌립니다.')}</p></div>
          <button type="button" aria-label={uiText('실행 설정 초기화')} className={button} disabled={actionsDisabled || settings === undefined} onClick={() => setConfirm('reset')}>{uiText('초기화')}</button>
        </div>
        <div className="flex items-start gap-3 py-4">
          <Trash aria-hidden className="mt-1 shrink-0 text-ink-muted" width={18} height={18} />
          <div className="min-w-0 flex-1"><h3 className="text-sm font-semibold text-ink">{uiText('런타임 삭제')}</h3>
            <p className="mt-1 text-xs leading-relaxed text-ink-secondary">{runtime?.installed && !runtime.uninstallable
              ? (connector ? uiText('Mew에 포함된 연결 프로그램은 자동 삭제할 수 없습니다. 별도로 설치한 CLI는 공급자의 제거 방법을 이용하세요.') : uiText('이 런타임은 자동 삭제를 지원하지 않습니다. 공급자의 설치 방법에 따라 직접 삭제하세요.'))
              : uiText('계정과 실행 설정을 유지하고 런타임을 제거합니다.')}</p></div>
          <button type="button" aria-label={uiText('런타임 삭제')} className={button + ' text-danger'} disabled={actionsDisabled || !runtime?.installed || !runtime.uninstallable} onClick={() => setConfirm('uninstall')}>{uiText('삭제')}</button>
        </div>
      </div>
    </HoverTipLayer>
    {confirm && <ConfirmDialog {...confirmCopy[confirm]} confirmLabel={confirmCopy[confirm].label} danger onConfirm={() => applyAction(confirm)} onCancel={() => setConfirm(null)} />}
  </DialogFrame>
}

export type { RuntimeSettingView }
