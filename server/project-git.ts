import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { GitConnectionError, GitConnections, gitConnections, gitIdentityEnv } from './git-connections.ts'
import { gitProvider } from './git-providers.ts'
import { providerRemote, withGitCredential } from './git-execution.ts'
import { ProjectRegistry, ProjectRegistryError, projectRegistry } from './project-registry.ts'

export interface ConnectedGitRepository { name: string; fullName: string; url: string; private: boolean }
type CloneRunner = (args: string[], options: { cwd: string; env: NodeJS.ProcessEnv }) => Promise<void>
const runClone: CloneRunner = async (args, options) => {
  await promisify(execFile)('git', args, { ...options, timeout: 120_000, maxBuffer: 2_000_000 })
}

/** Managed cloning never consults host Git credentials or executes repository hooks. */
export class ProjectGit {
  private registry: ProjectRegistry
  private connections: GitConnections
  private request: typeof fetch
  private run: CloneRunner
  private credential: typeof withGitCredential
  constructor(registry = projectRegistry, connections = gitConnections, request: typeof fetch = fetch, run: CloneRunner = runClone, credential = withGitCredential) {
    this.registry = registry; this.connections = connections; this.request = request; this.run = run; this.credential = credential
  }

  async repositories(owner: string): Promise<{ connected: boolean; repositories: ConnectedGitRepository[] }> {
    const provider = gitProvider()
    const connection = await this.connections.resolve(owner, provider.id, provider.host, provider.refresh)
    if (!connection) return { connected: false, repositories: [] }
    const repositories = new Map<string, ConnectedGitRepository>()
    for (let page = 1; ; page++) {
      const response = await this.request(`https://api.github.com/user/repos?affiliation=owner,collaborator,organization_member&visibility=all&sort=updated&per_page=100&page=${page}`, {
        headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${connection.accessToken}` },
        signal: AbortSignal.timeout(20_000), redirect: 'error',
      }).catch(() => { throw new GitConnectionError('GitHub 저장소를 불러오지 못했습니다. 다시 시도하세요.', 503, 'git-provider-unavailable') })
      if (response.status === 401) throw new GitConnectionError('GitHub 연결이 만료되었습니다. 다시 로그인하세요.')
      if (!response.ok) throw new GitConnectionError('GitHub 저장소 권한과 조직의 SSO 승인을 확인한 뒤 다시 시도하세요.', 503, 'git-provider-unavailable')
      const entries: unknown = await response.json()
      if (!Array.isArray(entries)) throw new GitConnectionError('GitHub 저장소 목록을 확인하지 못했습니다.', 503, 'git-provider-unavailable')
      for (const entry of entries) {
        if (typeof entry?.name !== 'string' || typeof entry?.full_name !== 'string' || typeof entry?.clone_url !== 'string' || typeof entry?.private !== 'boolean') continue
        let target: ReturnType<typeof providerRemote>
        try { target = providerRemote(entry.clone_url) } catch { continue }
        repositories.set(target.url, { name: entry.name, fullName: entry.full_name, url: target.url, private: entry.private })
      }
      // Follow every API page; never use a provider-supplied URL for credential forwarding.
      if (!response.headers.get('link')?.includes('rel="next"')) break
      if (page >= 1000) throw new GitConnectionError('GitHub 저장소가 너무 많습니다. 주소로 복제하세요.', 503, 'git-provider-unavailable')
    }
    if (this.connections.get(owner, provider.id, provider.host)?.id !== connection.id) throw new GitConnectionError('GitHub 연결이 변경되었습니다. 다시 시도하세요.')
    return { connected: true, repositories: [...repositories.values()] }
  }

  async clone(owner: string, input: unknown) {
    const url = publicCloneUrl(input)
    const name = decodeURIComponent(url.pathname.split('/').filter(Boolean).at(-1)!).replace(/\.git$/, '')
    const provider = url.hostname === 'github.com' ? gitProvider() : null
    const connection = provider ? await this.connections.resolve(owner, provider.id, provider.host, provider.refresh) : null
    return this.registry.clone(owner, name, async directory => {
      const execute = async (env: NodeJS.ProcessEnv, config: string[]) => {
        try {
          await this.run([...config.flatMap(value => ['-c', value]), '-c', 'core.hooksPath=/dev/null', '-c', 'init.templateDir=', 'clone', '--', url.toString(), directory], { cwd: directory, env })
        } catch { throw new ProjectRegistryError('저장소를 복제하지 못했습니다. 주소, 접근 권한과 Git 계정 연결을 확인하세요.', 409) }
      }
      if (connection) await this.credential(connection, providerRemote(url.toString()), execute)
      else await execute({ ...gitIdentityEnv(), GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null', GIT_CONFIG_SYSTEM: process.platform === 'win32' ? 'NUL' : '/dev/null', GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' }, [
        'credential.helper=', 'credential.useHttpPath=true', 'http.extraHeader=', 'http.cookieFile=', 'http.saveCookies=false', 'http.followRedirects=false', 'http.sslVerify=true', 'protocol.allow=never', 'protocol.https.allow=always',
      ])
    })
  }
}

/** Public GitHub/GitLab HTTPS addresses cannot contain credentials, options, or traversal. */
export function publicCloneUrl(input: unknown): URL {
  let url: URL
  try {
    if (typeof input !== 'string' || input.length > 2048 || /[\s\\\p{Cc}]/u.test(input) || /(?:^|\/)\.{1,2}(?:\/|$)/.test(input)) throw new Error()
    url = new URL(input)
    if (!['github.com', 'gitlab.com'].includes(url.hostname) || url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash || !/^\/[\w.-]+(?:\/[\w.-]+)+\/?$/.test(url.pathname)) throw new Error()
    const segments = url.pathname.split('/').filter(Boolean)
    if (segments.some(segment => segment === '.' || segment === '..') || (url.hostname === 'github.com' && segments.length !== 2)) throw new Error()
  } catch { throw new ProjectRegistryError('GitHub 또는 GitLab의 HTTPS 저장소 주소를 입력하세요.') }
  return url
}

export const projectGit = new ProjectGit()
