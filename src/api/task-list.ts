import { TASK_LIMIT, TASK_TEXT_LIMIT, validTaskTree, type TaskBoard, type TaskChange, type TaskItem } from '../../shared/task-list.ts'
import { validTagColors, type TaskTagColorChange } from '../../shared/task-tag-colors.ts'
import { validTag } from '../../shared/task-tags.ts'
import { mewFetch } from '../utils/remote-transport.ts'
import { json } from './response.ts'

function validItem(value: unknown): value is TaskItem {
  if (!value || typeof value !== 'object') return false
  const item = value as TaskItem
  const validId = (id: unknown) => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(id)
  return validId(item.id) && (item.parentId == null || validId(item.parentId))
    && typeof item.text === 'string' && item.text.length <= TASK_TEXT_LIMIT && typeof item.done === 'boolean'
    && (item.path === undefined || typeof item.path === 'string')
}

function validBoard(value: unknown): value is TaskBoard {
  if (!value || typeof value !== 'object') return false
  const board = value as TaskBoard
  return typeof board.canEdit === 'boolean' && Array.isArray(board.tasks) && board.tasks.length <= TASK_LIMIT
    && board.tasks.every(validItem) && validTaskTree(board.tasks)
    && (board.tags === undefined || Array.isArray(board.tags) && board.tags.every(validTag) && new Set(board.tags).size === board.tags.length)
    && (board.tagColors === undefined || validTagColors(board.tagColors))
}

async function taskRequest(url: string, init: RequestInit): Promise<TaskBoard> {
  const signal = AbortSignal.timeout(30_000)
  const response = await mewFetch(url, { ...init, signal })
  let board: unknown
  try { board = await json<unknown>(response) }
  catch (error) { throw Object.assign(error as Error, { status: response.status }) }
  if (!validBoard(board)) throw Object.assign(new SyntaxError('잘못된 태스크 변경입니다'), { status: response.status })
  return board
}

export function fetchTaskList(workspace: string, email: string): Promise<TaskBoard> {
  return taskRequest(`/api/task-list?workspace=${encodeURIComponent(workspace)}`, { headers: { 'X-Mew-Task-Owner': encodeURIComponent(email) } })
}

export function patchTaskList(workspace: string, changes: TaskChange[], email: string, tagColorChanges: TaskTagColorChange[] = [], deletedTags: string[] = []): Promise<TaskBoard> {
  return taskRequest('/api/task-list', { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-Mew-Task-Owner': encodeURIComponent(email) }, body: JSON.stringify({ workspace, changes, tagColorChanges, deletedTags }) })
}
