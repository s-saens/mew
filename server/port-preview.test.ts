import './test-isolated-data.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { once } from 'node:events'
import express from 'express'
import { WebSocket, WebSocketServer } from 'ws'
import { attachPortPreviewWebSocket, createPortPreviewMiddleware, createPortPreviewRoutes, portPreviewFrameUrl } from './port-preview.ts'
import { bindRemoteSocket } from './remote-access-context.ts'
import { resolveAuth } from './reqAuth.ts'
import type { AuthenticatedSession } from './auth.ts'
import { parseRemoteFrame } from '../shared/remote-access.ts'

const owner: AuthenticatedSession = { email: 'preview@example.test', user: { hash: '', role: 'owner', mustChangePassword: false, createdAt: 1, passwordChangedAt: 0 } }
async function start(server: http.Server) { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return `http://127.0.0.1:${(server.address() as { port: number }).port}` }
const stop = (server: http.Server) => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()) })

test('module rewriting handles multiline imports and reexports while preserving comments, strings, JSON and source maps', async t => {
  const comment = '// import fake from "/comment-only.js"'
  const literal = 'const message = \'import fake from "/string-only.js"\';'
  const template = 'const example = `export { fake } from "/template-only.js"`;'
  const sourceMap = '//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozfQ=='
  const source = [comment, literal, template, 'import {\n value\n} from "/dependency.js";', 'export {\n value as renamed\n} from "/exports.js";', 'const lazy = import(`/dynamic.js`);', 'const computed = import(`/chunks/${name}.js`);', 'const self = import.meta.url;', sourceMap].join('\n')
  const json = '{"example":"import fake from \\"/json-only.js\\""}'
  const upstream = http.createServer((req, res) => {
    if (req.url === '/entry.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(source); return }
    res.setHeader('Content-Type', 'text/html')
    res.end(`<html><head><script type="module">import {\n value\n} from "/inline.js";</script><script type="application/json">${json}</script></head><body></body></html>`)
  })
  const target = await start(upstream); t.after(() => stop(upstream))
  const app = express(), host = http.createServer(app)
  app.use(createPortPreviewMiddleware())
  const origin = await start(host); t.after(() => stop(host))
  const resource = portPreviewFrameUrl(target + '/entry.js', owner.email, { active: () => true })
  const code = await (await fetch(origin + resource)).text()
  for (const original of [comment, literal, template, sourceMap, 'import(`/chunks/${name}.js`)', 'import.meta.url']) assert.ok(code.includes(original), original)
  const prefix = resource.slice(0, resource.lastIndexOf('/'))
  for (const name of ['dependency', 'exports', 'dynamic']) assert.ok(code.includes(prefix + `/${name}.js`), `${name} stays inside preview capability`)
  const html = await (await fetch(origin + portPreviewFrameUrl(target, owner.email, { active: () => true }))).text()
  assert.match(html, /from "\/__mew_port_preview\/[^"\n]+\/inline\.js"/)
  assert.ok(html.includes(json), 'non-JavaScript inline data is preserved')
})


test('port preview binds cookies and URL capabilities to one port and live login, protects Mew and keeps HTML opaque', async t => {
  let current: AuthenticatedSession | null = owner, body = '', cookie = ''
  const upstream = http.createServer(async (req, res) => {
    if (req.url === '/redirect') { res.writeHead(302, { Location: 'http://example.com/' }); res.end(); return }
    if (req.url === '/cookie') { res.setHeader('Set-Cookie', 'isolated=yes; HttpOnly; Path=/'); res.end('ok'); return }
    if (req.url === '/api') { for await (const part of req) body += String(part); cookie = req.headers.cookie ?? ''; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ body, cookie, origin: req.headers.origin })); return }
    res.setHeader('Content-Type', 'text/html'); res.end('<html><head><script type="module" src="/root.js"></script></head><body>preview</body></html>')
  })
  const target = await start(upstream); t.after(() => stop(upstream))
  const app = express(), host = http.createServer(app)
  app.use((req, _res, next) => { bindRemoteSocket(req.socket, { current: () => current, capability: 'port-preview' }); req.auth = resolveAuth(req); next() })
  app.use(createPortPreviewMiddleware())
  app.use(express.json())
  app.use('/api/port-preview', createPortPreviewRoutes())
  attachPortPreviewWebSocket(host)
  const origin = await start(host); t.after(() => stop(host))
  const issue = await fetch(origin + '/api/port-preview/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ port: Number(new URL(target).port) }) })
  assert.equal(issue.status, 200)
  const session = await issue.json() as { token: string; url: string }
  const response = await fetch(origin + session.url)
  assert.equal(response.status, 200); assert.match(response.headers.get('content-security-policy')!, /sandbox allow-/)
  assert.doesNotMatch(response.headers.get('content-security-policy')!, /allow-same-origin/)
  assert.match(await response.text(), /__mew_port_preview\//)
  const raw = `${origin}/api/port-preview/${session.token}/raw`
  await fetch(raw + '/cookie')
  const exactBody = '{ "hello" : "world" }\n'
  const api = await fetch(raw + '/api', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: 'mew_session=must-not-forward', Origin: 'null' }, body: exactBody })
  assert.equal(api.status, 200)
  assert.deepEqual(await api.json(), { body: exactBody, cookie: 'isolated=yes', origin: `http://localhost:${new URL(target).port}` })
  assert.equal((await fetch(raw + '/redirect', { redirect: 'manual' })).status, 403)
  const second = portPreviewFrameUrl(target + '/api', owner.email, { active: () => !!current })
  const noCookies = await fetch(origin + second, { method: 'POST', body: '' }); assert.equal(noCookies.status, 200); assert.equal(cookie, '')
  assert.throws(() => portPreviewFrameUrl(origin, owner.email, { active: () => true }), /포트/)
  assert.equal((await fetch(origin + '/' + new URL(origin).port)).status, 403)
  current = null
  assert.equal((await fetch(origin + session.url)).status, 403)
  assert.equal((await fetch(raw + '/api')).status, 403)
  const login = await fetch(origin + '/' + new URL(target).port + '/deep?x=1', { redirect: 'manual' })
  assert.equal(login.status, 302); assert.match(login.headers.get('location')!, /^\/\?preview=/)
})

