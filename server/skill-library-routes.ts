import express from 'express'
import { SkillLibraryStore, SkillLibraryError } from './skill-library.ts'
import { authOf, requireFeature } from './reqAuth.ts'
import { runWithAgentAccount } from './agent-account-settings.ts'
import type { SkillLibraryMutation } from '../shared/skill-library.ts'

function workingDirectory(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new SkillLibraryError('작업 폴더를 확인하세요')
  return value
}

export function createSkillLibraryRouter(store = new SkillLibraryStore()) {
  const router = express.Router()
  router.use(requireFeature('agent'))
  router.use((req, _res, next) => runWithAgentAccount(authOf(req).email, next))
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next() })
  router.get('/', async (req, res, next) => {
    try { res.json(await store.list(workingDirectory(req.query.cwd))) }
    catch (error) { next(error) }
  })
  router.get('/detail', async (req, res, next) => {
    try {
      if (typeof req.query.id !== 'string') throw new SkillLibraryError('스킬을 선택하세요')
      res.json(await store.detail(workingDirectory(req.query.cwd), req.query.id))
    } catch (error) { next(error) }
  })
  router.post('/', async (req, res, next) => {
    try {
      const input: SkillLibraryMutation = { ...req.body, cwd: workingDirectory(req.body?.cwd) }
      await store.mutate(input)
      res.json({ ok: true })
    } catch (error) { next(error) }
  })
  router.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof SkillLibraryError) res.status(error.status).json({ error: error.message })
    else res.status(400).json({ error: '스킬 파일과 폴더 권한을 확인한 뒤 다시 시도하세요' })
  })
  return router
}
