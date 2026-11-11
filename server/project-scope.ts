import type express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { authOf } from './reqAuth.ts'
import { assertNotServerDataPath, DEFAULT_PROJECT, pathsForWorkspace, UnsafePathError, UnknownProjectError, workspaceContext, workspacePaths } from './paths.ts'
import { projectDirectory } from './subprojects.ts'
import { ProjectActionError } from './project-actions.ts'

export function projectRequestRoot(req: express.Request): string {
  for (const key of ['project', 'path'] as const) {
    const query = req.query[key], body = req.body?.[key]
    if (query !== undefined && body !== undefined && query !== body) throw new ProjectActionError('요청의 프로젝트 범위가 일치하지 않습니다.', 409)
    if (query !== undefined && typeof query !== 'string' || body !== undefined && typeof body !== 'string') throw new ProjectActionError('프로젝트 경로가 올바르지 않습니다.')
  }
  const project = req.query.project ?? req.body?.project ?? DEFAULT_PROJECT
  return projectDirectory(project, req.query.path ?? req.body?.path ?? '')
}

export function projectRequestWorkspace(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const query = req.query.workspacePath, body = req.body?.workspacePath
  if (query !== undefined && body !== undefined && query !== body) { res.status(409).json({ error: '요청의 프로젝트 범위가 일치하지 않습니다.' }); return }
  const requested = query ?? body
  if (requested === undefined) { next(); return }
  try {
    if (typeof requested !== 'string' || !requested || requested.length > 4096 || /[\0\r\n]/.test(requested) || !path.isAbsolute(requested)) throw new UnsafePathError('프로젝트 폴더의 절대 경로가 필요합니다.')
    const root = fs.realpathSync(requested)
    assertNotServerDataPath(root)
    if (!fs.statSync(root).isDirectory()) throw new UnsafePathError('프로젝트 폴더가 필요합니다.')
    if (workspaceContext.getStore()?.explicit) {
      if (root !== workspacePaths.root) { res.status(409).json({ error: '요청의 프로젝트 범위가 일치하지 않습니다.' }); return }
      next(); return
    }
    workspaceContext.run(pathsForWorkspace(root, authOf(req).email), next)
  } catch (error) {
    const status = error instanceof ProjectActionError ? error.status : 400
    res.status(status).json({ error: error instanceof ProjectActionError || error instanceof UnsafePathError || error instanceof UnknownProjectError ? error.message : '프로젝트 폴더를 확인하세요.' })
  }
}
