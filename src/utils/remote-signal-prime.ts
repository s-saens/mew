type PendingSignal = {
  version: 1
  url: string
  protocols: string
  socket: WebSocket
  messages: MessageEvent[]
  bytes: number
  failed: boolean
  dispose(close: boolean): void
}

const SLOT = Symbol.for('mewlink.remote-signal-prime')
const MAX_BYTES = 64 * 1024
const MAX_MESSAGES = 8
const MAX_AGE = 10_000

function pendingSignal(): PendingSignal | undefined {
  const entry: unknown = Object.getOwnPropertyDescriptor(window, SLOT)?.value
  if (!entry) return undefined
  const fields = typeof entry === 'object' ? Object.getOwnPropertyDescriptors(entry) : {}
  const values = Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, field.value]))
  const messages = values.messages
  const validMessages = Array.isArray(messages) && messages.length <= MAX_MESSAGES && messages.every(event => event instanceof MessageEvent && typeof event.data === 'string' && event.data.length <= MAX_BYTES) && messages.reduce((bytes, event: MessageEvent<string>) => bytes + new TextEncoder().encode(event.data).byteLength, 0) <= MAX_BYTES
  if (Object.values(fields).every(field => 'value' in field) && values.version === 1 && values.socket instanceof WebSocket && typeof values.url === 'string' && values.url.length <= 4096 && typeof values.protocols === 'string' && values.protocols.length <= 4096 && validMessages && Number.isSafeInteger(values.bytes) && values.bytes >= 0 && values.bytes <= MAX_BYTES && typeof values.failed === 'boolean' && typeof values.dispose === 'function') return entry as PendingSignal
  if (values.socket instanceof WebSocket) values.socket.close()
  Reflect.deleteProperty(window, SLOT)
  return undefined
}

/** This prepares a public challenge only; the connection controller still owns every authentication check. */
export function primeRemoteSignal(url: string, protocols?: string[]) {
  const target = new URL(url), origin = new URL(location.origin)
  if (target.protocol !== (origin.protocol === 'https:' ? 'wss:' : 'ws:') || target.host !== origin.host || target.username || target.password || target.hash || target.pathname !== '/central/signal' || target.searchParams.get('bootstrap') !== '1' || target.searchParams.get('role') !== 'browser') throw new Error('연결 화면의 주소 설정이 올바르지 않습니다.')
  const signature = JSON.stringify(protocols ?? [])
  const pending = pendingSignal()
  if (pending?.url === url && pending.protocols === signature) return
  pending?.dispose(true)
  const socket = new WebSocket(url, protocols)
  let timer: ReturnType<typeof setTimeout>
  const entry: PendingSignal = { version: 1, url, protocols: signature, socket, messages: [], bytes: 0, failed: false, dispose(close) {
    clearTimeout(timer); window.removeEventListener('pagehide', leave)
    socket.removeEventListener('message', message); socket.removeEventListener('error', failed); socket.removeEventListener('close', failed)
    if (Object.getOwnPropertyDescriptor(window, SLOT)?.value === entry) Reflect.deleteProperty(window, SLOT)
    if (close) { entry.messages.length = 0; socket.close() }
  } }
  const failed = () => { entry.failed = true; if (socket.readyState < WebSocket.CLOSING) socket.close() }
  const message = (event: MessageEvent) => {
    if (entry.failed) return
    if (typeof event.data !== 'string' || event.data.length > MAX_BYTES || entry.messages.length >= MAX_MESSAGES || (entry.bytes += new TextEncoder().encode(event.data).byteLength) > MAX_BYTES) { entry.failed = true; entry.messages.length = 0; entry.bytes = 0; socket.close(); return }
    entry.messages.push(event)
  }
  const leave = () => entry.dispose(true)
  socket.addEventListener('message', message); socket.addEventListener('error', failed); socket.addEventListener('close', failed)
  window.addEventListener('pagehide', leave, { once: true })
  timer = setTimeout(leave, MAX_AGE)
  Object.defineProperty(window, SLOT, { configurable: true, value: entry })
}

/** A controller may adopt one exact socket once; changed settings discard its public preparation. */
export function takePrimedRemoteSignal(url: string, protocols?: string[]) {
  const entry = pendingSignal()
  if (!entry) return undefined
  if (entry.url !== url || entry.protocols !== JSON.stringify(protocols ?? [])) { entry.dispose(true); throw new Error('연결 설정이 변경됐습니다. 페이지를 새로고침해 주세요.') }
  entry.dispose(false)
  return { socket: entry.socket, messages: entry.messages, failed: entry.failed || entry.socket.readyState >= WebSocket.CLOSING }
}
