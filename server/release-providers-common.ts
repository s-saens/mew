import type { ReleaseConnectionConfig, ReleaseProviderRunState } from '../shared/release-providers.ts'

export class ReleaseProviderError extends Error {
  status: number
  uncertain: boolean
  constructor(message: string, status = 400, uncertain = false) { super(message); this.status = status; this.uncertain = uncertain }
}

export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export function hasReleaseControl(value: string): boolean {
  return Array.from(value).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
}

function field(value: unknown, label: string, expression: RegExp, max = 200): string {
  if (typeof value !== 'string' || value.length > max || hasReleaseControl(value) || !expression.test(value)) throw new ReleaseProviderError(`${label} 설정을 확인하세요.`)
  return value
}

export function connectionConfig(value: unknown): ReleaseConnectionConfig {
  const config = record(value), label = field(config.label, '연결 이름', /^.+$/u, 100).trim()
  if (!label) throw new ReleaseProviderError('연결 이름을 입력하세요.')
  const ref = (value: unknown) => field(value, '브랜치', /^\S+$/u, 200)
  switch (config.provider) {
    case 'github-actions': {
      const owner = field(config.owner, 'GitHub 계정', /^[a-z\d](?:[a-z\d-]{0,38})$/i)
      const repo = field(config.repo, 'GitHub 저장소', /^(?!\.{1,2}$)[\w.-]+$/)
      const workflow = field(config.workflow, '워크플로', /^(?:[1-9]\d*|[\w.-]+\.ya?ml)$/i)
      let inputs: Record<string, string | boolean | number> | undefined
      if (config.inputs !== undefined) {
        const values = record(config.inputs), entries = Object.entries(values)
        if (values !== config.inputs || entries.length > 25 || JSON.stringify(values).length > 16_384) throw new ReleaseProviderError('워크플로 입력값을 확인하세요.')
        inputs = {}
        for (const [key, value] of entries) {
          field(key, '입력 이름', /^[a-zA-Z_][\w-]*$/, 100)
          if (typeof value !== 'string' && typeof value !== 'boolean' && !(typeof value === 'number' && Number.isFinite(value))) throw new ReleaseProviderError('워크플로 입력값을 확인하세요.')
          Object.defineProperty(inputs, key, { value, enumerable: true, configurable: true, writable: true })
        }
      }
      return { provider: 'github-actions', label, owner, repo, workflow, ref: ref(config.ref), ...(inputs ? { inputs } : {}) }
    }
    case 'cloudflare-pages':
      return { provider: 'cloudflare-pages', label, accountId: field(config.accountId, 'Cloudflare 계정 ID', /^[a-f\d]{32}$/i), projectName: field(config.projectName, 'Pages 프로젝트', /^[a-z\d][a-z\d-]*$/, 63), branch: ref(config.branch) }
    case 'google-cloud-build':
      return { provider: 'google-cloud-build', label, projectId: field(config.projectId, 'Google 프로젝트', /^[a-z][a-z\d-]{4,61}[a-z\d]$|^\d{6,30}$/), location: field(config.location, 'Google 리전', /^[a-z][a-z\d-]*$/, 64), triggerId: field(config.triggerId, '빌드 트리거', /^[a-zA-Z\d][a-zA-Z\d-]*$/, 128), branch: ref(config.branch) }
    default: throw new ReleaseProviderError('지원하는 공개 서비스를 선택하세요.')
  }
}

export function safeReleaseUrl(value: unknown, hosts?: readonly string[]): string | undefined {
  if (typeof value !== 'string' || value.length > 2048) return undefined
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.port || hasReleaseControl(value) || /\s/.test(value) || (hosts && !hosts.includes(url.hostname))) return undefined
    return url.href
  } catch { return undefined }
}

export function githubState(status: unknown, conclusion: unknown): ReleaseProviderRunState {
  if (status === 'in_progress') return 'running'
  if (['queued', 'requested', 'waiting', 'pending'].includes(String(status))) return 'queued'
  if (status !== 'completed') return 'unknown'
  if (conclusion === 'success') return 'succeeded'
  if (conclusion === 'cancelled' || conclusion === 'skipped') return 'cancelled'
  if (['failure', 'timed_out', 'action_required', 'startup_failure', 'stale'].includes(String(conclusion))) return 'failed'
  return 'unknown'
}

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024

export class ReleaseProviderClient {
  private request: typeof fetch
  constructor(request: typeof fetch) { this.request = request }
  async json(url: string, token: string, options: RequestInit = {}): Promise<Record<string, unknown>> {
    const changes = options.method === 'POST'
    let response: Response
    try {
      response = await this.request(url, { ...options, headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, ...options.headers }, redirect: 'error', signal: AbortSignal.timeout(20_000) })
    } catch { throw new ReleaseProviderError('공개 서비스에 연결하지 못했습니다. 서비스 화면에서 실행 여부를 확인하세요.', 503, changes) }
    if (!response.ok) {
      void response.body?.cancel().catch(() => {})
      if (response.status === 401 || response.status === 403) throw new ReleaseProviderError('연결 권한이 없거나 만료되었습니다. 연결 설정에서 접근 권한을 확인하세요.', 428)
      if (response.status === 404) throw new ReleaseProviderError('연결한 프로젝트나 실행을 찾을 수 없습니다. 연결 설정을 확인하세요.', 404)
      if (response.status === 429) throw new ReleaseProviderError('공개 서비스의 요청 한도에 도달했습니다. 잠시 후 상태를 확인하세요.', 503)
      throw new ReleaseProviderError('공개 서비스가 요청을 처리하지 못했습니다. 서비스 화면에서 상태를 확인하세요.', 502, changes && response.status >= 500)
    }
    if (Number(response.headers.get('Content-Length')) > MAX_RESPONSE_BYTES) { void response.body?.cancel().catch(() => {}); throw new ReleaseProviderError('서비스 응답이 너무 큽니다. 서비스 화면에서 상태를 확인하세요.', 502, changes) }
    const reader = response.body?.getReader(), chunks: Uint8Array[] = []
    let size = 0
    try {
      if (!reader) throw new Error('empty')
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > MAX_RESPONSE_BYTES) { await reader.cancel(); throw new Error('large') }
        chunks.push(value)
      }
      const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('shape')
      return parsed
    } catch { throw new ReleaseProviderError('서비스 응답을 확인하지 못했습니다. 서비스 화면에서 실행 여부를 확인하세요.', 502, changes) }
    finally { reader?.releaseLock() }
  }
}
