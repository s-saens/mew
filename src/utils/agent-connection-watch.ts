import type { AgentConnectionReady, AgentConnectionPong } from '../../shared/agent-connection.ts'
import { uuid } from './uuid.ts'

export const AGENT_CONNECTION_HANDSHAKE_TIMEOUT = 3000
export const AGENT_CONNECTION_IDLE_INTERVAL = 15_000
export const AGENT_CONNECTION_PROBE_TIMEOUT = 750

type Packet = { type: string } | AgentConnectionReady | AgentConnectionPong
type Options = {
  available(): boolean
  reconnect(): void
}
type Socket = Pick<WebSocket, 'readyState' | 'send' | 'bufferedAmount'> & { readonly connectionStartedAt?: number }

/** Check the relay independently of provider initialization or task activity. */
export class AgentConnectionWatch {
  private disposed = false
  private socket: Socket
  private options: Options
  private started?: number
  private pausedAt?: number
  private lastMessage = performance.now()
  private receivedFirst = false
  private supportsProbe = false
  private lastProbe = -Infinity
  private probeTimeout = AGENT_CONNECTION_PROBE_TIMEOUT
  private pending?: { id: string; sentAt: number }
  private handshake?: ReturnType<typeof setTimeout>
  private idle?: ReturnType<typeof setTimeout>
  private deadline?: ReturnType<typeof setTimeout>

  constructor(socket: Socket, options: Options) {
    this.socket = socket
    this.options = options
    this.started = 'connectionStartedAt' in socket ? socket.connectionStartedAt : performance.now()
    if (!options.available()) this.pausedAt = performance.now()
    this.armHandshake()
  }

  receive(packet: Packet) {
    if (this.disposed) return
    const now = performance.now()
    if (!this.receivedFirst) {
      this.readHandshakeStart()
      const started = this.started ?? now
      const paused = this.pausedAt === undefined ? 0 : now - Math.max(started, this.pausedAt)
      this.receivedFirst = true
      this.probeTimeout = Math.max(AGENT_CONNECTION_PROBE_TIMEOUT, Math.min(5000, Math.max(0, now - started - paused) * 3 + 100))
      clearTimeout(this.handshake)
      this.handshake = undefined
    }
    this.lastMessage = now
    if (packet.type === 'ready') this.supportsProbe = (packet as AgentConnectionReady).connectionProbe === true
    if (packet.type === 'pong' && this.pending && (packet as AgentConnectionPong).id === this.pending.id) {
      this.probeTimeout = Math.max(AGENT_CONNECTION_PROBE_TIMEOUT, Math.min(5000, (now - this.pending.sentAt) * 3 + 100))
      this.clearProbe()
    }
    this.armIdle()
  }

  resume() {
    if (this.disposed) return
    if (!this.options.available()) {
      this.pause()
      return
    }
    this.readHandshakeStart()
    if (this.pausedAt !== undefined) {
      if (this.started !== undefined) this.started += performance.now() - Math.max(this.started, this.pausedAt)
      this.pausedAt = undefined
    }
    if (!this.receivedFirst) {
      if (this.started !== undefined && performance.now() - this.started >= AGENT_CONNECTION_HANDSHAKE_TIMEOUT) this.fail()
      else this.armHandshake()
      return
    }
    if (this.socket.readyState !== 1) return
    if (this.supportsProbe) this.probe()
    else if (performance.now() - this.lastMessage >= AGENT_CONNECTION_IDLE_INTERVAL) this.fail()
    this.armIdle()
  }

  dispose() {
    this.disposed = true
    this.clearTimers()
  }

  private armHandshake() {
    if (this.disposed || this.receivedFirst || this.handshake !== undefined) return
    if (!this.options.available()) { this.pause(); return }
    this.readHandshakeStart()
    this.handshake = setTimeout(() => {
      this.handshake = undefined
      if (this.disposed) return
      if (!this.options.available()) { this.pause(); return }
      this.readHandshakeStart()
      if (this.started !== undefined && performance.now() - this.started >= AGENT_CONNECTION_HANDSHAKE_TIMEOUT) this.fail()
      else this.armHandshake()
    }, this.started === undefined ? AGENT_CONNECTION_HANDSHAKE_TIMEOUT : Math.max(0, this.started + AGENT_CONNECTION_HANDSHAKE_TIMEOUT - performance.now()))
  }

  private readHandshakeStart() {
    if (this.started !== undefined) return
    const started = this.socket.connectionStartedAt
    if (typeof started === 'number' && Number.isFinite(started)) this.started = started
  }

  private armIdle() {
    if (this.disposed || !this.receivedFirst || !this.supportsProbe || this.pending || this.idle !== undefined || !this.options.available()) return
    const remaining = this.lastMessage + AGENT_CONNECTION_IDLE_INTERVAL - performance.now()
    this.idle = setTimeout(() => {
      this.idle = undefined
      if (this.disposed) return
      if (!this.options.available()) { this.pause(); return }
      if (performance.now() - this.lastMessage >= AGENT_CONNECTION_IDLE_INTERVAL) this.probe()
      this.armIdle()
    }, remaining > 0 ? remaining : 1000)
  }

  private probe() {
    if (this.disposed || this.pending || this.socket.readyState !== 1 || this.socket.bufferedAmount > 0
      || !this.options.available() || performance.now() - this.lastProbe < 250) return
    const id = uuid()
    const sentAt = this.lastProbe = performance.now()
    this.pending = { id, sentAt }
    this.deadline = setTimeout(() => {
      this.deadline = undefined
      if (this.disposed) return
      if (!this.options.available()) { this.pause(); return }
      this.fail()
    }, this.probeTimeout)
    try { this.socket.send(JSON.stringify({ type: 'ping', id })) }
    catch { this.fail() }
  }

  private clearProbe() {
    clearTimeout(this.deadline)
    this.deadline = undefined
    this.pending = undefined
  }

  private pause() {
    this.pausedAt ??= performance.now()
    this.clearTimers()
  }

  private clearTimers() {
    clearTimeout(this.handshake)
    clearTimeout(this.idle)
    this.handshake = undefined
    this.idle = undefined
    this.clearProbe()
  }

  private fail() {
    if (this.disposed) return
    this.dispose()
    this.options.reconnect()
  }
}
