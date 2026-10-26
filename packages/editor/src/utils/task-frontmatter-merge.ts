import { isNode, parseDocument } from 'yaml'

const HEADER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/
export class TaskFrontmatterConflict extends Error {}

function selections(value: unknown): string {
  if (typeof value === 'string') {
    const text = value.trim()
    if (text.startsWith('[')) {
      const parsed = parseDocument(text)
      if (!parsed.errors.length && Array.isArray(parsed.toJS())) value = parsed.toJS()
    } else value = text ? [text] : []
  }
  return JSON.stringify(Array.isArray(value) ? [...value].sort() : value ?? [])
}

/** Merge untouched task properties with disk changes while retaining the submitted body. */
export function mergeTaskFrontmatter(base: string, incoming: string, current: string, rejectConflicts = true): string {
  if (base === current || incoming === current) return incoming
  const parts = [base, incoming, current].map(text => {
    const match = HEADER.exec(text)
    if (!match) throw new TaskFrontmatterConflict('태스크 문서 속성을 다시 불러온 뒤 저장하세요.')
    const yaml = parseDocument(match[1])
    if (yaml.errors.length) throw new TaskFrontmatterConflict('태스크 문서 속성을 다시 불러온 뒤 저장하세요.')
    return { match, yaml }
  })
  const [, next, disk] = parts
  const values = parts.map(part => part.yaml.toJS())
  let changed = false
  for (const key of ['title', 'description', 'done', 'startDate', 'date', 'tags', 'assignees']) {
    const comparable = (value: unknown) => key === 'tags' || key === 'assignees' ? selections(value)
      : JSON.stringify(key === 'done' && (value === 'true' || value === 'false') ? value === 'true' : value ?? null)
    const original = comparable(values[0]?.[key]), submitted = comparable(values[1]?.[key]), saved = comparable(values[2]?.[key])
    if (submitted === original) {
      if (saved === submitted) continue
      if (disk.yaml.has(key)) {
        const node = disk.yaml.get(key, true)
        next.yaml.set(key, isNode(node) ? node.clone() : node)
      }
      else next.yaml.delete(key)
      changed = true
    } else if (rejectConflicts && saved !== original && saved !== submitted) {
      throw new TaskFrontmatterConflict('태스크 속성이 다른 곳에서 변경되었습니다. 문서를 다시 불러온 뒤 저장하세요.')
    }
  }
  return changed ? `---\n${next.yaml.toString()}---\n${incoming.slice(next.match[0].length)}` : incoming
}
