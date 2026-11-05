import test from 'node:test'
import assert from 'node:assert/strict'
import { setTimeout as pause } from 'node:timers/promises'
import { chromium } from 'playwright-core'
import { createLabServer } from './server.mjs'

async function eventually(check, message) {
  const end = Date.now() + 10000
  while (Date.now() < end) { if (await check()) return; await pause(40) }
  assert.fail(message)
}

const fixture = `<!doctype html><meta charset="utf-8"><title>Touch fixture</title>
<style>body{margin:0;font:18px sans-serif}main{padding:20px}input,button{font:inherit;padding:12px}button{display:block;margin-top:1000px}footer{height:1000px}</style>
<body onclick="this.dataset.clicks=Number(this.dataset.clicks||0)+1"><main><label>Name <input id="entry"></label><button id="action" onclick="this.dataset.clicks=Number(this.dataset.clicks||0)+1">Tap target</button><footer></footer></main>`

test('mobile viewer preserves screen space and relays touch without accidental clicks', { timeout: 60000 }, async t => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, chromiumSandbox: true })
  const targetBrowser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, chromiumSandbox: true })
  let target
  const lab = await createLabServer({
    engine: { id: 'chrome', name: 'Mobile fixture', port: 5600 }, port: 0, initialUrl: 'https://mobile.fixture.test/',
    factory: async () => {
      const context = await targetBrowser.newContext()
      await context.route('https://mobile.fixture.test/**', route => route.fulfill({ contentType: 'text/html', body: fixture }))
      target = await context.newPage()
      return { context, page: target, canScreenshot: true, canPointer: true, close: () => context.close() }
    },
  })
  const context = await browser.newContext({ viewport: { width: 384, height: 720 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
  const viewer = await context.newPage()
  const cdp = await context.newCDPSession(viewer)
  t.after(async () => { await lab.close(); await browser.close(); await targetBrowser.close() })
  await viewer.goto(`http://127.0.0.1:${lab.port}/`)
  await viewer.locator('#screen').waitFor({ state: 'visible' })

  async function stableFrame() {
    await eventually(async () => await viewer.locator('#screen').evaluate(img => img.complete && img.naturalWidth > 0 && img.naturalWidth === Number(img.ownerDocument.getElementById('dimensions').textContent.split(' × ')[0])) && target.viewportSize().width === lab.session.width, 'remote image did not settle')
  }
  async function mappedPoint(locator) {
    await stableFrame()
    const box = await locator.boundingBox()
    assert.ok(box)
    return viewer.locator('#screen').evaluate((img, box) => {
      const rect = img.getBoundingClientRect()
      const scale = Math.min(rect.width / img.naturalWidth, rect.height / img.naturalHeight)
      return { x: rect.left + (rect.width - img.naturalWidth * scale) / 2 + (box.x + box.width / 2) * scale,
        y: rect.top + (rect.height - img.naturalHeight * scale) / 2 + (box.y + box.height / 2) * scale }
    }, box)
  }
  async function swipe() {
    const box = await viewer.locator('#screen').boundingBox()
    const x = box.x + box.width / 2, startY = box.y + box.height - 50
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: startY }] })
    for (let n = 1; n <= 6; n++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: startY - n * 55 }] })
      await pause(20)
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  }

  await t.test('collapsed controls leave most of the phone viewport to the page', async () => {
    await eventually(() => Promise.resolve(target.viewportSize().height > 600), 'collapsed mobile viewport remained too short')
    assert.equal(await viewer.locator('#navigation').isVisible(), false)
    assert.equal(await viewer.locator('#engines').isVisible(), false)
    await viewer.getByRole('button', { name: '도구', exact: true }).tap()
    assert.equal(await viewer.locator('#navigation').isVisible(), true)
    assert.equal(await viewer.locator('#engines').isVisible(), true)
    await viewer.getByRole('button', { name: '닫기', exact: true }).tap()
    await eventually(() => Promise.resolve(target.viewportSize().height > 600), 'closing controls did not restore page space')
  })

  await t.test('swipe scrolls the remote document without clicking or focusing the keyboard', async () => {
    await stableFrame()
    await swipe()
    await eventually(async () => await target.evaluate(() => window.scrollY) > 200, 'touch swipe did not scroll remote page')
    assert.equal(await target.locator('body').getAttribute('data-clicks'), null)
    assert.equal(await viewer.locator('#ime').evaluate(el => el.ownerDocument.activeElement === el), false)
    await swipe()
    await eventually(async () => await target.evaluate(() => window.scrollY) > 500, 'second swipe did not continue scrolling')
    assert.equal(await target.locator('body').getAttribute('data-clicks'), null)
  })

  await t.test('zoomed-out touch coordinates still activate the intended target', async () => {
    // Chrome suppresses taps briefly after a synthesized CDP swipe.
    await pause(700)
    const zoom = await viewer.locator('#zoom').boundingBox()
    await viewer.touchscreen.tap(zoom.x + zoom.width / 2, zoom.y + zoom.height / 2)

    await eventually(() => Promise.resolve(target.viewportSize().width === 512), '75% view did not increase remote layout width')
    await stableFrame()
    const point = await mappedPoint(target.locator('#action'))
    await viewer.touchscreen.tap(point.x, point.y)
    await eventually(async () => await target.locator('#action').getAttribute('data-clicks') === '1', 'scaled touch tap did not reach the target')
    assert.equal(await viewer.locator('#ime').evaluate(el => el.ownerDocument.activeElement === el), false)
  })

  await t.test('cancelled gestures do not click and keyboard opens only on request', async () => {
    const cancelPoint = await mappedPoint(target.locator('#action'))
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [cancelPoint] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
    assert.equal(await target.locator('#action').getAttribute('data-clicks'), '1')
    await target.evaluate(() => window.scrollTo(0, 0))
    const point = await mappedPoint(target.locator('#entry'))
    await viewer.touchscreen.tap(point.x, point.y)
    await viewer.locator('#keyboard').tap()
    assert.equal(await viewer.locator('#ime').evaluate(el => el.ownerDocument.activeElement === el && el.inputMode === 'text'), true)
    await viewer.keyboard.insertText('모바일')
    await eventually(async () => await target.locator('#entry').inputValue() === '모바일', 'keyboard text did not reach the remote input')
  })
})
