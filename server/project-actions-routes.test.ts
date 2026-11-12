import './test-isolated-data.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { spawnSync } from 'node:child_process'
import { crc32 } from 'node:zlib'
import express from 'express'
import { createProjectActionsRouter } from './project-actions-routes.ts'
import { ProjectActionsService } from './project-actions.ts'
import { runRequestWorkspace } from './workspace-scope.ts'
import { authOf, type Role } from './reqAuth.ts'
import { WORKSPACE_PROJECT } from './paths.ts'
import { readActiveWorkspace, writeActiveWorkspace } from './userUiState.ts'
import { setFeature } from './access-policy.ts'
import type { ProjectActionRun, ProjectActionsState } from '../shared/project-actions.ts'

const stateJson = (response: Response) => response.json() as Promise<ProjectActionsState>

const action = { id: 'build', name: 'Build', kind: 'build', command: 'saved command', artifacts: ['dist/*.apk'] }

test('project action HTTP routes isolate roots, persist edits, use stored commands and protect artifact downloads', async t => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-action-routes-'))
  const [a, b] = ['a', 'b'].map(name => path.join(temporary, name))
  for (const root of [a, b]) fs.mkdirSync(path.join(root, 'dist'), { recursive: true })
  fs.writeFileSync(path.join(b, 'dist/app.apk'), 'test APK')
  const email = 'project-action-routes@example.test'
  let role: Role = 'owner'
  writeActiveWorkspace(email, a)
  const started: Array<{ root: string; command: string }> = []
  let finish!: (value: { exitCode: number | null }) => void
  const service = new ProjectActionsService({ runner: input => {
    started.push({ root: input.root, command: input.command })
    return new Promise(resolve => { finish = resolve })
  } })
  service.save(a, [{ ...action, command: 'root a' }]); service.save(b, [action])
  const app = express()
  app.use((req, _res, next) => { req.auth = { role, email, mustChangePassword: false }; runRequestWorkspace(req, authOf(req), next) })
  app.use(express.json())
  app.use('/api/project-actions', createProjectActionsRouter({ service }))
  const server = http.createServer(app)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => {
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
    fs.rmSync(temporary, { recursive: true, force: true })
  })
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/project-actions`
  const request = (root: string | undefined, method = 'GET', extra: Record<string, unknown> = {}, endpoint = '') => {
    const scope = { project: WORKSPACE_PROJECT, ...(root !== undefined ? { workspacePath: root } : {}) }
    if (method === 'GET') return fetch(`${base}${endpoint}?${new URLSearchParams({ ...scope, ...extra } as Record<string, string>)}`)
    return fetch(base + endpoint, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...scope, ...extra }) })
  }
  assert.equal((await stateJson(await request(b))).projectRoot, b)
  assert.equal((await stateJson(await request(undefined))).actions[0].command, 'root a')
  role = 'manager'
  assert.equal((await request(b, 'PUT', { actions: [{ ...action, command: 'updated command' }] })).status, 200)
  const response = await request(b, 'POST', { id: 'build', command: 'client command must never run' }, '/run')
  assert.equal(response.status, 200)
  const { run } = await response.json() as { run: ProjectActionRun }
  assert.deepEqual(started, [{ root: b, command: 'updated command' }])
  assert.equal((await request(b, 'POST', { id: 'build' }, '/run')).status, 409)
  assert.equal((await request(b, 'GET', { runId: run.id, artifactPath: 'dist/app.apk' }, '/artifacts')).status, 404)
  finish({ exitCode: 0 })
  await new Promise(resolve => setImmediate(resolve))
  const download = await request(b, 'GET', { runId: run.id, artifactPath: 'dist/app.apk' }, '/artifacts')
  assert.equal(download.status, 200); assert.equal(await download.text(), 'test APK')
  assert.match(download.headers.get('content-disposition')!, /attachment/)
  assert.equal((await request(a, 'GET', { runId: run.id, artifactPath: 'dist/app.apk' }, '/artifacts')).status, 404)
  assert.equal((await request(b, 'GET', { runId: run.id, artifactPath: '../a/dist/app.apk' }, '/artifacts')).status, 404)

  // APKs created by ordinary command buttons or earlier server sessions have no run ID.
  fs.mkdirSync(path.join(b, 'build/app/outputs/flutter-apk'), { recursive: true })
  fs.writeFileSync(path.join(b, 'build/app/outputs/flutter-apk/app-debug.apk'), 'existing APK')
  fs.symlinkSync(path.join(b, 'dist/app.apk'), path.join(b, 'build/app/outputs/flutter-apk/link.apk'))
  const list = await request(b, 'GET', {}, '/available-artifacts')
  assert.deepEqual(await list.json(), { artifacts: [{ path: 'build/app/outputs/flutter-apk/app-debug.apk', name: 'app-debug.apk', size: 12 }] })
  const existing = await request(b, 'GET', { artifactPath: 'build/app/outputs/flutter-apk/app-debug.apk' }, '/available-artifact')
  assert.equal(existing.status, 200); assert.equal(await existing.text(), 'existing APK')
  assert.match(existing.headers.get('content-disposition')!, /attachment/)
  for (const artifactPath of ['dist/app.apk', '../a/dist/app.apk', 'build/app/outputs/flutter-apk/link.apk']) {
    assert.notEqual((await request(b, 'GET', { artifactPath }, '/available-artifact')).status, 200)
  }
  assert.deepEqual(await (await request(a, 'GET', {}, '/available-artifacts')).json(), { artifacts: [] })
  assert.notEqual((await request(a, 'GET', { artifactPath: 'build/app/outputs/flutter-apk/app-debug.apk' }, '/available-artifact')).status, 200)
  assert.equal(readActiveWorkspace(email), a)
  assert.equal((await stateJson(await request(a))).runs.length, 0)

  fs.mkdirSync(path.join(b, 'mobile'), { recursive: true })
  const nested = await request(b, 'PUT', { path: 'mobile', actions: [{ ...action, name: 'Mobile' }] })
  assert.equal(nested.status, 200)
  assert.equal((await stateJson(nested)).projectRoot, path.join(b, 'mobile'))
  assert.equal((await stateJson(await request(b))).actions[0].name, 'Build')
  fs.mkdirSync(path.join(b, 'mobile/dist'), { recursive: true }); fs.writeFileSync(path.join(b, 'mobile/dist/mobile.apk'), 'mobile APK')
  fs.mkdirSync(path.join(b, 'mobile/app/build/outputs/apk/debug'), { recursive: true })
  fs.writeFileSync(path.join(b, 'mobile/app/build/outputs/apk/debug/mobile.apk'), 'nested APK')
  const nestedExisting = await request(b, 'GET', { path: 'mobile' }, '/available-artifacts')
  assert.deepEqual(await nestedExisting.json(), { artifacts: [{ path: 'app/build/outputs/apk/debug/mobile.apk', name: 'mobile.apk', size: 10 }] })
  const nestedExistingDownload = await request(b, 'GET', { path: 'mobile', artifactPath: 'app/build/outputs/apk/debug/mobile.apk' }, '/available-artifact')
  assert.equal(nestedExistingDownload.status, 200); assert.equal(await nestedExistingDownload.text(), 'nested APK')
  const nestedStarted = await request(b, 'POST', { path: 'mobile', id: 'build' }, '/run')
  const nestedRun = (await nestedStarted.json() as { run: ProjectActionRun }).run
  finish({ exitCode: 0 }); await new Promise(resolve => setImmediate(resolve))
  const nestedDownload = await request(b, 'GET', { path: 'mobile', runId: nestedRun.id, artifactPath: 'dist/mobile.apk' }, '/artifacts')
  assert.equal(nestedDownload.status, 200); assert.equal(await nestedDownload.text(), 'mobile APK')
  const mismatch = new URL(`${base}?project=${WORKSPACE_PROJECT}`)
  mismatch.searchParams.set('mewWorkspacePath', a); mismatch.searchParams.set('mewProjectPath', a); mismatch.searchParams.set('workspacePath', b)
  assert.equal((await fetch(mismatch)).status, 409)
  assert.equal((await fetch(`${base}?workspacePath=${encodeURIComponent(a)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspacePath: b, actions: [] }) })).status, 409)
  for (const invalid of ['', 'relative', path.join(temporary, 'missing')]) assert.equal((await request(invalid)).status, 400)
  assert.equal((await fetch(`${base}?workspacePath=${encodeURIComponent(a)}&workspacePath=${encodeURIComponent(b)}`)).status, 400)
  assert.equal((await request(b, 'POST', { id: 'missing' }, '/run')).status, 404)
  assert.equal((await request(b, 'PUT', { actions: [{ ...action, name: '' }] })).status, 400)

  setFeature(email, 'terminal', false)
  for (const [method, endpoint] of [['GET', ''], ['PUT', ''], ['POST', '/run'], ['POST', '/discover'], ['GET', '/artifacts'], ['GET', '/available-artifacts'], ['GET', '/available-artifact']]) assert.equal((await request(b, method, { id: 'build' }, endpoint)).status, 403)
  setFeature(email, 'terminal', true)
  for (const denied of ['member', 'guest'] as const) {
    role = denied
    assert.equal((await request(b)).status, 403)
    assert.equal((await request(undefined)).status, 403)
  }
})

