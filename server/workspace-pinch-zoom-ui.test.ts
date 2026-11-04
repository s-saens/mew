import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { connectTestBrowser } from './test-browser.ts'

test('workspace blocks page pinch while preserving native pan and removable gesture handling', { timeout: 30_000 }, async () => {
  const root = path.resolve(import.meta.dirname, '..')
  const html = await fs.readFile(path.join(root, 'index.html'), 'utf8')
  const viewport = html.match(/<meta\s+name="viewport"\s+content="([^"]+)"/)?.[1]
  assert.ok(viewport)
  for (const setting of ['width=device-width', 'initial-scale=1', 'maximum-scale=1', 'viewport-fit=cover', 'interactive-widget=resizes-content']) assert.ok(viewport.includes(setting), setting)
  const css = await fs.readFile(path.join(root, 'src/index.css'), 'utf8')
  const touchAction = css.match(/html\s*\{[^}]*touch-action:\s*([^;]+);/)?.[1]
  assert.equal(touchAction, 'pan-x pan-y')
  const source = `import {startWorkspacePinchZoom} from ${JSON.stringify(path.join(root, 'src/utils/workspace-pinch-zoom.ts'))}; window.cleanupPinch=startWorkspacePinchZoom();`
  const bundle = await build({ input: 'virtual:workspace-pinch', write: false, platform: 'browser', output: { format: 'esm', codeSplitting: false }, plugins: [{ name: 'workspace-pinch-fixture', resolveId(id) { if (id === 'virtual:workspace-pinch') return id }, load(id) { if (id === 'virtual:workspace-pinch') return source } }] })
  const chunk = bundle.output.find(item => item.type === 'chunk' && item.isEntry)!
  assert.ok(chunk.type === 'chunk')
  const browser = await connectTestBrowser()
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('http://mew-workspace-pinch.test/**', route => route.fulfill(route.request().url().endsWith('/app.js')
      ? { contentType: 'text/javascript', body: chunk.code }
      : { contentType: 'text/html', body: `<!doctype html><html><meta name="viewport" content="${viewport}"><style>html{touch-action:${touchAction}}body{margin:0}#scroll{height:800px;overflow:auto}#content{height:4000px;background:linear-gradient(white,gray)}</style><div id="scroll"><div id="content">Workspace content</div></div><script type="module" src="/app.js"></script></html>` }))
    await page.goto('http://mew-workspace-pinch.test/')
    await page.waitForFunction('typeof window.cleanupPinch === "function"')
    const content = page.locator('#content')
    const emit = (type: string, count = 0) => content.evaluate((el, input) => {
      const win = el.ownerDocument.defaultView as any
      const touches = Array.from({ length: input.count }, (_, identifier) => new win.Touch({ identifier, target: el, clientX: 100, clientY: 200 + identifier * 100 }))
      const event = input.type.startsWith('touch')
        ? new win.TouchEvent(input.type, { bubbles: true, cancelable: true, touches, targetTouches: touches, changedTouches: touches })
        : input.type === 'wheel' ? new win.WheelEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: true, deltaY: -10 })
        : new win.Event(input.type, { bubbles: true, cancelable: true })
      el.dispatchEvent(event)
      return event.defaultPrevented
    }, { type, count })
    for (const type of ['touchstart', 'touchmove']) {
      assert.equal(await emit(type, 1), false, `${type} preserves one-finger gestures`)
      assert.equal(await emit(type, 2), true, `${type} suppresses page pinch`)
    }
    for (const type of ['gesturestart', 'gesturechange']) assert.equal(await emit(type), true, `${type} suppresses Safari page pinch`)
    assert.equal(await emit('wheel'), false, 'desktop Ctrl-wheel is not intercepted')
    const cdp = await page.context().newCDPSession(page)
    const scale = await content.evaluate(el => el.ownerDocument.defaultView!.visualViewport!.scale)
    const points = (distance: number) => [{ x: 190, y: 350 - distance / 2, id: 1 }, { x: 190, y: 350 + distance / 2, id: 2 }]
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(100) })
    for (const distance of [120, 150, 180, 220]) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(distance) })
      await page.waitForTimeout(20)
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    assert.equal(await content.evaluate(el => el.ownerDocument.defaultView!.visualViewport!.scale), scale)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 190, y: 600, id: 1 }] })
    for (let step = 1; step <= 6; step++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 190, y: 600 - step * 30, id: 1 }] })
      await page.waitForTimeout(20)
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await page.waitForFunction('document.getElementById("scroll").scrollTop > 40')
    await page.evaluate('window.cleanupPinch()')
    for (const type of ['touchstart', 'touchmove', 'gesturestart', 'gesturechange']) assert.equal(await emit(type, 2), false, `${type} listener is removed`)
    assert.deepEqual(errors, [])
    await cdp.detach()
  } finally { await browser.close() }
})
