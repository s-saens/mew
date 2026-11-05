import { uiText } from '@mew/ui/i18n-core'
import { mewFetch } from '../utils/remote-transport.ts'
import type { McpManagementInventory, McpManagementMutation } from '../../shared/mcp-management'

async function result<T>(response: Response): Promise<T> {
  const body = await response.json()
  if (!response.ok) throw new Error(body.error || uiText("요청을 처리하지 못했습니다"))
  return body
}

export function fetchMcpManagement(cwd: string, signal?: AbortSignal) {
  return mewFetch(`/api/agent/mcp-management?${new URLSearchParams({ cwd })}`, { signal }).then(result<McpManagementInventory>)
}

export function mutateMcpManagement(input: McpManagementMutation) {
  return mewFetch('/api/agent/mcp-management', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }).then(result<McpManagementInventory>)
}
