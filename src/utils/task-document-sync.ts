import type { TaskItem } from '../../shared/task-list.ts'

export type TaskDocumentChange = { before?: TaskItem; after: TaskItem } | { before: TaskItem; after: null }
export type TaskDocumentSyncMode = 'read' | 'write'
type Handler = {
  workspace: string
  prepare(mode: TaskDocumentSyncMode): Promise<() => void>
  apply(changes: TaskDocumentChange[]): Promise<void>
}
const handlers = new Map<string, Handler>()
const queues = new Map<string, Promise<unknown>>()

export function registerTaskDocumentSync(next: Handler): () => void {
  handlers.set(next.workspace, next)
  return () => { if (handlers.get(next.workspace) === next) handlers.delete(next.workspace) }
}

export async function syncTaskDocuments(workspace: string, before: TaskItem[], after: TaskItem[]): Promise<void> {
  const current = handlers.get(workspace)
  if (!current) return
  const previous = new Map(before.map(task => [task.id, task]))
  const next = new Set(after.map(task => task.id))
  const changes: TaskDocumentChange[] = before.filter(task => task.path && !next.has(task.id)).map(task => ({ before: task, after: null }))
  changes.push(...after.flatMap(task => {
    const old = previous.get(task.id)
    return task.path && JSON.stringify(old) !== JSON.stringify(task) ? [{ before: old, after: task }] : []
  }))
  if (changes.length) await current.apply(changes)
}

/** Both task reads and writes can move title-based files. */
export function withTaskDocumentSync<T>(workspace: string, run: () => Promise<T>, mode: TaskDocumentSyncMode = 'write'): Promise<T> {
  const current = handlers.get(workspace)
  const execute = async () => {
    if (!current) return run()
    if (handlers.get(workspace) !== current) throw new Error('프로젝트가 변경되었습니다. 다시 시도하세요.')
    const release = await current.prepare(mode)
    try { return await run() } finally { release() }
  }
  const result = (queues.get(workspace) ?? Promise.resolve()).then(execute, execute)
  const queued = result.catch(() => {})
  queues.set(workspace, queued)
  void queued.then(() => { if (queues.get(workspace) === queued) queues.delete(workspace) })
  return result
}
