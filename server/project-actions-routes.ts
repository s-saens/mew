import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { requireFeature, requireRole } from './reqAuth.ts'
import { UnsafePathError, UnknownProjectError } from './paths.ts'
import { projectRequestRoot as requestRoot, projectRequestWorkspace as requestWorkspace } from './project-scope.ts'
import { protectFileResponse } from './file-response.ts'
import { ProjectActionError, ProjectActionsService, projectActionsService } from './project-actions.ts'
import { projectActionArchive } from './project-actions-archive.ts'

function failure(res: express.Response, error: unknown): void {
  if (error instanceof ProjectActionError) res.status(error.status).json({ error: error.message })
  else if (error instanceof UnsafePathError || error instanceof UnknownProjectError) res.status(400).json({ error: error.message })
  else res.status(400).json({ error: '빌드·배포 설정이나 결과를 처리할 수 없습니다. 프로젝트 폴더와 파일 권한을 확인하세요.' })
}

export function createProjectActionsRouter(options: { service?: ProjectActionsService } = {}) {
  const router = express.Router(), service = options.service ?? projectActionsService
  router.use(requireRole('owner', 'manager'), requireFeature('terminal'), requestWorkspace)
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'private, no-store'); next() })
  router.get('/', (req, res) => {
    try { res.json(service.state(requestRoot(req))) }
    catch (error) { failure(res, error) }
  })
  router.put('/', (req, res) => {
    try { res.json(service.save(requestRoot(req), req.body?.actions)) }
    catch (error) { failure(res, error) }
  })
  router.post('/discover', (req, res) => {
    try { res.json(service.discover(requestRoot(req))) }
    catch (error) { failure(res, error) }
  })
  router.post('/run', (req, res) => {
    try { res.json({ run: service.run(requestRoot(req), req.body?.id) }) }
    catch (error) { failure(res, error) }
  })
  router.get('/artifacts', (req, res) => {
    let fd: number | undefined
    try {
      const file = service.artifact(requestRoot(req), req.query.runId, req.query.artifactPath)
      fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0))
      const stat = fs.fstatSync(fd)
      if (!stat.isFile()) throw new ProjectActionError('일반 결과 파일만 다운로드할 수 있습니다.', 403)
      protectFileResponse(res)
      res.attachment(path.basename(file)); res.type('application/octet-stream'); res.setHeader('Content-Length', stat.size)
      const source = fs.createReadStream(file, { fd, autoClose: true })
      fd = undefined
      res.once('close', () => source.destroy())
      source.once('error', error => { if (res.headersSent) res.destroy(error); else { res.removeHeader('Content-Length'); res.removeHeader('Content-Disposition'); failure(res, error) } })
      source.pipe(res)
    } catch (error) { if (fd !== undefined) fs.closeSync(fd); failure(res, error) }
  })
  router.get('/archive', (req, res) => {
    try {
      const archive = service.archive(requestRoot(req), req.query.runId)
      protectFileResponse(res)
      res.attachment(archive.name); res.type('application/zip'); res.setHeader('Content-Length', archive.size)
      if (req.method === 'HEAD') { res.end(); return }
      const source = projectActionArchive(archive.files, archive.validate)
      res.once('close', () => source.destroy())
      source.once('error', error => { if (res.headersSent) res.destroy(error); else { res.removeHeader('Content-Length'); res.removeHeader('Content-Disposition'); failure(res, error) } })
      source.pipe(res)
    } catch (error) { failure(res, error) }
  })
  return router
}
