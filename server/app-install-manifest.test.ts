import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)

test('install metadata references an installable app and real maskable mobile icons', async () => {
  const [html, manifestText] = await Promise.all(['index.html', 'public/manifest.webmanifest'].map(path => readFile(new URL(path, root), 'utf8')))
  assert.match(html, /rel="manifest" href="\/manifest\.webmanifest"/)
  assert.match(html, /name="apple-mobile-web-app-capable" content="yes"/)
  assert.match(html, /rel="apple-touch-icon" sizes="180x180" href="\/app-icon-180\.png"/)
  const manifest = JSON.parse(manifestText)
  assert.equal(manifest.id, '/')
  assert.equal(manifest.start_url, '/')
  assert.equal(manifest.scope, '/')
  assert.equal(manifest.display, 'standalone')
  assert.deepEqual(manifest.display_override, ['fullscreen', 'standalone'])
  assert.equal(manifest.prefer_related_applications, false)
  assert.ok(manifest.name && manifest.short_name)
  assert.deepEqual(manifest.icons.map((icon: { sizes: string }) => icon.sizes), ['192x192', '512x512'])
  for (const icon of [...manifest.icons, { src: '/app-icon-180.png', sizes: '180x180', purpose: 'any maskable' }]) {
    assert.equal(icon.purpose, 'any maskable')
    const png = await readFile(new URL('public' + icon.src, root))
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
    const [width, height] = icon.sizes.split('x').map(Number)
    assert.equal(png.readUInt32BE(16), width)
    assert.equal(png.readUInt32BE(20), height)
  }
})
