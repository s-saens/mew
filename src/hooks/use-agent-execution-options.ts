import { useState } from 'react'
import { scopedBrowserStorage } from '@mew/ui/browser-storage-scope'
import type { AgentExecutionOptions } from '../../shared/agent-execution-options'

const defaults: AgentExecutionOptions = { build: true, deploy: false }

function readExecution(key: string): AgentExecutionOptions {
  try {
    const value = JSON.parse(scopedBrowserStorage().getItem(key) ?? 'null')
    if (value && typeof value.build === 'boolean' && typeof value.deploy === 'boolean') return { build: value.build, deploy: value.deploy }
  } catch { /* Unavailable or damaged browser storage uses the defaults. */ }
  return { ...defaults }
}

export function useAgentExecutionOptions(account: string, workspace: string, tab: string) {
  const key = `mew:agent-execution:${JSON.stringify([account, workspace, tab])}`
  const [saved, setSaved] = useState(() => ({ key, value: readExecution(key) }))
  if (saved.key !== key) setSaved({ key, value: readExecution(key) })
  const value = saved.key === key ? saved.value : readExecution(key)
  const change = (next: AgentExecutionOptions) => {
    setSaved({ key, value: next })
    try { scopedBrowserStorage().setItem(key, JSON.stringify(next)) } catch { /* Keep the current draft usable when storage is full. */ }
  }
  return [value, change] as const
}
