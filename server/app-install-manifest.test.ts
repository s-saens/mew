import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { chromium } from 'playwright-core'
import { domBrowserExecutable } from './browser-dom-executable.ts'
import { DEFAULT_THEME_PALETTE, themeBackgroundImage } from '../shared/theme.ts'

const root = new URL('../', import.meta.url)

test('installed app icons show the borderless mark over the default midnight gradient', { skip: !domBrowserExecutable(), timeout: 15_000 }, async t => {
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  t.after(() => browser.close())
  const page = await browser.newPage()
  await page.setContent(`<style>
    body { margin: 0; }
    #background { position: relative; overflow: hidden; background: ${DEFAULT_THEME_PALETTE.background}; }
    #background::before { content: ''; position: absolute; inset: -8%; background-image: ${themeBackgroundImage(DEFAULT_THEME_PALETTE)}; }
  </style><div id="background"></div><canvas></canvas>`)
  for (const size of [180, 192, 512]) {
    await t.test(`${size}px`, async () => {
      const png = await readFile(new URL(`public/app-icon-${size}.png`, root))
      await page.locator('#background').evaluate((el, size) => { el.style.width = `${size}px`; el.style.height = `${size}px` }, size)
      const backgroundPng = await page.locator('#background').screenshot()
      const pixels = await page.locator('canvas').evaluate(async (canvas, { src, backgroundSrc }) => {
        const image = new canvas.ownerDocument.defaultView!.Image()
        image.src = src
        await image.decode()
        canvas.width = image.naturalWidth
        canvas.height = image.naturalHeight
        const context = canvas.getContext('2d')!
        const backdrop = new canvas.ownerDocument.defaultView!.Image()
        backdrop.src = backgroundSrc
        await backdrop.decode()
        context.drawImage(backdrop, 0, 0)
        const backgroundData = context.getImageData(0, 0, canvas.width, canvas.height).data
        context.drawImage(image, 0, 0)
        const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
        let invalidMargin = 0
        let ink = 0
        const bounds = [canvas.width, canvas.height, -1, -1]
        for (let y = 0; y < canvas.height; y++) {
          for (let x = 0; x < canvas.width; x++) {
            const offset = (y * canvas.width + x) * 4
            const background = [0, 1, 2].every(channel => Math.abs(data[offset + channel] - backgroundData[offset + channel]) <= 1) && data[offset + 3] === 255
            if (x < canvas.width * 0.3 || x >= canvas.width * 0.7 || y < canvas.height * 0.3 || y >= canvas.height * 0.7) {
              if (!background) invalidMargin++
            }
            if (data[offset] - backgroundData[offset] > 8) {
              ink++
              bounds[0] = Math.min(bounds[0], x)
              bounds[1] = Math.min(bounds[1], y)
              bounds[2] = Math.max(bounds[2], x)
              bounds[3] = Math.max(bounds[3], y)
            }
          }
        }
        return { invalidMargin, ink, bounds }
      }, { src: `data:image/png;base64,${png.toString('base64')}`, backgroundSrc: `data:image/png;base64,${backgroundPng.toString('base64')}` })
      assert.equal(pixels.invalidMargin, 0, 'the borderless outer margin must match the opaque default midnight gradient')
      assert.ok(pixels.ink > size * size * 0.035, 'the inner mark must remain visible')
      const expected = [size * 0.35, size * 0.3125, size * 0.65 - 1, size * 0.6875 - 1]
      pixels.bounds.forEach((value, index) => assert.ok(Math.abs(value - expected[index]) <= 1, `preserve the mark size and position: ${pixels.bounds}`))
    })
  }
})

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
