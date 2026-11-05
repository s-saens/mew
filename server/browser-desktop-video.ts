import { createRequire } from 'node:module'
// @ts-expect-error The installed desktop helper is an independently shipped JavaScript module.
import { nativeDirect } from '../native/remote-desktop/native-direct.mjs'
import { videoLevel } from '../native/remote-desktop/video-settings.mjs'

const requireNative = createRequire(new URL('../native/remote-desktop/package.json', import.meta.url))
const MAX_FRAME_BYTES = 4 * 1024 * 1024

/** FFmpeg stdout chunks do not correspond to pictures. AUD NALs delimit pictures. */
export class H264AccessUnits {
  private pending = Buffer.alloc(0)
  private scan = 0
  private aud = false
  private readonly maximum: number
  private readonly emit: (data: Buffer) => void

  constructor(emit: (data: Buffer) => void, { maxBytes = MAX_FRAME_BYTES } = {}) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 16 || maxBytes > MAX_FRAME_BYTES) throw new Error('Invalid H.264 access-unit limit')
    this.emit = emit
    this.maximum = maxBytes
  }

  push(chunk: Uint8Array) {
    // A large caller-owned chunk can contain many pictures; never copy it whole.
    for (let offset = 0; offset < chunk.byteLength; offset += 65536) {
      const part = Buffer.from(chunk.buffer, chunk.byteOffset + offset, Math.min(65536, chunk.byteLength - offset))
      this.pending = Buffer.concat([this.pending, part])
      while (this.scan + 3 < this.pending.length) {
        const start = this.scan
        if (this.pending[start] !== 0 || this.pending[start + 1] !== 0) { this.scan++; continue }
        const prefix = this.pending[start + 2] === 1 ? 3 : this.pending[start + 2] === 0 && this.pending[start + 3] === 1 ? 4 : 0
        if (!prefix) { this.scan++; continue }
        if (start + prefix >= this.pending.length) break
        if ((this.pending[start + prefix] & 31) === 9) {
          if (this.aud) {
            this.output(this.pending.subarray(0, start))
            this.pending = Buffer.from(this.pending.subarray(start))
            this.scan = prefix + 1
            continue
          }
          this.aud = true
        }
        this.scan += prefix + 1
      }
      if (this.pending.length > this.maximum) {
        this.reset()
        throw new Error('H.264 access unit exceeds the bounded video buffer')
      }
    }
  }

  flush() {
    try { if (this.aud) this.output(this.pending) } finally { this.reset() }
  }

  reset() { this.pending = Buffer.alloc(0); this.scan = 0; this.aud = false }

  private output(data: Buffer) {
    if (data.length > this.maximum) { this.reset(); throw new Error('H.264 access unit exceeds the bounded video buffer') }
    // Do not pass an isolated delimiter/header tail into the RTP reference chain.
    for (let index = 0; index + 3 < data.length; index++) {
      if (data[index] !== 0 || data[index + 1] !== 0) continue
      const prefix = data[index + 2] === 1 ? 3 : data[index + 2] === 0 && data[index + 3] === 1 ? 4 : 0
      if (prefix && index + prefix < data.length && [1, 2, 3, 4, 5].includes(data[index + prefix] & 31)) { this.emit(Buffer.from(data)); return }
    }
  }
}

export interface BrowserVideoSize { width: number; height: number; fps: number }
export interface BrowserVideoMode extends BrowserVideoSize {
  bitrate: number
  profile: 'baseline'
  payload: number
  level: number
  priority: 'speed'
  resolution: string
  quality: string
}

function videoSize(value: BrowserVideoSize): BrowserVideoSize {
  if (!value || !Number.isInteger(value.width) || !Number.isInteger(value.height) || !Number.isInteger(value.fps)
    || value.width < 160 || value.width > 3840 || value.height < 120 || value.height > 2160 || value.fps < 1 || value.fps > 60) throw new Error('Invalid browser video size')
  return { width: value.width - value.width % 2, height: value.height - value.height % 2, fps: value.fps }
}

/** X11 pixels are encoded once into a low-delay elementary H.264 stream. */
export function browserVideoFFmpegArgs(value: BrowserVideoSize & { display: string; bitrate: number; level?: number }) {
  const size = videoSize(value)
  if (!/^:\d+(?:\.\d+)?$/.test(value.display) || !Number.isSafeInteger(value.bitrate) || value.bitrate < 350000 || value.bitrate > 50000000) throw new Error('Invalid browser video encoder settings')
  const level = value.level ?? videoLevel(size.width, size.height, size.fps)
  if (!Number.isInteger(level) || level < videoLevel(size.width, size.height, size.fps) || level > 52) throw new Error('Invalid browser video level')
  return ['-hide_banner', '-loglevel', 'warning', '-nostdin', '-fflags', 'nobuffer', '-flags', 'low_delay',
    '-f', 'x11grab', '-draw_mouse', '1', '-framerate', String(size.fps), '-video_size', `${size.width}x${size.height}`, '-i', value.display,
    '-an', '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency', '-profile:v', 'baseline', '-level:v', `${Math.floor(level / 10)}.${level % 10}`,
    '-pix_fmt', 'yuv420p', '-threads:v', '2', '-bf', '0', '-b:v', String(value.bitrate), '-maxrate', String(value.bitrate), '-bufsize', String(Math.round(value.bitrate / 2)),
    '-g', String(size.fps), '-keyint_min', String(size.fps), '-sc_threshold', '0',
    '-x264-params', 'repeat-headers=1:aud=1:rc-lookahead=0:sync-lookahead=0:sliced-threads=1', '-flush_packets', '1', '-f', 'h264', 'pipe:1']
}

