import type { FileVersion } from '../../shared/file-version.ts'
import type { PublicShareInfo } from '../../shared/public-share.ts'
export type { PublicShareFile } from '../../shared/public-share.ts'
import type { PublicShareFile } from '../../shared/public-share.ts'
import type { TreeNode } from './client.ts'
import { mewFetch } from '../utils/remote-transport.ts'

export interface PublicShareIdentity { type: 'f' | 'd'; id: string }
export type PublicShareMetadata = PublicShareInfo

export class PublicShareError extends Error {
  readonly status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}

export function publicShareApiPath(share: PublicShareIdentity, action = '', filePath?: string): string {
  const base = `/api/public-shares/${share.type}/${encodeURIComponent(share.id)}${action ? '/' + action : ''}`
  return filePath === undefined ? base : `${base}?path=${encodeURIComponent(filePath)}`
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const timeout = AbortSignal.timeout(30_000)
  const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout
  const response = await mewFetch(url, { ...init, signal, cache: 'no-store', credentials: 'omit' })
  if (!response.ok) {
    const detail = await response.json().catch(() => null) as { error?: string } | null
    throw new PublicShareError(response.status, detail?.error ?? response.statusText)
  }
  return response.json() as Promise<T>
}

export function fetchPublicShare(share: PublicShareIdentity, signal?: AbortSignal): Promise<PublicShareMetadata> {
  return request(publicShareApiPath(share), { signal })
}
export function fetchPublicShareTree(share: PublicShareIdentity, path = '', signal?: AbortSignal): Promise<{ tree: TreeNode[] }> {
  return request(publicShareApiPath(share, 'tree', path), { signal })
}
export function fetchPublicShareFile(share: PublicShareIdentity, path: string, signal?: AbortSignal): Promise<PublicShareFile> {
  return request(publicShareApiPath(share, 'file', path), { signal })
}
export function savePublicShareFile(share: PublicShareIdentity, path: string, content: string, baseVersion: FileVersion): Promise<PublicShareFile> {
  return request(publicShareApiPath(share, 'file'), {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path, content, baseVersion }),
  })
}
