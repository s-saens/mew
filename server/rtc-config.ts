export type DesktopIceServer = { urls: string | string[]; username?: string; credential?: string }

export function desktopIceServers(env: NodeJS.ProcessEnv = process.env): DesktopIceServer[] {
  let entries: unknown
  try { entries = JSON.parse(env.MEW_DESKTOP_ICE_SERVERS || '[{"urls":["stun:stun.l.google.com:19302","stun:stun.cloudflare.com:3478"]}]') } catch { throw new Error('MEW_DESKTOP_ICE_SERVERS는 JSON 배열이어야 합니다.') }
  if (!Array.isArray(entries) || entries.length > 8) throw new Error('브라우저 ICE 서버 설정을 확인해 주세요.')
  return entries.map((value) => {
    const urls = typeof value?.urls === 'string' ? [value.urls] : value?.urls
    if (!Array.isArray(urls) || !urls.length || urls.length > 8 || urls.some((url) => typeof url !== 'string' || url.length > 2048 || !/^stuns?:[^\s]+$/.test(url))) throw new Error('직접 연결에는 stun: 또는 stuns: 주소만 사용할 수 있습니다. TURN 중계는 지원하지 않습니다.')
    if ([value.username, value.credential].some((entry) => entry !== undefined && (typeof entry !== 'string' || entry.length > 4096))) throw new Error('ICE 서버 인증 설정을 확인해 주세요.')
    return { urls, ...(value.username ? { username: value.username } : {}), ...(value.credential ? { credential: value.credential } : {}) }
  })
}

export function desktopAutoNat(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env.MEW_DESKTOP_AUTO_NAT
  if (value === undefined || value === '' || value === '1') return true
  if (value === '0') return false
  throw new Error('MEW_DESKTOP_AUTO_NAT은 0 또는 1이어야 합니다.')
}

/** Only addresses are needed by the viewer; host credentials stay on the server. */
export function viewerIceServers(servers: DesktopIceServer[]): Array<{ urls: string | string[] }> {
  return servers.flatMap(({ urls }) => {
    const safe = (typeof urls === 'string' ? [urls] : urls).filter(url => /^stuns?:(?:\[[0-9a-f:.]+\]|[a-z0-9.-]+)(?::[0-9]{1,5})?$/i.test(url))
    return safe.length ? [{ urls: safe }] : []
  })
}
