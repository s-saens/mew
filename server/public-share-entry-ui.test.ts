import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { duplexPair } from 'node:stream'
import express from 'express'
import { connectTestBrowser } from './test-browser.ts'
import { directUiHtml, sendDirectUiHtml } from './direct-ui.ts'

test('direct HTML rewrites startup resources while preserving document links and inline code', () => {
  const source = `<html><head><link rel="modulepreload" href='./assets/shared.js'><link href="./assets/app.css"><script type="module" src=./assets/main.js></script><script>const example='src="./assets/example.js"'</script></head><body><a href="#heading">Heading</a><a href="./next.md">Next</a><img src="./image.png"></body></html>`
  const result = directUiHtml(source)
  assert.match(result, /href='\/assets\/shared.js'/)
  assert.match(result, /href="\/assets\/app.css"/)
  assert.match(result, /src=\/assets\/main.js/)
  assert.ok(result.includes(`<script>const example='src="./assets/example.js"'</script>`))
  assert.ok(result.includes('<a href="#heading">'))
  assert.ok(result.includes('<a href="./next.md">'))
  assert.ok(result.includes('<img src="./image.png">'))
  assert.equal(result.includes('<base'), false)
  assert.equal(directUiHtml(result), result)
})

/** Dispatch real HTTP parsing and Express handlers without a listening app or test server. */
function request(server: http.Server, target: string, method = 'GET'): Promise<{ status: number; headers: Record<string, string>; body: Buffer }> {
  const [client, host] = duplexPair()
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    const timeout = setTimeout(() => { client.destroy(); host.destroy(); reject(new Error('Static fixture response timed out')) }, 5000)
    client.on('data', chunk => chunks.push(Buffer.from(chunk)))
    client.once('error', reject)
    client.once('end', () => {
      clearTimeout(timeout)
      const raw = Buffer.concat(chunks), boundary = raw.indexOf('\r\n\r\n')
      const lines = raw.subarray(0, boundary).toString().split('\r\n')
      const status = Number(lines.shift()!.split(' ')[1])
      const headers = Object.fromEntries(lines.map(line => { const split = line.indexOf(':'); return [line.slice(0, split).toLowerCase(), line.slice(split + 1).trim()] }))
      client.destroy(); host.destroy()
      resolve({ status, headers, body: raw.subarray(boundary + 4) })
    })
    server.emit('connection', host)
    client.write(`${method} ${target} HTTP/1.1\r\nHost: public-entry.test\r\nConnection: close\r\n\r\n`)
  })
}

test('public deep links load relative production assets from the direct app root', { timeout: 15_000 }, async t => {
  const source = await readFile(new URL('../index.html', import.meta.url), 'utf8')
  const html = source.replace('src="/src/main.tsx"', 'src="./assets/app.js"')
    .replace('</head>', '<link rel="stylesheet" href="./assets/app.css"></head>')
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mew-public-entry-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  await mkdir(path.join(directory, 'assets'))
  await writeFile(path.join(directory, 'index.html'), html)
  await writeFile(path.join(directory, 'assets/app.js'), "import('./editor.js').then(({ready})=>{document.getElementById('root').textContent=ready;document.getElementById('root').dataset.path=location.pathname})")
  await writeFile(path.join(directory, 'assets/editor.js'), 'export const ready="Public document ready"')
  await writeFile(path.join(directory, 'assets/app.css'), '#root { color: rgb(12, 34, 56); }')
  const app = express(), server = http.createServer(app)
  app.use('/assets', express.static(path.join(directory, 'assets'), { immutable: true, maxAge: '30d' }))
  app.use(async (_req, res) => { res.setHeader('Cache-Control', 'no-cache'); await sendDirectUiHtml(res, path.join(directory, 'index.html')) })
  const browser = await connectTestBrowser()
  t.after(() => browser.close())
  const page = await browser.newPage()
  page.setDefaultTimeout(2000)
  const requests: string[] = [], errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('http://public-entry.test/**', async route => {
    const url = new URL(route.request().url())
    requests.push(url.pathname)
    if (url.pathname === '/fonts/ibm-plex/fonts.css') return route.fulfill({ contentType: 'text/css', body: '' })
    const response = await request(server, url.pathname + url.search, route.request().method())
    return route.fulfill({ status: response.status, headers: response.headers, body: response.body })
  })
  for (const path of ['/', `/share/f/${'a'.repeat(43)}`, `/share/d/${'b'.repeat(43)}/`]) {
    await page.goto('http://public-entry.test' + path)
    await page.getByText('Public document ready', { exact: true }).waitFor()
    assert.equal(await page.locator('#root').getAttribute('data-path'), path)
    assert.equal(await page.locator('#root').evaluate(el => el.ownerDocument.defaultView!.getComputedStyle(el).color), 'rgb(12, 34, 56)')
    assert.equal(await page.locator('base').count(), 0)
  }
  assert.ok(requests.includes('/assets/editor.js'), 'dynamic imports follow the loaded module at the app root')
  assert.equal(requests.some(path => /^\/share\/.+\/assets\//.test(path)), false)
  assert.deepEqual(errors, [])
  const head = await request(server, `/share/f/${'a'.repeat(43)}`, 'HEAD')
  assert.equal(head.status, 200)
  assert.match(head.headers['content-type'], /^text\/html/)
  assert.equal(head.headers['cache-control'], 'no-cache')
  assert.equal(head.body.length, 0)
  assert.equal(await readFile(path.join(directory, 'index.html'), 'utf8'), html, 'the served artifact remains unchanged')
})
