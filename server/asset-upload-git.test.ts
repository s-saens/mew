import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import express from 'express'
import type { RemoteFrame } from '../shared/remote-access.ts'

test('temporary attachment uploads do not run Git hooks or change the index', { timeout: 20_000 }, async t => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-asset-upload-git-'))
  const root = path.join(temporary, 'project')
  fs.mkdirSync(root)
  process.env.MEW_DATA_DIR = path.join(temporary, 'data')
  process.env.MEW_WORKSPACE = root
  const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: 'pipe' }).trim()
  git('init')
  git('config', 'user.name', 'Mew Test')
  git('config', 'user.email', 'mew@example.test')
  const hookDir = path.join(temporary, 'hooks')
  fs.mkdirSync(hookDir)
  git('config', 'core.hooksPath', hookDir)
  fs.writeFileSync(path.join(root, 'initial.txt'), 'initial')
  git('add', 'initial.txt')
  git('commit', '-m', 'initial')
  fs.writeFileSync(path.join(root, 'staged.txt'), 'already staged')
  git('add', 'staged.txt')
  const originalHead = git('rev-parse', 'HEAD')
  const originalIndex = git('ls-files', '--stage')
  const hook = path.join(hookDir, 'pre-commit')
  fs.writeFileSync(hook, '#!/bin/sh\nprintf hook-ran > hook-ran\nprintf "document check failed\\n" >&2\nexit 1\n', { mode: 0o700 })

  const { createApiApp } = await import('./api.ts')
  const { isTemporaryAssetPath } = await import('./localAssets.ts')
  const { attachAuthContext } = await import('./reqAuth.ts')
  const { upsertUser, getUser } = await import('./auth.ts')
  const { gitConnections } = await import('./git-connections.ts')
  const { remoteDispatcher } = await import('./remote-access-dispatch.ts')
  const { resetTreeWatchers } = await import('./watcher.ts')
  const email = 'asset-upload@example.test'
  upsertUser(email, { role: 'owner', hash: '', mustChangePassword: false, createdAt: 1, passwordChangedAt: 0 })
  gitConnections.set(email, { provider: 'github', host: 'github.com', login: 'test', identity: { name: 'Test', email }, accessToken: 'test-token' })
  const app = express()
  app.use(attachAuthContext)
  app.use('/api', createApiApp())
  const server = http.createServer(app)
  const frames: RemoteFrame[] = []
  const session = { email, user: getUser(email)! }
  const dispatcher = remoteDispatcher(server, { send: async raw => {
    const frame = JSON.parse(raw) as RemoteFrame
    frames.push(frame)
    if (frame.type === 'response' || frame.type === 'chunk') setImmediate(() => { void dispatcher.receive(JSON.stringify({ type: 'credit', id: frame.id })) })
  }, close: () => {} }, () => session, 'https://mew.example.test')
  t.after(() => { dispatcher.close(); resetTreeWatchers(); fs.rmSync(temporary, { recursive: true, force: true }) })

  const upload = async (route: string, destDir?: string, projectRoot = root) => {
    const form = new FormData()
    form.append('file', new Blob(['image bytes'], { type: 'image/png' }), 'image.png')
    if (destDir !== undefined) form.append('destDir', destDir)
    form.append('project', '.workspace')
    form.append('projectRoot', projectRoot)
    const request = new Request('https://mew.example.test/', { method: 'POST', body: form })
    const id = crypto.randomUUID()
    await dispatcher.receive(JSON.stringify({ type: 'request', id, method: 'POST', path: `/api/${route}`, headers: { 'content-type': request.headers.get('content-type') } }))
    await dispatcher.receive(JSON.stringify({ type: 'chunk', id, data: Buffer.from(await request.arrayBuffer()).toString('base64') }))
    await dispatcher.receive(JSON.stringify({ type: 'end', id }))
    const deadline = Date.now() + 4000
    while (!frames.some(frame => frame.id === id && frame.type === 'end')) {
      if (Date.now() > deadline) throw new Error('Upload request timed out')
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    const response = frames.find(frame => frame.id === id && frame.type === 'response') as Extract<RemoteFrame, { type: 'response' }>
    const bytes = Buffer.concat(frames.filter((frame): frame is Extract<RemoteFrame, { type: 'chunk' }> => frame.id === id && frame.type === 'chunk').map(frame => Buffer.from(frame.data, 'base64')))
    return { status: response.status, body: JSON.parse(bytes.toString()) }
  }

  for (const relative of ['.mew/temp/assets/image.png', './.mew/temp/assets/nested/image.png']) assert.equal(isTemporaryAssetPath(relative), true)
  for (const relative of ['.mew/temp/assets', '.mew/temp/assets-neighbor/image.png', '.mew/temp/assets/../outside/image.png', '../.mew/temp/assets/image.png']) assert.equal(isTemporaryAssetPath(relative), false)
  for (const [route, destination] of [['upload-into', '.mew/temp/assets'], ['upload-into', './.mew/temp/assets/nested'], ['upload', undefined]] as const) {
    const response = await upload(route, destination)
    assert.equal(response.status, 200, `${route} should save an attachment even if a Git hook would fail: ${JSON.stringify(response.body)}`)
    const relative = response.body.relPath ?? response.body.path
    assert.equal(fs.readFileSync(path.join(root, relative), 'utf8'), 'image bytes')
    assert.equal(git('rev-parse', 'HEAD'), originalHead)
    assert.equal(git('ls-files', '--stage'), originalIndex, 'upload leaves all staged entries intact')
    assert.equal(fs.existsSync(path.join(root, 'hook-ran')), false, 'temporary attachment upload must not start a Git commit')
  }

  const stale = await upload('upload-into', '.mew/temp/assets', `${root}-previous`)
  assert.equal(stale.status, 409, 'a request for a previous project is rejected before saving')
  assert.equal(fs.existsSync(path.join(root, '.mew/temp/assets/image copy.png')), false)
  assert.equal(git('ls-files', '--stage'), originalIndex)

  fs.writeFileSync(hook, '#!/bin/sh\nprintf hook-ran > hook-ran\n', { mode: 0o700 })
  const ordinary = await upload('upload-into', '.mew/temp/assets-neighbor')
  assert.equal(ordinary.status, 200)
  assert.ok(ordinary.body.commit?.hash, 'ordinary explorer uploads still create their automatic commit')
  assert.equal(fs.readFileSync(path.join(root, 'hook-ran'), 'utf8'), 'hook-ran')
  assert.equal(git('show', 'HEAD:.mew/temp/assets-neighbor/image.png'), 'image bytes')
  assert.equal(git('diff', '--cached', '--name-only'), 'staged.txt', 'unrelated staged changes remain untouched by the ordinary upload commit')
})
