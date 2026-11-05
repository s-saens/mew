import { splitFrontmatter } from '@mew/editor/frontmatter'
import { documentReference } from './agent-attachments.ts'

export function fileAgentTitle(content: string, path: string): string {
  const name = path.split('/').at(-1) || path
  return /\.md$/i.test(path)
    ? splitFrontmatter(content).frontmatter?.title.trim() || name.replace(/\.md$/i, '')
    : name
}

export function fileAgentDraft(file: { project: string; path: string }, title: string): string {
  return documentReference(file.project, file.path, title)
}
