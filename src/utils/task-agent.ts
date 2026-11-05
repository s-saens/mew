import { splitFrontmatter } from '@mew/editor/frontmatter'
import { isTaskDocumentPath } from '../../shared/task-document-paths.ts'
import { documentAbsolutePath } from './document-title-preview.ts'
import { editorFile } from './editor-files.ts'

export function taskAgentFile(tabPath: string, project: string, workspace?: { path: string; docsPath?: string } | null, content?: string): { project: string; path: string } | null {
  if (content !== undefined && !splitFrontmatter(content).frontmatter?.fields.some(field => field.key === 'done' && /^(true|false)$/.test(field.value))) return null
  const file = editorFile(tabPath, project)
  if (file.project === '.workspace') return isTaskDocumentPath(file.path) ? file : null
  if (!workspace) return null
  const root = workspace.path.replace(/\/$/, '')
  const absolute = documentAbsolutePath(root, workspace.docsPath, file.project, file.path)
  return absolute.startsWith(`${root}/`) && isTaskDocumentPath(absolute.slice(root.length + 1)) ? file : null
}
