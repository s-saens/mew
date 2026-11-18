import path from 'node:path'
import { isWikiDocumentationPath } from '../shared/wiki-documentation.ts'
import { DEFAULT_PROJECT, projectRoot, resolveProjectPath, workspacePaths } from './paths.ts'

function quote(raw: string): string {
  return JSON.stringify(raw)
}

function unquote(raw: string): string {
  const t = raw.trim()
  if (t.startsWith('"') && t.endsWith('"')) {
    try { return JSON.parse(t) as string }
    catch { return t.slice(1, -1).replace(/\\"/g, '"') }
  }
  return t
}

/** frontmatter 블록에서 title 값을 뽑는다 — 링크 라벨 동기화용 (없으면 null) */
export function parseTitle(content: string): string | null {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content)
  if (!m) return null
  for (const line of m[1].split(/\r?\n/)) {
    const f = /^title:\s*(.*)$/.exec(line)
    if (f) return unquote(f[1])
  }
  return null
}

export function todayDate(): string {
  return new Date().toISOString().slice(0, 10)
}

export function isProjectWikiDocument(project: string, relativePath: string): boolean {
  const file = resolveProjectPath(project, relativePath)
  const root = project === DEFAULT_PROJECT ? workspacePaths.root : projectRoot(project)
  return isWikiDocumentationPath(path.relative(root, file).split(path.sep).join('/'))
}

/** Initialize Wiki descriptions from the title until the author can describe the body. */
export function buildFrontmatter(title: string, includeDescription: boolean): string {
  const today = todayDate()
  const description = includeDescription ? `description: ${quote(title.trim() || "제목 없는 문서")}\n` : ''
  return `---\ntitle: ${quote(title)}\ncreated: ${today}\nupdated: ${today}\n${description}---\n\n`
}
