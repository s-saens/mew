export interface VoiceCapture {
  stop: () => Promise<Blob>
  cancel: () => void
}

export class VoiceCaptureError extends Error {
  readonly reason: 'unsupported' | 'empty' | 'recording' | 'size'
  constructor(reason: VoiceCaptureError['reason']) { super(reason); this.reason = reason }
}

export const MAX_VOICE_BYTES = 25 * 1024 * 1024

/** The caller owns the abort signal, including while microphone permission is pending. */
export async function beginVoiceCapture(signal: AbortSignal, onError: (error: unknown) => void): Promise<VoiceCapture> {
  signal.throwIfAborted()
  if (!globalThis.MediaRecorder || !globalThis.navigator?.mediaDevices?.getUserMedia) throw new VoiceCaptureError('unsupported')
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  let released = false
  const release = () => {
    if (released) return
    released = true
    stream.getTracks().forEach(track => track.stop())
  }
  if (signal.aborted) { release(); throw new DOMException('Aborted', 'AbortError') }
  let recorder: MediaRecorder
  try {
    const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm']
      .find(type => MediaRecorder.isTypeSupported(type))
    recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
  } catch (error) { release(); throw error }
  const chunks: Blob[] = []
  let settle: { resolve: (blob: Blob) => void; reject: (error: unknown) => void } | undefined
  let cancelled = false
  let bytes = 0
  const cleanup = () => { signal.removeEventListener('abort', cancel); release() }
  const cancel = () => {
    if (cancelled) return
    cancelled = true
    if (recorder.state !== 'inactive') recorder.stop()
    cleanup()
    settle?.reject(new DOMException('Aborted', 'AbortError'))
    settle = undefined
    chunks.length = 0
  }
  recorder.ondataavailable = event => {
    if (cancelled || !event.data.size) return
    bytes += event.data.size
    if (bytes > MAX_VOICE_BYTES) {
      const pending = settle
      settle = undefined
      cancel()
      const error = new VoiceCaptureError('size')
      if (pending) pending.reject(error)
      else onError(error)
      return
    }
    chunks.push(event.data)
  }
  recorder.onstop = () => {
    cleanup()
    if (cancelled) return
    const blob = new Blob(chunks, { type: recorder.mimeType || chunks[0]?.type || 'audio/webm' })
    chunks.length = 0
    if (!settle) { onError(new VoiceCaptureError('recording')); return }
    if (blob.size) settle.resolve(blob)
    else settle.reject(new VoiceCaptureError('empty'))
    settle = undefined
  }
  recorder.onerror = () => {
    if (cancelled) return
    cancelled = true
    if (recorder.state !== 'inactive') recorder.stop()
    cleanup()
    const error = new VoiceCaptureError('recording')
    if (settle) settle.reject(error)
    else onError(error)
    settle = undefined
    chunks.length = 0
  }
  signal.addEventListener('abort', cancel, { once: true })
  try { recorder.start(1000) } catch (error) { cleanup(); throw error }
  return {
    cancel,
    stop: () => new Promise<Blob>((resolve, reject) => {
      if (cancelled || recorder.state === 'inactive' || settle) { reject(new VoiceCaptureError('recording')); return }
      settle = { resolve, reject }
      try { recorder.stop() } catch (error) { cleanup(); settle = undefined; reject(error) }
    }),
  }
}

export function voiceFile(blob: Blob): File {
  const extension = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm'
  return new File([blob], `voice-${Date.now()}.${extension}`, { type: blob.type })
}
