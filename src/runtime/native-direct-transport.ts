import type { AppTransport } from './app-runtime.ts'
import { base64ToBytes, bytesToBase64, type NativeDirectBridge } from './native-bridge.ts'
import { nativeDirectPath } from './native-direct-path.ts'
import { NativeDirectSocket } from './native-direct-socket.ts'
import { uuid } from '../utils/uuid.ts'

export const NATIVE_HTTP_LIMIT = 32 * 1024 * 1024
const MAX_REQUESTS = 16
const FORBIDDEN_HEADERS = new Set(['authorization', 'cookie', 'host', 'origin', 'referer', 'connection', 'content-length', 'transfer-encoding', 'set-cookie'])

async function readBody(request: Request, signal: AbortSignal): Promise<Uint8Array> {
  const reader = request.body?.getReader()
  if (!reader) return new Uint8Array()
  const parts: Uint8Array[] = []; let length = 0
  const abort = () => { void reader.cancel().catch(() => {}) }
  signal.addEventListener('abort', abort, { once: true })
  try {
    while (true) {
      signal.throwIfAborted()
      const part = await reader.read()
      if (part.done) break
      length += part.value.length
      if (length > NATIVE_HTTP_LIMIT) { await reader.cancel(); throw new RangeError('Native request body is too large') }
      parts.push(part.value)
    }
    const bytes = new Uint8Array(length); let offset = 0
    for (const part of parts) { bytes.set(part, offset); offset += part.length }
    return bytes
  } finally { signal.removeEventListener('abort', abort); reader.releaseLock() }
}

export class NativeDirectTransport implements AppTransport {
  private closed = false
  private pending = new Map<string, (error: Error) => void>()
  private sockets = new Map<string, NativeDirectSocket>()
  private readonly bridge: NativeDirectBridge
  private readonly events: EventTarget
  constructor(bridge: NativeDirectBridge, events: EventTarget = window) {
    this.bridge = bridge; this.events = events
    events.addEventListener('mew-native-socket', this.receiveSocket)
  }
  fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (this.closed) throw new Error('Native connection is closed')
    if (this.pending.size >= MAX_REQUESTS) throw new Error('Native request queue is full')
    const path = nativeDirectPath(input instanceof Request ? input.url : String(input))
    const request = new Request(input instanceof Request ? input : new URL(path, 'mew-app://workspace/'), init)
    if (!['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) throw new TypeError('Unsupported native request method')
    request.signal.throwIfAborted()
    const id = uuid()
    const operation = new AbortController()
    let rejectCancelled!: (error: Error) => void
    const cancelled = new Promise<never>((_, reject) => { rejectCancelled = reject })
    const cancel = (error: Error) => {
      if (!this.pending.has(id)) return
      this.pending.delete(id); operation.abort(error); rejectCancelled(error)
      void this.bridge.cancel({ id }).catch(() => {})
    }
    this.pending.set(id, cancel)
    const abort = () => cancel(request.signal.reason instanceof Error ? request.signal.reason : new DOMException('Aborted', 'AbortError'))
    request.signal.addEventListener('abort', abort, { once: true })
    const timer = setTimeout(() => cancel(new Error('Native network request timed out')), 30_000)
    try {
      const response = await Promise.race([cancelled, (async () => {
        const bytes = await readBody(request, operation.signal)
        if (!this.pending.has(id) || this.closed) throw new DOMException('Aborted', 'AbortError')
        const headers = [...request.headers].filter(([name]) => !FORBIDDEN_HEADERS.has(name) && !name.startsWith('sec-'))
        const value = await this.bridge.fetch({ id, path, method: request.method, headers, ...(bytes.length ? { bodyBase64: bytesToBase64(bytes) } : {}) })
        if (!value || !Number.isInteger(value.status) || value.status < 200 || value.status > 599 || !Array.isArray(value.headers) || value.headers.length > 128 || value.headers.some(pair => !Array.isArray(pair) || pair.length !== 2 || pair.some(part => typeof part !== 'string' || part.length > 8192 || /[\r\n]/.test(part)))) throw new TypeError('Invalid native response')
        if (typeof value.bodyBase64 !== 'string' || value.bodyBase64.length > Math.ceil(NATIVE_HTTP_LIMIT / 3) * 4 || value.bodyBase64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value.bodyBase64)) throw new RangeError('Invalid native response body')
        const body = base64ToBytes(value.bodyBase64)
        if (body.length > NATIVE_HTTP_LIMIT) throw new RangeError('Native response body is too large')
        const safeHeaders = value.headers.filter(([name]) => !['set-cookie', 'content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(name.toLowerCase()))
        return new Response(request.method === 'HEAD' || [204, 205, 304].includes(value.status) ? null : body as Uint8Array<ArrayBuffer>, { status: value.status, headers: safeHeaders })
      })()])
      return response
    } finally { clearTimeout(timer); this.pending.delete(id); request.signal.removeEventListener('abort', abort) }
  }
  socket(url: string, protocols?: string | string[]): WebSocket {
    if (this.closed || this.sockets.size >= 16) throw new Error('Native socket connection is unavailable')
    const path = nativeDirectPath(url, true), requested = typeof protocols === 'string' ? [protocols] : protocols ?? []
    if (requested.length > 16 || new Set(requested).size !== requested.length || requested.some(value => typeof value !== 'string' || value.length > 256 || !/^[!#$%&'*+\-.^_`|~\w]+$/.test(value))) throw new DOMException('Invalid socket protocols', 'SyntaxError')
    const id = uuid(), socket = new NativeDirectSocket(this.bridge, id, url, requested, () => this.sockets.delete(id))
    this.sockets.set(id, socket)
    void this.bridge.openSocket({ id, path, protocols: requested }).catch(() => socket.fail())
    return socket as unknown as WebSocket
  }
  private receiveSocket = (event: Event) => {
    const value = (event as CustomEvent<unknown>).detail
    if (!value || typeof value !== 'object' || !('id' in value) || typeof value.id !== 'string') return
    this.sockets.get(value.id)?.receive(value as Record<string, unknown>)
  }
  close() {
    if (this.closed) return
    this.closed = true; this.events.removeEventListener('mew-native-socket', this.receiveSocket)
    for (const cancel of this.pending.values()) cancel(new Error('Native connection is closed'))
    for (const socket of this.sockets.values()) { void this.bridge.closeSocket({ id: socket.id }).catch(() => {}); socket.finish(1006) }
  }
}
