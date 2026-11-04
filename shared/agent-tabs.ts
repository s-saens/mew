export type AgentTabState = {
  id: string
  label: string
  runtime?: string | null
  cwd?: string | null
  renamed?: boolean
  sessionIds?: Record<string, string>
  preset?: { id: string; name: string; thinkingId?: string; thinkingConfigId?: string; modelId: string; role: string }
}

export type AgentTabsState = { tabs: AgentTabState[]; activeId: string | null }

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function mergeTab(current: AgentTabState, base: AgentTabState, next: AgentTabState): AgentTabState {
  const merged: Record<string, unknown> = { ...current }
  for (const key of new Set([...Object.keys(base), ...Object.keys(next)])) {
    if (key === 'id') continue
    const field = key as keyof AgentTabState
    if (same(base[field], next[field])) continue
    if (key === 'sessionIds') {
      const sessions = { ...current.sessionIds }
      for (const slot of new Set([...Object.keys(base.sessionIds ?? {}), ...Object.keys(next.sessionIds ?? {})])) {
        if (base.sessionIds?.[slot] === next.sessionIds?.[slot]) continue
        const value = next.sessionIds?.[slot]
        if (value === undefined) delete sessions[slot]
        else sessions[slot] = value
      }
      if (Object.keys(sessions).length) merged.sessionIds = sessions
      else delete merged.sessionIds
    } else if (next[field] === undefined) delete merged[key]
    else merged[key] = next[field]
  }
  return merged as AgentTabState
}

/** Apply only local changes since base; another device's additions and fields survive. */
export function mergeAgentTabs(current: AgentTabsState, base: AgentTabsState, next: AgentTabsState): AgentTabsState {
  const baseTabs = new Map(base.tabs.map(tab => [tab.id, tab]))
  const nextTabs = new Map(next.tabs.map(tab => [tab.id, tab]))
  const tabs = current.tabs.flatMap(tab => {
    const before = baseTabs.get(tab.id), after = nextTabs.get(tab.id)
    if (!before) return [tab]
    if (!after) return []
    return [mergeTab(tab, before, after)]
  })
  const ids = new Set(tabs.map(tab => tab.id))
  for (const tab of next.tabs) {
    if (!baseTabs.has(tab.id) && !ids.has(tab.id)) { tabs.push(tab); ids.add(tab.id) }
  }
  const retainedBaseOrder = base.tabs.filter(tab => nextTabs.has(tab.id)).map(tab => tab.id)
  const nextBaseOrder = next.tabs.filter(tab => baseTabs.has(tab.id)).map(tab => tab.id)
  if (!same(retainedBaseOrder, nextBaseOrder)) {
    const order = new Map(next.tabs.map((tab, index) => [tab.id, index]))
    tabs.sort((left, right) => (order.get(left.id) ?? next.tabs.length) - (order.get(right.id) ?? next.tabs.length))
  }
  const requestedActive = next.activeId !== base.activeId ? next.activeId : current.activeId
  const activeId = requestedActive === null ? null : ids.has(requestedActive) ? requestedActive
    : current.activeId && ids.has(current.activeId) ? current.activeId : tabs[0]?.id ?? null
  return { tabs, activeId }
}
