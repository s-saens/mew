import { uiText } from '@mew/ui/i18n-core'
import type { SharedMcpConnectionStatus } from '../../shared/shared-mcp'
import { mewFetch } from '../utils/remote-transport'

async function connectionResult(response: Response): Promise<SharedMcpConnectionStatus> {
  const body = await response.json()
  if (!response.ok) throw new Error(body.error || uiText('MCP 연결을 확인하지 못했습니다. 다시 시도하세요.'))
  return body
}

export function fetchSharedMcpStatus(name: string, signal?: AbortSignal) {
  return mewFetch(`/api/agent/mcp/status?${new URLSearchParams({ name })}`, { signal }).then(connectionResult)
}

export function changeSharedMcpConnection(name: string, action: 'connect' | 'disconnect' | 'cancel', options?: { mode?: 'desktop' | 'browser' }) {
  return mewFetch(`/api/agent/mcp/${action}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(action === 'connect' && options?.mode ? { name, mode: options.mode } : { name }),
  }).then(connectionResult)
}

export async function fetchSharedMcpAuthorizeUrl(name: string): Promise<string> {
  const response = await mewFetch('/api/agent/mcp/authorize-url', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
  })
  const body = await response.json()
  if (!response.ok || typeof body?.url !== 'string') throw new Error(body?.error || uiText('MCP 연결을 확인하지 못했습니다. 다시 시도하세요.'))
  return body.url
}

export function submitSharedMcpCallback(name: string, callbackUrl: string) {
  return mewFetch('/api/agent/mcp/callback', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, callbackUrl }),
  }).then(connectionResult)
}
