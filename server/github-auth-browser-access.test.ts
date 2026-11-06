import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { once } from 'node:events'
import test from 'node:test'
import express from 'express'
import type { GitHubAuth } from './github-auth.ts'
import type { RequestAuth } from './reqAuth.ts'

test('GitHub browser approval checks browser and workflow grants before reading jobs while cleanup stays available', async t => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-github-browser-access-'))
  process.env.MEW_DATA_DIR = path.join(temporary, 'data')
  const { setFeature } = await import('./access-policy.ts')
  const { GitConnectionError } = await import('./git-connections.ts')
  const { createGitHubAuthRouter } = await import('./github-auth-routes.ts')
  const calls: Array<{ method: string; owner: string; id?: string }> = []
  const store = {
    async status(owner: string) { calls.push({ method: 'status', owner }); return { job: null } },
    start(owner: string) { calls.push({ method: 'start', owner }); return { id: 'fixture-job' } },
    stop(owner: string, id: string) { calls.push({ method: 'stop', owner, id }) },
    disconnect(owner: string) { calls.push({ method: 'disconnect', owner }) },
    browserJob(owner: string, id: string) { calls.push({ method: 'browserJob', owner, id }); throw new GitConnectionError('Fixture job is absent', 404) },
  } as unknown as GitHubAuth
  const account = 'github-browser@test'
  let auth: RequestAuth = { email: account, role: 'member', mustChangePassword: false }
  const app = express()
  app.use((req, _res, next) => { req.auth = auth; next() })
  app.use('/github', createGitHubAuthRouter(store))
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening')
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await fs.rm(temporary, { recursive: true, force: true }) })
  const address = server.address(); assert.ok(address && typeof address !== 'string')
  const request = (pathname: string, method = 'POST') => fetch(`http://127.0.0.1:${address.port}/github${pathname}`, { method })
  for (const feature of ['git', 'filesWrite', 'nativeBrowser'] as const) setFeature(account, feature, false)

  setFeature(account, 'git', true)
  assert.equal((await request('/fixture-job/browser')).status, 403)
  assert.deepEqual(calls, [], 'denied browser access must not read or mutate the OAuth job')
  assert.equal((await request('')).status, 202, 'a Git workflow can begin without the embedded browser')
  assert.deepEqual(calls.pop(), { method: 'start', owner: account })
  for (const workflow of ['git', 'filesWrite'] as const) {
    setFeature(account, 'git', workflow === 'git'); setFeature(account, 'filesWrite', workflow === 'filesWrite')
    setFeature(account, 'nativeBrowser', true)
    const response = await request('/fixture-job/browser')
    assert.equal(response.status, 404, `${workflow} plus browser access reaches the owned-job check`)
    assert.deepEqual(calls.pop(), { method: 'browserJob', owner: account, id: 'fixture-job' })
    setFeature(account, 'nativeBrowser', false)
    assert.equal((await request('/fixture-job/stop')).status, 200, 'revoking browser access must not prevent cancelling the OAuth job')
    assert.deepEqual(calls.pop(), { method: 'stop', owner: account, id: 'fixture-job' })
    assert.equal((await request('', 'DELETE')).status, 200, 'disconnect remains controlled by the workflow permission')
    assert.deepEqual(calls.pop(), { method: 'disconnect', owner: account })
  }
  setFeature(account, 'git', false); setFeature(account, 'filesWrite', false); setFeature(account, 'nativeBrowser', true)
  for (const [pathname, method] of [['/fixture-job/browser', 'POST'], ['/fixture-job/stop', 'POST'], ['', 'DELETE'], ['', 'GET'], ['', 'POST']] as const) {
    assert.equal((await request(pathname, method)).status, 403, 'browser access alone does not authorize the Git workflow')
  }
  assert.deepEqual(calls, [])
  setFeature(account, 'git', true)
  for (const denied of [{ ...auth, mustChangePassword: true }, { ...auth, email: null }]) {
    auth = denied
    assert.equal((await request('/fixture-job/browser')).status, 403)
  }
  assert.deepEqual(calls, [], 'invalid authentication also stops before job lookup')
})
