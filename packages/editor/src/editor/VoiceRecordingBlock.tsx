import { useLayoutEffect, useRef, useState } from 'react'
import { Microphone, Square, RefreshDouble, Xmark } from 'iconoir-react'
import { HoverTipLayer } from '@mew/ui'
import { uiText } from '@mew/ui/i18n-core'
import { useUiLocale } from '@mew/ui/i18n'
import { beginVoiceCapture, VoiceCaptureError, voiceFile, type VoiceCapture } from './voiceCapture'

type Phase = 'idle' | 'requesting' | 'recording' | 'stopping' | 'uploading' | 'retry'

function errorMessage(error: unknown): string {
  if (error instanceof VoiceCaptureError) {
    if (error.reason === 'unsupported') return uiText('이 브라우저에서는 녹음할 수 없습니다. HTTPS 또는 localhost에서 지원 브라우저를 사용하세요.')
    if (error.reason === 'size') return uiText('녹음이 25 MiB를 초과했습니다. 더 짧게 다시 녹음하세요.')
    if (error.reason === 'empty') return uiText('녹음된 소리가 없습니다. 다시 녹음하세요.')
  }
  if (error instanceof DOMException && ['NotAllowedError', 'SecurityError'].includes(error.name)) return uiText('마이크 접근이 차단되었습니다. 브라우저 권한과 연결 보안을 확인하세요.')
  return uiText('녹음하지 못했습니다. 마이크를 확인하고 다시 시도하세요.')
}

export function VoiceRecordingBlock({ signal, onSave, onCancel }: {
  signal: AbortSignal; onSave: (file: File) => Promise<void>; onCancel: () => void
}) {
  useUiLocale()
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [seconds, setSeconds] = useState(0)
  const [preview, setPreview] = useState<string | null>(null)
  const capture = useRef<VoiceCapture | null>(null)
  const file = useRef<File | null>(null)
  const busy = useRef(false)
  const controller = useRef<AbortController | null>(null)
  const startButton = useRef<HTMLButtonElement>(null)
  useLayoutEffect(() => {
    const local = new AbortController()
    controller.current = local
    const abort = () => local.abort()
    if (signal.aborted) abort()
    else signal.addEventListener('abort', abort, { once: true })
    startButton.current?.focus({ preventScroll: true })
    return () => { signal.removeEventListener('abort', abort); local.abort(); capture.current?.cancel() }
  }, [signal])
  useLayoutEffect(() => {
    if (phase !== 'recording') return
    const started = Date.now()
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 250)
    return () => window.clearInterval(timer)
  }, [phase])
  useLayoutEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])
  const live = () => !!controller.current && !controller.current.signal.aborted
  async function upload(recording: File) {
    if (busy.current || !live()) return
    busy.current = true
    setError(null)
    setPhase('uploading')
    try { await onSave(recording) }
    catch {
      if (live()) { setError(uiText('녹음을 업로드하지 못했습니다. 다시 시도하세요.')); setPhase('retry') }
    } finally { busy.current = false }
  }
  async function start() {
    if (busy.current || !live()) return
    busy.current = true
    setError(null); setSeconds(0); setPhase('requesting')
    try {
      capture.current = await beginVoiceCapture(controller.current!.signal, failure => {
        if (!live()) return
        setError(errorMessage(failure)); setPhase('idle'); capture.current = null
      })
      if (live()) setPhase('recording')
    } catch (failure) {
      if (live()) { setError(errorMessage(failure)); setPhase('idle') }
    } finally { busy.current = false }
  }
  async function stop() {
    if (busy.current || !capture.current || !live()) return
    busy.current = true
    setPhase('stopping')
    let recording: File | undefined
    try {
      recording = voiceFile(await capture.current.stop())
      if (!live()) return
      file.current = recording
      setPreview(URL.createObjectURL(recording))
    } catch (failure) {
      if (live()) { setError(errorMessage(failure)); setPhase('idle') }
    } finally { capture.current = null; busy.current = false }
    if (recording && live()) await upload(recording)
  }
  const controlClass = 'shrink-0 rounded p-1.5 text-ink hover:bg-surface-hover focus-visible:outline focus-visible:outline-accent disabled:opacity-40'
  const status = phase === 'requesting' ? uiText('마이크 권한 대기 중…') : phase === 'recording' ? uiText('녹음 중')
    : phase === 'stopping' ? uiText('녹음 마무리 중…') : phase === 'uploading' ? uiText('업로드 중…') : uiText('음성 녹음')
  return <HoverTipLayer><span role="group" aria-label={uiText('음성 녹음')} className="mew-voice-block"
    onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); onCancel() } }}>
    <span className="flex min-w-0 flex-wrap items-center gap-1">
      {preview ? <audio src={preview} controls aria-label={uiText('녹음 재생')} className="min-w-0 max-w-full" /> : <>
        <span role="status" className="min-w-0 flex-1 text-xs text-ink">{status}</span>
        {phase === 'recording' && <span className="text-xs tabular-nums text-ink" aria-label={uiText('녹음 시간')}>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</span>}
      </>}
      {phase === 'idle' && <button ref={startButton} type="button" onClick={() => void start()} aria-label={uiText('녹음 시작')} data-tip={uiText('녹음 시작')} className={controlClass}><Microphone width={18} height={18} /></button>}
      {phase === 'recording' && <button type="button" onClick={() => void stop()} aria-label={uiText('녹음 중지')} data-tip={uiText('녹음 중지')} className={controlClass}><Square width={18} height={18} /></button>}
      {phase === 'retry' && <button type="button" onClick={() => { if (file.current) void upload(file.current) }} aria-label={uiText('다시 시도')} data-tip={uiText('다시 시도')} className={controlClass}><RefreshDouble width={18} height={18} /></button>}
      <button type="button" onClick={onCancel} aria-label={uiText('취소')} data-tip={uiText('취소')} className={controlClass}><Xmark width={18} height={18} /></button>
    </span>
    {preview && phase === 'uploading' && <span role="status" className="text-xs text-ink-muted">{status}</span>}
    {error && <span role="alert" className="text-xs text-ink">{error}</span>}
  </span></HoverTipLayer>
}