test('missing and malformed setup remains a recoverable HTTP state; explicit discovery persists only known actions', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-action-discover-route-'))
  const app = express()
  app.use((req, _res, next) => { req.auth = { role: 'owner', email: 'action-discovery@example.test', mustChangePassword: false }; next() })
  app.use(express.json()); app.use('/actions', createProjectActionsRouter())
  const server = http.createServer(app)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); fs.rmSync(root, { recursive: true, force: true }) })
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/actions`
  const scope = { workspacePath: root, project: WORKSPACE_PROJECT }
  let response = await fetch(`${base}?${new URLSearchParams(scope)}`)
  assert.equal(response.status, 200); assert.equal((await stateJson(response)).needsAgent, true)
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { build: 'compile' } }))
  response = await fetch(`${base}/discover`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(scope) })
  assert.equal(response.status, 200); assert.equal((await stateJson(response)).actions[0].command, 'npm run build')
  fs.writeFileSync(path.join(root, '.mew/project-actions.json'), '{broken')
  response = await fetch(`${base}?${new URLSearchParams(scope)}`)
  assert.equal(response.status, 200)
  const state = await stateJson(response); assert.equal(state.needsAgent, true); assert.ok(state.warnings.length)
})

test('automatically detected web output downloads as a scoped, validated ZIP of its recorded files', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-action-archive-'))
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-action-archive-outside-'))
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { build: 'vite build' } }))
  let role: Role = 'owner'
  const service = new ProjectActionsService({ runner: async () => {
    fs.mkdirSync(path.join(root, 'dist/assets'), { recursive: true })
    fs.writeFileSync(path.join(root, 'dist/index.html'), '<script src="assets/app.js"></script>')
    fs.writeFileSync(path.join(root, 'dist/assets/app.js'), 'app')
    fs.writeFileSync(path.join(root, 'dist/assets/한글.js'), 'uni')
    for (let i = 0; i < 508; i++) fs.writeFileSync(path.join(root, `dist/assets/${i}.js`), 'x')
    return { exitCode: 0 }
  } })
  const app = express()
  app.use((req, _res, next) => { req.auth = { role, email: 'archive@example.test', mustChangePassword: false }; next() })
  app.use(express.json()); app.use('/actions', createProjectActionsRouter({ service }))
  const server = http.createServer(app)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(outside, { recursive: true, force: true }) })
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/actions`
  const scope = { workspacePath: root, project: WORKSPACE_PROJECT }
  const started = await fetch(`${base}/run`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...scope, id: 'npm:build' }) })
  const runId = (await started.json() as { run: ProjectActionRun }).run.id
  await new Promise(resolve => setImmediate(resolve))
  const state = await stateJson(await fetch(`${base}?${new URLSearchParams(scope)}`))
  assert.deepEqual(state.runs[0].archive, { name: 'dist.zip', fileCount: 511, size: 551 })
  assert.equal(state.runs[0].artifacts.length, 100)
  const url = `${base}/archive?${new URLSearchParams({ ...scope, runId })}`
  const head = await fetch(url, { method: 'HEAD' })
  assert.equal(head.status, 200)
  const response = await fetch(url)
  assert.equal(response.status, 200); assert.match(response.headers.get('content-disposition')!, /dist\.zip/)
  const zip = Buffer.from(await response.arrayBuffer())
  assert.equal(Number(head.headers.get('content-length')), zip.length)
  assert.equal(Number(response.headers.get('content-length')), zip.length)
  // Read the central directory and check that entries use paths relative to dist.
  const end = zip.length - 22
  assert.equal(zip.readUInt32LE(end), 0x06054b50)
  assert.equal(zip.readUInt16LE(end + 10), 511)
  let offset = zip.readUInt32LE(end + 16)
  const entries = new Map<string, string>()
  for (let i = 0; i < 511; i++) {
    assert.equal(zip.readUInt32LE(offset), 0x02014b50)
    const size = zip.readUInt32LE(offset + 24), nameLength = zip.readUInt16LE(offset + 28)
    const name = zip.subarray(offset + 46, offset + 46 + nameLength).toString()
    const local = zip.readUInt32LE(offset + 42), data = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28)
    const contents = zip.subarray(data, data + size)
    assert.equal(crc32(contents), zip.readUInt32LE(offset + 16))
    entries.set(name, contents.toString())
    offset += 46 + nameLength + zip.readUInt16LE(offset + 30) + zip.readUInt16LE(offset + 32)
  }
  assert.equal(entries.size, 511)
  assert.equal(entries.get('index.html'), '<script src="assets/app.js"></script>')
  assert.equal(entries.get('assets/app.js'), 'app')
  assert.equal(entries.get('assets/한글.js'), 'uni')
  const zipPath = path.join(outside, 'output.zip')
  fs.writeFileSync(zipPath, zip)
  const python = spawnSync('python3', ['-c', 'import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; assert len(z.namelist()) == 511; assert z.read("assets/한글.js") == b"uni"', zipPath], { encoding: 'utf8' })
  if (!python.error || (python.error as NodeJS.ErrnoException).code !== 'ENOENT') assert.equal(python.status, 0, python.stderr)
  assert.equal((await fetch(`${base}/archive?${new URLSearchParams({ ...scope, workspacePath: outside, runId })}`)).status, 404)
  role = 'member'; assert.equal((await fetch(url)).status, 403); role = 'owner'
  fs.unlinkSync(path.join(root, 'dist/index.html'))
  fs.writeFileSync(path.join(outside, 'secret'), 'private')
  fs.symlinkSync(path.join(outside, 'secret'), path.join(root, 'dist/index.html'))
  assert.notEqual((await fetch(url)).status, 200)
  fs.unlinkSync(path.join(root, 'dist/index.html'))
  assert.notEqual((await fetch(url)).status, 200)
})
