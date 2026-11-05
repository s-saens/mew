import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { setTimeout as pause } from 'node:timers/promises'
import { chromium } from 'playwright-core'
import { WebSocket } from 'ws'
import { createLabServer } from './server.mjs'

async function eventually(check, message, timeout = 10000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    if (await check()) return
    await pause(40)
  }
  assert.fail(message)
}

const fixture = `<!doctype html><html><head><meta charset="utf-8"><title>Viewer integration fixture</title>
<style>body{margin:0;background:#f5f5f5;font:16px sans-serif}main{padding:20px}input,button{font:inherit;margin:0 0 12px;padding:8px}iframe{display:block;width:300px;height:100px;border:0}output{display:block}</style></head>
<body><main><label>Input <input id="entry" aria-label="Input"></label><br><button id="action">Apply</button><output id="result">Waiting</output><iframe src="https://frame.fixture.test/" title="Cross-origin checkbox"></iframe></main>
<script>document.querySelector('#action').addEventListener('click',()=>document.querySelector('#result').textContent=document.querySelector('#entry').value)</script></body></html>`
const frameFixture = '<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:10px;font:16px sans-serif"><label><input id="check" type="checkbox" style="width:24px;height:24px">Manual checkbox</label></body></html>'

test('real viewer forwards screenshot input, preserves sessions, and rejects unauthorized requests', { timeout: 60000 }, async (t) => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--disable-dev-shm-usage'] })
  let target
  const lab = await createLabServer({
    engine: { id: 'chrome', name: 'Chrome fixture', port: 5600 },
    initialUrl: 'https://fixture.test/', port: 0,
    factory: async () => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
      await context.route('https://fixture.test/**', route => route.fulfill({ contentType: 'text/html', body: fixture }))
      await context.route('https://frame.fixture.test/**', route => route.fulfill({ contentType: 'text/html', body: frameFixture }))
      target = await context.newPage()
      return { context, page: target, canScreenshot: true, canPointer: true, screenshotType: 'png', close: () => context.close() }
    },
  })
  t.after(async () => { await lab.close(); await browser.close() })
  const origin = `http://127.0.0.1:${lab.port}`
  const viewer = await browser.newPage({ viewport: { width: 1300, height: 1000 } })
  await viewer.goto(origin)
  await eventually(async () => target && await target.locator('#entry').count() === 1, 'fixture did not load')
  await viewer.locator('#screen').waitFor({ state: 'visible' })

  async function stableFrame() {
    await eventually(async () => {
      const image = await viewer.locator('#screen').evaluate(img => ({ loaded: img.complete, width: img.naturalWidth, height: img.naturalHeight }))
      return image.loaded && image.width === lab.session.width && image.height === lab.session.height
    }, 'viewer image does not match current remote viewport')
  }
  async function remoteClick(locator) {
    await stableFrame()
    const box = await locator.boundingBox()
    assert.ok(box, 'remote target must have a layout box')
    const image = await viewer.locator('#screen').evaluate(img => {
      const rect = img.getBoundingClientRect()
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight }
    })
    const scale = Math.min(image.width / image.naturalWidth, image.height / image.naturalHeight)
    const x = image.left + (image.width - image.naturalWidth * scale) / 2 + (box.x + box.width / 2) * scale
    const y = image.top + (image.height - image.naturalHeight * scale) / 2 + (box.y + box.height / 2) * scale
    await viewer.mouse.click(x, y)
  }

  await t.test('desktop screenshot pointer and ASCII/non-ASCII input reach the real page', async () => {
    await remoteClick(target.locator('#entry'))
    await viewer.keyboard.type('Hello 123')
    await viewer.keyboard.insertText(' 한글')
    await eventually(async () => await target.locator('#entry').inputValue() === 'Hello 123 한글', 'ASCII or Korean input was lost or duplicated')
    await remoteClick(target.locator('#action'))
    await eventually(async () => await target.locator('#result').textContent() === 'Hello 123 한글', 'screenshot button click was not forwarded')
  })

  await t.test('cross-origin checkbox supports pointer click and real Space key activation', async () => {
    const checkbox = target.frameLocator('iframe').locator('#check')
    await remoteClick(checkbox)
    await eventually(() => checkbox.isChecked(), 'cross-origin checkbox did not receive pointer click')
    await viewer.keyboard.press('Space')
    await eventually(async () => !await checkbox.isChecked(), 'Space key did not toggle the focused checkbox')
  })

  await t.test('reloading viewer preserves remote page state and reconnects', async () => {
    await viewer.reload()
    await viewer.locator('#screen').waitFor({ state: 'visible' })
    assert.equal(await target.locator('#entry').inputValue(), 'Hello 123 한글')
    assert.equal(await target.locator('#result').textContent(), 'Hello 123 한글')
  })

  await t.test('mobile and desktop resizes update remote viewport and retain coordinate input', async () => {
    await viewer.setViewportSize({ width: 390, height: 844 })
    await eventually(async () => {
      const size = target.viewportSize()
      return size.width >= 320 && size.width <= 390 && size.height >= 240
    }, 'mobile viewport was not forwarded')
    await stableFrame()
    await remoteClick(target.locator('#entry'))
    await viewer.keyboard.press('End')
    await viewer.keyboard.type('!')
    await eventually(async () => await target.locator('#entry').inputValue() === 'Hello 123 한글!', 'mobile coordinate input was not forwarded')
    await viewer.setViewportSize({ width: 1300, height: 1000 })
    await eventually(async () => target.viewportSize().width > 1000, 'desktop viewport was not restored')
    await stableFrame()
  })

  await t.test('text-only viewer keeps loaded text visible after subsequent engine states', async (subtest) => {
    const textLab = await createLabServer({
      engine: { id: 'lightpanda', name: 'Text-only fixture', port: 5604 },
      initialUrl: 'https://fixture.test/', port: 0,
      factory: async () => {
        const context = await browser.newContext()
        await context.route('https://fixture.test/**', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Text fixture</title><body>Text-only page content remains visible.</body>' }))
        const page = await context.newPage()
        return { context, page, canScreenshot: false, canPointer: false, close: () => context.close() }
      },
    })
    const textViewer = await browser.newPage()
    subtest.after(async () => { await textViewer.close(); await textLab.close() })
    await textViewer.goto(`http://127.0.0.1:${textLab.port}`)
    await eventually(async () => await textViewer.locator('#text-output').textContent() === 'Text-only page content remains visible.', 'text-only page was not relayed')
    // A state is sent after every text poll. Verify its processing explicitly,
    // rather than sampling between the text and state messages by chance.
    textLab.session.title = 'Text state checkpoint'
    textLab.session.sendState()
    await eventually(async () => await textViewer.locator('#page-title').textContent() === 'Text state checkpoint', 'subsequent engine state did not reach the viewer')
    assert.equal(await textViewer.locator('#placeholder').isHidden(), true)
    assert.equal(await textViewer.locator('#text-output').isVisible(), true)
    assert.equal(await textViewer.locator('#screen').isHidden(), true)
    assert.equal(await textViewer.locator('#screen').getAttribute('aria-disabled'), 'true')
    assert.equal(await textViewer.locator('#text-output').textContent(), 'Text-only page content remains visible.')
  })

  await t.test('foreign Host and invalid WebSocket token receive HTTP 403', async () => {
    const status = await new Promise((resolve, reject) => {
      const request = http.get(`${origin}/`, { headers: { host: `attacker.example:${lab.port}` } }, response => { response.resume(); resolve(response.statusCode) })
      request.on('error', reject)
    })
    assert.equal(status, 403)
    const websocketStatus = await new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${lab.port}/session?token=invalid`)
      ws.once('unexpected-response', (_, response) => { response.resume(); resolve(response.statusCode) })
      ws.once('open', () => { ws.close(); reject(new Error('invalid token opened a WebSocket')) })
      ws.once('error', reject)
    })
    assert.equal(websocketStatus, 403)
  })
})
