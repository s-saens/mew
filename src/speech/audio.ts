export const SAMPLE_RATE = 16_000
export const MAX_RECORDING_MS = 60_000

/** Encode normalized mono samples as a little-endian PCM WAV file. */
export function encodeWav(samples: Float32Array): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  const write = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)) }
  write(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true); write(8, 'WAVE')
  write(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true)
  view.setUint16(22, 1, true); view.setUint32(24, SAMPLE_RATE, true); view.setUint32(28, SAMPLE_RATE * 2, true)
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, 'data'); view.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(44 + i * 2, sample < 0 ? sample * 32768 : sample * 32767, true)
  }
  return new Blob([buffer], { type: 'audio/wav' })
}

export async function convertToWav(recording: Blob, signal: AbortSignal): Promise<Blob> {
  signal.throwIfAborted()
  const context = new AudioContext()
  try {
    const decoded = await context.decodeAudioData(await recording.arrayBuffer())
    signal.throwIfAborted()
    if (!decoded.length || decoded.duration > MAX_RECORDING_MS / 1000 + 2) throw new Error('Invalid audio duration')
    const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * SAMPLE_RATE), SAMPLE_RATE)
    const source = offline.createBufferSource()
    source.buffer = decoded
    source.connect(offline.destination)
    source.start()
    const result = await offline.startRendering()
    signal.throwIfAborted()
    return encodeWav(result.getChannelData(0))
  } finally { await context.close().catch(() => {}) }
}