interface NativeMode extends BrowserVideoSize { bitrate: number; profile: string; payload: number; level: number; resolution: string; quality: string }
interface VideoOptions {
  emit: (value: Record<string, unknown>) => void
  onVideo: (mode: BrowserVideoMode) => void | Promise<void>
  keyframe: () => void
  onError: (error: Error) => void
  input?: (value: unknown, reliable: boolean) => void
  onBitrate?: (value: number) => void
  iceServers?: { urls: string | string[] }[]
  autoNat?: boolean
}
interface DirectTransport {
  signal(value: Record<string, unknown>): void
  configure(value: BrowserVideoMode): void
  frame(value: { data: Buffer; timestamp: number }, done?: () => void): void
  close(): Promise<void>
}

/** Reuses the desktop's bounded RTP pacer and reliable/unreliable input channels. */
export class BrowserDesktopVideo {
  private readonly options: VideoOptions
  private direct?: DirectTransport
  private requested?: BrowserVideoSize
  private accepted?: NativeMode
  private closed = false
  private configuration = 0

  constructor(options: VideoOptions) { this.options = options }

  configure(size: BrowserVideoSize) {
    if (this.closed) return
    this.requested = videoSize(size)
    if (this.direct) { if (this.accepted) this.configureAccepted(); return }
    const rtc = requireNative('node-datachannel')
    const direct = nativeDirect(rtc, {
      settings: { resolution: '1080p', fps: 60, quality: 'balanced', priority: 'speed' },
      iceServers: this.options.iceServers ?? [], autoNat: this.options.autoNat ?? false, localCursor: false,
      emit: this.options.emit,
      input: this.options.input ?? (() => {}),
      keyframe: () => { if (!this.closed) this.options.keyframe() },
      bitrate: (value: number) => { if (!this.closed) this.options.onBitrate?.(value) },
      fail: (error: Error) => { if (!this.closed) this.options.onError(error) },
      video: (modes: NativeMode[]) => {
        if (this.closed) return
        this.accepted = modes.find(mode => mode.profile === 'baseline')
        if (!this.accepted) { this.options.onError(new Error('The browser did not accept low-delay baseline H.264')); return }
        this.configureAccepted()
      },
    })
    this.direct = direct
  }

  private configureAccepted() {
    if (!this.accepted || !this.requested || !this.direct || this.closed) return
    const accepted = this.accepted, requested = this.requested
    const scale = Math.min(1, accepted.width / requested.width, accepted.height / requested.height)
    const width = Math.max(2, Math.floor(requested.width * scale / 2) * 2)
    const height = Math.max(2, Math.floor(requested.height * scale / 2) * 2)
    const fps = Math.min(requested.fps, accepted.fps)
    const mode: BrowserVideoMode = { ...accepted, width, height, fps, profile: 'baseline', priority: 'speed', level: Math.min(accepted.level, videoLevel(width, height, fps)),
      bitrate: Math.max(350000, Math.min(accepted.bitrate, Math.round(width * height * fps * .15))) }
    this.direct.configure(mode)
    this.options.emit({ type: 'negotiatedvideo', ...mode })
    const configuration = ++this.configuration
    void Promise.resolve().then(() => {
      if (!this.closed && configuration === this.configuration) return this.options.onVideo(mode)
    }).catch(error => { if (!this.closed) this.options.onError(error instanceof Error ? error : new Error(String(error))) })
  }

  signal(value: Record<string, unknown>) {
    if (this.closed || !this.direct) return
    if (!value || !['answer', 'candidate'].includes(String(value.type))) throw new Error('Invalid browser video signal')
    if (value.type === 'answer' && (typeof value.sdp !== 'string' || value.sdp.length > 131072)) throw new Error('Invalid browser video answer')
    if (value.type === 'candidate') {
      const candidate = value.candidate as { candidate?: unknown; sdpMid?: unknown } | undefined
      if (!candidate || typeof candidate.candidate !== 'string' || candidate.candidate.length > 4096
        || candidate.sdpMid !== undefined && (typeof candidate.sdpMid !== 'string' || candidate.sdpMid.length > 128)) throw new Error('Invalid browser video candidate')
    }
    this.direct.signal(value)
  }

  frame(data: Buffer, timestamp: number, done: () => void = () => {}) {
    if (this.closed || !this.direct || !this.accepted) { done(); return }
    if (!Buffer.isBuffer(data) || data.length > MAX_FRAME_BYTES || !Number.isSafeInteger(timestamp) || timestamp < 0) { done(); throw new Error('Invalid encoded browser frame') }
    this.direct.frame({ data, timestamp }, done)
  }

  async close() { if (this.closed) return; this.closed = true; await this.direct?.close(); this.direct = undefined; this.accepted = undefined }
}
