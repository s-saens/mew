import fs from 'node:fs'
import { projectRegistry } from './project-registry.ts'
import { WORKSPACE_ROOT, pathsForWorkspace, workspaceContext } from './paths.ts'
import { readActiveWorkspace, readRootProjects, writeActiveWorkspace } from './userUiState.ts'

function isDirectory(directory: string): boolean {
  try { return fs.statSync(directory).isDirectory() } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) return false
    throw error
  }
}

/** Snapshot the account's root for the entire request, including asynchronous work. */
export function runAccountWorkspace<T>(account: string | null, action: () => T): T {
  if (account) projectRegistry.ensureMigration()
  const saved = account ? readActiveWorkspace(account) : null
  const selected = saved && isDirectory(saved) ? saved : account ? readRootProjects(account)?.paths.find(isDirectory) ?? null : null
  if (selected && account && selected !== saved) writeActiveWorkspace(account, selected)
  return workspaceContext.run(pathsForWorkspace(selected ?? WORKSPACE_ROOT, account), action)
}
