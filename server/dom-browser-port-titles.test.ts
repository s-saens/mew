import assert from 'node:assert/strict'
import { once } from 'node:events'
import http from 'node:http'
import net from 'node:net'
import test, { type TestContext } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { gzipSync } from 'node:zlib'
import type { DomBrowserPort } from '../shared/dom-browser.ts'
import { enrichDomBrowserPortTitles } from './dom-browser-port-titles.ts'

async function fixture(t: TestContext, handler: http.RequestListener, hostname = '127.0.0.1') {
  const server = http.createServer(handler)
  server.listen(0, hostname)
  await once(server, 'listening')
  t.after(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()) }))
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  return { server, port: address.port }
}
const app = (port: number): DomBrowserPort => ({ port, kind: 'app' })
const options = { allowedPort: () => true }
function html(response: http.ServerResponse, title = 'Local app') {
  response.setHeader('Content-Type', 'text/html; charset=utf-8')
  response.end(`<html><head><title>${title}</title></head><body></body></html>`)
}

test('titles decode HTML entities, normalize text, limit Unicode length, and never execute scripts or send cookies', async t => {
  let requests = 0
  const local = await fixture(t, (request, response) => {
    requests++
    assert.equal(request.url, '/')
    assert.equal(request.headers.cookie, undefined)
    assert.equal(request.headers.authorization, undefined)
    response.setHeader('Content-Type', 'text/html')
    response.end('<script>fetch("/executed");document.title="Executed"</script><title>  A &amp; B &#x1f408;\n\t&#x0; &#x200b; &lt;b&gt;literal&lt;/b&gt; </title>')
  })
  const ports = [app(local.port)]
  const result = await enrichDomBrowserPortTitles(ports, options)
  assert.deepEqual(result, [{ ...ports[0], title: 'A & B 🐈 � <b>literal</b>' }])
  assert.deepEqual(ports, [app(local.port)], 'enrichment does not mutate input objects')
  assert.equal(requests, 1, 'scripts and subresources are never loaded')
  const long = await fixture(t, (_request, response) => html(response, '🦊'.repeat(250)))
  assert.equal(Array.from((await enrichDomBrowserPortTitles([app(long.port)], options))[0]!.title!).length, 200)
})

test('same-port loopback redirects are followed at most three times without retaining cookies', async t => {
  const paths: string[] = []
  const local = await fixture(t, (request, response) => {
    assert.equal(request.headers.cookie, undefined)
    paths.push(request.url!)
    const step = request.url === '/' ? 0 : Number(request.url!.slice(1))
    if (step === 3) { html(response, 'Redirected'); return }
    response.writeHead(302, { Location: `http://localhost:${local.port}/${step + 1}`, 'Set-Cookie': 'session=private' })
    response.end()
  })
  assert.equal((await enrichDomBrowserPortTitles([app(local.port)], options))[0]!.title, 'Redirected')
  assert.deepEqual(paths, ['/', '/1', '/2', '/3'])
  const endless = await fixture(t, (_request, response) => { response.writeHead(302, { Location: '/' }); response.end() })
  let endlessRequests = 0
  endless.server.on('request', () => endlessRequests++)
  assert.deepEqual(await enrichDomBrowserPortTitles([app(endless.port)], options), [app(endless.port)])
  assert.equal(endlessRequests, 4)
})

test('redirects cannot reach external, HTTPS, cross-port, or credential-bearing URLs', async t => {
  let destinationRequests = 0
  const destination = await fixture(t, (_request, response) => { destinationRequests++; html(response) })
  let location = ''
  let requests = 0
  const local = await fixture(t, (_request, response) => { requests++; response.writeHead(302, { Location: location }); response.end() })
  for (const target of [
    `http://example.test:${local.port}/`,
    `http://192.168.1.1:${local.port}/`,
    `https://127.0.0.1:${local.port}/`,
    `http://127.0.0.1:${destination.port}/`,
    `http://user:password@127.0.0.1:${local.port}/`,
    `http://@localhost:${local.port}/`,
    `//@localhost:${local.port}/`,
    `http:////@localhost:${local.port}/`,
    'http://[',
  ]) {
    location = target
    const before = requests
    assert.deepEqual(await enrichDomBrowserPortTitles([app(local.port)], options), [app(local.port)])
    assert.equal(requests, before + 1)
  }
  assert.equal(destinationRequests, 0)
})

test('Mew, blocked, invalid, and currently disallowed ports are never probed; permissions are rechecked for redirects', async t => {
  let requests = 0, allowed = true
  const local = await fixture(t, (_request, response) => {
    requests++; allowed = false
    response.writeHead(302, { Location: '/next' }); response.end()
  })
  const skipped: DomBrowserPort[] = [{ port: local.port, kind: 'mew' }, { port: local.port, kind: 'blocked' }, app(0), app(65536), app(local.port)]
  assert.deepEqual(await enrichDomBrowserPortTitles(skipped, { allowedPort: () => false }), skipped)
  assert.equal(requests, 0)
  assert.deepEqual(await enrichDomBrowserPortTitles([app(local.port)], { allowedPort: () => allowed }), [app(local.port)])
  assert.equal(requests, 1)
})

