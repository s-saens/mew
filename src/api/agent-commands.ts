import { isMewTransportSuspended, mewFetch } from '../utils/remote-transport.ts'
import { uiText } from '@mew/ui/i18n-core'
import type { AgentCommandRecord, AgentCommandScope } from '../../shared/agent-command'

async function request<T>(suffix: string, body?: unknown, signal?: AbortSignal, onStatus?: (status: number) => void): Promise<T> {
  signal?.throwIfAborted()
  const response = await mewFetch(`/api/agent/commands${suffix}`, body === undefined ? { cache: 'no-store', signal } : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  onStatus?.(response.status)
  const value = await response.json().catch(error => { if (response.ok) throw error; return {} })
  if (!response.ok) throw Object.assign(new Error(value?.error ?? uiText("명령 요청에 실패했습니다")), { status: response.status })
  return value as T
}

export async function listAgentCommands(scope: AgentCommandScope, signal?: AbortSignal) {
  const controller = new AbortController()
  const abort = () => controller.abort(signal?.reason)
  signal?.addEventListener('abort', abort, { once: true })
  if (signal?.aborted) abort()
  let remaining = 5000
  let previous = performance.now()
  let paused = isMewTransportSuspended()
  let permanentStatus: number | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  const checkDeadline = () => {
    const now = performance.now(), waiting = isMewTransportSuspended()
    if (!paused && !waiting) remaining -= now - previous
    previous = now
    paused = waiting
    if (remaining <= 0) {
      const message = permanentStatus === undefined ? 'Command status read timed out' : `${uiText("명령 요청에 실패했습니다")} (HTTP ${permanentStatus})`
      const error = new DOMException(message, 'TimeoutError')
      if (permanentStatus !== undefined) Object.assign(error, { status: permanentStatus })
      controller.abort(error)
    }
    else timer = setTimeout(checkDeadline, Math.min(250, remaining))
  }
  timer = setTimeout(checkDeadline, 250)
  let rejectAbort: (() => void) | undefined
  const canceled = new Promise<never>((_resolve, reject) => {
    rejectAbort = () => reject(controller.signal.reason ?? new DOMException('Aborted', 'AbortError'))
    controller.signal.addEventListener('abort', rejectAbort, { once: true })
    if (controller.signal.aborted) rejectAbort()
  })
  try {
    // Race the complete response, including JSON, even when a transport ignores cancellation.
    return await Promise.race([request<{ commands: AgentCommandRecord[] }>(`?${new URLSearchParams(scope)}`, undefined, controller.signal, status => {
      if (status >= 400 && status < 500 && status !== 408 && status !== 429) permanentStatus = status
    }), canceled])
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
    if (rejectAbort) controller.signal.removeEventListener('abort', rejectAbort)
  }
}
export const startAgentCommand = (input: AgentCommandScope & { id: string; tab: string; command: string; afterUserCount: number }) => request<{ command: AgentCommandRecord }>('', input)
export const stopAgentCommand = (id: string) => request(`/${encodeURIComponent(id)}/stop`, {})
export const stopAgentTabCommands = (tab: string) => request(`/stop-tab/${encodeURIComponent(tab)}`, {})
export const readAgentCommandOutput = (id: string) => request<{ command: AgentCommandRecord; text: string }>(`/${encodeURIComponent(id)}/output`)
export const agentCommandArchiveUrl = (id: string) => `/api/agent/commands/${encodeURIComponent(id)}/archive`
