import { useEffect, useMemo, useState } from 'react'
import { json } from '../api/response.ts'
import { mewFetch } from '../utils/remote-transport.ts'
import { createAgentTabPreviews, type AgentTabPreview, type AgentTabPreviewTarget } from '../utils/agent-tab-previews.ts'
import { sessionIdOf, type AgentTab } from '../utils/agentTabs.ts'

export function useAgentTabPreviews(account: string, workspacePath: string | null, tabs: AgentTab[], activeId: string | null, enabled: boolean) {
  const [, refresh] = useState(0)
  const scope = useMemo(() => ({ account, workspacePath }), [account, workspacePath])
  const previews = useMemo(() => createAgentTabPreviews(async (target, signal) => {
    const query = new URLSearchParams({ workspace: scope.workspacePath ?? '', tab: target.id })
    const result = await mewFetch(`/api/user-ui/agent-tabs/history?${query}`, { signal }).then(json<{ preview: AgentTabPreview | null }>)
    return result.preview
  }, () => refresh(value => value + 1)), [scope])
  const targets = tabs.flatMap((tab): AgentTabPreviewTarget[] => {
    if (!tab.runtime || tab.runtime === 'tmux' || !tab.cwd) return []
    const sessionId = sessionIdOf(tab, tab.runtime, tab.cwd)
    return sessionId ? [{ id: tab.id, runtime: tab.runtime, cwd: tab.cwd, sessionId }] : []
  })
  const signature = JSON.stringify(targets)
  useEffect(() => {
    previews.update(enabled && workspacePath ? JSON.parse(signature) as AgentTabPreviewTarget[] : [], activeId)
  }, [previews, enabled, workspacePath, signature, activeId])
  useEffect(() => () => previews.dispose(), [previews])
  return previews
}
