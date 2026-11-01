import { splitFrontmatter } from '@mew/editor/frontmatter'
import { isTaskDocumentPath } from '../../shared/task-document-paths.ts'
import { documentAbsolutePath } from './document-title-preview.ts'
import { editorFile } from './editor-files.ts'
import type { Locale } from '../i18n-locales.ts'

export function taskAgentFile(tabPath: string, project: string, workspace?: { path: string; docsPath?: string } | null): { project: string; path: string } | null {
  const file = editorFile(tabPath, project)
  if (file.project === '.workspace') return isTaskDocumentPath(file.path) ? file : null
  if (!workspace) return null
  const root = workspace.path.replace(/\/$/, '')
  const absolute = documentAbsolutePath(root, workspace.docsPath, file.project, file.path)
  return absolute.startsWith(`${root}/`) && isTaskDocumentPath(absolute.slice(root.length + 1)) ? file : null
}

const instructions: Record<Locale, string> = {
  ko: '참조한 태스크 문서를 먼저 정리한 이후 그 내용에 따라 구현하세요.',
  en: 'First organize the referenced task document, then implement the task according to its contents.',
  'zh-CN': '请先整理所引用的任务文档，再根据文档内容进行实现。',
  ja: '参照したタスク文書を先に整理してから、その内容に従って実装してください。',
}

export function taskAgentPrompt(file: { project: string; path: string }, locale: Locale): string {
  return `[[${file.project}:${file.path}]]\n\n${instructions[locale]}`
}

export function taskAgentTitle(content: string, path: string): string {
  return splitFrontmatter(content).frontmatter?.title.trim() || path.split('/').at(-1)!.replace(/\.md$/, '')
}
