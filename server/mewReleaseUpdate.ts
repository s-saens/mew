import fs from 'node:fs'
import path from 'node:path'
import { newer } from './update-policy.ts'

type ReleaseChannel = 'curl' | 'npm' | 'windows' | 'termux'
export type MewInstallChannel = 'git' | ReleaseChannel | 'unknown'
type PackagedInstall = { channel: ReleaseChannel | 'unknown'; version: string | null }

const REPOSITORY = 's-saens/mew'
const RELEASES_URL = `https://api.github.com/repos/${REPOSITORY}/releases`
const RELEASE_PAGE = `https://github.com/${REPOSITORY}/releases/tag`
const NPM_LATEST = 'https://registry.npmjs.org/mew-ide/latest'
const STABLE_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*)?$/

type GitHubChannel = Exclude<ReleaseChannel, 'npm'>
const releaseTags: Record<GitHubChannel, string> = {
  curl: 'mew-cli-v',
  windows: 'mew-windows-v',
  termux: 'mew-termux-v',
}

function versionFrom(value: unknown): string | null {
  return typeof value === 'string' && VERSION.test(value) ? value : null
}

function readVersion(root: string, filename: string): string | null {
  try {
    return versionFrom(fs.readFileSync(path.join(root, filename), 'utf8').trim())
  } catch {
    return null
  }
}

export function packagedMewInstall(root: string, env = process.env): PackagedInstall | null {
  if (env.MEW_DISTRIBUTION === 'release' || fs.existsSync(path.join(root, 'mew-runtime.json'))) {
    const channel = env.MEW_INSTALL_CHANNEL
    return {
      channel: channel === 'curl' || channel === 'npm' || channel === 'windows' ? channel : 'unknown',
      version: versionFrom(env.MEW_INSTALL_VERSION),
    }
  }
  if (fs.existsSync(path.join(root, '.mew-termux-source'))) {
    return { channel: 'termux', version: readVersion(root, '.mew-install-version') }
  }
  return null
}

function requiredAssets(channel: GitHubChannel, platform: string, arch: string): string[] {
  switch (channel) {
    case 'curl': return ['install.sh', 'SHA256SUMS', 'mew-cli-standalone.tar.gz', `mew-runtime-${platform}-${arch}.tar.gz`]
    case 'windows': return ['mew-windows-setup-x64.exe', 'mew-windows-setup-x64.exe.sha256']
    case 'termux': return ['install-termux.sh', 'mew-source.tar.gz']
  }
}

type GitHubRelease = {
  tag_name?: unknown
  draft?: boolean
  prerelease?: boolean
  assets?: Array<{ name: string; state: string }>
}

function latestGitHubVersion(releases: GitHubRelease[], channel: GitHubChannel, assets: string[], latest: string | null) {
  const prefix = releaseTags[channel]
  for (const release of releases) {
    if (release.draft || (release.prerelease && channel !== 'termux')) continue
    if (typeof release.tag_name !== 'string' || !release.tag_name.startsWith(prefix)) continue
    const version = release.tag_name.slice(prefix.length)
    if (!STABLE_VERSION.test(version)) continue
    const uploaded = new Set(release.assets?.filter(asset => asset.state === 'uploaded').map(asset => asset.name))
    if (!assets.every(asset => uploaded.has(asset))) continue
    if (!latest || newer(latest, version)) latest = version
  }
  return latest
}

export async function latestMewRelease(
  channel: ReleaseChannel,
  { fetchRelease = fetch, platform = String(process.platform), arch = String(process.arch) } = {},
): Promise<string> {
  const signal = AbortSignal.timeout(15_000)
  const request = async (url: string) => {
    const response = await fetchRelease(url, { signal, headers: {
      Accept: channel === 'npm' ? 'application/json' : 'application/vnd.github+json',
      'User-Agent': 'mew-update-check',
    } })
    if (!response.ok) throw new Error(`버전 조회 실패 (${response.status})`)
    return response
  }
  if (channel === 'npm') {
    const data = await (await request(NPM_LATEST)).json() as { version?: unknown }
    const version = versionFrom(data?.version)
    if (version) return version
  } else {
    const required = requiredAssets(channel, platform, arch)
    let latest: string | null = null
    for (let page = 1; ; page++) {
      const response = await request(`${RELEASES_URL}?per_page=100&page=${page}`)
      const releases: unknown = await response.json()
      if (!Array.isArray(releases)) break
      latest = latestGitHubVersion(releases, channel, required, latest)
      if (!response.headers.get('link')?.includes('rel="next"')) {
        if (latest) return latest
        break
      }
    }
  }
  throw new Error('이 설치 방식의 최신 배포 버전을 찾지 못했습니다.')
}

// Reuse the result during status polling and share concurrent browser refreshes.
const checks = new Map<ReleaseChannel, { latest?: string; pending?: Promise<string> }>()
async function checkedVersion(channel: ReleaseChannel, refresh: boolean): Promise<string> {
  const previous = checks.get(channel)
  if (previous?.pending) return previous.pending
  if (!refresh && previous?.latest) return previous.latest
  const pending = latestMewRelease(channel)
  checks.set(channel, { pending })
  try {
    const latest = await pending
    checks.set(channel, { latest })
    return latest
  } catch (error) {
    checks.delete(channel)
    throw error
  }
}

export const ORIGINAL_INSTALLER_MESSAGE = '실행 중인 Mew를 중지한 뒤 처음 설치할 때 사용한 설치기를 다시 실행하세요. npm은 npx mew-ide@latest, curl은 해당 버전의 설치 스크립트를 사용하세요.'

function updateInstruction(channel: ReleaseChannel): string {
  if (channel === 'npm') return 'Mew를 중지한 뒤 설치했던 터미널에서 npx mew-ide@latest를 실행하세요.'
  if (channel === 'windows') return '릴리스 페이지에서 mew-windows-setup-x64.exe를 실행하세요. Mew가 실행 중이었다면 Windows에 다시 로그인한 뒤 Mew를 여세요.'
  if (channel === 'termux') return 'mew stop을 실행한 뒤 릴리스 페이지의 install-termux.sh를 실행하세요.'
  return 'Mew를 중지한 뒤 릴리스 페이지의 install.sh를 실행하세요.'
}

export async function packagedMewUpdate(install: PackagedInstall, refresh: boolean) {
  const { channel, version } = install
  const base = {
    installChannel: channel,
    currentVersion: version,
    latestVersion: null as string | null,
    updateInstruction: null as string | null,
    updateUrl: null as string | null,
    supported: false,
    available: false,
    error: null as string | null,
  }
  if (channel === 'unknown' || !version) {
    const updateInstruction = channel === 'termux'
      ? 'mew stop을 실행한 뒤 사용하던 Termux 설치 스크립트로 업데이트하세요.'
      : ORIGINAL_INSTALLER_MESSAGE
    return { ...base, error: '이 설치의 업데이트 정보를 확인할 수 없습니다.', updateInstruction }
  }
  try {
    const latest = await checkedVersion(channel, refresh)
    const available = newer(version, latest)
    return {
      ...base, supported: true, available,
      latestVersion: latest,
      updateInstruction: available ? updateInstruction(channel) : null,
      updateUrl: available && channel !== 'npm' ? `${RELEASE_PAGE}/${releaseTags[channel]}${latest}` : null,
    }
  } catch (error) {
    return { ...base, supported: true, error: error instanceof Error ? error.message : String(error) }
  }
}