test('port-only remote protocol cannot send ordinary Mew APIs and local websocket preserves HMR protocol and revokes', async t => {
  assert.throws(() => parseRemoteFrame(JSON.stringify({ type: 'request', id: 'x', capability: 'port-preview', method: 'GET', path: '/api/files', headers: {} })))
  assert.throws(() => parseRemoteFrame(JSON.stringify({ type: 'socket', id: 'x', capability: 'port-preview', path: '/api/tmux/ws' })))
  const upstream = http.createServer(), wss = new WebSocketServer({ server: upstream, handleProtocols: protocols => protocols.has('chosen-hmr') ? 'chosen-hmr' : false })
  let protocol = ''
  wss.on('connection', socket => { protocol = socket.protocol; socket.on('message', value => socket.send(value)) })
  const target = await start(upstream); t.after(() => stop(upstream))
  let active = true
  const url = portPreviewFrameUrl(target, owner.email, { active: () => active }), token = url.split('/')[3]!
  const host = http.createServer(); attachPortPreviewWebSocket(host, { account: () => owner.email })
  const origin = await start(host); t.after(() => stop(host))
  const socket = new WebSocket(`${origin.replace('http:', 'ws:')}/api/port-preview/ws?token=${encodeURIComponent(token)}&path=/hmr&protocols=offered-hmr,chosen-hmr`, ['offered-hmr', 'chosen-hmr'])
  await once(socket, 'open'); const message = once(socket, 'message'); socket.send('hmr'); assert.equal(String((await message)[0]), 'hmr'); assert.equal(protocol, 'chosen-hmr'); assert.equal(socket.protocol, 'chosen-hmr')
  const closed = once(socket, 'close'); active = false; await closed
})

