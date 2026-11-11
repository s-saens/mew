import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Microphone, Xmark } from 'iconoir-react'
import { DialogFrame, HoverTipLayer } from '@mew/ui'
import { beginVoiceCapture, type VoiceCapture } from '../../packages/editor/src/editor/voiceCapture'
import { useI18n } from '../i18n'
import { convertToWav, MAX_RECORDING_MS } from './audio'
import { fetchSpeech, transcribeSpeech } from './api'
import type { SpeechStatus } from '../../shared/speech'
import { speechLabels } from './labels'

type Phase = 'idle' | 'permission' | 'recording' | 'processing' | 'review'
type Props = { onTranscript: (text: string) => void; disabled?: boolean; onSessionStart?: () => void; restoreFocus?: () => HTMLElement | null }

export function SpeechInputButton({ onTranscript, disabled, onSessionStart, restoreFocus }: Props) {
  const { locale } = useI18n()
  const s = useMemo(() => speechLabels(locale), [locale])
  const transcriptId = useId()
  const titleId = useId()
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<SpeechStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [result, setResult] = useState('')
  const [error, setError] = useState('')
  const operation = useRef<AbortController | null>(null)
  const capture = useRef<VoiceCapture | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mounted = useRef(true)
  const cleanup = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    operation.current?.abort()
    operation.current = null
    capture.current?.cancel()
    capture.current = null
  }
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; cleanup() }
  }, [])
  const close = () => { cleanup(); setOpen(false); setStatus(null); setPhase('idle'); setResult(''); setError('') }
  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    fetchSpeech(controller.signal).then(value => { if (!controller.signal.aborted) { setStatus(value); setLoading(false) } }).catch(err => {
      if (!controller.signal.aborted) { setError(err instanceof Error ? err.message : s.requestFailed); setLoading(false) }
    })
    return () => controller.abort()
  // Keep the destination confirmed at open even if the display language changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function stop(controller: AbortController) {
    if (!capture.current || operation.current !== controller) return
    const activeCapture = capture.current
    capture.current = null
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    setPhase('processing')
    try {
      const blob = await activeCapture.stop()
      const wav = await convertToWav(blob, controller.signal)
      const deadline = setTimeout(() => controller.abort(), 310_000)
      let transcript: { text: string }
      try { transcript = await transcribeSpeech(wav, status!.revision, controller.signal) } finally { clearTimeout(deadline) }
      if (controller.signal.aborted || !mounted.current) return
      if (!transcript.text.trim()) throw new Error(s.empty)
      setResult(transcript.text)
      setPhase('review')
    } catch (err) {
      if (!mounted.current || operation.current !== controller) return
      setError(err instanceof Error && err.name !== 'AbortError' ? err.message : s.requestFailed)
      setPhase('idle')
    } finally { if (operation.current === controller) operation.current = null }
  }

  async function start() {
    if (operation.current || !status || loading || (status.config.provider === 'faster-whisper' && (!status.install.installed || !status.config.allowModelDownload))) return
    cleanup()
    const controller = new AbortController()
    operation.current = controller
    setError(''); setPhase('permission')
    try {
      const voice = await beginVoiceCapture(controller.signal, err => {
        if (operation.current !== controller || !mounted.current) return
        cleanup(); setError(err instanceof Error ? err.message : s.recordError); setPhase('idle')
      })
      if (controller.signal.aborted || !mounted.current) { voice.cancel(); return }
      capture.current = voice
      setPhase('recording')
      timer.current = setTimeout(() => { void stop(controller) }, MAX_RECORDING_MS)
    } catch (err) {
      if (controller.signal.aborted || !mounted.current || operation.current !== controller) return
      operation.current = null
      setError(err instanceof Error && err.name !== 'NotAllowedError' ? err.message : s.recordError); setPhase('idle')
    }
  }

  function openDialog() {
    try { onSessionStart?.(); setLoading(true); setOpen(true) } catch (err) { setError(err instanceof Error ? err.message : s.requestFailed); setLoading(true); setOpen(true) }
  }
  function insert() {
    try { onTranscript(result); close() } catch (err) { setError(err instanceof Error ? err.message : s.requestFailed) }
  }
  return <>
    <HoverTipLayer><button type="button" disabled={disabled} onClick={openDialog} aria-label={s.title} data-tip={s.title} className="flex h-8 w-8 items-center justify-center rounded text-ink-secondary hover:bg-surface-hover hover:text-ink disabled:opacity-40"><Microphone width={18} height={18} aria-hidden="true" /></button></HoverTipLayer>
    {open && <DialogFrame labelledBy={titleId} onClose={close} restoreFocus={restoreFocus} className="max-h-[90dvh] max-w-lg overflow-y-auto p-4" overlayClassName="p-3">
        <div className="mb-3 flex items-center justify-between gap-2"><div id={titleId} className="text-sm font-semibold text-ink-bright">{s.title}</div><button type="button" onClick={close} aria-label={s.cancel} data-tip={s.cancel} className="rounded p-1 text-ink-secondary hover:bg-surface-hover"><Xmark width={18} height={18} aria-hidden="true" /></button></div>
        {phase === 'review' ? <><label className="block text-sm text-ink-secondary" htmlFor={transcriptId}>{s.transcript}</label><textarea id={transcriptId} value={result} onChange={event => setResult(event.target.value)} rows={5} className="mt-1 w-full resize-y rounded border border-edge-strong bg-surface p-2 text-sm text-ink" /><div className="text-xs text-ink-muted">{s.reviewNotice}</div></> : <><div className="text-sm text-ink-secondary" role="status">{loading ? s.loading : phase === 'permission' ? s.preparing : phase === 'recording' ? s.recording : phase === 'processing' ? s.transcribing : s.recordLimit}</div>{status && <div className="mt-2 break-all text-sm text-ink-secondary"><div>{s.preflightDestination}: {status.config.provider === 'faster-whisper' ? s.preflightLocal : status.config.baseUrl}</div>{status.config.provider !== 'whisper-cpp' && <div>{s.preflightModel}: {status.config.model}</div>}{status.config.provider === 'faster-whisper' && <div>{s.sourceCold}</div>}{status.config.provider === 'faster-whisper' && !status.install.installed && <div>{s.preflightNeedInstall}</div>}{status.config.provider === 'faster-whisper' && !status.config.allowModelDownload && <div>{s.preflightNeedConsent}</div>}</div>}</>}
        {error && <div role="alert" className="mt-2 select-text text-sm text-danger">{error}</div>}
        <div className="mt-3 flex justify-end gap-2"><button type="button" onClick={close} className="rounded border border-edge-strong px-3 py-1.5 text-sm text-ink-secondary hover:bg-surface-hover">{s.cancel}</button>{phase === 'idle' && <button type="button" disabled={loading || !status || (status.config.provider === 'faster-whisper' && (!status.install.installed || !status.config.allowModelDownload))} onClick={() => void start()} className="rounded bg-accent px-3 py-1.5 text-sm text-ink-on-accent disabled:opacity-40">{s.start}</button>}{phase === 'recording' && <button type="button" onClick={() => { if (operation.current) void stop(operation.current) }} className="rounded bg-accent px-3 py-1.5 text-sm text-ink-on-accent">{s.stopAndTranscribe}</button>}{phase === 'review' && <button type="button" disabled={!result.trim()} onClick={insert} className="rounded bg-accent px-3 py-1.5 text-sm text-ink-on-accent disabled:opacity-40">{s.insert}</button>}</div>
    </DialogFrame>}
  </>
}
