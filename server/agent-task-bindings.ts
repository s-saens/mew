import path from 'node:path'
import { DATA_DIR, readJsonFile, writeFileAtomic } from './dataDir.ts'
import { readSets, AgentSetError } from './agentSets.ts'
import { normalizeTaskBindings, type AgentTaskBindings } from '../shared/agent-task-bindings.ts'

const file = path.join(DATA_DIR, 'agent-task-bindings.json')
export function readTaskBindings(): AgentTaskBindings {
  const value = readJsonFile<Record<string, unknown>>(file) ?? {}
  // Deleted sets become unassigned without invalidating the remaining bindings.
  const ids = new Set(readSets().map(set => set.id))
  const filtered = Object.fromEntries(Object.entries(value).filter(([, id]) => typeof id === 'string' && ids.has(id)))
  try { return normalizeTaskBindings(filtered, [...ids]) } catch { return {} }
}
export function writeTaskBindings(input: unknown): AgentTaskBindings {
  try {
    const bindings = normalizeTaskBindings(input, readSets().map(set => set.id))
    writeFileAtomic(file, `${JSON.stringify(bindings, null, 2)}\n`)
    return bindings
  } catch { throw new AgentSetError('에이전트 작업 연결이 올바르지 않습니다') }
}
