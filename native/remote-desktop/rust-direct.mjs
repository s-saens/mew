import { randomBytes } from 'node:crypto'
import { directAttempts } from './native-direct.mjs'
import { connectionNotice } from './connection-notice.mjs'
import { publicV4 } from './nat-port-map.mjs'
import { nativeConnectivity } from './native-connectivity.mjs'
import { DEFAULT_VIDEO, videoOffer, videoModes, videoRate, videoSettings } from './video-settings.mjs'
import { videoAdaptation } from './video-adaptation.mjs'

export function rustMedia(settings, ssrc) {
  const codecs = videoOffer(settings)
  return [`m=video 9 UDP/TLS/RTP/SAVPF ${codecs.map(c => c.payload).join(' ')}`, 'a=mid:video', 'a=sendonly', 'a=rtcp-mux',
    `b=AS:${Math.ceil(videoRate(settings) / 1000)}`, `a=ssrc:${ssrc} cname:mew`, `a=ssrc:${ssrc} msid:mew-desktop screen`, 'a=msid:mew-desktop screen',
    ...codecs.flatMap(c => [`a=rtpmap:${c.payload} H264/90000`, `a=fmtp:${c.payload} ${c.fmtp}`, `a=rtcp-fb:${c.payload} nack`, `a=rtcp-fb:${c.payload} nack pli`, `a=rtcp-fb:${c.payload} ccm fir`]), ''].join('\r\n')
}

