import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { WebSocket, WebSocketServer } from 'ws'
import { BrowserSession } from './session.mjs'
import { ENGINES, INITIAL_URL, parseCommand, viewerHostnames } from './protocol.mjs'

function matchesToken(candidate, token) {
  if (typeof candidate !== 'string') return false
  const a = Buffer.from(candidate), b = Buffer.from(token)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** One listener and isolated browser session per engine; no changes to Mew's server. */
export async function createLabServer({ engine, runtime, initialUrl = INITIAL_URL, factory, port = engine.port }) {
  const token = randomBytes(24).toString('hex')
  const nonce = randomBytes(18).toString('base64')
  const viewerHosts = viewerHostnames(runtime?.viewerHosts)
  const allowedHosts = new Set(['localhost', '127.0.0.1', '[::1]', ...viewerHosts])
  const session = new BrowserSession({ id: engine.id, runtime, initialUrl, factory, viewerHosts })
  const clients = new Set()
  const files = new Map(await Promise.all(['client.html', 'client.js', 'client.css'].map(async name => [name, await readFile(new URL(name, import.meta.url), 'utf8')])))
  const localHost = request => {
    try {
      const url = new URL(`http://${request.headers.host}`)
      return allowedHosts.has(url.hostname) && Number(url.port) === server.address()?.port
    } catch { return false }
  }
  const server = http.createServer((request, response) => {
    if (!localHost(request)) { response.writeHead(403); response.end(); return }
    const url = new URL(request.url || '/', 'http://localhost')
    response.setHeader('cache-control', 'no-store')
    response.setHeader('x-content-type-options', 'nosniff')
    response.setHeader('referrer-policy', 'no-referrer')
    response.setHeader('content-security-policy', `default-src 'none'; script-src 'self' 'nonce-${nonce}'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'self' http://localhost:* http://127.0.0.1:*`)
    if (request.method !== 'GET' && request.method !== 'HEAD') { response.writeHead(405); response.end(); return }
    if (url.pathname === '/health') {
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({ service: 'mew-browser-lab', engine: engine.id, port: server.address()?.port, pid: process.pid, phase: session.phase }))
      return
    }
    if (url.pathname === '/') {
      const config = { ...engine, port: server.address()?.port, token, initialUrl, engines: ENGINES,
        canScreenshot: engine.id !== 'lightpanda', canPointer: engine.id !== 'lightpanda' }
      const json = JSON.stringify(config).replaceAll('<', '\\u003c')
      response.setHeader('content-type', 'text/html; charset=utf-8')
      response.end(files.get('client.html').replace('__LAB_CONFIG__', json).replaceAll('__LAB_NONCE__', nonce))
      return
    }
    const asset = { '/client.js': ['client.js', 'text/javascript'], '/client.css': ['client.css', 'text/css'] }[url.pathname]
    if (asset) {
      response.setHeader('content-type', `${asset[1]}; charset=utf-8`)
      response.end(files.get(asset[0])); return
    }
    response.writeHead(404); response.end()
  })
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 24 * 1024 })
  server.on('upgrade', (request, socket, head) => {
    let url
    try { url = new URL(request.url, 'http://localhost') } catch { socket.destroy(); return }
    if (!localHost(request) || url.pathname !== '/session' || !matchesToken(url.searchParams.get('token'), token)) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return
    }
    sockets.handleUpgrade(request, socket, head, ws => sockets.emit('connection', ws))
  })
  session.on('message', message => {
    const data = JSON.stringify(message)
    for (const client of clients) {
      if (client.readyState !== WebSocket.OPEN) continue
      if (client.bufferedAmount > 8 * 1024 * 1024) { client.close(1013, 'Viewer is not keeping up'); continue }
      client.send(data)
    }
  })
  sockets.on('connection', ws => {
    clients.add(ws)
    ws.send(JSON.stringify(session.state()))
    if (session.lastFrame) ws.send(JSON.stringify(session.lastFrame))
    session.setViewed(true)
    ws.on('message', (raw, binary) => {
      if (binary) { ws.close(1003); return }
      let command
      try { command = parseCommand(raw, session) }
      catch (error) { ws.send(JSON.stringify({ type: 'error', message: error.message })); return }
      void session.enqueue(command).catch(error => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'error', message: error.message }))
      })
    })
    const disconnect = () => { clients.delete(ws); session.setViewed(clients.size > 0) }
    ws.once('close', disconnect)
    ws.once('error', disconnect)
  })
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve) })
  } catch (error) {
    sockets.close(); await session.close(); throw error
  }
  let closing
  return {
    server, session,
    get port() { return server.address()?.port },
    close() {
      closing ??= (async () => {
        for (const client of clients) client.terminate()
        sockets.close()
        await session.close()
        await new Promise(resolve => server.close(resolve))
      })()
      return closing
    },
  }
}
