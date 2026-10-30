import { publicMewBaseUrl } from './port-preview-url.ts'

export function publicShareUrl(type: 'f' | 'd', id: string): string {
  if (!['f', 'd'].includes(type) || !/^[A-Za-z0-9_-]{43}$/.test(id)) throw new Error('공개 링크가 올바르지 않습니다.')
  return `${publicMewBaseUrl()}/share/${type}/${id}`
}
