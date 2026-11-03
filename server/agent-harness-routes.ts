import express from 'express'
import { AgentHarnessStore, HarnessError } from './agent-harness.ts'
import { authOf, requireFeature } from './reqAuth.ts'
import { runWithAgentAccount } from './agent-account-settings.ts'
import type { HarnessInventory, HarnessKind, HarnessMutation } from '../shared/agent-harness.ts'

function scope(value: unknown, kind: unknown): { cwd: string; kind: HarnessKind } {
  if (typeof value !== 'string' || !value.trim() || !['skills', 'mcp'].includes(String(kind))) throw new HarnessError('작업 폴더와 종류를 확인하세요')
  return { cwd: value, kind: kind as HarnessKind }
}
function commonLocations(inventory: HarnessInventory) {
  return new Set(inventory.locations.filter(location => location.kind === 'mcp' && location.agent === 'mew').map(location => location.id))
}
function requireCommonOwner(req: express.Request) {
  if (authOf(req).role !== 'owner') throw new HarnessError('Mew 공통 MCP는 소유자만 관리할 수 있습니다', 403)
}
export function createAgentHarnessRouter(store = new AgentHarnessStore()) {
  const router = express.Router()
  router.use(requireFeature('agent'))
  router.use((req, _res, next) => runWithAgentAccount(authOf(req).email, next))
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next() })
  router.get('/', async (req, res, next) => {
    try {
      const input = scope(req.query.cwd, req.query.kind)
      const inventory = await store.list(input.cwd, input.kind)
      const canManageSharedMcp = authOf(req).role === 'owner'
      if (input.kind === 'mcp' && !canManageSharedMcp) {
        const common = commonLocations(inventory)
        const readonly = { writable: false, reason: 'Mew 공통 MCP는 소유자만 관리할 수 있습니다' }
        inventory.locations = inventory.locations.map(location => common.has(location.id) ? { ...location, ...readonly } : location)
        inventory.items = inventory.items.map(item => common.has(item.location) ? { ...item, ...readonly } : item)
      }
      res.json({ ...inventory, canManageSharedMcp })
    } catch (error) { next(error) }
  })
  router.get('/detail', async (req, res, next) => {
    try {
      const input = scope(req.query.cwd, req.query.kind)
      if (typeof req.query.id !== 'string') throw new HarnessError('항목을 선택하세요')
      if (input.kind === 'mcp') {
        const inventory = await store.list(input.cwd, input.kind)
        const item = inventory.items.find(item => item.id === req.query.id)
        if (!item) throw new HarnessError('항목이 변경되었거나 삭제되었습니다. 새로고침하세요', 404)
        if (commonLocations(inventory).has(item.location)) requireCommonOwner(req)
      }
      res.json(await store.detail(input.cwd, input.kind, req.query.id))
    } catch (error) { next(error) }
  })
  router.post('/', async (req, res, next) => {
    try {
      const input = scope(req.body?.cwd, req.body?.kind)
      const mutation: HarnessMutation = { ...req.body, ...input }
      if (input.kind === 'mcp') {
        const inventory = await store.list(input.cwd, input.kind)
        const common = commonLocations(inventory)
        const item = inventory.items.find(item => item.id === mutation.id)
        if (['save', 'move', 'delete', 'import'].includes(mutation.action) && !item) throw new HarnessError('항목이 변경되었거나 삭제되었습니다. 새로고침하세요', 404)
        if (['create', 'move', 'import'].includes(mutation.action) && !inventory.locations.some(location => location.id === mutation.target)) throw new HarnessError('쓸 수 있는 대상 위치를 선택하세요')
        if (mutation.action === 'import' || item && common.has(item.location) || mutation.target && common.has(mutation.target)) requireCommonOwner(req)
      }
      await store.mutate(mutation)
      res.json({ ok: true })
    } catch (error) { next(error) }
  })
  router.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof HarnessError) res.status(error.status).json({ error: error.message })
    else res.status(400).json({ error: '파일 권한 또는 설정 형식을 확인한 뒤 다시 시도하세요' })
  })
  return router
}
