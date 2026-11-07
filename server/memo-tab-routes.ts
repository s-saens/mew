import express from 'express'
import { authOf, requireAuthenticated, requireFeature } from './reqAuth.ts'
import { createPrivateMemoTab, deletePrivateMemoTab, privateMemoRoom, readPrivateMemoTabs } from './private-memos.ts'
import { closeMemoRoom } from './collab.ts'

export function createMemoTabRouter(handleError: (res: express.Response, error: unknown) => void = (res) => { res.status(500).json({ error: 'Memo storage unavailable' }) }): express.Router {
  const router = express.Router()
  router.use(requireAuthenticated, requireFeature('collaboration'))
  router.get('/', (req, res) => {
    const ownerId = authOf(req).email!
    res.json({ tabs: readPrivateMemoTabs(ownerId), ownerId })
  })
  router.post('/', (req, res) => { res.status(201).json({ tab: createPrivateMemoTab(authOf(req).email!) }) })
  router.delete('/:id', (req, res) => {
    const owner = authOf(req).email!, id = String(req.params.id)
    if (!deletePrivateMemoTab(owner, id)) { res.status(404).json({ error: 'Memo tab not found' }); return }
    closeMemoRoom(privateMemoRoom(owner, id))
    res.json({ ok: true })
  })
  router.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => { handleError(res, error) })
  return router
}
