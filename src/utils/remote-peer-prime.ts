type PendingPeer = {
  version: 1
  url: string
  admission: string
  peer: RTCPeerConnection
  channel: RTCDataChannel
  descriptionPromise: Promise<RTCSessionDescriptionInit>
  candidates: RTCIceCandidateInit[]
  failed: boolean
  dispose(close: boolean): void
}

const SLOT = Symbol.for('mewlink.remote-peer-prime')
const MAX_AGE = 10_000
const MAX_CANDIDATES = 128
const MAX_CANDIDATE_BYTES = 4096
const candidateFields = new Set(['candidate', 'sdpMid', 'sdpMLineIndex', 'usernameFragment'])

function dataFields(value: unknown): Record<string, PropertyDescriptor> | undefined {
  if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return undefined
  const fields = Object.getOwnPropertyDescriptors(value)
  return Reflect.ownKeys(fields).every(key => typeof key === 'string' && 'value' in fields[key]) ? fields : undefined
}

function validCandidate(value: unknown): value is RTCIceCandidateInit {
  const fields = dataFields(value)
  if (!fields || Object.keys(fields).some(key => !candidateFields.has(key))) return false
  const candidate = fields.candidate?.value, mid = fields.sdpMid?.value, index = fields.sdpMLineIndex?.value, fragment = fields.usernameFragment?.value
  return typeof candidate === 'string' && candidate.length <= MAX_CANDIDATE_BYTES && new TextEncoder().encode(candidate).byteLength <= MAX_CANDIDATE_BYTES &&
    (mid === undefined || mid === null || typeof mid === 'string' && mid.length <= 256) &&
    (index === undefined || index === null || Number.isInteger(index) && index >= 0 && index <= 65535) &&
    (fragment === undefined || fragment === null || typeof fragment === 'string' && fragment.length <= 256)
}

function validCandidates(value: unknown): value is RTCIceCandidateInit[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return false
  const fields = Object.getOwnPropertyDescriptors(value) as unknown as Record<string, PropertyDescriptor>, length = fields.length?.value
  if (!Number.isInteger(length) || length < 0 || length > MAX_CANDIDATES || Reflect.ownKeys(fields).length !== length + 1) return false
  for (let index = 0; index < length; index++) if (!fields[index] || !('value' in fields[index]) || !validCandidate(fields[index].value)) return false
  return true
}

const ownDataOnly = (value: object) => Reflect.ownKeys(Object.getOwnPropertyDescriptors(value)).every(key => 'value' in Object.getOwnPropertyDescriptor(value, key)!)
const isPeer = (value: unknown): value is RTCPeerConnection => typeof RTCPeerConnection !== 'undefined' && value instanceof RTCPeerConnection && Object.getPrototypeOf(value) === RTCPeerConnection.prototype && ownDataOnly(value)
const isChannel = (value: unknown): value is RTCDataChannel => typeof RTCDataChannel !== 'undefined' && value instanceof RTCDataChannel && Object.getPrototypeOf(value) === RTCDataChannel.prototype && ownDataOnly(value)

function closeEndpoint(peer: unknown, channel: unknown) {
  try { if (isChannel(channel)) RTCDataChannel.prototype.close.call(channel) } catch { /* A failed endpoint is already unusable. */ }
  try { if (isPeer(peer)) RTCPeerConnection.prototype.close.call(peer) } catch { /* A failed endpoint is already unusable. */ }
}

function pendingPeer(): PendingPeer | undefined {
  const slot = Object.getOwnPropertyDescriptor(window, SLOT)
  if (!slot) return undefined
  const fields = dataFields(slot.value), raw = slot.value && typeof slot.value === 'object' ? Object.getOwnPropertyDescriptors(slot.value) : {}
  const values = Object.fromEntries(Object.entries(raw).filter(([, field]) => 'value' in field).map(([key, field]) => [key, field.value]))
  const promise = values.descriptionPromise
  if (slot.configurable && fields && values.version === 1 &&
    typeof values.url === 'string' && values.url.length <= 4096 && typeof values.admission === 'string' && values.admission.length <= 8192 &&
    isPeer(values.peer) && isChannel(values.channel) && promise instanceof Promise && Object.getPrototypeOf(promise) === Promise.prototype && ownDataOnly(promise) && !Object.hasOwn(promise, 'then') &&
    validCandidates(values.candidates) && typeof values.failed === 'boolean' && typeof values.dispose === 'function') return slot.value as PendingPeer
  closeEndpoint(values.peer, values.channel)
  Reflect.deleteProperty(window, SLOT)
  return undefined
}