test('empty, non-HTML, unsuccessful, oversized decoded, and disconnected responses preserve ports', async t => {
  let mode = ''
  const local = await fixture(t, (_request, response) => {
    if (mode === 'disconnect') { response.destroy(); return }
    response.setHeader('Content-Type', mode === 'json' ? 'application/json' : 'text/html')
    if (mode === 'error') response.statusCode = 500
    if (mode === 'partial-disconnect') {
      response.write('<title>Incomplete response</title>')
      setImmediate(() => response.destroy())
    } else if (mode === 'oversize' || mode === 'compressed-oversize') {
      const text = '<title>Should not be returned</title>' + 'a'.repeat(128 * 1024)
      if (mode === 'compressed-oversize') { response.setHeader('Content-Encoding', 'gzip'); response.end(gzipSync(text)) }
      else response.end(text)
    } else if (mode === 'empty') response.end('<title> \n </title>')
    else response.end('<title>Should not be returned</title>')
  })
  for (mode of ['empty', 'json', 'error', 'oversize', 'compressed-oversize', 'disconnect', 'partial-disconnect']) {
    assert.deepEqual(await enrichDomBrowserPortTitles([app(local.port)], options), [app(local.port)], mode)
  }
  const compressed = await fixture(t, (_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html', 'Content-Encoding': 'gzip' })
    response.end(gzipSync('<title>Decoded title</title>'))
  })
  assert.equal((await enrichDomBrowserPortTitles([app(compressed.port)], options))[0]!.title, 'Decoded title')
})

test('IPv6-only listeners are reached after an IPv4 connection failure', async t => {
  const probe = net.createServer()
  try {
    probe.listen({ port: 0, host: '::1', ipv6Only: true })
    await once(probe, 'listening')
  } catch { probe.close(); t.skip('IPv6 loopback is unavailable'); return }
  await new Promise<void>(resolve => probe.close(() => resolve()))
  const local = await fixture(t, (_request, response) => html(response, 'IPv6 app'), '::1')
  assert.equal((await enrichDomBrowserPortTitles([app(local.port)], options))[0]!.title, 'IPv6 app')
})

test('four workers probe at most 32 ports and release their connections', async t => {
  let active = 0, peak = 0, requests = 0
  const local = await fixture(t, (_request, response) => {
    requests++; active++; peak = Math.max(peak, active)
    response.once('close', () => active--)
    setTimeout(() => html(response), 15)
  })
  const result = await enrichDomBrowserPortTitles(Array.from({ length: 40 }, () => app(local.port)), options)
  assert.equal(requests, 32)
  assert.equal(peak, 4)
  assert.equal(result.filter(entry => entry.title).length, 32)
  await delay(20)
  assert.equal(active, 0)
})

test('the batch deadline returns partial successes and aborts hanging requests', async t => {
  let hangingClosed = false
  const hanging = await fixture(t, (request, _response) => { request.once('close', () => { hangingClosed = true }) })
  const fast = await fixture(t, (_request, response) => html(response, 'Ready'))
  const started = performance.now()
  const ports = [app(hanging.port), app(fast.port)]
  const result = await enrichDomBrowserPortTitles(ports, { ...options, timeoutMs: 100 })
  assert.deepEqual(result, [ports[0], { ...ports[1], title: 'Ready' }])
  assert.ok(performance.now() - started < 500)
  await delay(20)
  assert.equal(hangingClosed, true)
})

test('individual ports expire after 600 ms and cancellation closes all outstanding requests', async t => {
  let requests = 0, closed = 0
  const hanging = await fixture(t, (request, _response) => { requests++; request.once('close', () => closed++) })
  const started = performance.now()
  assert.deepEqual(await enrichDomBrowserPortTitles([app(hanging.port)], options), [app(hanging.port)])
  const elapsed = performance.now() - started
  assert.ok(elapsed >= 500 && elapsed < 1000, `port timeout took ${elapsed} ms`)
  const controller = new AbortController()
  const pending = enrichDomBrowserPortTitles(Array.from({ length: 8 }, () => app(hanging.port)), { ...options, signal: controller.signal })
  await delay(30)
  controller.abort()
  assert.equal((await pending).length, 8)
  await delay(20)
  assert.equal(requests, 5)
  assert.equal(closed, 5)
  const before = requests
  assert.deepEqual(await enrichDomBrowserPortTitles([app(hanging.port)], { ...options, signal: controller.signal }), [app(hanging.port)])
  assert.equal(requests, before)
})
