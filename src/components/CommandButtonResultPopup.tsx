import { uiText } from '@mew/ui/i18n-core'
import { useUiLocale } from '@mew/ui/i18n'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CommandButtonResult } from '../../shared/command-button-result'
import type { CmdButtonState } from '../api/client'
import { SessionTerminalPopup } from './SessionTerminalPopup'

const POLL_INTERVAL_MS = 2000

export function CommandButtonResultPopup({ button, onClose, onChanged, onRun, fetchResult, archiveUrl }: {
  button: CmdButtonState
  onClose: () => void
  onChanged: () => void
  onRun: () => Promise<unknown>
  fetchResult: () => Promise<{ result: CommandButtonResult | null }>
  archiveUrl: string
}) {
  const locale = useUiLocale()
  const callbacks = useRef({ onChanged, onRun, fetchResult })
  useLayoutEffect(() => { callbacks.current = { onChanged, onRun, fetchResult } }, [onChanged, onRun, fetchResult])
  const [result, setResult] = useState<CommandButtonResult | null | undefined>(undefined)
  const [expectRunning, setExpectRunning] = useState(button.running)
  const [loadingError, setLoadingError] = useState<string | null>(null)
  const [runError, setRunError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const active = useRef(false)
  const startingRef = useRef(false)
  const epoch = useRef(0)
  const pending = useRef<{ epoch: number } | null>(null)
  const lastState = useRef<'running' | 'other'>(button.running ? 'running' : 'other')

  const refresh = useCallback(() => {
    if (startingRef.current || pending.current?.epoch === epoch.current) return
    const request = { epoch: epoch.current }
    pending.current = request
    void callbacks.current.fetchResult().then(({ result: next }) => {
      if (!active.current || request.epoch !== epoch.current) return
      setResult(next)
      setLoadingError(null)
      if (!next) return
      setExpectRunning(next.state === 'running')
      const nextState = next.state === 'running' ? 'running' : 'other'
      if (lastState.current === 'running' && nextState === 'other') callbacks.current.onChanged()
      lastState.current = nextState
    }).catch(error => {
      if (active.current && request.epoch === epoch.current) {
        setLoadingError(error instanceof Error ? error.message : String(error))
      }
    }).finally(() => {
      if (pending.current === request) pending.current = null
    })
  }, [])

  useEffect(() => {
    active.current = true
    refresh()
    const timer = window.setInterval(refresh, POLL_INTERVAL_MS)
    return () => { active.current = false; window.clearInterval(timer) }
  }, [refresh])

  async function start() {
    if (startingRef.current) return
    startingRef.current = true
    epoch.current++
    setStarting(true)
    setRunError(null)
    try {
      await callbacks.current.onRun()
      if (!active.current) return
      lastState.current = 'running'
      setResult({ command: button.command, state: 'running', exitCode: null })
      setExpectRunning(true)
    } catch (error) {
      if (active.current) setRunError(error instanceof Error ? error.message : String(error))
      throw error
    } finally {
      startingRef.current = false
      if (active.current) {
        setStarting(false)
        refresh()
      }
    }
  }

  const running = result?.state === 'running' || (result == null && expectRunning)
  const finished = result && result.state !== 'running' ? result : null
  const loading = !running && result === undefined
  const status = finished
    ? `${finished.state === 'completed' ? uiText('완료') : finished.state === 'failed' ? uiText('실패') : uiText('중단됨')}${finished.exitCode === null ? '' : uiText(' · 종료 코드 {p0}', { p0: finished.exitCode })}${finished.error ? ` · ${finished.error}` : ''}`
    : loadingError && running ? loadingError : undefined
  const shortOutput = { ko: '최근 출력만 표시합니다.', en: 'Only recent output is shown.', ja: '最近の出力のみ表示しています。', 'zh-CN': '仅显示最近输出。' }[locale]

  return <SessionTerminalPopup
    key={running ? 'running' : 'stopped'}
    title={button.name} subtitle={finished?.command ?? button.command} idleNote={button.command}
    session={button.session} running={running}
    statusNote={status} statusTone={finished?.state === 'completed' ? 'success' : finished?.state === 'failed' || (loadingError && running) ? 'danger' : 'muted'}
    onRun={start} onClose={onClose} onChanged={onChanged}
    canStop={running}
    footerActions={finished && <button type="button" disabled={starting} onClick={() => { void start().then(onChanged).catch(() => {}) }}
      className="shrink-0 rounded bg-accent px-3 py-1 text-sm text-ink-on-accent disabled:opacity-50">{uiText('실행')}</button>}
    completedContent={finished ? <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-edge px-3 py-2 text-xs text-ink-secondary">
        <span className="flex-1">{finished.previewTruncated ? finished.archived ? uiText('최근 출력만 표시합니다. 전체 출력은 다운로드하세요.') : shortOutput : uiText('저장된 출력 · 읽기 전용')}</span>
        {finished.archived && <a href={archiveUrl} className="rounded px-2 py-1 text-ink underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ink-secondary">{uiText('전체 출력 다운로드')}</a>}
      </div>
      {runError && <div role="alert" className="px-3 pt-2 text-sm text-danger-strong">{runError}</div>}
      <pre tabIndex={0} aria-label={uiText('저장된 터미널 출력')} className="min-h-0 flex-1 select-text overflow-auto whitespace-pre p-3 font-mono text-xs leading-relaxed text-ink outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent">{finished.text || uiText('출력 없음')}</pre>
    </div> : loading ? <div className="p-4 text-sm text-ink-muted">{loadingError ? <span role="alert">{loadingError} <button type="button" className="underline" onClick={refresh}>{uiText('다시 시도')}</button></span> : <span role="status">{uiText('출력을 불러오는 중…')}</span>}</div> : undefined}
  />
}
