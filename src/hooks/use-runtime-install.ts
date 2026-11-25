import { useRef, useState } from 'react'
import { uiText } from '@mew/ui/i18n-core'
import type { AgentRuntimeStatus } from '../api/client'
import { useWorkspaceApi } from '../api/workspace-api-context'
import { cachedAgentRuntimes, refreshAgentRuntimes, updateAgentRuntimesCache } from '../utils/agentPickerCache'

export type InstallFailure = { id: string; message: string }

export function canInstallRuntime(status?: AgentRuntimeStatus | null) {
  return !!status?.installable && !status.installed && !status.installBlocker
}

export function useRuntimeInstall() {
  const { installAgentRuntime } = useWorkspaceApi()
  const pending = useRef(false)
  const [installing, setInstalling] = useState<string | null>(null)
  const [installFailure, setInstallFailure] = useState<InstallFailure | null>(null)

  const install = async (id: string) => {
    if (pending.current) return
    pending.current = true
    setInstalling(id)
    setInstallFailure(null)
    try {
      const { status, output } = await installAgentRuntime(id)
      if (!status.installed) throw new Error(uiText('설치 후에도 실행 파일을 찾지 못했습니다'))
      const runtimes = await refreshAgentRuntimes().catch(() => cachedAgentRuntimes() ?? [])
      const result = runtimes.find(runtime => runtime.id === id)
      if (result?.installed && result.installation) return
      const installed = { ...status, installation: status.installation ?? { state: 'succeeded' as const, output } }
      updateAgentRuntimesCache(result ? runtimes.map(runtime => runtime.id === id ? installed : runtime) : [...runtimes, installed])
    } catch (error) {
      setInstallFailure({ id, message: error instanceof Error ? error.message : String(error) })
      await refreshAgentRuntimes().catch(() => {})
    } finally {
      pending.current = false
      setInstalling(null)
    }
  }

  return { installing, installFailure, install }
}
