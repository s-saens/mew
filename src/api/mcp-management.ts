import { uiText } from '@mew/ui/i18n-core'
import { mewFetch } from '../utils/remote-transport.ts'
import type { McpManagementInventory, McpManagementMutation } from '../../shared/mcp-management'

export function createMcpManagementClient(requestFetch: typeof mewFetch = mewFetch) {
  const scopedFetch = requestFetch


  async function result<T>(response: Response): Promise<T> {
    const body = await response.json()
    if (!response.ok) throw new Error(body.error || uiText("요청을 처리하지 못했습니다"))
    return body
  }

  function fetchMcpManagement(cwd: string, signal?: AbortSignal) {
    return scopedFetch(`/api/agent/mcp-management?${new URLSearchParams({ cwd })}`, { signal }).then(result<McpManagementInventory>)
  }

  function mutateMcpManagement(input: McpManagementMutation) {
    return scopedFetch('/api/agent/mcp-management', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }).then(result<McpManagementInventory>)
  }
  return { fetchMcpManagement, mutateMcpManagement }
}

export const { fetchMcpManagement, mutateMcpManagement } = createMcpManagementClient()
