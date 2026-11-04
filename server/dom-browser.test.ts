import './test-isolated-data.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { once } from 'node:events'
import { WebSocket, WebSocketServer } from 'ws'
import { chromium } from 'playwright-core'
import { attachDomBrowserWebSocket, closeDomBrowsers, DOM_BROWSER_WS, domBrowserTarget, parseDomBrowserCommand, domBrowserMewPorts, domBrowserBlockedPorts } from './dom-browser.ts'
import type { DomBrowserCommand, DomBrowserMessage } from '../shared/dom-browser.ts'
import type { RequestAuth } from './reqAuth.ts'
import { accessChanges } from './access-policy.ts'
import { remotePath } from '../shared/remote-access.ts'
import { domBrowserExecutable } from './browser-dom-executable.ts'

async function start(server: http.Server) {
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`
}
const stop = (server: http.Server) => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()) })
const owner: RequestAuth = { role: 'owner', email: 'dom-browser@example.test', mustChangePassword: false }

test('DOM browser registry marks actual Mew listeners and removes closed servers', async () => {
  const host = http.createServer()
  attachDomBrowserWebSocket(host, () => owner)
  const origin = await start(host)
  const port = Number(new URL(origin).port)
  try {
    assert.ok(domBrowserMewPorts().has(port))
    assert.ok(domBrowserBlockedPorts().has(port))
    assert.ok(domBrowserBlockedPorts().has(4999))
    assert.throws(() => domBrowserTarget(origin, domBrowserBlockedPorts()))
  } finally { await stop(host) }
  assert.equal(domBrowserMewPorts().has(port), false)
  assert.equal(domBrowserBlockedPorts().has(port), false)
})

test('existing browser connections block a Mew server that starts listening later', async () => {
  const first = http.createServer()
  attachDomBrowserWebSocket(first, () => owner)
  const firstOrigin = await start(first)
  const client = connection(firstOrigin)
  await once(client.ws, 'open')
  let protectedRequests = 0
  const later = http.createServer((_req, res) => { protectedRequests++; res.end('Mew') })
  attachDomBrowserWebSocket(later, () => owner)
  const laterOrigin = await start(later)
  try {
    client.send({ type: 'navigate', url: laterOrigin })
    await client.wait(() => client.messages.find(message => message.type === 'error'), 'new Mew listener is blocked')
    assert.equal(protectedRequests, 0)
  } finally {
    client.ws.terminate()
    await closeDomBrowsers()
    await Promise.all([stop(first), stop(later)])
  }
})

function connection(origin: string, requestOrigin = origin) {
  const ws = new WebSocket(origin.replace('http:', 'ws:') + DOM_BROWSER_WS, { origin: requestOrigin })
  const messages: DomBrowserMessage[] = []
  ws.on('message', raw => messages.push(JSON.parse(raw.toString()) as DomBrowserMessage))
  type CommandWithoutGeneration = DomBrowserCommand extends infer Command ? Command extends DomBrowserCommand ? Omit<Command, 'generation'> & { generation?: number } : never : never
  const send = (value: CommandWithoutGeneration) => {
    const latest = messages.findLast(message => message.type === 'events' || message.type === 'state')
    ws.send(JSON.stringify({ generation: latest && 'generation' in latest ? latest.generation : 0, ...value }))
  }
  const wait = async <T>(read: () => T | undefined, label: string): Promise<T> => {
    const until = Date.now() + 12_000
    while (Date.now() < until) {
      const result = read()
      if (result !== undefined) return result
      await new Promise(resolve => setTimeout(resolve, 25))
    }
    throw new Error(`Timed out: ${label}; ${JSON.stringify(messages.filter(message => message.type !== 'events'))}`)
  }
  return { ws, messages, send, wait }
}

function findNode(value: unknown, predicate: (node: Record<string, unknown>) => boolean): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object') return
  if (!Array.isArray(value) && predicate(value as Record<string, unknown>)) return value as Record<string, unknown>
  for (const child of Object.values(value)) {
    const result = findNode(child, predicate)
    if (result) return result
  }
}

test('DOM browser accepts HTTP(S) sites and rejects credentials, Mew ports, and malformed addresses', () => {
  const blocked = new Set([5000, 4999])
  for (const raw of ['https://example.com/path?q=1#test', 'http://external.example.test:3000', 'http://192.168.0.1:3000', 'http://localhost.example.com:3000']) assert.equal(domBrowserTarget(raw, blocked).href, new URL(raw).href)
  for (const raw of ['', '/relative', 'file:///etc/passwd', 'ftp://example.com', 'javascript:alert(1)', 'data:text/html,hello', 'http://localhost:5000', 'http://[::1]:4999', 'https://external.example.test:5000', 'http://user:password@localhost:3000', 'https://user:password@example.com', 'http://@localhost:3000', 'https://@example.com', 'http://example.com:0', 'http://example.com:65536']) assert.throws(() => domBrowserTarget(raw, blocked), raw)
  assert.equal(domBrowserTarget('http://localhost:3000/path?q=1#test', new Set([5000])).pathname, '/path')
  assert.equal(domBrowserTarget('http://[::1]:3000', new Set([5000])).hostname, '[::1]')
  assert.equal(domBrowserTarget('http://127.0.0.2:3000', new Set([5000])).hostname, '127.0.0.2')
  assert.equal(domBrowserTarget('http://127.1:3000', new Set([5000])).hostname, '127.0.0.1')
})

test('DOM browser validates command input and remote transport capability', () => {
  for (const colorScheme of ['dark', 'light']) assert.deepEqual(parseDomBrowserCommand(JSON.stringify({ type: 'color-scheme', colorScheme })), { type: 'color-scheme', colorScheme })
  for (const colorScheme of ['system', 'no-preference', '', null, true, 1, {}, undefined]) assert.throws(() => parseDomBrowserCommand(JSON.stringify({ type: 'color-scheme', colorScheme })))
  for (const command of [{ type: 'input', id: -1, value: '' }, { type: 'resize', width: 1, height: 1 }, { type: 'key', key: 'Control+Escape' }, { type: 'scroll', id: 1, x: null, y: 0 }, { type: 'key', key: 'Enter', ctrlKey: 'true' }]) assert.throws(() => parseDomBrowserCommand(JSON.stringify(command)))
  for (const scrollRevision of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '1', null]) assert.throws(() => parseDomBrowserCommand(JSON.stringify({ type: 'scroll', generation: 1, id: 1, x: 0, y: 100, scrollRevision })))
  for (const scrollRevision of [1, Number.MAX_SAFE_INTEGER]) assert.equal((parseDomBrowserCommand(JSON.stringify({ type: 'scroll', generation: 1, id: 1, x: 0, y: 100, scrollRevision })) as { scrollRevision: number }).scrollRevision, scrollRevision)
  assert.deepEqual(parseDomBrowserCommand('{"type":"scroll","generation":1,"id":1,"x":0,"y":100}'), { type: 'scroll', generation: 1, id: 1, x: 0, y: 100 })
  assert.deepEqual(parseDomBrowserCommand('{"type":"key","generation":1,"key":"Enter","ctrlKey":true}'), { type: 'key', generation: 1, key: 'Enter', ctrlKey: true })
  assert.equal(remotePath(DOM_BROWSER_WS, true), true)
  assert.equal(remotePath(DOM_BROWSER_WS, true, 'port-preview'), false)
})

test('host DOM relay opens an external HTTP hostname and follows links, redirects, and history without internet access', { timeout: 60_000, skip: !domBrowserExecutable() }, async t => {
  const launch = chromium.launch.bind(chromium)
  t.mock.method(chromium, 'launch', (options: Parameters<typeof chromium.launch>[0]) => launch({
    ...options,
    args: [...(options?.args ?? []), '--host-resolver-rules=MAP external.example.test 127.0.0.1', '--no-proxy-server'],
  }))
  let origin = '', protectedRequests = 0
  const fixture = http.createServer((req, res) => {
    if (req.url === '/redirect') { res.writeHead(302, { location: '/redirected?external=1#last' }); res.end(); return }
    if (req.url === '/mew-redirect') { res.writeHead(302, { location: origin + '/secret' }); res.end(); return }
    res.setHeader('content-type', 'text/html')
    res.end(`<!doctype html><html><head><title>External site</title></head><body><output id="path">${req.url}</output><a id="next" href="/next?link=1#next">Next</a><a id="redirect" href="/redirect">Redirect</a><a id="mew" href="/mew-redirect">Mew</a></body></html>`)
  })
  const local = await start(fixture); t.after(() => stop(fixture))
  const external = local.replace('127.0.0.1', 'external.example.test')
  const host = http.createServer((_req, res) => { protectedRequests++; res.end('Mew secret') })
  attachDomBrowserWebSocket(host, () => owner)
  origin = await start(host); t.after(async () => { await closeDomBrowsers(); await stop(host) })
  const client = connection(origin); await once(client.ws, 'open'); t.after(() => client.ws.terminate())
  const loaded = async (from: number, path: string) => {
    await client.wait(() => client.messages.slice(from).findLast(message => message.type === 'state' && !message.loading && message.url === external + path), `external page ${path}`)
    return client.wait(() => findNode(client.messages.slice(from), entry => (entry.attributes as Record<string, unknown> | undefined)?.id === 'next'), `external snapshot ${path}`)
  }
  const singleSnapshot = async (from: number, label: string) => {
    await new Promise(resolve => setTimeout(resolve, 150))
    const snapshots = client.messages.slice(from).flatMap(message => message.type === 'events' ? message.events : []).filter(event => event && typeof event === 'object' && 'type' in event && event.type === 2)
    assert.equal(snapshots.length, 1, `${label} relays its automatic full snapshot once`)
  }
  client.send({ type: 'navigate', url: external + '/start?entry=1#first' })
  await loaded(0, '/start?entry=1#first')
  await singleSnapshot(0, 'initial document navigation')
  const beforeReload = client.messages.length
  client.send({ type: 'reload' })
  const reloadedNext = await loaded(beforeReload, '/start?entry=1#first')
  await singleSnapshot(beforeReload, 'document reload')
  const beforeLink = client.messages.length
  client.send({ type: 'click', id: Number(reloadedNext.id) })
  await loaded(beforeLink, '/next?link=1#next')
  const beforeBack = client.messages.length
  client.send({ type: 'back' }); await loaded(beforeBack, '/start?entry=1#first')
  const beforeForward = client.messages.length
  client.send({ type: 'forward' }); await loaded(beforeForward, '/next?link=1#next')
  const redirect = await client.wait(() => findNode(client.messages.slice(beforeForward), entry => (entry.attributes as Record<string, unknown> | undefined)?.id === 'redirect'), 'external redirect link')
  const beforeRedirect = client.messages.length
  client.send({ type: 'click', id: Number(redirect.id) }); await loaded(beforeRedirect, '/redirected?external=1#last')
  const mew = await client.wait(() => findNode(client.messages.slice(beforeRedirect), entry => (entry.attributes as Record<string, unknown> | undefined)?.id === 'mew'), 'Mew redirect link')
  const beforeMew = client.messages.length
  client.send({ type: 'click', id: Number(mew.id) })
  await client.wait(() => client.messages.slice(beforeMew).find(message => message.type === 'error'), 'external redirect to Mew rejection')
  assert.equal(protectedRequests, 0, 'external documents cannot redirect into Mew')
})

test('host scrolls apply instantly, echo viewer revisions per node, and reset revisions after document or SPA history navigation', { timeout: 45_000, skip: !domBrowserExecutable() }, async t => {
  let documentRequests = 0
  const fixture = http.createServer((req, res) => {
    if (req.headers['sec-fetch-dest'] === 'document') documentRequests++
    res.setHeader('content-type', 'text/html')
    res.end('<!doctype html><html><head><style>.scroller{height:100px;overflow:auto;scroll-behavior:smooth}.scroller>div{height:1000px}</style></head><body><button id="host-scroll" onclick="document.querySelector(\'#first\').scrollTo({top:300,behavior:\'instant\'})">Host scroll</button><button id="route" onclick="history.pushState({},\'\',\'/next\')">SPA route</button><div id="first" class="scroller"><div>first</div></div><div id="second" class="scroller"><div>second</div></div></body></html>')
  })
  const target = await start(fixture); t.after(() => stop(fixture))
  const host = http.createServer(); attachDomBrowserWebSocket(host, () => owner)
  const origin = await start(host); t.after(async () => { await closeDomBrowsers(); await stop(host) })
  const client = connection(origin); await once(client.ws, 'open'); t.after(() => client.ws.terminate())
  const node = (from: number, id: string) => client.wait(() => findNode(client.messages.slice(from), entry => (entry.attributes as Record<string, unknown> | undefined)?.id === id), `recorded node ${id}`)
  const scroll = (from: number, id: number) => client.wait(() => findNode(client.messages.slice(from), entry => entry.source === 3 && entry.id === id), `scroll event for ${id}`)
  client.send({ type: 'navigate', url: target })
  const firstId = Number((await node(0, 'first')).id), secondId = Number((await node(0, 'second')).id)
  const beforeFirst = client.messages.length
  client.send({ type: 'scroll', id: firstId, x: 0, y: 200, scrollRevision: 7 })
  const first = await scroll(beforeFirst, firstId)
  assert.equal(first.y, 200, 'the first scroll event already has the final coordinate despite smooth CSS')
  assert.equal(first.scrollRevision, 7)
  const beforeSecond = client.messages.length
  client.send({ type: 'scroll', id: secondId, x: 0, y: 250, scrollRevision: 8 })
  assert.equal((await scroll(beforeSecond, secondId)).scrollRevision, 8)
  const beforeHost = client.messages.length
  client.send({ type: 'click', id: Number((await node(0, 'host-scroll')).id) })
  const hostScroll = await scroll(beforeHost, firstId)
  assert.equal(hostScroll.y, 300)
  assert.equal(hostScroll.scrollRevision, 7, 'other nodes do not replace this node\'s last viewer revision')
  const beforeLegacy = client.messages.length
  client.send({ type: 'scroll', id: firstId, x: 0, y: 400 })
  const legacy = await scroll(beforeLegacy, firstId)
  assert.equal(legacy.y, 400)
  assert.equal(legacy.scrollRevision, undefined, 'legacy input does not reuse an earlier viewer revision')
  const beforeLastRevision = client.messages.length
  client.send({ type: 'scroll', id: firstId, x: 0, y: 450, scrollRevision: 9 })
  assert.equal((await scroll(beforeLastRevision, firstId)).scrollRevision, 9)
  const beforeReload = client.messages.length
  client.send({ type: 'reload' })
  await node(beforeReload, 'first')
  const beforeFreshHost = client.messages.length
  client.send({ type: 'click', id: Number((await node(beforeReload, 'host-scroll')).id) })
  const fresh = await scroll(beforeFreshHost, firstId)
  assert.equal(fresh.y, 300)
  assert.equal(fresh.scrollRevision, undefined, 'a new document starts without revisions for reused node IDs')
  client.send({ type: 'click', id: Number((await node(beforeReload, 'route')).id) })
  await client.wait(() => client.messages.findLast(message => message.type === 'state' && message.url === target + '/next'), 'SPA route')
  const beforeHistoryDocuments = documentRequests
  for (const [navigation, url, revision] of [['back', target + '/', 1000], ['forward', target + '/next', 2000]] as const) {
    const beforeRevision = client.messages.length
    client.send({ type: 'scroll', id: firstId, x: 0, y: 450, scrollRevision: revision })
    assert.equal((await scroll(beforeRevision, firstId)).scrollRevision, revision)
    const beforeNavigation = client.messages.length
    const previousGeneration = client.messages.findLast(message => message.type === 'state')!.generation
    client.send({ type: navigation })
    await node(beforeNavigation, 'first')
    const navigated = await client.wait(() => client.messages.slice(beforeNavigation).findLast(message => message.type === 'state' && !message.loading && message.url === url), `${navigation} state and snapshot`)
    assert.ok('generation' in navigated && navigated.generation > previousGeneration)
    const beforeHistoryScroll = client.messages.length
    client.send({ type: 'click', id: Number((await node(beforeNavigation, 'host-scroll')).id) })
    const historyScroll = await scroll(beforeHistoryScroll, firstId)
    assert.equal(historyScroll.y, 300)
    assert.equal(historyScroll.scrollRevision, undefined, `${navigation} snapshot starts a new viewer revision scope`)
    assert.equal(documentRequests, beforeHistoryDocuments, `${navigation} remains in the existing SPA document`)
  }
})

test('DOM browser websocket requires login, current capability, and the Mew origin', async t => {
  let auth: RequestAuth = { role: 'guest', email: null, mustChangePassword: false }
  const host = http.createServer(); attachDomBrowserWebSocket(host, () => auth)
  const origin = await start(host); t.after(() => stop(host))
  const rejected = async (requestOrigin = origin) => {
    const ws = new WebSocket(origin.replace('http:', 'ws:') + DOM_BROWSER_WS, { origin: requestOrigin })
    const status = await new Promise<number>(resolve => { ws.once('unexpected-response', (_req, response) => { response.resume(); resolve(response.statusCode!) }); ws.once('error', () => {}) })
    ws.terminate(); return status
  }
  assert.equal(await rejected(), 403)
  auth = { ...owner, mustChangePassword: true }; assert.equal(await rejected(), 403)
  auth = { ...owner, role: 'member' }; assert.equal(await rejected(), 403)
  auth = owner; assert.equal(await rejected('https://attacker.example'), 403)
  const client = connection(origin); await once(client.ws, 'open')
  const closed = once(client.ws, 'close')
  auth = { role: 'guest', email: null, mustChangePassword: false }; accessChanges.emit('change')
  await closed
})

test('host DOM relay runs native SPA paths and JS, relays input/scroll/history/HMR, inlines images, and blocks redirects to Mew', { timeout: 60_000, skip: !domBrowserExecutable() }, async t => {
  let hostOrigin = '', mewRequests = 0
  const fixture = http.createServer((req, res) => {
    if (req.url === '/image.svg') { res.setHeader('content-type', 'image/svg+xml'); res.end('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="red"/></svg>'); return }
    if (req.url === '/local-redirect') { res.writeHead(302, { location: '/redirected?local=1#last' }); res.end(); return }
    if (req.url === '/redirect') { res.writeHead(302, { location: hostOrigin + '/secret' }); res.end(); return }
    res.setHeader('content-type', 'text/html')
    res.end(`<!doctype html><html><head><title>Local SPA</title><style>.asset{background-image:url('/image.svg')}</style></head><body><button id="inc">Increment</button><button id="route">Route</button><button id="redirect">Redirect</button><button id="popup">Popup</button><button id="attack">Attack</button><input id="name"><output id="value">initial</output><output id="counter">0</output><output id="key"></output><output id="path"></output><output id="hmr"></output><img id="asset" src="/image.svg"><div id="scroller" style="height:30px;overflow:auto"><div style="height:200px">scroll</div></div><script type="module">let n=0;document.querySelector('#inc').onclick=()=>document.querySelector('#counter').textContent=String(++n);document.querySelector('#name').oninput=e=>document.querySelector('#value').textContent=e.target.value;document.querySelector('#name').onkeydown=e=>{if(e.key==='Enter')document.querySelector('#key').textContent='keyboard-enter'};document.querySelector('#popup').onclick=()=>window.open('/popup?native=1#popup');document.querySelector('#attack').onclick=()=>{const frame=document.createElement('iframe');document.body.appendChild(frame);frame.contentWindow.open('${hostOrigin}/popup');const form=document.createElement('form');form.target='protected-popup';form.action='${hostOrigin}/form';document.body.appendChild(form);form.submit();document.querySelector('#key').textContent='popup-attempted'};const render=()=>document.querySelector('#path').textContent=location.pathname+location.search+location.hash;document.querySelector('#route').onclick=()=>{history.pushState({},'', '/deep?q=1#hash');render()};document.querySelector('#redirect').onclick=()=>location.href='/redirect';addEventListener('popstate',render);render();const socket=new WebSocket(location.origin.replace('http','ws')+'/hmr');socket.onmessage=event=>document.querySelector('#hmr').textContent=event.data;</script></body></html>`)
  })
  const hmr = new WebSocketServer({ server: fixture }); hmr.on('connection', ws => { ws.send('native-hmr') })
  const target = await start(fixture)
  t.after(async () => { hmr.clients.forEach(ws => ws.terminate()); hmr.close(); await stop(fixture) })
  const host = http.createServer((_req, res) => { mewRequests++; res.end('Mew secret') })
  attachDomBrowserWebSocket(host, () => owner); hostOrigin = await start(host)
  t.after(async () => { await closeDomBrowsers(); await stop(host) })
  const client = connection(hostOrigin); await once(client.ws, 'open')
  t.after(() => client.ws.terminate())
  const node = async (id: string) => client.wait(() => findNode(client.messages, entry => (entry.attributes as Record<string, unknown> | undefined)?.id === id), `recorded node ${id}`)
  const text = async (value: string) => client.wait(() => findNode(client.messages, entry => entry.textContent === value || entry.value === value), `recorded text ${value}`)
  client.send({ type: 'navigate', url: target + '/start?native=1#first' })
  await text('/start?native=1#first')
  await text('native-hmr')
  const increment = Number((await node('inc')).id)
  client.send({ type: 'click', id: increment }); await text('1')
  const input = Number((await node('name')).id)
  client.send({ type: 'click', id: input })
  client.send({ type: 'input', id: input, value: 'typed through DOM' }); await text('typed through DOM')
  client.send({ type: 'focus', id: input }); client.send({ type: 'key', key: 'Enter' }); await text('keyboard-enter')
  client.send({ type: 'click', id: Number((await node('route')).id) }); await text('/deep?q=1#hash')
  const beforeBack = client.messages.length
  client.send({ type: 'back' })
  await client.wait(() => client.messages.slice(beforeBack).findLast(message => message.type === 'state' && !message.loading && message.url === target + '/start?native=1#first'), 'native back navigation')
  const beforeForward = client.messages.length
  client.send({ type: 'forward' })
  await client.wait(() => client.messages.slice(beforeForward).findLast(message => message.type === 'state' && !message.loading && message.url === target + '/deep?q=1#hash'), 'native forward navigation')
  client.send({ type: 'scroll', id: Number((await node('scroller')).id), x: 0, y: 50 })
  await client.wait(() => findNode(client.messages, entry => entry.source === 3 && entry.y === 50), 'real scroll event')
  const image = await node('asset')
  assert.match(String((image.attributes as Record<string, unknown>).src), /^data:image\/svg\+xml;base64,/)
  await client.wait(() => findNode(client.messages, entry => Object.values(entry).some(value => typeof value === 'string' && value.includes('background-image:') && value.includes('data:image/svg+xml;base64,'))), 'inlined CSS image')
  client.send({ type: 'click', id: Number((await node('attack')).id) }); await text('popup-attempted')
  await new Promise(resolve => setTimeout(resolve, 100)); assert.equal(mewRequests, 0)
  assert.equal(client.messages.findLast(message => message.type === 'state')?.type === 'state' && (client.messages.findLast(message => message.type === 'state') as { canGoBack?: boolean }).canGoBack, true)
  client.send({ type: 'click', id: Number((await node('popup')).id) }); await text('/popup?native=1#popup')
  client.send({ type: 'navigate', url: target + '/local-redirect' }); await text('/redirected?local=1#last')
  const beforeOwnPort = client.messages.length
  client.send({ type: 'navigate', url: hostOrigin + '/secret' })
  await client.wait(() => client.messages.slice(beforeOwnPort).find(message => message.type === 'error'), 'Mew own-port rejection')
  assert.equal(mewRequests, 0)
  const beforeRedirect = client.messages.length
  client.send({ type: 'navigate', url: target + '/redirect' })
  await client.wait(() => client.messages.slice(beforeRedirect).find(message => message.type === 'error'), 'redirect rejection')
  assert.equal(mewRequests, 0)
})

test('new host documents refresh inlined assets and reject reused DOM IDs from the previous generation', { timeout: 45_000, skip: !domBrowserExecutable() }, async t => {
  let color = 'red', clicks = 0
  const fixture = http.createServer((req, res) => {
    res.setHeader('cache-control', 'no-store')
    if (req.url === '/image.svg') { res.setHeader('content-type', 'image/svg+xml'); res.end(`<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="${color}"/></svg>`); return }
    if (req.url === '/clicked') { clicks++; res.end('ok'); return }
    res.setHeader('content-type', 'text/html')
    res.end('<!doctype html><html><head><style>body{background-image:url(/image.svg)}</style></head><body><button id="inc" onclick="fetch(\'/clicked\')">Click</button><img id="asset" src="/image.svg"></body></html>')
  })
  const target = await start(fixture); t.after(() => stop(fixture))
  const host = http.createServer(); attachDomBrowserWebSocket(host, () => owner)
  const origin = await start(host); t.after(async () => { await closeDomBrowsers(); await stop(host) })
  const client = connection(origin); await once(client.ws, 'open'); t.after(() => client.ws.terminate())
  const snapshot = async (from: number, expectedColor: string) => client.wait(() => {
    for (const message of client.messages.slice(from)) {
      if (message.type !== 'events') continue
      const image = findNode(message.events, node => (node.attributes as Record<string, unknown> | undefined)?.id === 'asset')
      const src = image && String((image.attributes as Record<string, unknown>).src)
      if (src?.startsWith('data:') && Buffer.from(src.slice(src.indexOf(',') + 1), 'base64').toString().includes(`fill="${expectedColor}"`)) return message
    }
  }, `fresh ${expectedColor} asset snapshot`)
  client.send({ type: 'navigate', url: target })
  const first = await snapshot(0, 'red')
  const oldId = Number(findNode(first.events, node => (node.attributes as Record<string, unknown> | undefined)?.id === 'inc')!.id)
  color = 'blue'
  const beforeReload = client.messages.length
  client.send({ type: 'reload' })
  const second = await snapshot(beforeReload, 'blue')
  assert.ok(second.generation > first.generation)
  const currentId = Number(findNode(second.events, node => (node.attributes as Record<string, unknown> | undefined)?.id === 'inc')!.id)
  assert.equal(currentId, oldId, 'rrweb IDs are reused in a new document')
  client.send({ type: 'click', generation: first.generation, id: oldId })
  await new Promise(resolve => setTimeout(resolve, 100))
  assert.equal(clicks, 0, 'stale clicks cannot act on a new document')
  client.send({ type: 'click', generation: second.generation, id: currentId })
  await client.wait(() => clicks === 1 ? true : undefined, 'current generation click')
  color = 'green'
  const beforeNavigate = client.messages.length
  client.send({ type: 'navigate', url: target + '/another-document' })
  await snapshot(beforeNavigate, 'green')
})

test('host DOM browser isolates cookies and web storage per Chromium session', { skip: !domBrowserExecutable(), timeout: 30_000 }, async t => {
  let requests = 0
  const fixture = http.createServer((req, res) => {
    const cookie = req.headers.cookie ?? 'none'
    const n = req.url === '/set' ? ++requests : requests
    if (req.url === '/set') {
      res.setHeader('set-cookie', `sid=session-${n}; Path=/`)
    }
    res.setHeader('content-type', 'text/html')
    res.end(`<!doctype html><html><body><p id="cookie">${cookie}</p><p id="storage"></p><script>if(location.pathname==='/set')localStorage.setItem('token','local-${n}');document.getElementById('storage').textContent=localStorage.getItem('token')||'empty';</script></body></html>`)
  })
  const target = await start(fixture); t.after(() => stop(fixture))
  const host = http.createServer(); attachDomBrowserWebSocket(host, () => owner)
  const origin = await start(host); t.after(async () => { await closeDomBrowsers(); await stop(host) })

  const hasText = (events: unknown, text: string) => Boolean(findNode(events, node => node.textContent === text || node.value === text))
  const clientA = connection(origin); await once(clientA.ws, 'open'); t.after(() => clientA.ws.terminate())
  clientA.send({ type: 'navigate', url: `${target}/set` })
  await clientA.wait(() => clientA.messages.some(m => m.type === 'events' && hasText(m.events, 'local-1')) ? true : undefined, 'session A initial storage')

  const beforeCheckA = clientA.messages.length
  clientA.send({ type: 'navigate', url: `${target}/check` })
  await clientA.wait(() => {
    const slice = clientA.messages.slice(beforeCheckA).filter(m => m.type === 'events').map(m => m.events)
    return hasText(slice, 'sid=session-1') && hasText(slice, 'local-1') ? true : undefined
  }, 'session A retains its cookie and localStorage')

  const clientB = connection(origin); await once(clientB.ws, 'open'); t.after(() => clientB.ws.terminate())
  clientB.send({ type: 'navigate', url: `${target}/check` })
  await clientB.wait(() => {
    const slice = clientB.messages.filter(m => m.type === 'events').map(m => m.events)
    return hasText(slice, 'none') && hasText(slice, 'empty') ? true : undefined
  }, 'session B has isolated cookies and localStorage')

  clientA.ws.close()
  clientB.ws.close()
  await closeDomBrowsers()
})
