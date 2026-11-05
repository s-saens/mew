import express from 'express'
import { McpManagementError, McpManagementStore } from './mcp-management.ts'
import { sharedMcpAuthStatus } from './shared-mcp-oauth.ts'
import { authOf, requireAuthenticated, requireFeature } from './reqAuth.ts'
import { runWithAgentAccount } from './agent-account-settings.ts'
import type { McpManagementInventory, McpManagementMutation } from '../shared/mcp-management.ts'
import type { SharedMcpConnectionStatus } from '../shared/shared-mcp.ts'

function workingDirectory(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new McpManagementError('프로젝트 폴더를 확인하세요')
  return value
}

type ConnectionSummary = Pick<SharedMcpConnectionStatus, 'status' | 'error'>

/** Reads saved readiness only; listing and usage changes never connect to an upstream. */
export function createMcpManagementRouter(store = new McpManagementStore(), status: (name: string) => ConnectionSummary = name => sharedMcpAuthStatus(store.directory, name)) {
  const router = express.Router()
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next() })
  router.use(requireAuthenticated, requireFeature('agent'))
  router.use((req, _res, next) => runWithAgentAccount(authOf(req).email, next))
  const summarize = (inventory: McpManagementInventory, canManage: boolean): McpManagementInventory => ({
    ...inventory, canManage,
    servers: inventory.servers.map(server => {
      let connection: ConnectionSummary
      try {
        const value = status(server.name)
        connection = { status: value.status, ...(value.error ? { error: value.error } : {}) }
      } catch { connection = { status: 'error', error: '연결 상태를 확인하지 못했습니다. 연결 설정을 확인하세요.' } }
      return { ...server, connection }
    }),
  })
  router.get('/', (req, res, next) => {
    try { res.json(summarize(store.list(workingDirectory(req.query.cwd)), authOf(req).role === 'owner')) }
    catch (error) { next(error) }
  })
  router.post('/', (req, res, next) => {
    try {
      const canManage = authOf(req).role === 'owner'
      const input: McpManagementMutation = { ...req.body, cwd: workingDirectory(req.body?.cwd) }
      if (!canManage && !(input.action === 'usage' && input.scope === 'project')) throw new McpManagementError('공통 MCP 연결과 묶음은 소유자만 관리할 수 있습니다', 403)
      if (input.action === 'consolidate-cloudflare' && Array.isArray(input.disable) && input.disable.length) {
        const unified = store.list(input.cwd).cloudflare.existingUnified
        if (!unified || status(unified).status !== 'connected') throw new McpManagementError('통합 연결을 먼저 추가하고 연결을 확인한 뒤 기존 연결을 끄세요', 409)
      }
      res.json(summarize(store.mutate(input), canManage))
    } catch (error) { next(error) }
  })
  router.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error instanceof McpManagementError ? error.status : 400).json({ error: error instanceof McpManagementError ? error.message : 'MCP 관리 설정을 확인한 뒤 다시 시도하세요' })
  })
  return router
}
