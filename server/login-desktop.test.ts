import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createServer } from 'node:http'
import { EventEmitter, once } from 'node:events'
import express from 'express'
import { WebSocket } from 'ws'
import type { RequestAuth } from './reqAuth.ts'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-login-facade-test-'))
process.env.MEW_DATA_DIR = root
const { createLoginDesktopAuthSession, createLoginDesktopRoutes, closeLoginDesktopJob, closeLoginDesktops, loginDesktopUrlAllowed } = await import('./login-desktop.ts')
const { BrowserDesktopSession, attachBrowserDesktopWebSocket, closeBrowserDesktops } = await import('./browser-desktop.ts')
const { browserLoginJob, browserLoginJobs } = await import('./browser-login-jobs.ts')
const { setFeature } = await import('./access-policy.ts')
test.after(async () => { await closeLoginDesktops(); await closeBrowserDesktops(); await fs.rm(root, { recursive: true, force: true }) })
const idOf = (stream: string) => new URL(stream, 'http://localhost').searchParams.get('login')!

test('the generic login facade retains the registered HTTPS provider entry boundary', () => {
  for (const url of ['https://accounts.google.com/o/oauth2/auth?fixture=1', 'https://github.com/login/device', 'https://auth.openai.com/authorize']) assert.equal(loginDesktopUrlAllowed(url), true)
  for (const url of ['https://accounts.google.com.evil.test/', 'http://localhost:3333/', 'https://example.test/', 'https://user:password@accounts.google.com/', 'https://accounts.google.com:444/', 'file:///etc/passwd', 'about:blank']) assert.equal(loginDesktopUrlAllowed(url), false)
})

test('login helpers bind opaque metadata to an account and job on the shared H.264 endpoint', async () => {
  try {
    const stream = await createLoginDesktopAuthSession('alice@test', 'official-cli', 'http://127.0.0.1:30123/verify')
    const id = idOf(stream), record = browserLoginJob(id, 'alice@test')!
    assert.equal(new URL(stream, 'http://localhost').pathname, '/api/browser-desktop/ws')
    assert.match(id, /^[A-Za-z0-9_-]{32}$/)
    assert.equal(record.account, 'alice@test'); assert.equal(record.job, 'official-cli')
    assert.equal(record.url, 'http://127.0.0.1:30123/verify')
    assert.equal(browserLoginJob(id, 'bob@test'), undefined)
    assert.equal(await createLoginDesktopAuthSession('alice@test', 'official-cli', record.url), stream)
    const another = await createLoginDesktopAuthSession('alice@test', 'github-device', 'https://github.com/login/device')
    assert.notEqual(idOf(another), id, 'separate jobs do not create competing native browser runtimes')
    const replaced = await createLoginDesktopAuthSession('alice@test', 'official-cli', 'https://accounts.google.com/updated')
    assert.notEqual(idOf(replaced), id)
    assert.equal(browserLoginJob(id, 'alice@test'), undefined, 'a changed job URL revokes its old token')
    await closeLoginDesktopJob('alice@test', 'official-cli')
    assert.equal(browserLoginJob(idOf(replaced), 'alice@test'), undefined)
    assert.ok(browserLoginJob(idOf(another), 'alice@test'), 'completion does not remove unrelated jobs')
    for (const target of ['https://user:password@example.test/', 'file:///etc/passwd', 'http://external.example.test/']) await assert.rejects(createLoginDesktopAuthSession('alice@test', 'bad', target))
  } finally { await closeLoginDesktops() }
})

test('login job limits are per account, reuse is bounded, and expiry revokes retained links', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 100000 })
  try {
    const streams = await Promise.all(Array.from({ length: 32 }, (_, index) => createLoginDesktopAuthSession('limited@test', `job-${index}`, 'https://accounts.google.com/')))
    assert.equal(browserLoginJobs('limited@test').length, 32)
    assert.equal(await createLoginDesktopAuthSession('limited@test', 'job-0', 'https://accounts.google.com/'), streams[0])
    await assert.rejects(createLoginDesktopAuthSession('limited@test', 'overflow', 'https://accounts.google.com/'), /너무 많습니다/)
    const other = await createLoginDesktopAuthSession('other@test', 'independent', 'https://accounts.google.com/')
    assert.ok(browserLoginJob(idOf(other), 'other@test'))
    t.mock.timers.tick(8 * 60 * 60_000)
    assert.equal(browserLoginJobs().length, 0)
    assert.equal(browserLoginJob(idOf(streams[0]), 'limited@test'), undefined)
  } finally { await closeLoginDesktops() }
})

