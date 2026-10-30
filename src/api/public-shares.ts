import type { PublicShare, PublicShareSetting } from '../../shared/public-share.ts'
import { mewFetch } from '../utils/remote-transport.ts'
import { json } from './response.ts'

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const timeout = AbortSignal.timeout(30_000)
  return mewFetch(url, { ...init, signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout }).then(json<T>)
}

export async function fetchPublicShare(project: string, path: string, signal?: AbortSignal): Promise<PublicShare | null> {
  const result = await request<{ share: PublicShare | null }>(`/api/public-shares?project=${encodeURIComponent(project)}&path=${encodeURIComponent(path)}`, { signal })
  return result.share
}

export async function listPublicShares(project: string, signal?: AbortSignal): Promise<PublicShare[]> {
  const result = await request<{ shares: PublicShare[] }>(`/api/public-shares/list?project=${encodeURIComponent(project)}`, { signal })
  return result.shares
}

export async function setPublicShare(project: string, path: string, mode: PublicShareSetting, signal?: AbortSignal): Promise<PublicShare | null> {
  const result = await request<{ share: PublicShare | null }>('/api/public-shares', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project, path, mode }), signal,
  })
  return result.share
}
