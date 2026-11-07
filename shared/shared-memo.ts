// Reserved collaboration room, independent of the active workspace/project.
export const SHARED_MEMO_PROJECT = '__mew_shared__'
export const SHARED_MEMO_PATH = 'memo'
export const SHARED_MEMO_ROOM = `${SHARED_MEMO_PROJECT}:${SHARED_MEMO_PATH}`

export const PRIVATE_MEMO_PROJECT = '__mew_private_memo__'
export interface MemoTab { id: string; name: string }

const memoIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
export function isPrivateMemoId(id: string): boolean { return memoIdPattern.test(id) }

export function privateMemoPath(userId: string, id: string): string {
  return `${encodeURIComponent(userId)}/${id}`
}

export function privateMemoOwner(room: string): string | null {
  const prefix = `${PRIVATE_MEMO_PROJECT}:`
  if (!room.startsWith(prefix)) return null
  const parts = room.slice(prefix.length).split('/')
  if (parts.length !== 2 || !isPrivateMemoId(parts[1]!)) return null
  try {
    const owner = decodeURIComponent(parts[0]!)
    return owner && encodeURIComponent(owner) === parts[0] ? owner : null
  } catch { return null }
}

export function isMemoProject(project: string): boolean {
  return project === SHARED_MEMO_PROJECT || project === PRIVATE_MEMO_PROJECT
}

export function isMemoRoom(room: string): boolean {
  return room === SHARED_MEMO_ROOM || privateMemoOwner(room) !== null
}