test('HTTP browser creation needs nativeBrowser alone while ownership cleanup survives its revocation', { timeout: 10000 }, async () => {
  let auth: RequestAuth = { email: 'member@test', role: 'member', mustChangePassword: false }
  const app = express()
  app.use(express.json()); app.use((req, _res, next) => { req.auth = auth; next() }); app.use('/api/login-desktop', createLoginDesktopRoutes())
  const server = createServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  const post = (url = 'https://accounts.google.com/') => fetch(origin + '/api/login-desktop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) })
  try {
    assert.equal((await post()).status, 403)
    setFeature('member@test', 'nativeBrowser', true)
    const response = await post(); assert.equal(response.status, 200)
    const page = await response.json() as { id: string; streamUrl: string; url: string }
    assert.equal(idOf(page.streamUrl), page.id)
    assert.equal(page.url, 'https://accounts.google.com/')
    assert.equal((await post('http://127.0.0.1:30123/')).status, 400)
    assert.equal((await post('https://example.test/')).status, 400)
    assert.equal((await (await post()).json() as { id: string }).id, page.id, 'reopening the same provider reuses its job metadata')
    assert.equal((await (await post('https://accounts.google.com')).json() as { id: string }).id, page.id, 'URL normalization cannot accumulate duplicate login jobs')
    const claude = await (await post('https://claude.ai')).json() as { id: string }
    assert.equal((await (await post('https://claude.ai/')).json() as { id: string }).id, claude.id)
    auth = { ...auth, email: 'another@test', role: 'owner' }
    assert.equal((await fetch(origin + '/api/login-desktop/' + page.id, { method: 'DELETE' })).status, 403)
    auth = { email: 'member@test', role: 'member', mustChangePassword: true }
    assert.equal((await post()).status, 403)
    auth = { ...auth, mustChangePassword: false }; setFeature('member@test', 'nativeBrowser', false)
    assert.equal((await post()).status, 403)
    assert.equal((await fetch(origin + '/api/login-desktop/' + page.id, { method: 'DELETE' })).status, 200, 'revoked authority can still release its own job')
    assert.equal(browserLoginJob(page.id, 'member@test'), undefined)
    auth = { email: null, role: 'guest', mustChangePassword: false }
    assert.equal((await post()).status, 403)
    assert.equal((await fetch(origin + '/api/login-desktop/unknown', { method: 'DELETE' })).status, 403)
  } finally {
    setFeature('member@test', 'nativeBrowser', null); await closeLoginDesktops()
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()))
  }
})

test('login WebSockets reject cross-account, revoked, stale and cross-origin job tokens before launching Chrome', { timeout: 10000 }, async () => {
  let account = 'owner@test'
  const server = createServer((_req, res) => res.end('fixture'))
  attachBrowserDesktopWebSocket(server, () => ({ email: account, role: 'owner', mustChangePassword: false }))
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  const reject = async (stream: string, source = origin) => {
    const ws = new WebSocket(origin.replace('http:', 'ws:') + stream, { origin: source })
    ws.on('error', () => {})
    try { const response = await once(ws, 'unexpected-response'); assert.equal(response[1].statusCode, 403); response[1].resume() }
    finally { ws.terminate() }
  }
  try {
    const stream = await createLoginDesktopAuthSession(account, 'official-job', 'https://accounts.google.com/')
    account = 'other@test'; await reject(stream)
    account = 'owner@test'; await reject(stream, 'https://evil.test')
    setFeature(account, 'nativeBrowser', false); await reject(stream); setFeature(account, 'nativeBrowser', null)
    await closeLoginDesktopJob(account, 'official-job'); await reject(stream)
    await reject('/api/browser-desktop/ws?login=unknown')
  } finally {
    setFeature('owner@test', 'nativeBrowser', null); await closeLoginDesktops(); await closeBrowserDesktops()
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()))
  }
})

test('a completed login can close its bound viewer but cannot close a replacement general browser', async () => {
  const makeViewer = () => Object.assign(new EventEmitter(), { readyState: WebSocket.OPEN as number, send() {}, close() { this.readyState = WebSocket.CLOSED } })
  const session = new BrowserDesktopSession('purpose@test', 'about:blank')
  try {
    const login = makeViewer(), general = makeViewer()
    session.attachViewer(login as unknown as WebSocket, () => true, 'login-old')
    session.attachViewer(general as unknown as WebSocket, () => true)
    await session.closeLoginView('login-old')
    assert.equal(session.isClosed, false)
    assert.equal(general.readyState, WebSocket.OPEN)
    const second = makeViewer(); session.attachViewer(second as unknown as WebSocket, () => true, 'login-new')
    await session.closeLoginView('login-old'); assert.equal(session.isClosed, false)
    await session.closeLoginView('login-new'); assert.equal(session.isClosed, true)
  } finally { await session.close() }
})
