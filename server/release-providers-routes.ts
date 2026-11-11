import express from 'express'
import { authOf, requireFeature, requireRole } from './reqAuth.ts'
import { projectRequestRoot, projectRequestWorkspace } from './project-scope.ts'
import { ReleaseProviderError, ReleaseProvidersService, releaseProvidersService } from './release-providers.ts'
import { UnsafePathError, UnknownProjectError } from './paths.ts'

function failure(res: express.Response, error: unknown): void {
  if (error instanceof ReleaseProviderError) res.status(error.status).json({ error: error.message })
  else if (error instanceof UnsafePathError || error instanceof UnknownProjectError) res.status(400).json({ error: error.message })
  else res.status(500).json({ error: '공개 서비스 연결을 처리하지 못했습니다. 프로젝트와 연결 설정을 확인하세요.' })
}

export function createReleaseProvidersRouter(options: { service?: ReleaseProvidersService } = {}) {
  const router = express.Router(), service = options.service ?? releaseProvidersService
  router.use(requireRole('owner', 'manager'), requireFeature('terminal'), projectRequestWorkspace)
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'private, no-store'); next() })
  router.get('/', (req, res) => {
    try { res.json(service.state(projectRequestRoot(req), authOf(req).email!)) } catch (error) { failure(res, error) }
  })
  router.put('/connection', (req, res) => {
    try {
      const root = projectRequestRoot(req), owner = authOf(req).email!
      service.save(root, owner, req.body); res.json(service.state(root, owner))
    } catch (error) { failure(res, error) }
  })
  router.delete('/connection/:id', (req, res) => {
    try {
      const root = projectRequestRoot(req), owner = authOf(req).email!
      service.remove(root, owner, req.params.id); res.json(service.state(root, owner))
    } catch (error) { failure(res, error) }
  })
  router.post('/run', async (req, res) => {
    try { res.json(await service.start(projectRequestRoot(req), authOf(req).email!, req.body?.connectionId, req.body?.requestId)) } catch (error) { failure(res, error) }
  })
  router.post('/refresh', async (req, res) => {
    try { res.json(await service.refresh(projectRequestRoot(req), authOf(req).email!, req.body?.runId)) } catch (error) { failure(res, error) }
  })
  return router
}
