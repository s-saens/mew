export class ApiResponseError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiResponseError'
    this.status = status
  }
}

export async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    if (res.status === 401) {
      // 세션 만료 — 인증 bootstrap이 이 이벤트를 받아 로그인 화면으로 전환한다
      window.dispatchEvent(new Event('mew:auth-expired'))
    }
    const body = await res.json().catch(() => ({ error: res.statusText }))
    const message = typeof body?.error === 'string' ? body.error.trim() : ''
    throw new ApiResponseError(message || res.statusText.trim() || `HTTP ${res.status}`, res.status)
  }
  return res.json() as Promise<T>
}