/** Prepare only public ICE state; keys, signaling, and authentication remain with the controller. */
export function primeRemotePeer(url: string, admission: string) {
  const target = new URL(url), origin = new URL(location.origin)
  if (url.length > 4096 || target.protocol !== (origin.protocol === 'https:' ? 'wss:' : 'ws:') || target.host !== origin.host || target.username || target.password || target.hash ||
    target.pathname !== '/central/signal' || target.searchParams.get('bootstrap') !== '1' || target.searchParams.get('role') !== 'browser' ||
    typeof admission !== 'string' || admission.length > 8192 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(admission)) throw new Error('연결 화면의 주소 설정이 올바르지 않습니다.')
  const pending = pendingPeer()
  if (pending?.url === url && pending.admission === admission) return pending.descriptionPromise
  pending?.dispose(true)
  if (Object.getOwnPropertyDescriptor(window, SLOT)) throw new Error('연결 준비 상태를 확인하지 못했습니다.')
  const peer = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }] })
  let channel: RTCDataChannel
  try { channel = peer.createDataChannel('mew-app', { ordered: true }) }
  catch (error) { closeEndpoint(peer, undefined); throw error }
  const ownerWindow = window
  let timer: ReturnType<typeof setTimeout>, canceled = false, adopted = false
  const entry: PendingPeer = {
    version: 1, url, admission, peer, channel, candidates: [], failed: false, descriptionPromise: Promise.resolve({ type: 'offer' }),
    dispose(close) {
      clearTimeout(timer); ownerWindow.removeEventListener('pagehide', leave)
      peer.removeEventListener('icecandidate', candidate); peer.removeEventListener('connectionstatechange', failed); channel.removeEventListener('close', failed); channel.removeEventListener('error', failed)
      if (Object.getOwnPropertyDescriptor(ownerWindow, SLOT)?.value === entry) Reflect.deleteProperty(ownerWindow, SLOT)
      adopted = !close
      if (close) { canceled = true; entry.candidates.length = 0; closeEndpoint(peer, channel) }
    },
  }
  const failed = (event: Event) => { if (event.type === 'error' || peer.connectionState === 'failed' || peer.connectionState === 'closed' || channel.readyState === 'closed') { entry.failed = true; entry.dispose(true) } }
  const candidate = (event: RTCPeerConnectionIceEvent) => {
    if (canceled || !event.candidate) return
    let value: RTCIceCandidateInit
    try { value = event.candidate.toJSON() } catch { entry.failed = true; entry.dispose(true); return }
    if (!validCandidate(value) || entry.candidates.length >= MAX_CANDIDATES) { entry.failed = true; entry.dispose(true); return }
    entry.candidates.push(value)
  }
  const leave = () => entry.dispose(true)
  peer.addEventListener('icecandidate', candidate); peer.addEventListener('connectionstatechange', failed); channel.addEventListener('close', failed); channel.addEventListener('error', failed)
  ownerWindow.addEventListener('pagehide', leave, { once: true })
  timer = setTimeout(leave, MAX_AGE)
  Object.defineProperty(ownerWindow, SLOT, { configurable: true, value: entry })
  entry.descriptionPromise = (async () => {
    const description = await peer.createOffer()
    if (canceled) throw new Error('연결 준비가 취소됐습니다.')
    if (description.type !== 'offer' || typeof description.sdp !== 'string' || /^a=(?:candidate:|end-of-candidates)/m.test(description.sdp)) throw new Error('연결 준비 정보를 확인하지 못했습니다.')
    await peer.setLocalDescription(description)
    if (canceled) throw new Error('연결 준비가 취소됐습니다.')
    return { type: description.type, sdp: description.sdp }
  })()
  void entry.descriptionPromise.catch(() => { entry.failed = true; if (!adopted && !canceled) entry.dispose(true) })
  return entry.descriptionPromise
}

/** Transfer one exact endpoint; the controller must immediately install its own ICE handler. */
export function hasPrimedRemotePeer(url: string, admission: string) {
  const entry = pendingPeer()
  return !!entry && entry.url === url && entry.admission === admission && !entry.failed && entry.peer.connectionState !== 'failed' && entry.peer.connectionState !== 'closed' && entry.channel.readyState !== 'closed'
}

export function takePrimedRemotePeer(url: string, admission: string) {
  const entry = pendingPeer()
  if (!entry) return undefined
  if (entry.url !== url || entry.admission !== admission) { entry.dispose(true); throw new Error('연결 설정이 변경됐습니다. 페이지를 새로고침해 주세요.') }
  if (entry.failed || entry.peer.connectionState === 'failed' || entry.peer.connectionState === 'closed' || entry.channel.readyState === 'closed') { entry.dispose(true); return undefined }
  entry.dispose(false)
  return { peer: entry.peer, channel: entry.channel, descriptionPromise: entry.descriptionPromise, candidates: entry.candidates }
}
