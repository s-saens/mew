import { validPreviewPort } from '../../shared/port-preview.ts'

let previewBaseUrl: string | null | undefined

export function configurePortPreviewBaseUrl(value?: string | null) {
  previewBaseUrl = value === undefined ? undefined : null
  if (typeof value !== 'string' || value.length > 2048 || /[\\\s]/.test(value)) return
  try {
    const url = new URL(value)
    const path = /^\/([A-Za-z0-9_-]{3,64})\/([A-Za-z0-9_-]{1,48})\/?$/.exec(url.pathname)
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || !path || ['register', 'central', 'api', 'auth'].includes(path[1]!)) return
    if (url.href !== `${url.origin}${url.pathname}`) return
    previewBaseUrl = `${url.origin}/${path[1]}/${path[2]}`
  } catch { /* An invalid remote address must never fall back to the installed app origin. */ }
}

export function portPreviewUrl(port: number): string {
  if (!validPreviewPort(port)) throw new Error('포트가 올바르지 않습니다.')
  if (previewBaseUrl === null) throw new Error('Mewlink 기기 주소를 확인하지 못했습니다. 페이지를 다시 열어 주세요.')
  return `${previewBaseUrl ?? location.origin}/${port}`
}
