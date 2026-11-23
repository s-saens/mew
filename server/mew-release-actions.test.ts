import './test-isolated-data.ts'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import express from 'express'
import type { MewUpdateStatus } from './mewUpdate.ts'

test('release status and source management actions do not inspect or mutate the source installation', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-release-actions-'))
  const previousState = process.env.XDG_STATE_HOME
  const previousDistribution = process.env.MEW_DISTRIBUTION
  const previousChannel = process.env.MEW_INSTALL_CHANNEL
  const previousVersion = process.env.MEW_INSTALL_VERSION
  delete process.env.MEW_INSTALL_CHANNEL
  delete process.env.MEW_INSTALL_VERSION
  process.env.XDG_STATE_HOME = directory
  process.env.MEW_DISTRIBUTION = 'release'
  const jobPath = path.join(directory, 'mew', 'update-job.json')
  const savedJob = JSON.stringify({ state: 'running', startedAt: 1, finishedAt: null, message: null })
  await fs.mkdir(path.dirname(jobPath))
  await fs.writeFile(jobPath, savedJob)
  const { createApiApp, tmuxManager } = await import('./api.ts')
  const list = tmuxManager.list
  const startCommand = tmuxManager.startCommand
  tmuxManager.list = async () => { throw new Error('must not inspect terminal sessions') }
  tmuxManager.startCommand = async () => { throw new Error('must not launch source management commands') }
  const app = express()
  app.use((req, _res, next) => {
    req.auth = { role: 'owner', email: 'release-owner@example.com', mustChangePassword: false }
    next()
  })
  app.use('/api', createApiApp())
  const server = http.createServer(app)
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`
    const statusResponse = await fetch(`${base}/mew-update/status?refresh=1`)
    assert.equal(statusResponse.status, 200)
    const status = await statusResponse.json() as { canUpdate: boolean; supported: boolean; job: unknown; error: string; updateInstruction: string }
    assert.equal(status.canUpdate, false)
    assert.equal(status.supported, false)
    assert.equal(status.job, null)
    assert.match(status.error, /업데이트 정보를 확인할 수 없습니다/)
    assert.match(status.updateInstruction, /npx mew-ide@latest/)
    assert.match(status.updateInstruction, /curl/)

    process.env.MEW_INSTALL_CHANNEL = 'curl'
    process.env.MEW_INSTALL_VERSION = '0.10.0'
    const originalFetch = globalThis.fetch
    t.mock.method(globalThis, 'fetch', async (url: string, options?: RequestInit) => {
      if (!url.startsWith('https://api.github.com/repos/s-saens/mew/releases?')) return originalFetch(url, options)
      const assets = ['install.sh', 'SHA256SUMS', 'mew-cli-standalone.tar.gz', `mew-runtime-${process.platform}-${process.arch}.tar.gz`]
      return Response.json([{ tag_name: 'mew-cli-v0.11.0', draft: false, prerelease: false, assets: assets.map(name => ({ name, state: 'uploaded' })) }])
    })
    const curlResponse = await fetch(`${base}/mew-update/status?refresh=1`)
    assert.equal(curlResponse.status, 200)
    const curl = await curlResponse.json() as MewUpdateStatus
    assert.equal(curl.installChannel, 'curl')
    assert.equal(curl.available, true)
    assert.equal(curl.canUpdate, false)
    assert.equal(curl.currentVersion, '0.10.0')
    assert.equal(curl.latestVersion, '0.11.0')
    assert.equal(curl.updateUrl, 'https://github.com/s-saens/mew/releases/tag/mew-cli-v0.11.0')
    assert.equal(curl.error, null)
    for (const action of ['build', 'restart', 'update']) {
      const response = await fetch(`${base}/mew-actions/${action}/run`, { method: 'POST' })
      assert.equal(response.status, 409)
      const error = (await response.json() as { error: string }).error
      assert.match(error, /npx mew-ide@latest/)
      assert.match(error, /curl/)
    }
    assert.equal(await fs.readFile(jobPath, 'utf8'), savedJob)
  } finally {
    tmuxManager.list = list
    tmuxManager.startCommand = startCommand
    await new Promise<void>(resolve => server.close(() => resolve()))
    if (previousState === undefined) delete process.env.XDG_STATE_HOME
    else process.env.XDG_STATE_HOME = previousState
    if (previousDistribution === undefined) delete process.env.MEW_DISTRIBUTION
    else process.env.MEW_DISTRIBUTION = previousDistribution
    if (previousChannel === undefined) delete process.env.MEW_INSTALL_CHANNEL
    else process.env.MEW_INSTALL_CHANNEL = previousChannel
    if (previousVersion === undefined) delete process.env.MEW_INSTALL_VERSION
    else process.env.MEW_INSTALL_VERSION = previousVersion
    await fs.rm(directory, { recursive: true, force: true })
  }
})
