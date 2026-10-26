import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import express from 'express'
import type { AuthenticatedSession } from './auth.ts'
import type { RemoteFrame } from '../shared/remote-access.ts'
import { remoteDispatcher } from './remote-access-dispatch.ts'
import { createRemoteUiRouter } from './remote-ui.ts'
import { workspaceSearchPolicy } from './search-indexing.ts'

const entry = await fs.readFile(new URL('../index.html', import.meta.url), 'utf8')

test('workspace crawlers can fetch noindex on HTML, files, API errors and SPA routes', async t => {
  const app = express()
  app.use(workspaceSearchPolicy)
  app.get('/file.pdf', (_req, res) => res.type('pdf').send('fixture'))
  app.get('/api/private', (_req, res) => res.status(401).json({ error: 'login required' }))
  app.use((_req, res) => res.type('html').send(entry))
  const server = http.createServer(app)
  server.listen(0, '127.0.0.1')
  await new Promise<void>(resolve => server.once('listening', resolve))
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())))
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`

  const robots = await fetch(`${origin}/robots.txt`)
  assert.equal(robots.status, 200)
  assert.match(robots.headers.get('content-type') ?? '', /^text\/plain/)
  assert.equal(await robots.text(), 'User-agent: *\nAllow: /\n')
  assert.equal(robots.headers.get('cache-control'), 'no-cache')
  const head = await fetch(`${origin}/robots.txt`, { method: 'HEAD' })
  assert.equal(head.status, 200)
  assert.equal(await head.text(), '')

  for (const resource of ['/', '/file.pdf', '/api/private', '/unknown-route']) {
    const response = await fetch(origin + resource)
    assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow', resource)
    if (resource === '/' || resource === '/unknown-route') {
      const html = await response.text()
      assert.match(html, /<meta name="robots" content="noindex, nofollow"/)
      assert.match(html, /<meta name="description" content="Mew is a browser workspace/)
      assert.match(html, /<title>mew · My Easy Workspace<\/title>/)
    }
  }
})

test('P2P keeps the workspace noindex header and the installed entry metadata', async t => {
  const dist = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-search-policy-'))
  await fs.writeFile(path.join(dist, 'index.html'), entry)
  const app = express()
  app.use(workspaceSearchPolicy)
  app.use('/api/remote-ui', createRemoteUiRouter(dist))
  const server = http.createServer(app)
  const owner: AuthenticatedSession = { email: 'owner@example.test', user: { hash: '', role: 'owner', mustChangePassword: false, createdAt: 1, passwordChangedAt: 0 } }
  let status: number | undefined
  let headers: Record<string, string> = {}
  const chunks: Buffer[] = []
  let finish!: () => void
  const done = new Promise<void>(resolve => { finish = resolve })
  const dispatcher = remoteDispatcher(server, {
    async send(raw) {
      const frame = JSON.parse(raw) as RemoteFrame
      if (frame.type === 'response') { status = frame.status; headers = frame.headers }
      if (frame.type === 'chunk') chunks.push(Buffer.from(frame.data, 'base64'))
      if (frame.type === 'end') finish()
      if (frame.type === 'response' || frame.type === 'chunk') queueMicrotask(() => void dispatcher.receive(JSON.stringify({ type: 'credit', id: frame.id })))
    },
    close() {},
  }, () => owner, 'https://mew.invalid')
  t.after(async () => { dispatcher.close(); await fs.rm(dist, { recursive: true, force: true }) })
  await dispatcher.receive(JSON.stringify({ type: 'request', id: 'index', method: 'GET', path: '/api/remote-ui/file?path=/index.html', headers: {} }))
  await done
  assert.equal(status, 200)
  assert.equal(headers['x-robots-tag'], 'noindex, nofollow')
  const html = Buffer.concat(chunks).toString()
  assert.match(html, /<meta name="robots" content="noindex, nofollow"/)
  assert.match(html, /mew-p2p-app/)
})
