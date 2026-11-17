import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { gzipSync } from 'node:zlib'
import { once } from 'node:events'
import { createHash } from 'node:crypto'
import { connectTestBrowser } from './test-browser.ts'
import { DEFAULT_THEME_PALETTE } from '../shared/theme.ts'
import { defaultDebugConfig } from '../shared/debugger.ts'
import express from 'express'
import { uiStaticAssets } from './ui-static-assets.ts'

// A test-owned HTTP fixture serves an existing build and example-only API data.
// It never builds, launches Mew, accesses account data, or saves project files.
const dist = path.resolve(process.env.MEW_BENCH_DIST ?? new URL('../dist/', import.meta.url).pathname)
const variants = [{ name: 'current', dist }, ...(process.env.MEW_BENCH_COMPARE_DIST ? [{ name: 'baseline', dist: path.resolve(process.env.MEW_BENCH_COMPARE_DIST) }] : [])]
let activeDist = dist
const rounds = Number(process.env.MEW_BENCH_ROUNDS ?? 5)
const delay = Number(process.env.MEW_BENCH_API_DELAY ?? 80)
const assetDelay = Number(process.env.MEW_BENCH_ASSET_DELAY ?? 0)
const cpuRate = Number(process.env.MEW_BENCH_CPU_RATE ?? 1)
const downloadMbps = Number(process.env.MEW_BENCH_DOWNLOAD_MBPS ?? 0)
const locale = process.env.MEW_BENCH_LOCALE ?? 'en'
const staticMode = process.env.MEW_BENCH_STATIC_MODE ?? 'gzip'
const viewMode = process.env.MEW_BENCH_VIEW_MODE ?? 'plain'
const output = process.env.MEW_BENCH_OUTPUT ?? '/tmp/mew-startup-benchmark.json'
assert.ok(Number.isInteger(rounds) && rounds > 0)
assert.ok(Number.isFinite(delay) && delay >= 0 && Number.isFinite(assetDelay) && assetDelay >= 0)
assert.ok(Number.isFinite(cpuRate) && cpuRate >= 1 && Number.isFinite(downloadMbps) && downloadMbps >= 0)
assert.ok(['en', 'ko', 'ja', 'zh'].includes(locale))
assert.ok(['gzip', 'production'].includes(staticMode))
assert.ok(['plain', 'hotview'].includes(viewMode))
for (const variant of variants) variant.artifactSha = createHash('sha256').update(await fs.readFile(path.join(variant.dist, 'index.html'))).digest('hex')
const productionAssets = new Map(variants.map(variant => {
  const app = express()
  app.use('/assets', uiStaticAssets(path.join(variant.dist, 'assets')))
  app.use((_req, res) => res.status(404).end())
  return [variant.dist, app]
}))
const storedTabs = { panes: [{ id: 'main', tabs: [{ path: 'README.md', preview: false, viewMode }], activePath: 'README.md' }], layout: { kind: 'leaf', pane: 'main' }, focusedPaneId: 'main' }
const initialUi = { sidebar: { docsExpanded: false }, chrome: { sidebarOpen: true, sidebarView: 'files' }, tabs: { '.workspace': storedTabs } }
const content = '# Startup benchmark\n\nThis example document is ready to edit.\n'
const auth = { authenticated: true, email: 'benchmark@example.test', accountId: 'benchmark-account', role: 'owner', mustChangePassword: false, displayName: 'Benchmark', avatarDataUrl: null, capabilities: { filesRead: true, filesWrite: true, agent: true, terminal: false, serverFiles: false, collaboration: false, chat: false, git: true, database: false, desktop: true, nativeBrowser: false } }
const workspace = { path: '/example', workspaceScopeVersion: 1, projects: [], docs: 'docs', docsPath: '/example/docs', hasProject: true }
const staticCache = new Map()
const waits = ms => new Promise(resolve => setTimeout(resolve, ms))
const requests = []
let navigation = 0
let editorTabs = { '.workspace': storedTabs }, editorRevision = 1, agentTabs = null
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1')
    const record = { navigation, method: req.method, path: url.pathname + url.search, startMs: performance.now() }
    requests.push(record)
    if (url.pathname.startsWith('/api/')) {
      let submitted
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        const parts = []
        for await (const part of req) parts.push(part)
        const body = Buffer.concat(parts).toString()
        if (body) submitted = JSON.parse(body)
      }
      await waits(delay)
      let value = {}
      if (url.pathname === '/api/auth/me') value = auth
      else if (url.pathname === '/api/workspace') value = { ...workspace, ...(url.searchParams.get('include') === 'workspace-ui' ? { workspaceUi: { workspacePath: workspace.path, state: initialUi }, editorTabs: { workspacePath: workspace.path, state: editorTabs, revision: editorRevision } } : {}) }
      else if (url.pathname === '/api/user-ui/root-projects') value = { state: { paths: ['/example'], icons: {}, groups: [] } }
      else if (url.pathname === '/api/user-ui/theme') value = { state: { palette: DEFAULT_THEME_PALETTE, custom: [] } }
      else if (url.pathname === '/api/user-ui/workspace') value = { state: initialUi }
      else if (url.pathname === '/api/user-ui/editor-tabs') {
        if (submitted) { editorTabs = { ...editorTabs, [submitted.project]: submitted.state }; editorRevision++ }
        value = { state: editorTabs, revision: editorRevision }
      }
      else if (url.pathname === '/api/user-ui/agent-tabs') {
        if (submitted) agentTabs = submitted.state
        value = { state: agentTabs, claims: [] }
      }
      else if (url.pathname === '/api/tree') value = { version: 1, state: 'ready', entries: [{ name: 'README.md', path: 'README.md', type: 'file' }] }
      else if (url.pathname === '/api/file-access') value = { view: true, edit: true }
      else if (url.pathname === '/api/file') value = { path: url.searchParams.get('path'), content, editable: true, rules: null }
      else if (url.pathname === '/api/projects' || url.pathname === '/api/members') value = []
      else if (url.pathname === '/api/project-icons/read') value = { icons: {} }
      else if (url.pathname === '/api/mewpet/skins') value = { skins: [] }
      else if (url.pathname === '/api/agent/sessions') value = { sessions: [] }
      else if (url.pathname === '/api/comments') value = { threads: [] }
      else if (url.pathname === '/api/table-layout') value = { tables: [] }
      else if (url.pathname === '/api/debugger') value = { config: defaultDebugConfig('js-debug', '/example'), session: { id: null, state: 'idle', reason: '', frames: [], output: '', breakpoints: [], capabilities: {} }, adapter: { installed: false, version: '' }, sessions: [] }
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      res.end(JSON.stringify(value))
    } else {
      if (url.pathname === '/') navigation++
      record.navigation = navigation
      const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1))
      const target = path.resolve(activeDist, relative)
      if (!target.startsWith(activeDist + path.sep)) { res.writeHead(403); res.end(); return }
      if (staticMode === 'production' && url.pathname.startsWith('/assets/')) {
        await waits(assetDelay)
        record.rawBytes = (await fs.stat(target)).size
        await new Promise(resolve => {
          res.once('finish', resolve)
          res.once('close', resolve)
          productionAssets.get(activeDist)(req, res)
        })
        record.encoding = res.getHeader('content-encoding') ?? 'identity'
        record.encodedBytes = Number(res.getHeader('content-length') ?? 0)
        record.endMs = performance.now()
        return
      }
      let cached = staticCache.get(target)
      if (!cached) {
        const body = await fs.readFile(target)
        const extension = path.extname(target)
        cached = { body: gzipSync(body), rawBytes: body.length, type: { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webp': 'image/webp', '.png': 'image/png' }[extension] ?? 'application/octet-stream' }
        staticCache.set(target, cached)
      }
      await waits(assetDelay)
      record.rawBytes = cached.rawBytes
      record.gzipBytes = cached.body.length
      record.encoding = 'gzip'
      record.encodedBytes = cached.body.length
      res.writeHead(200, { 'content-type': cached.type, 'content-encoding': 'gzip', 'cache-control': relative === 'index.html' ? 'no-store' : 'public, max-age=31536000, immutable' })
      res.end(cached.body)
    }
    record.endMs = performance.now()
  } catch (error) { res.writeHead(error.code === 'ENOENT' ? 404 : 500); res.end() }
})
server.listen(0, '127.0.0.1')
await once(server, 'listening')
const origin = `http://127.0.0.1:${server.address().port}`
let browser
const samples = []
try {
  browser = await connectTestBrowser()
  for (const width of [1100, 390]) for (let round = 0; round < rounds; round++) for (const variant of round % 2 ? [...variants].reverse() : variants) {
    activeDist = variant.dist
    editorTabs = { '.workspace': storedTabs }; editorRevision = 1; agentTabs = null
    const context = await browser.newContext({ viewport: { width, height: 800 }, locale: 'en-US' })
    const page = await context.newPage()
    const cdp = await context.newCDPSession(page)
    if (cpuRate !== 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuRate })
    if (downloadMbps) await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: downloadMbps * 1_000_000 / 8, uploadThroughput: downloadMbps * 1_000_000 / 8 })
    const errors = []
    const consoleErrors = [], failedRequests = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })
    page.on('requestfailed', request => failedRequests.push({ path: new URL(request.url()).pathname, error: request.failure()?.errorText }))
    await page.addInitScript(locale => {
      localStorage.setItem('mew:locale', locale)
      localStorage.setItem('mew:mewcat-skin', 'none')
      // Independent presence/agent sockets are inert in this HTTP/JS benchmark.
      class Socket extends EventTarget {
        static OPEN = 1; static CLOSED = 3; readyState = 0
        send() {} close() { this.readyState = 3 }
      }
      Object.defineProperty(globalThis, 'WebSocket', { value: Socket })
      const timings = globalThis.startupBenchmark = { paints: [], longTasks: [] }
      new PerformanceObserver(list => { for (const entry of list.getEntries()) timings.paints.push({ name: entry.name, start: entry.startTime }) }).observe({ type: 'paint', buffered: true })
      new PerformanceObserver(list => { for (const entry of list.getEntries()) timings.longTasks.push({ start: entry.startTime, duration: entry.duration }) }).observe({ type: 'longtask', buffered: true })
      const observer = new MutationObserver(() => {
        const menu = document.querySelector('button[aria-label="Menu"], button[aria-label="메뉴"], button[aria-label="菜单"], button[aria-label="メニュー"]')
        const tree = document.querySelector('[data-sidebar] [data-path="README.md"]')
        const editor = document.querySelector('.cm-content[contenteditable="true"], .ProseMirror[contenteditable="true"]')
        for (const [key, element] of [['menu', menu], ['tree', tree], ['editor', editor]]) {
          if (timings[key] !== undefined || !element || key === 'editor' && !element.textContent.includes('This example document')) continue
          timings[key] = null
          requestAnimationFrame(() => { timings[key] = performance.now() })
        }
      })
      observer.observe(document, { childList: true, subtree: true, attributes: true, characterData: true })
    }, locale)
    for (const cache of ['cold', 'warm']) {
      const offset = performance.now(), first = requests.length
      if (cache === 'cold') await page.goto(origin, { waitUntil: 'domcontentloaded' })
      else await page.reload({ waitUntil: 'domcontentloaded' })
      try {
        await page.waitForFunction(() => Number.isFinite(globalThis.startupBenchmark.editor) && globalThis.startupBenchmark.editor > 0, undefined, { timeout: 20_000 })
      } catch (error) {
        const diagnostic = { variant: variant.name, width, round, cache, errors, consoleErrors, failedRequests, requested: requests.slice(first).map(request => request.path), body: await page.locator('body').innerText() }
        await fs.writeFile(output + '.failure.json', JSON.stringify(diagnostic, null, 2))
        console.error(JSON.stringify(diagnostic))
        throw error
      }
      await waits(150)
      const measurement = await page.evaluate(() => ({ ...globalThis.startupBenchmark, resources: performance.getEntriesByType('resource').map(entry => ({ name: new URL(entry.name).pathname, start: entry.startTime, duration: entry.duration, transferBytes: entry.transferSize, decodedBytes: entry.decodedBodySize })) }))
      const sample = { variant: variant.name, width, round, cache, ...measurement, errors: [...errors], requests: requests.slice(first).map(request => ({ ...request, startMs: request.startMs - offset, endMs: request.endMs === undefined ? null : request.endMs - offset })) }
      samples.push(sample)
      assert.deepEqual(errors, [], 'the fixture must render without browser exceptions')
      console.log(JSON.stringify({ variant: variant.name, width, round, cache, menuMs: measurement.menu, editorMs: measurement.editor, api: sample.requests.filter(request => request.path.startsWith('/api/')).length, jsEncodedBytes: sample.requests.filter(request => request.path.endsWith('.js')).reduce((sum, request) => sum + (request.encodedBytes ?? 0), 0) }))
    }
    await context.close()
  }
  const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
  const summary = []
  for (const variant of variants) for (const width of [1100, 390]) for (const cache of ['cold', 'warm']) {
    const chosen = samples.filter(sample => sample.variant === variant.name && sample.width === width && sample.cache === cache)
    summary.push({ variant: variant.name, width, cache, rounds: chosen.length, menuMedianMs: median(chosen.map(sample => sample.menu)), treeDomMedianMs: median(chosen.map(sample => sample.tree)), editorMedianMs: median(chosen.map(sample => sample.editor)), fcpMedianMs: median(chosen.map(sample => sample.paints.find(paint => paint.name === 'first-contentful-paint')?.start)), jsTransferMedianBytes: median(chosen.map(sample => sample.resources.filter(resource => resource.name.endsWith('.js')).reduce((sum, resource) => sum + resource.transferBytes, 0))), jsTransferredBeforeEditorMedianBytes: median(chosen.map(sample => sample.resources.filter(resource => resource.name.endsWith('.js') && resource.start + resource.duration <= sample.editor).reduce((sum, resource) => sum + resource.transferBytes, 0))), apiRequestsMedian: median(chosen.map(sample => sample.requests.filter(request => request.path.startsWith('/api/')).length)) })
  }
  const report = { kind: 'isolated-installed-build-http', fixtureVersion: 2, chromium: browser.version(), node: process.version, variants, locale, staticMode, viewMode, apiDelayMs: delay, assetDelayMs: assetDelay, cpuRate, downloadMbps, summary, samples }
  for (const variant of variants) assert.equal(createHash('sha256').update(await fs.readFile(path.join(variant.dist, 'index.html'))).digest('hex'), variant.artifactSha, 'the installed artifact stays unchanged during measurement')
  await fs.writeFile(output, JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ output, summary }))
} finally {
  await browser?.close()
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
}
