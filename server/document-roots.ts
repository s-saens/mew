import fs from 'node:fs'
import path from 'node:path'
import { projectDocsDir, safeProjectPath } from './project-agent-settings.ts'

export function defaultDescriptionRoot(repository: string): string {
  return safeProjectPath(repository, projectDocsDir(repository))
}

/** Scan the named documentation roles without opening unrelated hidden state. */
export function repositoryDocumentRoots(repository: string): string[] {
  const directories = new Set([projectDocsDir(repository), '.mew/docs', '.mew/tasks', '.mew/notes', 'docs', 'resources/skills', 'resources/help'])
  return [...directories].map(directory => safeProjectPath(repository, directory))
    .filter(directory => fs.existsSync(directory) && fs.statSync(directory).isDirectory())
    .sort((left, right) => path.relative(repository, left).localeCompare(path.relative(repository, right)))
}
