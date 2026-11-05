import type { LoginDesktopInput } from '../../shared/login-desktop.ts'
import { desktopVideoFeedback } from './desktop-video.ts'

export function browserDesktopPeer({ signal, stream, failed }: {
  signal: (message: unknown) => void
  stream: (stream: MediaStream) => void
  failed: () => void
}) {
  let peer: RTCPeerConnection | undefined, control: RTCDataChannel | undefined, motion: RTCDataChannel | undefined
  let negotiation = -1, closed = false, frameReady = false, pending: Array<{ negotiation: number; candidate: RTCIceCandidateInit }> = []
  let messages = Promise.resolve(), sampling = false
  const feedback = desktopVideoFeedback()
  const send = (channel: RTCDataChannel | undefined, message: unknown, limit = 64 * 1024, reliableInput = false) => {
    if (closed || channel?.readyState !== 'open') return
    if (channel.bufferedAmount > limit) { if (reliableInput) failed(); return }
    try { channel.send(JSON.stringify(message)) } catch { failed() }
  }
  const disposePeer = () => {
    if (peer) {
      peer.onconnectionstatechange = null; peer.ondatachannel = null; peer.ontrack = null; peer.onicecandidate = null
      for (const receiver of peer.getReceivers()) receiver.track?.stop()
      peer.close()
    }
    peer = undefined; motion = undefined; control = undefined
  }
  const timer = setInterval(() => {
    const current = peer
    if (sampling || !current || closed || control?.readyState !== 'open') return
    sampling = true
    void current.getStats().then(report => {
      if (current !== peer || closed) return
      let rtt: number | undefined
      report.forEach(value => { if (value.type === 'candidate-pair' && value.nominated && value.state === 'succeeded' && typeof value.currentRoundTripTime === 'number') rtt = value.currentRoundTripTime * 1000 })
      report.forEach(value => {
        if (value.type === 'inbound-rtp' && value.kind === 'video' && Number.isFinite(value.packetsReceived) && Number.isFinite(value.packetsLost)) send(control, { type: 'feedback', ...feedback(value, rtt) }, 16 * 1024)
      })
    }).catch(() => {}).finally(() => { sampling = false })
  }, 1000)
  return {
    input(message: LoginDesktopInput) { send(message.type === 'pointer' ? motion : control, message, 64 * 1024, message.type !== 'pointer') },
    ready() { frameReady = true; send(control, { type: 'viewer-ready' }) },
    message(value: Record<string, unknown>) {
      messages = messages.then(async () => {
        if (closed) return
        const generation = Number(value.negotiation)
        if (!Number.isInteger(generation) || generation < 0) return
        if (value.type === 'candidate') {
          if (generation === negotiation && peer?.remoteDescription) await peer.addIceCandidate(value.candidate as RTCIceCandidateInit)
          else if (generation >= negotiation && pending.length < 128) pending.push({ negotiation: generation, candidate: value.candidate as RTCIceCandidateInit })
          return
        }
        if (value.type !== 'offer' || generation < negotiation) return
        disposePeer(); negotiation = generation; frameReady = false
        const current = new RTCPeerConnection({ iceServers: [], bundlePolicy: 'max-bundle' })
        peer = current
        current.onicecandidate = event => { if (!closed && peer === current && event.candidate) signal({ type: 'candidate', negotiation: generation, candidate: event.candidate.toJSON() }) }
        current.ontrack = event => {
          if (closed || peer !== current) return
          const receiver = event.receiver as RTCRtpReceiver & { jitterBufferTarget?: number }
          if ('jitterBufferTarget' in receiver) { try { receiver.jitterBufferTarget = 0 } catch { /* Keep the browser's supported minimum. */ } }
          stream(event.streams[0] ?? new MediaStream([event.track]))
        }
        current.ondatachannel = event => {
          const channel = event.channel
          if (closed || peer !== current || !['motion', 'control'].includes(channel.label)) { channel.close(); return }
          if (channel.label === 'motion') motion = channel
          else control = channel
          channel.onopen = () => { if (frameReady && channel.label === 'control') send(channel, { type: 'viewer-ready' }) }
          channel.onerror = channel.onclose = () => { if (!closed && peer === current && current.connectionState !== 'closed') failed() }
          if (channel.readyState === 'open') channel.onopen(new Event('open'))
        }
        current.onconnectionstatechange = () => { if (!closed && peer === current && ['failed', 'disconnected'].includes(current.connectionState)) failed() }
        await current.setRemoteDescription({ type: 'offer', sdp: String(value.sdp) })
        if (closed || peer !== current) return
        const candidates = pending.filter(candidate => candidate.negotiation === generation)
        pending = pending.filter(candidate => candidate.negotiation > generation)
        for (const candidate of candidates) await current.addIceCandidate(candidate.candidate)
        const answer = await current.createAnswer()
        if (closed || peer !== current) return
        await current.setLocalDescription(answer)
        if (!closed && peer === current) signal({ type: 'answer', negotiation: generation, sdp: current.localDescription!.sdp })
      }).catch(() => { if (!closed) failed() })
      return messages
    },
    close() { if (closed) return; send(control, { type: 'release' }); closed = true; clearInterval(timer); disposePeer(); pending = [] },
  }
}
