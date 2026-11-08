type ReceiverCounters = {
  id: string
  jitterBufferDelay?: number
  jitterBufferEmittedCount?: number
  totalDecodeTime?: number
  framesDecoded?: number
}

export type DesktopVideoTiming = { bufferMs?: number; decodeMs?: number }

/** Interval averages; missing, reset, and idle counters never imply zero delay. */
export function desktopVideoTiming() {
  let previous: ReceiverCounters | undefined
  return (value: ReceiverCounters): DesktopVideoTiming => {
    const old = previous?.id === value.id ? previous : undefined
    const average = (duration: keyof ReceiverCounters, count: keyof ReceiverCounters) => {
      const seconds = value[duration], frames = value[count], oldSeconds = old?.[duration], oldFrames = old?.[count]
      if (![seconds, frames, oldSeconds, oldFrames].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0)) return
      const elapsed = Number(seconds) - Number(oldSeconds), emitted = Number(frames) - Number(oldFrames)
      if (elapsed < 0 || emitted <= 0) return
      return elapsed * 1000 / emitted
    }
    const bufferMs = average('jitterBufferDelay', 'jitterBufferEmittedCount'), decodeMs = average('totalDecodeTime', 'framesDecoded')
    previous = { ...value }
    return { ...(bufferMs !== undefined ? { bufferMs } : {}), ...(decodeMs !== undefined ? { decodeMs } : {}) }
  }
}
