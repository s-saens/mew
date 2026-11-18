import fs from 'node:fs'
import path from 'node:path'
import { projectDocsDir, safeProjectPath } from './project-agent-settings.ts'
import { isWikiDocumentationPath, wikiDocumentationRoots } from '../shared/wiki-documentation.ts'

export function defaultDescriptionRoot(repository: string): string | undefined {
  const configured = projectDocsDir(repository)
  const roots = repositoryWikiRoots(repository)
  if (isWikiDocumentationPath(configured)) {
    const selected = safeProjectPath(repository, configured)
    if (fs.existsSync(selected) && fs.statSync(selected).isDirectory()) return selected
  }
  return roots[0]
}

export function repositoryWikiRoots(repository: string): string[] {
  return wikiDocumentationRoots.filter(directory => fs.existsSync(path.join(repository, directory)))
    .map(directory => safeProjectPath(repository, directory))
    .filter(directory => fs.statSync(directory).isDirectory())
}

/** Scan the named documentation roles without opening unrelated hidden state. */
export function repositoryDocumentRoots(repository: string): string[] {
  const directories = new Set([projectDocsDir(repository), '.mew/docs', '.mew/tasks', '.mew/notes', 'docs', 'resources/skills', 'resources/help'])
  return [...directories].map(directory => safeProjectPath(repository, directory))
    .filter(directory => fs.existsSync(directory) && fs.statSync(directory).isDirectory())
    .sort((left, right) => path.relative(repository, left).localeCompare(path.relative(repository, right)))
}
