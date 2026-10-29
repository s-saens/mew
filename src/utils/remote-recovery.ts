export function remoteRecoveryDelay(failures: number, offline = false, random = Math.random()) {
  if (!offline && failures === 0) return 0
  const base = offline ? [2000, 5000, 10_000, 30_000][Math.min(Math.max(0, failures), 3)]
    : Math.min(30_000, 250 * 2 ** Math.min(Math.max(0, failures - 1), 7))
  return Math.min(30_000, Math.round(base * (0.75 + Math.max(0, Math.min(1, random)) / 2)))
}

export function remoteRecoveryMessage(code?: string, message?: string) {
  if (code === 'offline') return '호스트가 오프라인입니다. 다시 연결을 기다리는 중입니다.'
  if (code === 'network-offline') return '인터넷 연결을 기다리는 중입니다.'
  if (code === 'authentication-timeout') return '로그인 상태 확인이 지연되고 있습니다. 다시 연결하는 중입니다.'
  if (code === 'rate-limited') return '연결 요청이 많습니다. 잠시 후 다시 연결합니다.'
  return message || '연결 복구 중'
}

export async function remoteDeadline<T>(read: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal, message = '연결 응답 시간이 초과됐습니다.') {
  signal?.throwIfAborted()
  const request = new AbortController()
  const cancel = () => request.abort(signal?.reason)
  let reject!: (reason: unknown) => void
  const cancelled = new Promise<never>((_resolve, fail) => { reject = fail })
  const aborted = () => reject(request.signal.reason)
  request.signal.addEventListener('abort', aborted, { once: true })
  signal?.addEventListener('abort', cancel, { once: true })
  const timer = setTimeout(() => request.abort(Object.assign(new Error(message), { code: 'response-timeout' })), 10_000)
  try {
    if (signal?.aborted) cancel()
    const pending = Promise.resolve().then(() => { request.signal.throwIfAborted(); return read(request.signal) })
    return await Promise.race([pending, cancelled])
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', cancel)
    request.signal.removeEventListener('abort', aborted)
  }
}

export async function remotePresence(origin: string, instance: string, signal?: AbortSignal): Promise<boolean | undefined> {
  return remoteDeadline(async request => {
    const url = new URL('/central/presence', origin)
    url.searchParams.set('instance', instance)
    const response = await fetch(url, { signal: request, cache: 'no-store', credentials: 'omit' })
    let value: { online?: unknown; error?: string; code?: string }
    try { value = await response.json() }
    catch (error) {
      request.throwIfAborted()
      if (response.status === 404) return undefined
      if (response.ok) throw error
      value = {}
    }
    if (!value || typeof value !== 'object') {
      if (response.status === 404) return undefined
      throw new Error('기기의 연결 상태를 확인하지 못했습니다.')
    }
    if (response.status === 404 && value.code !== 'instance-not-found') return undefined
    if (!response.ok) throw Object.assign(new Error(value.error || '연결 서버의 응답을 기다리는 중입니다.'), {
      status: response.status, code: value.code || (response.status === 429 ? 'rate-limited' : 'central-unavailable'),
      retryAfter: response.status === 429 ? presenceRetryAfter(response.headers.get('Retry-After')) : 0,
    })
    if (typeof value.online !== 'boolean') throw new Error('기기의 연결 상태를 확인하지 못했습니다.')
    return value.online
  }, signal)
}

function presenceRetryAfter(value: string | null) {
  const seconds = value === null ? 30 : Number(value)
  return Number.isFinite(seconds) && seconds >= 0 ? Math.min(60_000, seconds * 1000) : 30_000
}
