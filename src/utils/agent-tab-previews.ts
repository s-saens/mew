import type { HistoryPreview } from '../../shared/agent-history.ts'
import type { AgentEvent } from './agentFold.ts'

export type AgentTabPreviewTarget = { id: string; runtime: string; cwd: string; sessionId: string }
export type AgentTabPreview = HistoryPreview<AgentEvent>
const MAX_BYTES = 32 * 1024 * 1024
const READ_TIMEOUT_MS = 5000
const keyOf = (target: AgentTabPreviewTarget) => JSON.stringify([target.id, target.runtime, target.cwd, target.sessionId])

/** Read saved displays without opening the tabs' agent connections. Scoped to one account and root. */
export function createAgentTabPreviews(load: (target: AgentTabPreviewTarget, signal: AbortSignal) => Promise<AgentTabPreview | null>, changed: () => void) {
  type Entry = { target: AgentTabPreviewTarget; controller: AbortController; started: boolean; preview: AgentTabPreview | null; bytes: number }
  const entries = new Map<string, Entry>()
  const running = new Set<Entry>()
  let activeId: string | null = null
  let bytes = 0

  function drain() {
    while (running.size < 2) {
      const waiting = [...entries.values()].filter(entry => !entry.started)
      const entry = waiting.find(entry => entry.target.id === activeId) ?? waiting[0]
      if (!entry) return
      entry.started = true
      running.add(entry)
      let timer: ReturnType<typeof setTimeout>
      let aborted: () => void
      const read = Promise.race([
        Promise.resolve().then(() => entry.controller.signal.aborted ? null : load(entry.target, entry.controller.signal)).catch(() => null),
        new Promise<null>(resolve => {
          aborted = () => resolve(null)
          entry.controller.signal.addEventListener('abort', aborted, { once: true })
          timer = setTimeout(() => entry.controller.abort(), READ_TIMEOUT_MS)
        }),
      ])
      void read.then(preview => {
        if (entries.get(keyOf(entry.target)) !== entry || entry.controller.signal.aborted) return
        if (preview?.sessionId !== entry.target.sessionId || !Number.isSafeInteger(preview.start) || preview.start < 0 || !Array.isArray(preview.events)) return
        entry.bytes = JSON.stringify(preview).length * 2
        if (entry.bytes > MAX_BYTES) { entry.bytes = 0; return }
        entry.preview = preview
        bytes += entry.bytes
        for (const previous of [...entries.values()].sort((a, b) => Number(a.target.id === activeId) - Number(b.target.id === activeId))) {
          if (bytes <= MAX_BYTES) break
          bytes -= previous.bytes
          previous.bytes = 0
          previous.preview = null
        }
        changed()
      }).finally(() => {
        clearTimeout(timer)
        entry.controller.signal.removeEventListener('abort', aborted)
        running.delete(entry)
        drain()
      })
    }
  }

  return {
    update(targets: AgentTabPreviewTarget[], selectedId: string | null) {
      activeId = selectedId
      const keep = new Set(targets.map(keyOf))
      for (const [key, entry] of entries) if (!keep.has(key)) {
        entry.controller.abort()
        running.delete(entry)
        bytes -= entry.bytes
        entries.delete(key)
      }
      for (const target of targets) if (!entries.has(keyOf(target))) {
        entries.set(keyOf(target), { target, controller: new AbortController(), started: false, preview: null, bytes: 0 })
      }
      drain()
    },
    get(target: AgentTabPreviewTarget) { return entries.get(keyOf(target))?.preview ?? null },
    dispose() {
      for (const entry of entries.values()) entry.controller.abort()
      entries.clear()
      running.clear()
      bytes = 0
    },
  }
}
