import express from 'express'
import { authOf, requireFeature, requireRole } from './reqAuth.ts'
import { UnsafePathError, UnknownProjectError } from './paths.ts'
import { ProjectActionError } from './project-actions.ts'
import { projectRequestRoot, projectRequestWorkspace } from './project-scope.ts'
import { ProjectPipelinesService, projectPipelinesService } from './project-pipelines.ts'

export function createProjectPipelinesRouter(options: { service?: ProjectPipelinesService } = {}) {
  const router = express.Router(), service = options.service ?? projectPipelinesService
  router.use(requireRole('owner', 'manager'), requireFeature('terminal'), projectRequestWorkspace)
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'private, no-store'); next() })
  const route = (handler: (req: express.Request) => unknown): express.RequestHandler => (req, res) => {
    try { res.json(handler(req)) }
    catch (error) {
      const status = error instanceof ProjectActionError ? error.status : 400
      res.status(status).json({ error: error instanceof ProjectActionError || error instanceof UnsafePathError || error instanceof UnknownProjectError ? error.message : '미리보기·공개 설정이나 실행 기록을 처리할 수 없습니다. 프로젝트 폴더와 권한을 확인하세요.' })
    }
  }
  router.get('/', route(req => service.state(projectRequestRoot(req), authOf(req).email ?? '')))
  router.put('/', route(req => service.save(projectRequestRoot(req), authOf(req).email ?? '', req.body?.pipelines)))
  router.post('/discover', route(req => service.discover(projectRequestRoot(req), authOf(req).email ?? '')))
  router.post('/run', route(req => ({ run: service.run(projectRequestRoot(req), authOf(req).email ?? '', req.body?.id, req.body?.expectedRevision) })))
  return router
}