test('direct opaque preview runs root module, API POST and HMR without host DOM access', { timeout: 15_000 }, async t => {
  const { chromium } = await import('playwright-core')
  const targetServer = http.createServer(async (req, res) => {
    if (req.url === '/app.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(`const response=await fetch('/api/echo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({value:'direct'})});const text=(await response.json()).value;const ws=new WebSocket('ws://'+location.host+'/hmr');const hmr=await new Promise(resolve=>{ws.onopen=()=>ws.send('ping');ws.onmessage=e=>{resolve(e.data);ws.close()}});let isolated=false;try{parent.document.body}catch{isolated=true}const base=window.__MEW_PORT_PREVIEW_BASE_PATH__;history.pushState({},' ',base+'/deep');document.querySelector('#result').textContent=text+' '+hmr+' '+isolated+' '+(location.pathname==='/deep')`); return }
    if (req.url === '/api/echo') { let body = ''; for await (const part of req) body += String(part); res.end(body); return }
    res.setHeader('Content-Type', 'text/html'); res.end('<html><head></head><body><div id="result">Loading</div><script type="module" src="/app.js"></script></body></html>')
  })
  const wss = new WebSocketServer({ server: targetServer }); wss.on('connection', socket => socket.on('message', () => socket.send('HMR')))
  const target = await start(targetServer); t.after(() => stop(targetServer))
  const app = express(), host = http.createServer(app)
  app.use((req, _res, next) => { bindRemoteSocket(req.socket, { current: () => owner, capability: 'port-preview' }); req.auth = resolveAuth(req); next() })
  app.use(createPortPreviewMiddleware()); attachPortPreviewWebSocket(host)
  const origin = await start(host); t.after(() => stop(host))
  const browser = await chromium.launch({ headless: true }); t.after(() => browser.close())
  const page = await browser.newPage(), errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  await page.goto(origin + '/' + new URL(target).port, { waitUntil: 'domcontentloaded' })
  await page.frameLocator('iframe').getByText('direct HMR true true', { exact: true }).waitFor({ timeout: 5000 })
  assert.deepEqual(errors, [])
  const base = await page.frameLocator('iframe').locator('#result').evaluate(el => Object.getOwnPropertyDescriptor(el.ownerDocument.defaultView!, '__MEW_PORT_PREVIEW_BASE_PATH__'))
  assert.equal(base!.writable, false); assert.match(base!.value as string, /^\/__mew_port_preview\//)
})

test('direct and raw event streams deliver their first event and cancel upstream on disconnect', { timeout: 10_000 }, async t => {
  let disconnected = 0
  const upstream = http.createServer((_req, res) => {
    res.setHeader('Content-Type', 'text/event-stream'); res.flushHeaders(); res.write('data: first\n\n')
    const timer = setInterval(() => res.write(': keepalive\n\n'), 10_000)
    res.once('close', () => { clearInterval(timer); disconnected++ })
  })
  const target = await start(upstream); t.after(() => stop(upstream))
  const app = express(), host = http.createServer(app)
  app.use((req, _res, next) => { bindRemoteSocket(req.socket, { current: () => owner, capability: 'port-preview' }); req.auth = resolveAuth(req); next() })
  app.use(createPortPreviewMiddleware()); app.use('/api/port-preview', createPortPreviewRoutes())
  const origin = await start(host); t.after(() => stop(host))
  const url = portPreviewFrameUrl(target + '/events', owner.email, { active: () => true }), token = url.split('/')[3]!
  for (const path of [url, `/api/port-preview/${token}/raw/events`]) {
    const controller = new AbortController()
    const response = await fetch(origin + path, { signal: controller.signal })
    assert.equal(response.status, 200)
    const reader = response.body!.getReader(), first = await Promise.race([reader.read(), new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error('first SSE event was buffered')), 1000).unref())])
    assert.equal(Buffer.from(first.value!).toString(), 'data: first\n\n')
    controller.abort(); await reader.cancel().catch(() => {})
  }
  const deadline = Date.now() + 1000
  while (disconnected !== 2 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10))
  assert.equal(disconnected, 2)
})

test('raw preview requires a verified port-only transport, even with a valid local login and token', { timeout: 10_000 }, async t => {
  const { createSession, removeUser, upsertUser } = await import('./auth.ts')
  const { remoteDispatcher } = await import('./remote-access-dispatch.ts')
  let requests = 0
  const upstream = http.createServer((_req, res) => { requests++; res.setHeader('Content-Type', 'text/html'); res.end('<html><head></head><body>isolated</body></html>') })
  const target = await start(upstream); t.after(() => stop(upstream))
  upsertUser(owner.email, owner.user); t.after(() => { removeUser(owner.email) })
  const cookie = `mew_session=${createSession(owner.email)}`
  const token = portPreviewFrameUrl(target, owner.email, { active: () => true }).split('/')[3]!
  const route = `/api/port-preview/${token}/raw/`
  const app = express(), host = http.createServer(app)
  app.use(createPortPreviewMiddleware())
  const origin = await start(host)
  for (const headers of [{ Cookie: cookie }, { Cookie: cookie, 'x-mew-capability': 'port-preview' }]) {
    assert.equal((await fetch(origin + route, { headers })).status, 403)
  }
  assert.equal(requests, 0)
  const pending = new Map<string, { status: number; done: (status: number) => void }>()
  const dispatcher = remoteDispatcher(host, {
    send: async raw => {
      const frame = JSON.parse(raw)
      const request = pending.get(frame.id)
      if (!request) return
      if (frame.type === 'response') request.status = frame.status
      if (frame.type === 'end') request.done(request.status)
    }, close() { for (const request of pending.values()) request.done(0) },
  }, () => owner, origin)
  t.after(async () => { dispatcher.close(); await stop(host) })
  const request = async (id: string, capability?: 'port-preview') => {
    const completed = new Promise<number>(done => pending.set(id, { status: 0, done }))
    await dispatcher.receive(JSON.stringify({ type: 'request', id, method: 'GET', path: route, headers: {}, responseWindow: 8, ...(capability ? { capability } : {}) }))
    return completed
  }
  assert.throws(() => parseRemoteFrame(JSON.stringify({ type: 'request', id: 'ordinary', method: 'GET', path: route, headers: {} })))
  assert.equal(requests, 0)
  assert.equal(await request('preview', 'port-preview'), 200)
  assert.equal(requests, 1)
})
