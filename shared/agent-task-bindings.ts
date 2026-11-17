export const AGENT_TASKS = ['assistant', 'gitCommit', 'schedule', 'projectCreation'] as const
export type AgentTask = typeof AGENT_TASKS[number]
export type AgentTaskBindings = Partial<Record<AgentTask, string>>

export function normalizeTaskBindings(input: unknown, validIds: readonly string[]): AgentTaskBindings {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid agent task bindings')
  const source = input as Record<string, unknown>
  const result: AgentTaskBindings = {}
  for (const key of Object.keys(source)) {
    if (!AGENT_TASKS.includes(key as AgentTask)) throw new Error('Unknown agent task')
    const id = source[key]
    if (id === '' || id === null) continue
    if (typeof id !== 'string' || !validIds.includes(id)) throw new Error('Unknown agent set')
    result[key as AgentTask] = id
  }
  return result
}
