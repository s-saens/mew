import { scopedBrowserStorage } from '@mew/ui/browser-storage-scope'
import { trimInputHistory, writeBrowserStorage } from '@mew/ui/browser-storage'
// Drafts belong to a browser account, logical project, working root and tab.
const DRAFTS_KEY = 'mew:agent-input-drafts'
const HISTORIES_KEY = 'mew:agent-input-histories'
const MAX_HISTORY_ITEMS = 100

type DraftMap = Record<string, string>
type HistoryMap = Record<string, string[]>

export type AgentInputDraftScope = Readonly<{ account: string; projectPath: string; workspacePath: string; migrateLegacy?: boolean }>

export function agentInputOwnerKey(tabId: string, scope?: AgentInputDraftScope): string {
  return scope ? `v2:${JSON.stringify([scope.account, scope.projectPath, scope.workspacePath, tabId])}` : tabId
}

/** Only the single-project compatibility view may claim an older tab-only entry. */
function scopedValue<T>(map: Record<string, T>, tabId: string, scope: AgentInputDraftScope | undefined, save: (map: Record<string, T>) => void): T | undefined {
  const key = agentInputOwnerKey(tabId, scope)
  if (scope?.migrateLegacy && !Object.hasOwn(map, key) && Object.hasOwn(map, tabId)) {
    map[key] = map[tabId]
    delete map[tabId]
    save(map)
  }
  return Object.hasOwn(map, key) ? map[key] : undefined
}

function readAll(): DraftMap {
  try {
    const parsed: unknown = JSON.parse(scopedBrowserStorage().getItem(DRAFTS_KEY) ?? '{}')
    if (!parsed || typeof parsed !== 'object') return {}
    const out: DraftMap = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'string' && v) out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

function writeAll(map: DraftMap): void {
  try {
    if (Object.keys(map).length === 0) scopedBrowserStorage().removeItem(DRAFTS_KEY)
    else writeBrowserStorage(DRAFTS_KEY, JSON.stringify(map))
  } catch {
    // 저장 실패는 편의 기능 상실로만 끝낸다.
  }
}

function readHistories(): HistoryMap {
  try {
    const parsed: unknown = JSON.parse(scopedBrowserStorage().getItem(HISTORIES_KEY) ?? '{}')
    if (!parsed || typeof parsed !== 'object') return {}
    const out: HistoryMap = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(value)) out[key] = value.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
    }
    return out
  } catch {
    return {}
  }
}

function writeHistories(map: HistoryMap): void {
  try {
    if (Object.keys(map).length === 0) scopedBrowserStorage().removeItem(HISTORIES_KEY)
    else writeBrowserStorage(HISTORIES_KEY, JSON.stringify(trimInputHistory(map)))
  } catch { /* 히스토리는 편의 기능이다. */ }
}

export function readAgentInputDraft(tabId: string, scope?: AgentInputDraftScope): string {
  return scopedValue(readAll(), tabId, scope, writeAll) ?? ''
}

export function writeAgentInputDraft(tabId: string, text: string, scope?: AgentInputDraftScope): void {
  const map = readAll()
  const key = agentInputOwnerKey(tabId, scope)
  if (scope?.migrateLegacy) delete map[tabId]
  if (text) map[key] = text
  else delete map[key]
  writeAll(map)
}

export function clearAgentInputDraft(tabId: string, scope?: AgentInputDraftScope): void {
  writeAgentInputDraft(tabId, '', scope)
  const histories = readHistories()
  delete histories[agentInputOwnerKey(tabId, scope)]
  if (scope?.migrateLegacy) delete histories[tabId]
  writeHistories(histories)
}

export function readAgentInputHistory(tabId: string, scope?: AgentInputDraftScope): string[] {
  return scopedValue(readHistories(), tabId, scope, writeHistories) ?? []
}

/** Keep only successful sends, up to the most recent 100 per owner. */
export function recordAgentInputHistory(tabId: string, text: string, scope?: AgentInputDraftScope): void {
  if (!text.trim()) return
  const histories = readHistories()
  const key = agentInputOwnerKey(tabId, scope)
  const previous = scopedValue(histories, tabId, scope, writeHistories) ?? []
  delete histories[key]
  histories[key] = previous[previous.length - 1] === text
    ? previous
    : [...previous, text].slice(-MAX_HISTORY_ITEMS)
  writeHistories(histories)
}
