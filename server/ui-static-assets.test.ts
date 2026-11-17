import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import http from 'node:http'
import { once } from 'node:events'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { brotliCompressSync, brotliDecompressSync, gzipSync, gunzipSync } from 'node:zlib'
import { uiStaticAssets } from './ui-static-assets.ts'

test('direct UI assets negotiate compression and retain static validators, HEAD, ranges and boundaries', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mew-static-ui-'))
  const source = Buffer.from('console.log("same immutable UI, 한국어 日本語");\n'.repeat(200))
  const filename = 'entry-test123.js'
  await Promise.all([
    writeFile(path.join(directory, filename), source),
    writeFile(path.join(directory, filename + '.br'), brotliCompressSync(source)),
    writeFile(path.join(directory, filename + '.gz'), gzipSync(source)),
    writeFile(path.join(directory, 'legacy.js'), source),
    writeFile(path.join(directory, '.private.js'), source),
    writeFile(path.join(directory, '.private.js.gz'), gzipSync(source)),
    writeFile(path.join(directory, 'theme-test.css'), 'body { color: black; }'),
    writeFile(path.join(directory, 'theme-test.css.gz'), gzipSync('body { color: black; }')),
  ])
  const app = express()
  app.use('/assets', uiStaticAssets(directory))
  app.use((_req, res) => res.status(404).end())
  const server = http.createServer(app)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(directory, { recursive: true, force: true }) })
  const port = (server.address() as { port: number }).port
  const request = (url: string, headers: http.OutgoingHttpHeaders = {}, method = 'GET') => new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }>((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: url, headers, method }, res => {
      const chunks: Buffer[] = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, body: Buffer.concat(chunks) }))
      res.on('error', reject)
    })
    req.on('error', reject)
    req.end()
  })
  const url = `/assets/${filename}`
  const gzip = await request(url + '?connection=current', { 'accept-encoding': 'gzip' })
  assert.equal(gzip.status, 200)
  assert.equal(gzip.headers['content-encoding'], 'gzip')
  assert.match(String(gzip.headers['content-type']), /^text\/javascript/)
  assert.match(String(gzip.headers.vary), /Accept-Encoding/)
  assert.match(String(gzip.headers['cache-control']), /max-age=2592000, immutable/)
  assert.equal(Number(gzip.headers['content-length']), gzip.body.byteLength)
  assert.ok(gzip.body.byteLength < source.byteLength / 5)
  assert.deepEqual(gunzipSync(gzip.body), source)

  const br = await request(url, { 'accept-encoding': 'gzip;q=0.5, br;q=1' })
  assert.equal(br.headers['content-encoding'], 'br')
  assert.deepEqual(brotliDecompressSync(br.body), source)
  const head = await request(url, { 'accept-encoding': 'br' }, 'HEAD')
  assert.equal(head.status, 200)
  assert.equal(head.body.byteLength, 0)
  assert.equal(head.headers['content-length'], br.headers['content-length'])
  assert.equal(head.headers.etag, br.headers.etag)

  const identity = await request(url)
  assert.equal(identity.headers['content-encoding'], undefined)
  assert.deepEqual(identity.body, source)
  assert.notEqual(identity.headers.etag, gzip.headers.etag)
  const explicitIdentity = await request(url, { 'accept-encoding': 'identity;q=1, br;q=0.5, gzip;q=0' })
  assert.equal(explicitIdentity.headers['content-encoding'], undefined)
  assert.deepEqual(explicitIdentity.body, source)
  const uncompressedLegacy = await request('/assets/legacy.js', { 'accept-encoding': 'br' })
  assert.equal(uncompressedLegacy.status, 200)
  assert.equal(uncompressedLegacy.headers['content-encoding'], undefined)
  assert.deepEqual(uncompressedLegacy.body, source)

  const unchanged = await request(url, { 'accept-encoding': 'gzip', 'if-none-match': gzip.headers.etag })
  assert.equal(unchanged.status, 304)
  assert.equal(unchanged.body.byteLength, 0)
  assert.match(String(unchanged.headers.vary), /Accept-Encoding/)
  assert.equal((await request(url, { 'accept-encoding': 'gzip', 'if-none-match': identity.headers.etag })).status, 200)
  const range = await request(url, { 'accept-encoding': 'br', range: 'bytes=2-12' })
  assert.equal(range.status, 206)
  assert.equal(range.headers['content-encoding'], undefined)
  assert.equal(range.headers['content-range'], `bytes 2-12/${source.byteLength}`)
  assert.deepEqual(range.body, source.subarray(2, 13))
  const css = await request('/assets/theme-test.css?v=1', { 'accept-encoding': 'gzip' })
  assert.equal(css.headers['content-type'], 'text/css; charset=utf-8')
  assert.equal(gunzipSync(css.body).toString(), 'body { color: black; }')
  for (const url of ['/assets/missing.js', '/assets/.private.js', '/assets/%2eprivate.js', '/assets/../entry-test123.js', '/assets/%2e%2e/entry-test123.js', '/assets/%E0%A4%A.js']) {
    const result = await request(url, { 'accept-encoding': 'gzip' })
    assert.ok([400, 404].includes(result.status), `${url}: ${result.status}`)
    assert.equal(result.headers['content-encoding'], undefined)
  }
  assert.equal((await request(url, { 'accept-encoding': 'gzip' }, 'POST')).status, 404)
})
