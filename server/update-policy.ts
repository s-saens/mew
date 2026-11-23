import path from 'node:path'
/** Match agent hosts and CLI process arguments, including script-based npm executables. */
export function agentProcessRunning(processes: string, runtime: string, commands: string[]): boolean {
  return processes.split('\n').some(line => {
    const args = line.trim().split(/\s+/)
    const host = args.indexOf('--host')
    if (host >= 0 && args[host + 1] === runtime && args.some(arg => path.basename(arg) === 'agentHost.ts')) return true
    return args.some(arg => commands.some(command => arg === command || path.basename(arg) === path.basename(command)))
  })
}

export function primeReleaseUrl(installer: string, baseOverride?: string, channel = 'stable'): string {
  if (!['stable', 'beta'].includes(channel)) throw new Error('Prime 릴리스 채널을 확인해 주세요')
  const base = baseOverride || installer.match(/prime_agent_base_url="\$\{PRIME_AGENT_DOWNLOAD_BASE_URL:-(https:\/\/[^}"\s]+)\}"/)?.[1]
  if (!base || new URL(base).protocol !== 'https:') throw new Error('Prime 공식 배포 경로를 읽지 못했습니다')
  return `${base.replace(/\/$/, '')}/${channel}`
}

export function primeReleaseVersion(value: string): string {
  const version = value.trim().replace(/^v/, '')
  if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version)) throw new Error('Prime 최신 버전을 읽지 못했습니다')
  return version
}

export function newer(current: string | null, latest: string | null): boolean {
  if (!current || !latest || current === latest) return false
  const parse = (value: string) => value.match(/(?:^|\s|v)(\d+)\.(\d+)(?:\.(\d+))?(?:-([\w.-]+))?/)
  const a = parse(current), b = parse(latest)
  if (!a || !b) return false
  for (let i = 1; i <= 3; i++) { const diff = Number(b[i] ?? 0) - Number(a[i] ?? 0); if (diff) return diff > 0 }
  if (a[4] && !b[4]) return true
  if (!a[4] && b[4]) return false
  if (a[4] && b[4]) {
    const left = a[4].split('.'), right = b[4].split('.')
    for (let i = 0; i < Math.max(left.length, right.length); i++) {
      if (left[i] === right[i]) continue
      if (left[i] === undefined) return true
      if (right[i] === undefined) return false
      const l = /^\d+$/.test(left[i]), r = /^\d+$/.test(right[i])
      if (l !== r) return l
      return l ? Number(right[i]) > Number(left[i]) : right[i] > left[i]
    }
  }
  return false
}
