export const TASK_DOCUMENT_DIRECTORY = '.mew/tasks'
export const TASK_DONE_DIRECTORY = `${TASK_DOCUMENT_DIRECTORY}/Done`
export const TASK_DOCUMENT_DIRECTORIES = [TASK_DOCUMENT_DIRECTORY, TASK_DONE_DIRECTORY, 'docs/tasks', 'docs/tasks/Done', 'tasks'] as const
export const TASK_GUIDE_FILENAMES = new Set(['_tasks.md', '_done.md', 'moc.md', '_moc.md', 'readme.md'])

export function isTaskDocumentPath(relative: string): boolean {
  const separator = relative.lastIndexOf('/')
  const directory = relative.slice(0, separator), filename = relative.slice(separator + 1)
  return TASK_DOCUMENT_DIRECTORIES.some(candidate => candidate === directory)
    && filename.endsWith('.md') && !TASK_GUIDE_FILENAMES.has(filename.toLowerCase())
}
