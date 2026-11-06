import { mewFetch } from '../utils/remote-transport.ts'
import { uiText } from '@mew/ui/i18n-core'
import type { HarnessDetail, HarnessInventory, HarnessKind, HarnessMutation } from '../../shared/agent-harness'

export function createAgentHarnessClient(requestFetch: typeof mewFetch = mewFetch) {
  const scopedFetch = requestFetch

  async function result<T>(response: Response): Promise<T> {
    const body = await response.json()
    if (!response.ok) throw new Error(body.error || uiText("요청을 처리하지 못했습니다"))
    return body
  }
  function fetchHarness(cwd: string, kind: HarnessKind, signal?: AbortSignal) {
    return scopedFetch(`/api/agent/harness?${new URLSearchParams({ cwd, kind })}`, { signal }).then(result<HarnessInventory>)
  }
  function fetchHarnessDetail(cwd: string, kind: HarnessKind, id: string, signal?: AbortSignal) {
    return scopedFetch(`/api/agent/harness/detail?${new URLSearchParams({ cwd, kind, id })}`, { signal }).then(result<HarnessDetail>)
  }
  function mutateHarness(input: HarnessMutation) {
    return scopedFetch('/api/agent/harness', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }).then(result<{ ok: boolean }>)
  }
  return { fetchHarness, fetchHarnessDetail, mutateHarness }
}

export const { fetchHarness, fetchHarnessDetail, mutateHarness } = createAgentHarnessClient()
