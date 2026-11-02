import { REMOTE_LIMITS, parseRemoteFrame } from '../../shared/remote-access.ts'
import type { DataChannelTransport } from './remote-transport.ts'

const CHECK_TIMEOUT = 250
type ProbeTransport = Pick<DataChannelTransport, 'forward'>
type ForegroundCheck = {
  id: string
  transport: ProbeTransport
  timer: ReturnType<typeof setTimeout>
  sentAt?: number
  timeout: number
  received(event: MessageEvent): void
}

/** Probe an authorized open channel; the caller owns lease and visibility decisions. */
export function createRemoteForegroundProbe(peer: RTCPeerConnection, channel: RTCDataChannel, onUnresponsive: () => void) {
  let pending: ForegroundCheck | undefined
  let lastCheck = -Infinity

  function cancel() {
    const check = pending
    if (!check) return
    pending = undefined
    clearTimeout(check.timer)
    channel.removeEventListener('message', check.received)
    void check.transport.forward({ type: 'cancel', id: check.id }).catch(() => {})
  }

  function check(transport: ProbeTransport, interrupted = false) {
    if (pending || !interrupted && performance.now() - lastCheck < CHECK_TIMEOUT || channel.bufferedAmount > REMOTE_LIMITS.queue) return
    lastCheck = performance.now()
    const probe: ForegroundCheck = {
      id: `remote-check-${crypto.randomUUID()}`,
      transport,
      timer: setTimeout(() => { if (pending === probe) cancel() }, CHECK_TIMEOUT),
      timeout: CHECK_TIMEOUT,
      received(event: MessageEvent) {
        if (pending !== probe) return
        try {
          const frame = parseRemoteFrame(event.data)
          if (frame.id === probe.id && ['response', 'end', 'error'].includes(frame.type)) cancel()
        } catch { /* Unrelated or invalid frames cannot prove a fresh round trip. */ }
      },
    }
    pending = probe
    channel.addEventListener('message', probe.received)

    // Local queue waiting cannot establish that a peer has stopped responding.
    const arm = () => {
      if (pending !== probe || probe.sentAt === undefined) return
      clearTimeout(probe.timer)
      probe.timer = setTimeout(() => {
        if (pending !== probe) return
        cancel()
        onUnresponsive()
      }, Math.max(0, probe.sentAt + probe.timeout - performance.now()))
    }
    if (typeof peer.getStats === 'function') void Promise.resolve().then(() => peer.getStats()).then(report => {
      if (pending !== probe) return
      report.forEach(stat => {
        if (stat.type !== 'transport' || typeof stat.selectedCandidatePairId !== 'string') return
        const pair = report.get(stat.selectedCandidatePairId), rtt = pair?.currentRoundTripTime
        if (pair?.type !== 'candidate-pair' || typeof rtt !== 'number' || !Number.isFinite(rtt) || rtt < 0) return
        probe.timeout = Math.max(probe.timeout, Math.min(1000, rtt * 3000 + 50))
      })
      arm()
    }).catch(() => {})

    void transport.forward({ type: 'request', id: probe.id, method: 'HEAD', path: '/api/remote-ui/file?path=/favicon.ico', headers: {} }).then(() => {
      if (pending !== probe) return
      probe.sentAt = performance.now()
      arm()
    }).catch(() => { if (pending === probe) cancel() })
  }

  function reset() {
    cancel()
    lastCheck = -Infinity
  }

  return { check, cancel, reset }
}
