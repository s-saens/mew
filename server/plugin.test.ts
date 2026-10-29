import assert from 'node:assert/strict'
import http from 'node:http'
import { registerHooks } from 'node:module'
import test from 'node:test'
import type { Express } from 'express'
import type { ViteDevServer } from 'vite'

test('development API setup never loads Mewlink or mounts its management API', async t => {
  const pluginUrl = new URL('./plugin.ts', import.meta.url).href
  const stubs: Record<string, string[]> = {
    './config.ts': [],
    './access-socket.ts': ['watchSocketAccess'],
    './websocket-origin.ts': ['webSocketOriginAllowed'],
    './login-desktop.ts': ['attachLoginDesktopWebSocket'],
    './remote-desktop.ts': ['attachRemoteDesktopWebSocket'],
    './api.ts': ['createApiApp'],
    './port-preview.ts': ['attachPortPreviewWebSocket', 'createPortPreviewMiddleware'],
    './authRoutes.ts': ['createAuthRouter', 'checkOrigin'],
    './reqAuth.ts': ['attachAuthContext', 'resolveAuth', 'authorizeTmux', 'authorizeCollab', 'authorizeFeature', 'authorizeDatabase'],
    '@mew/tmux-term/server': ['attachTmuxWebSocket'],
    './presence.ts': ['attachPresenceWebSocket'],
    './live-socket.ts': ['attachLiveWebSocket'],
    './live-sources.ts': ['createLiveSource'],
    './collab.ts': ['attachCollabWebSocket'],
    './collabAgent.ts': ['attachCollabAgents'],
    './db/socket.ts': ['attachDbWebSocket'],
    './agentWs.ts': ['attachAgentWebSocket'],
    './agentAcp.ts': ['reapOrphanAgents'],
    './agentScheduledPrompts.ts': ['startAgentScheduledPrompts'],
    './watcher.ts': ['watchDocsTree'],
    './search-indexing.ts': ['workspaceSearchPolicy'],
  }
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (context.parentURL === pluginUrl) {
        assert.notEqual(specifier, './remote-access-agent.ts', 'dev must leave stored Mewlink registration and connections untouched')
        const source = specifier === './paths.ts'
          ? 'export const WORKSPACE_ROOT = "/fixture"'
          : stubs[specifier]?.map(name => `export function ${name}() { return (_req, _res, next) => next() }`).join('\n')
        if (source !== undefined) return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true }
      }
      return nextResolve(specifier, context)
    },
  })
  t.after(() => hooks.deregister())
  const { configureDocsServer } = await import('./plugin.ts')
  const httpServer = http.createServer()
  t.after(() => httpServer.close())

  for (const server of [httpServer, null]) {
    const apps: Express[] = []
    configureDocsServer({ httpServer: server, middlewares: { use(app: Express) { apps.push(app) } } } as unknown as ViteDevServer)
    assert.equal(apps.length, 1)
    const app = apps[0]!
    const layers = app.router.stack as unknown as { match(path: string): boolean }[]
    const mountedAt = (path: string) => layers.filter(layer => layer.match(path) && !layer.match('/')).length
    assert.equal(mountedAt('/api'), 2, 'local authentication context and API stay mounted')
    assert.equal(mountedAt('/api/auth'), 3, 'local authentication stays mounted')
    assert.equal(mountedAt('/api/remote-access'), mountedAt('/api'), 'Mewlink management has no dedicated route')
    assert.equal(httpServer.listening, false, 'fixture never starts an application server')
  }
})