function rustAttempt(engine, { session, iceServers, udpPort, emit, input, keyframe, bitrate, fail, video: startVideo, settings = DEFAULT_VIDEO, connected = () => {}, readClipboard, now = Date.now, localCursor = true, relativeOnly = false, negotiation = 0, autoNat = true, connectivity = nativeConnectivity }) {
  settings = videoSettings(settings)
  let closed = false, opened = 0, remote = false, pending = [], mode, gathering = 'new', clipboardPending = false
  const channels = new Set(), notice = connectionNotice(connected)
  const post = value => { if (!closed) engine.postMessage({ session, negotiation, ...value }) }
  const counts = { host: 0, srflx: 0, ipv6: 0, public4: 0 }
  const report = () => { if (!closed) emit({ type: 'network-status', negotiation, gathering, ...counts }) }
  const nat = connectivity({ enabled: autoNat, emit: (candidate, mid) => { if (!closed) { counts.srflx++; report(); emit({ type: 'candidate', negotiation, candidate: { candidate, sdpMid: mid } }) } }, status: mapping => { if (!closed) emit({ type: 'network-status', negotiation, gathering, ...counts, mapping }) } })
  const adaptation = videoAdaptation({ maximum: videoRate(settings), priority: settings.priority, now, keyframe, change: bitrate })
  const control = value => post({ type: 'control', text: JSON.stringify(value) })
  const message = (raw, label) => {
    if (typeof raw !== 'string' || raw.length > 16 * 1024) throw new Error('Invalid desktop input')
    const value = JSON.parse(raw)
    if (label === 'control' && value.type === 'viewer-ready' && Object.keys(value).length === 1) notice.ready()
    else if (label === 'control' && value.type === 'clipboard-read') {
      if (!Number.isSafeInteger(value.id) || value.id < 1 || Object.keys(value).length !== 2) throw new Error('Invalid clipboard request')
      if (clipboardPending) return
      clipboardPending = true
      void Promise.resolve().then(readClipboard).then(text => {
        if (typeof text !== 'string' || text.length > 4096 || text.includes('\0')) throw new Error('Invalid clipboard text')
        const response = { type: 'clipboard', id: value.id, text }
        if (Buffer.byteLength(JSON.stringify(response)) > 16 * 1024) throw new Error('Clipboard text too large')
        control(response)
      }).catch(() => control({ type: 'clipboard', id: value.id, error: true })).finally(() => { clipboardPending = false })
    } else if (label === 'control' && value.type === 'feedback') {
      if (adaptation.feedback(value)) post({ type: 'stats' })
    } else input(value, label === 'control')
  }
  const onEvent = event => {
    if (closed || event.session !== session || event.negotiation !== negotiation || !event.type.startsWith('rtc-')) return
    try {
      if (event.type === 'rtc-description' && event.value.type === 'offer') emit({ type: 'offer', sdp: event.value.sdp, native: true, negotiation })
      else if (event.type === 'rtc-candidate') {
        const { candidate, sdpMid } = event.value, fields = candidate.split(/\s+/), type = fields[fields.indexOf('typ') + 1], address = fields[4] ?? ''
        if (type === 'relay') return
        if (type === 'host') counts.host++
        if (type === 'srflx') counts.srflx++
        if (publicV4(address)) counts.public4++
        if (address.includes(':') && !/^(?:fe[89ab]|f[cd]|::)/i.test(address)) counts.ipv6++
        emit({ type: 'candidate', negotiation, candidate: { candidate, sdpMid } }); report(); nat.candidate(candidate, sdpMid)
      } else if (event.type === 'rtc-gathering') { gathering = event.value === 2 ? 'complete' : 'gathering'; report() }
      else if (event.type === 'rtc-state' && [3, 4, 5].includes(event.value)) throw new Error(gathering === 'complete' && iceServers.length && !counts.srflx && !counts.ipv6 && !counts.public4 ? '외부 연결 주소를 찾지 못했습니다. STUN 주소 탐색을 확인해 주세요.' : '외부 기기와 직접 연결 경로를 만들지 못했습니다. 자동 NAT 연결과 호스트 UDP 허용 상태를 확인해 주세요.')
      else if (event.type === 'rtc-error' || event.type === 'rtc-closed') throw new Error('원격 영상·입력 연결이 종료됐습니다.')
      else if (event.type === 'rtc-open' && ['motion', 'control'].includes(event.label) && !channels.has(event.label)) {
        channels.add(event.label); nat.connected(); notice.opened(event.label)
        if (++opened === 2) emit({ type: 'connected', native: true, localCursor, relativeOnly })
      } else if (event.type === 'rtc-message') message(event.value, event.label)
      else if (event.type === 'rtc-congested') adaptation.congested()
      else if (event.type === 'rtc-stats' && mode) control({ type: 'video-status', ...mode, bitrate: adaptation.rate(), ...event.value })
    } catch (error) { fail(error, opened === 0) }
  }
  engine.on('message', onEvent)
  try {
    const ssrc = randomBytes(4).readUInt32BE() || 1
    post({ type: 'peer', iceServers: iceServers.flatMap(s => typeof s.urls === 'string' ? [s.urls] : s.urls), udpPort, media: rustMedia(settings, ssrc), ssrc, nackHistory: Math.min(4096, Math.max(512, Math.ceil(videoRate(settings) / 8 / 1180 * .4))) })
  } catch (error) { engine.removeListener('message', onEvent); void nat.close(); throw error }
  return {
    signal(value) {
      if (closed || (value.negotiation ?? 0) !== negotiation) return
      if (value.type === 'answer') {
        const modes = videoModes(value.sdp, settings)
        post({ type: 'answer', sdp: value.sdp }); remote = true
        for (const candidate of pending) post({ type: 'candidate', candidate }); pending = []
        startVideo(modes, negotiation)
      } else if (value.type === 'candidate') { if (remote) post({ type: 'candidate', candidate: value.candidate }); else if (pending.length < 128) pending.push(value.candidate) }
    },
    configure(value) { if (closed) return; mode = value; adaptation.configure(value.bitrate) },
    frame(_value, done = () => {}) { done() },
    unopened() { return opened === 0 },
    close() { if (closed) return nat.close(); post({ type: 'close-peer' }); closed = true; engine.removeListener('message', onEvent); notice.close(); pending = []; return nat.close() },
  }
}

export function rustDirect(engine, options) { return directAttempts(options, value => rustAttempt(engine, value)) }
