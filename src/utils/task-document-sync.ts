import type { TaskItem } from '../../shared/task-list.ts'

export type TaskDocumentChange = { before?: TaskItem; after: TaskItem }
type Handler = {
  workspace: string
  prepare(): Promise<() => void>
  apply(changes: TaskDocumentChange[]): Promise<void>
}
let handler: Handler | undefined
let queue: Promise<unknown> = Promise.resolve()

export function registerTaskDocumentSync(next: Handler): () => void {
  handler = next
  return () => { if (handler === next) handler = undefined }
}

export async function syncTaskDocuments(workspace: string, before: TaskItem[], after: TaskItem[]): Promise<void> {
  const current = handler
  if (current?.workspace !== workspace) return
  const previous = new Map(before.map(task => [task.id, task]))
  const changes = after.flatMap(task => {
    const old = previous.get(task.id)
    return task.path && JSON.stringify(old) !== JSON.stringify(task) ? [{ before: old, after: task }] : []
  })
  if (changes.length) await current.apply(changes)
}

/** Both task reads and writes can move title-based files. */
export function withTaskDocumentSync<T>(workspace: string, run: () => Promise<T>): Promise<T> {
  const current = handler
  const execute = async () => {
    if (!current || current.workspace !== workspace) return run()
    if (handler !== current) throw new Error('프로젝트가 변경되었습니다. 다시 시도하세요.')
    const release = await current.prepare()
    try { return await run() } finally { release() }
  }
  const result = queue.then(execute, execute)
  queue = result.catch(() => {})
  return result
}
