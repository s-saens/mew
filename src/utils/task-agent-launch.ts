import type { TaskItem } from '../../shared/task-list.ts'

type LaunchOptions = {
  path: string
  tasks: readonly TaskItem[]
  isCurrent: () => boolean
  readBefore: () => Promise<TaskItem[]>
  prepare: () => Promise<() => void>
  readAfter: () => Promise<TaskItem[]>
  sync: (before: TaskItem[], after: TaskItem[]) => Promise<void>
}

export async function resolveTaskAgentLaunch({ path, tasks, isCurrent, readBefore, prepare, readAfter, sync }: LaunchOptions): Promise<TaskItem | null> {
  if (!isCurrent()) return null
  let before = [...tasks]
  if (!before.some(task => task.path === path)) before = await readBefore()
  if (!isCurrent()) return null
  const task = before.find(task => task.path === path)
  if (!task) throw new Error('TASK_DOCUMENT_UNAVAILABLE')
  const release = await prepare()
  try {
    if (!isCurrent()) return null
    const after = await readAfter()
    if (!isCurrent()) return null
    await sync(before, after)
    if (!isCurrent()) return null
    const current = after.find(candidate => candidate.id === task.id)
    if (!current?.path) throw new Error('TASK_DOCUMENT_UNAVAILABLE')
    return current
  } finally { release() }
}
