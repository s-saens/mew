import { base64ToBytes, bytesToBase64, nativeDeadline, type NativeDirectBridge } from './native-bridge.ts'

export const NATIVE_SOCKET_MESSAGE_LIMIT = 1024 * 1024
const QUEUE_LIMIT = 4 * NATIVE_SOCKET_MESSAGE_LIMIT

function decodeMessage(value: unknown) {
  if (typeof value !== 'string' || value.length > Math.ceil(NATIVE_SOCKET_MESSAGE_LIMIT / 3) * 4 || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new TypeError('Invalid native socket message')
  const bytes = base64ToBytes(value)
  if (bytes.byteLength > NATIVE_SOCKET_MESSAGE_LIMIT) throw new TypeError('Native socket message is too large')
  return bytes
}

/** WebSocket shape used by the existing collaboration, terminal, and agent clients. */
export class NativeDirectSocket extends EventTarget {
  readonly CONNECTING = 0; readonly OPEN = 1; readonly CLOSING = 2; readonly CLOSED = 3
  readyState = 0
  binaryType: BinaryType = 'blob'
  bufferedAmount = 0
  protocol = ''; extensions = ''
  onopen: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  private outgoing = Promise.resolve()
  private closeTimer?: ReturnType<typeof setTimeout>
  private openingTimer: ReturnType<typeof setTimeout>
  readonly bridge: NativeDirectBridge
  readonly id: string
  readonly url: string
  private readonly protocols: string[]
  private readonly remove: () => void
  constructor(bridge: NativeDirectBridge, id: string, url: string, protocols: string[], remove: () => void) {
    super()
    this.bridge = bridge; this.id = id; this.url = url; this.protocols = protocols; this.remove = remove
    for (const name of ['open', 'message', 'error', 'close'] as const) this.addEventListener(name, event => {
      const callback = this[`on${name}`] as ((event: Event) => void) | null
      callback?.call(this, event)
    })
    this.openingTimer = setTimeout(() => this.fail(), 30_000)
  }
  receive(value: Record<string, unknown>) {
    if (this.readyState === this.CLOSED) return
    try {
      if (value.type === 'open') {
        if (this.readyState !== this.CONNECTING || typeof value.protocol !== 'string' || value.protocol !== '' && !this.protocols.includes(value.protocol)) throw new Error('Invalid native socket protocol')
        clearTimeout(this.openingTimer); this.protocol = value.protocol; this.readyState = this.OPEN
        this.dispatchEvent(new Event('open'))
      } else if (value.type === 'message' && this.readyState === this.OPEN) {
        if (typeof value.binary !== 'boolean') throw new Error('Invalid native socket message')
        const bytes = decodeMessage(value.bodyBase64)
        const data = value.binary ? this.binaryType === 'arraybuffer' ? bytes.buffer : new Blob([bytes as Uint8Array<ArrayBuffer>]) : new TextDecoder().decode(bytes)
        this.dispatchEvent(new MessageEvent('message', { data }))
      } else if (value.type === 'close') {
        this.finish(typeof value.code === 'number' && Number.isInteger(value.code) && value.code >= 1000 && value.code <= 4999 ? value.code : 1006, typeof value.reason === 'string' ? value.reason.slice(0, 123) : '', value.wasClean === true)
      } else if (value.type === 'error') this.fail()
    } catch { this.fail() }
  }
  send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
    if (this.readyState === this.CONNECTING) throw new DOMException('Socket is not open', 'InvalidStateError')
    if (this.readyState !== this.OPEN) return
    const binary = typeof data !== 'string'
    const snapshot = typeof data === 'string' ? new TextEncoder().encode(data) : data instanceof Blob ? data : ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice() : new Uint8Array(data).slice()
    const size = snapshot instanceof Blob ? snapshot.size : snapshot.byteLength
    if (size > NATIVE_SOCKET_MESSAGE_LIMIT || this.bufferedAmount + size > QUEUE_LIMIT) { this.close(1009); throw new DOMException('Native socket queue is full', 'QuotaExceededError') }
    this.bufferedAmount += size
    this.outgoing = this.outgoing.then(async () => {
      if (this.readyState === this.CLOSED) return
      const bytes = snapshot instanceof Blob ? new Uint8Array(await snapshot.arrayBuffer()) : snapshot
      if (this.readyState !== this.CLOSED) await nativeDeadline(this.bridge.sendSocket({ id: this.id, bodyBase64: bytesToBase64(bytes), binary }), 30_000)
    }).catch(() => this.fail()).finally(() => { this.bufferedAmount -= size })
  }
  close(code = 1000, reason = '') {
    if (code !== 1000 && code !== 1009 && !(code >= 3000 && code <= 4999)) throw new DOMException('Invalid socket close code', 'InvalidAccessError')
    if (new TextEncoder().encode(reason).length > 123) throw new DOMException('Socket close reason is too long', 'SyntaxError')
    if (this.readyState >= this.CLOSING) return
    this.readyState = this.CLOSING; clearTimeout(this.openingTimer)
    this.closeTimer = setTimeout(() => this.finish(1006), 5000)
    void this.outgoing.then(() => nativeDeadline(this.bridge.closeSocket({ id: this.id, code, reason }), 5000)).catch(() => this.finish(1006))
  }
  fail() {
    if (this.readyState === this.CLOSED) return
    this.dispatchEvent(new Event('error'))
    void this.bridge.closeSocket({ id: this.id }).catch(() => {})
    this.finish(1006)
  }
  finish(code: number, reason = '', wasClean = false) {
    if (this.readyState === this.CLOSED) return
    clearTimeout(this.openingTimer); clearTimeout(this.closeTimer)
    this.readyState = this.CLOSED; this.remove()
    this.dispatchEvent(new CloseEvent('close', { code, reason, wasClean }))
  }
}
