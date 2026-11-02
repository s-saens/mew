import express from 'express'
import { canUse } from './access-policy.ts'
import { authOf, requireAuthenticated, requireFeature, resolveAuth } from './reqAuth.ts'
import { SharedMcpConnectionError, SharedMcpConnections } from './shared-mcp-connections.ts'

const connections = new SharedMcpConnections()

export function createSharedMcpRouter(store = connections) {
  const router = express.Router()
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next() })
  router.use(requireAuthenticated, requireFeature('agent'))
  router.get('/status', async (req, res, next) => {
    try { res.json(await store.status(authOf(req).email!, req.query.name)) } catch (error) { next(error) }
  })
  router.post('/connect', (req, res, next) => {
    try {
      const owner = authOf(req).email!
      res.status(202).json(store.start(owner, req.body?.name, () => { const auth = resolveAuth(req); return auth.email === owner && canUse(auth, 'agent') }))
    } catch (error) { next(error) }
  })
  router.post('/cancel', async (req, res, next) => {
    try { res.json(await store.cancel(authOf(req).email!, req.body?.name)) } catch (error) { next(error) }
  })
  router.post('/disconnect', async (req, res, next) => {
    try { res.json(await store.disconnect(authOf(req).email!, req.body?.name)) } catch (error) { next(error) }
  })
  router.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error instanceof SharedMcpConnectionError ? error.status : 500).json({ error: error instanceof SharedMcpConnectionError ? error.message : 'MCP 연결 상태를 확인하지 못했습니다. 다시 시도하세요.' })
  })
  return router
}
