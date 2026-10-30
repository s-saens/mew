import './test-isolated-data.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import express from 'express'
import { DATA_DIR } from './dataDir.ts'
import { getUser, upsertUser } from './auth.ts'
import { setFeature, setFileRule } from './access-policy.ts'
import { WORKSPACE_ROOT, setWorkspaceRoot } from './paths.ts'
import { createApiApp } from './api.ts'
import type { RequestAuth } from './reqAuth.ts'
import type { PublicShare, PublicShareFile } from '../shared/public-share.ts'
import { resetTreeWatchers } from './watcher.ts'
import { remoteDispatcher } from './remote-access-dispatch.ts'
import type { RemoteFrame } from '../shared/remote-access.ts'

test('public capability links isolate files, enforce edit revisions, revoke and preserve workspace identity', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-public-share-'))
  const project = path.join(root, 'project')
  const directory = path.join(project, 'published')
  fs.mkdirSync(path.join(directory, 'nested'), { recursive: true })
  fs.writeFileSync(path.join(directory, 'note.md'), '# Public note')
  fs.writeFileSync(path.join(directory, 'nested/second.md'), 'Second note')
  fs.writeFileSync(path.join(project, 'private.md'), 'Private sibling')
  fs.writeFileSync(path.join(directory, '.env'), 'SECRET=value')
  fs.writeFileSync(path.join(directory, '.npmrc'), 'token=secret')
  fs.writeFileSync(path.join(directory, 'page.html'), '<script>window.stolen=true</script>')
  fs.writeFileSync(path.join(directory, 'image.png'), Buffer.from([137, 80, 78, 71, 0, 13, 10]))
  fs.mkdirSync(path.join(directory, '.git'))
  fs.writeFileSync(path.join(directory, '.git/config'), 'git credentials')
  fs.symlinkSync(path.join(project, 'private.md'), path.join(directory, 'escape.md'))
  fs.symlinkSync(path.join(directory, 'note.md'), path.join(directory, 'alias.md'))
  fs.symlinkSync(DATA_DIR, path.join(directory, 'runtime-state'))
  const oldWorkspace = WORKSPACE_ROOT
  setWorkspaceRoot(root)
  const email = 'public-link-owner@example.com'
  upsertUser(email, { hash: '', role: 'owner', mustChangePassword: false, createdAt: 100, passwordChangedAt: 0 })
  let auth: RequestAuth = { role: 'owner', email, mustChangePassword: false }
  const app = express()
  app.use((req, _res, next) => { req.auth = auth; next() })
  app.use('/api', createApiApp())
  const server = http.createServer(app)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/public-shares`
  const request = (route: string, body?: unknown) => fetch(base + route, body === undefined ? undefined : { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const manage = (file: string, mode: string) => request('', { project: 'project', path: file, mode })
  const anonymous = () => { auth = { role: 'guest', email: null, mustChangePassword: false } }
  const owner = () => { auth = { role: 'owner', email, mustChangePassword: false } }
  const shared = async (file: string, mode: string) => {
    owner()
    const response = await manage(file, mode)
    assert.equal(response.status, 200, await response.clone().text())
    return (await response.json() as { share: PublicShare }).share
  }
  let retained: (() => boolean) | undefined
  const frames: RemoteFrame[] = []
  let dispatcher: ReturnType<typeof remoteDispatcher>
  dispatcher = remoteDispatcher(server, { send: async raw => {
    const frame = JSON.parse(raw) as RemoteFrame
    frames.push(frame)
    if (frame.type === 'response' || frame.type === 'chunk') setImmediate(() => { void dispatcher.receive(JSON.stringify({ type: 'credit', id: frame.id })) })
  }, close() {} }, () => null, 'https://mew.run', { alive: () => true, allowPublicShare: valid => { retained = valid } })
  try {
    for (const role of ['member', 'guest'] as const) {
      auth = { role, email: role === 'guest' ? null : email, mustChangePassword: false }
      assert.equal((await manage('published/note.md', 'view')).status, 403)
      assert.equal((await request('?project=project&path=published/note.md')).status, 403)
      assert.equal((await request('/list?project=project')).status, 403)
    }
    const managerEmail = 'public-link-manager@example.com'
    upsertUser(managerEmail, { hash: '', role: 'manager', mustChangePassword: false, createdAt: 200, passwordChangedAt: 0 })
    auth = { role: 'manager', email: managerEmail, mustChangePassword: false }
    setFileRule(managerEmail, 'project', 'published/note.md', 'view')
    assert.equal((await manage('published/note.md', 'view')).status, 403)
    setFileRule(managerEmail, 'project', 'published/note.md', 'inherit')
    assert.equal((await manage('published/nested/second.md', 'view')).status, 200)
    assert.equal((await manage('published/nested/second.md', 'off')).status, 200)
    const share = await shared('published/note.md', 'view')
    assert.match(share.id, /^[A-Za-z0-9_-]{43}$/)
    assert.equal(share.url, `/share/f/${share.id}`)
    assert.equal(share.type, 'f')
    assert.equal(fs.statSync(path.join(DATA_DIR, 'public-shares.json')).mode & 0o777, 0o600)
    const endpoint = `/f/${share.id}`
    const tree = await (await fetch(base.replace('/public-shares', '') + '/tree?project=project')).json() as { path: string; children?: { path: string; publicShare?: string }[] }[]
    assert.equal(tree.find(node => node.path === 'published')?.children?.find(node => node.path === 'published/note.md')?.publicShare, 'view')
    anonymous()
    assert.deepEqual(await (await request(endpoint)).json(), { name: 'note.md', type: 'f', mode: 'view' })
    await dispatcher.receive(JSON.stringify({ type: 'request', id: 'public-metadata', method: 'GET', path: `/api/public-shares${endpoint}`, headers: {} }))
    const deadline = performance.now() + 2000
    while (!frames.some(frame => frame.type === 'end' && frame.id === 'public-metadata')) {
      if (performance.now() > deadline) throw new Error('Public metadata transport timed out')
      await new Promise(resolve => setTimeout(resolve, 5))
    }
    assert.ok(frames.some(frame => frame.type === 'response' && frame.id === 'public-metadata' && frame.status === 200))
    assert.equal(retained?.(), true, 'only a successfully resolved link grants anonymous transport retention')
    const fileResponse = await request(endpoint + '/file')
    const file = await fileResponse.json() as PublicShareFile
    assert.equal(file.content, '# Public note')
    assert.equal(file.path, '')
    assert.match(fileResponse.headers.get('cache-control')!, /no-store/)
    assert.equal((await fetch(base.replace('/public-shares', '') + '/file?project=project&path=published/note.md')).status, 403)
    for (const target of ['../private.md', '/private.md', 'private.md', '.env', '.git/config', 'nested/second.md']) {
      assert.equal((await request(endpoint + '/file?path=' + encodeURIComponent(target))).status, 404, target)
    }
    assert.equal((await request(`/d/${share.id}`)).status, 404)
    assert.equal((await request('/f/not-a-token')).status, 404)
    assert.equal((await request(endpoint + '/tree')).status, 404)
    assert.equal((await request(endpoint + '/file', { path: '', content: 'denied', baseVersion: file.version })).status, 403)
    const editable = await shared('published/note.md', 'edit')
    assert.equal(editable.id, share.id)
    anonymous()
    assert.equal((await request(endpoint + '/file', { path: '', content: 'Changed', baseVersion: {} })).status, 409)
    const saved = await request(endpoint + '/file', { path: '', content: 'Changed', baseVersion: file.version })
    assert.equal(saved.status, 200, await saved.clone().text())
    assert.equal(fs.readFileSync(path.join(directory, 'note.md'), 'utf8'), 'Changed')
    const next = await saved.json() as PublicShareFile
    assert.notEqual(next.version.tag, file.version.tag)
    assert.equal((await request(endpoint + '/file', { path: '', content: 'Stale overwrite', baseVersion: file.version })).status, 409)
    fs.writeFileSync(path.join(directory, 'note.md'), 'External change')
    assert.equal((await request(endpoint + '/file', { path: '', content: 'Overwrite external', baseVersion: next.version })).status, 409)
    fs.unlinkSync(path.join(directory, 'note.md'))
    assert.equal((await request(endpoint + '/file', { path: '', content: 'Recreate', baseVersion: next.version })).status, 404)
    assert.equal(fs.existsSync(path.join(directory, 'note.md')), false)
    fs.writeFileSync(path.join(directory, 'note.md'), 'Restored')

    const folder = await shared('published', 'edit')
    anonymous()
    const folderEndpoint = `/d/${folder.id}`
    const entries = await (await request(folderEndpoint + '/tree')).json() as { tree: { path: string; name: string; type: string; children?: unknown[] }[] }
    assert.deepEqual(entries.tree.map(node => node.name), ['nested', 'image.png', 'note.md', 'page.html'])
    assert.deepEqual(entries.tree[0].children, [])
    assert.equal((await (await request(folderEndpoint + '/file?path=nested%2Fsecond.md')).json() as PublicShareFile).content, 'Second note')
    assert.deepEqual((await (await request(folderEndpoint + '/tree?path=nested')).json() as { tree: { path: string }[] }).tree.map(node => node.path), ['nested/second.md'])
    for (const target of ['../private.md', '.env', '.npmrc', '.git/config', 'alias.md', 'escape.md', 'runtime-state/users.json', 'nested/../../private.md']) {
      assert.equal((await request(folderEndpoint + '/file?path=' + encodeURIComponent(target))).status, 404, target)
      assert.equal((await request(folderEndpoint + '/raw?path=' + encodeURIComponent(target))).status, 404, target)
    }
    assert.equal((await request(folderEndpoint + '/file?path=image.png')).status, 415)
    const raw = await request(folderEndpoint + '/raw?path=page.html')
    assert.equal(raw.status, 200)
    assert.match(raw.headers.get('content-security-policy')!, /sandbox/)
    assert.equal(raw.headers.get('referrer-policy'), 'no-referrer')
    assert.equal(raw.headers.get('x-content-type-options'), 'nosniff')
    assert.match(raw.headers.get('cache-control')!, /no-store/)
    assert.equal(await raw.text(), '<script>window.stolen=true</script>')
    const binary = await request(folderEndpoint + '/raw?path=image.png')
    assert.deepEqual(Buffer.from(await binary.arrayBuffer()), fs.readFileSync(path.join(directory, 'image.png')))
    assert.equal((await request(folderEndpoint + '/file', { path: 'missing.md', content: 'Create', baseVersion: next.version })).status, 404)
    assert.equal(fs.existsSync(path.join(directory, 'missing.md')), false)

    owner()
    for (const target of ['published/.env', 'published/.npmrc', 'published/alias.md', 'published/escape.md', 'published/runtime-state']) assert.notEqual((await manage(target, 'view')).status, 200, target)
    for (const target of ['../private.md', '/published/note.md', 'published/./note.md', 'published\\note.md', 'published/note.md\0']) assert.equal((await manage(target, 'view')).status, 400, target)
    setFileRule(email, 'project', 'published/nested/second.md', 'deny')
    assert.equal((await manage('published', 'view')).status, 403)
    anonymous()
    assert.equal((await request(folderEndpoint)).status, 404)
    setFileRule(email, 'project', 'published/nested/second.md', 'inherit')
    assert.equal((await request(folderEndpoint)).status, 200)
    setFeature(email, 'filesWrite', false)
    assert.equal((await request(folderEndpoint)).status, 404)
    setFeature(email, 'filesWrite', null)

    const other = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-public-other-'))
    try {
      fs.mkdirSync(path.join(other, 'project/published'), { recursive: true })
      fs.writeFileSync(path.join(other, 'project/published/note.md'), 'Other workspace')
      setWorkspaceRoot(other)
      assert.equal((await (await request(endpoint + '/file')).json() as PublicShareFile).content, 'Restored')
      owner()
      assert.deepEqual(await (await request('?project=project&path=published/note.md')).json(), { share: null })
    } finally { setWorkspaceRoot(root); fs.rmSync(other, { recursive: true, force: true }) }

    const originalUser = getUser(email)!
    upsertUser(email, { ...originalUser, role: 'member' })
    anonymous()
    assert.equal((await request(endpoint)).status, 404)
    upsertUser(email, originalUser)
    assert.equal((await request(endpoint)).status, 200)
    upsertUser(email, { ...originalUser, createdAt: 101 })
    assert.equal((await request(endpoint)).status, 404)
    upsertUser(email, originalUser)

    const renamed = path.join(project, 'moved-published')
    fs.renameSync(directory, renamed)
    fs.symlinkSync(renamed, directory)
    assert.equal((await request(endpoint + '/file')).status, 404)
    assert.equal((await request(folderEndpoint + '/tree')).status, 404)
    fs.unlinkSync(directory)
    fs.renameSync(renamed, directory)
    assert.equal((await request(endpoint)).status, 200)

    owner()
    assert.equal((await manage('published/note.md', 'off')).status, 200)
    assert.equal(retained?.(), false, 'revoked links also expire the public transport retention')
    assert.equal((await request('/list?project=project')).status, 200)
    assert.equal(fs.readFileSync(path.join(DATA_DIR, 'public-shares.json'), 'utf8').includes(share.id), false)
    anonymous()
    for (const route of ['', '/file', '/raw']) assert.equal((await request(endpoint + route)).status, 404)
    const replacement = await shared('published/note.md', 'view')
    assert.notEqual(replacement.id, share.id)
    owner()
    assert.equal((await manage('published', 'off')).status, 200)
    anonymous()
    assert.equal((await request(folderEndpoint + '/tree')).status, 404)
  } finally {
    dispatcher.close()
    await new Promise<void>(resolve => server.close(() => resolve()))
    resetTreeWatchers()
    setWorkspaceRoot(oldWorkspace)
    fs.rmSync(root, { recursive: true, force: true })
  }
})
