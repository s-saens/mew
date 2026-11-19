// Resolve agent links to project tabs or authorized server-file tabs.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_PROJECT, isDeniedSegment, listProjects, WORKSPACE_PROJECT, workspacePaths } from './paths.ts'

export type WorkspaceFileLink = { path: string; line: number | null } & ({ project: string } | { external: true })

interface WorkspaceRoots {
  workspaceRoot: string
  docsRoot: string
  projects: string[]
}

function inside(root: string, candidate: string): string | null {
  const relative = path.relative(root, candidate)
  if (!relative || relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) return null
  if (relative.split(path.sep).some(isDeniedSegment)) return null
  return relative.split(path.sep).join('/')
}

function pathAndLine(raw: string): { filePath: string; line: number | null } | null {
  let value = raw.trim()
  if (!value) return null

  const hashLine = value.match(/#L(\d+)(?:-L?\d+)?$/i)
  const line = hashLine ? Number(hashLine[1]) : null
  value = value.replace(/#.*$/, '').replace(/\?.*$/, '')

  if (/^file:/i.test(value)) {
    try {
      const url = new URL(value)
      if (url.protocol !== 'file:' || (url.hostname && url.hostname !== 'localhost')) return null
      value = fileURLToPath(url)
      return splitLine(value, line)
    } catch {
      return null
    }
  } else if (!path.isAbsolute(value) && /^[a-z][a-z0-9+.-]*:/i.test(value)) {
    return null
  }

  try {
    value = decodeURIComponent(value)
  } catch {
    return null
  }

  return splitLine(value, line)
}

function splitLine(value: string, line: number | null) {
  const suffix = value.match(/:(\d+)(?::\d+)?$/)
  if (suffix) {
    line ??= Number(suffix[1])
    value = value.slice(0, -suffix[0].length)
  }
  if (line !== null && (!Number.isSafeInteger(line) || line < 1)) line = null
  return { filePath: value, line }
}

/** 테스트에서는 임시 루트를 주입하고, 실제 요청에서는 아래 resolveWorkspaceLink가 라이브 경로를 넣는다. */
export function resolveWorkspaceLinkAt(raw: string, roots: WorkspaceRoots, allowExternal = false): WorkspaceFileLink | null {
  const parsed = pathAndLine(raw)
  if (!parsed) return null
  const absolute = path.isAbsolute(parsed.filePath)
    ? path.resolve(parsed.filePath)
    : path.resolve(roots.workspaceRoot, parsed.filePath)

  const docsPath = inside(roots.docsRoot, absolute)
  let target: WorkspaceFileLink | null = docsPath ? { project: DEFAULT_PROJECT, path: docsPath, line: parsed.line } : null
  if (!target) {
    for (const project of roots.projects) {
      const relative = inside(path.join(roots.workspaceRoot, project), absolute)
      if (relative) {
        target = { project, path: relative, line: parsed.line }
        break
      }
    }
  }
  const workspacePath = target ? null : inside(roots.workspaceRoot, absolute)
  if (workspacePath) target = { project: WORKSPACE_PROJECT, path: workspacePath, line: parsed.line }
  if (!target && allowExternal) target = { external: true, path: absolute, line: parsed.line }
  if (!target) return null

  try {
    return fs.statSync(absolute).isFile() ? target : null
  } catch {
    return null
  }
}

export function resolveWorkspaceLink(raw: string, allowExternal: boolean): WorkspaceFileLink | null {
  return resolveWorkspaceLinkAt(raw, {
    workspaceRoot: workspacePaths.root,
    docsRoot: workspacePaths.docsRoot,
    projects: listProjects(),
  }, allowExternal)
}
