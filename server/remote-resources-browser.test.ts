import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import http from 'node:http'
import { once } from 'node:events'
import { build } from 'rolldown'
import { chromium } from 'playwright-core'
import { domBrowserExecutable } from './browser-dom-executable.ts'

test('an installed resource worker remains ready while its update registration stalls, without offline or HTTP data fallback', { skip: !domBrowserExecutable(), timeout: 20_000 }, async t => {
  const bundle = await build({ input: new URL('../src/utils/remote-resources.ts', import.meta.url).pathname, write: false, platform: 'browser', output: { format: 'iife', name: 'Remote' } })
  const code = bundle.output.find(value => value.type === 'chunk')!.code
  const worker = await fs.readFile(new URL('../public/remote-resource-worker.js', import.meta.url), 'utf8')
  let centralDataRequests = 0
  const server = http.createServer((request, response) => {
    if (request.url === '/remote-resource-worker.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(worker); return }
    if (request.url?.startsWith('/api/')) { centralDataRequests++; response.statusCode = 503; response.end('Direct connection required'); return }
    response.setHeader('Content-Type', 'text/html')
    response.end(`<body><script>${code}</script><script>Remote.enableRemoteResources().then(cleanup=>{window.resourceCleanup=cleanup;window.resourceReady=true})</script></body>`)
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  t.after(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()) }))
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  t.after(() => browser.close())
  const context = await browser.newContext(), page = await context.newPage(), errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  await page.goto(origin + '/launch/resource_fixture_abcdefghijklmnop')
  await page.waitForFunction('window.resourceReady')
  const result = await page.locator('body').evaluate(async element => {
    const view = element.ownerDocument.defaultView!
    const globals = view as unknown as { resourceCleanup(): void; Remote: { enableRemoteResources(): Promise<() => void> } }
    globals.resourceCleanup()
    const container = view.navigator.serviceWorker, controller = container.controller
    let registrations = 0
    Object.defineProperty(container, 'register', { configurable: true, value() { registrations++; return new Promise(() => {}) } })
    const started = view.performance.now()
    const status = await Promise.race([
      globals.Remote.enableRemoteResources().then(dispose => { globals.resourceCleanup = dispose; return 'ready' }),
      new Promise<string>(resolve => view.setTimeout(() => resolve('blocked-on-registration'), 300)),
    ])
    const elapsed = view.performance.now() - started
    const response = await view.fetch('/api/resource-readiness-probe')
    globals.resourceCleanup()
    return { status, elapsed, registrations, sameController: container.controller === controller, dataStatus: response.status, cache: response.headers.get('cache-control') }
  })
  assert.equal(result.status, 'ready')
  assert.ok(result.elapsed < 300, `${result.elapsed}ms preparation with a permanently pending registration update`)
  assert.equal(result.registrations, 1)
  assert.equal(result.sameController, true)
  assert.equal(result.dataStatus, 503, 'without the live authenticated tab transport, resource access still fails')
  assert.equal(centralDataRequests, 0, 'host data must not fall back to central HTTP')
  assert.deepEqual(errors, [])
  await context.close()
})
