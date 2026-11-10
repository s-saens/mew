type VideoCounters = { id: string; packetsReceived?: number; packetsLost?: number; framesReceived?: number; framesDecoded?: number; jitterBufferDelay?: number; jitterBufferEmittedCount?: number; totalDecodeTime?: number }
const count = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0
export function desktopVideoFeedback() {
  let previous: VideoCounters | undefined
  return (value: VideoCounters, rtt?: number) => {
    const old = previous?.id === value.id ? previous : undefined
    const delta = (key: keyof VideoCounters) => old && count(value[key]) && count(old[key]) ? Math.max(0, (value[key] as number) - (old[key] as number)) : 0
    const received = delta('packetsReceived'), lost = delta('packetsLost'), frames = delta('framesDecoded'), emitted = delta('jitterBufferEmittedCount')
    const feedback = { loss: lost / Math.max(1, received + lost), delay: emitted ? Math.min(10000, delta('jitterBufferDelay') * 1000 / emitted) : 0,
      decoded: count(value.framesDecoded) && value.framesDecoded > 0,
      ...(count(value.framesReceived) ? { received: delta('framesReceived'), decodedFrames: frames } : {}),
      ...(count(rtt) ? { rtt: Math.min(10000, rtt) } : {}),
      ...(count(value.totalDecodeTime) && frames ? { decode: Math.min(10000, delta('totalDecodeTime') * 1000 / frames) } : {}),
    }
    previous = { ...value }
    return feedback
  }
}
