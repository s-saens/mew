import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { chromium } from 'playwright-core'
import { domBrowserExecutable } from './browser-dom-executable.ts'

const root = path.resolve(import.meta.dirname, '..')
const label = '그라데이션 방향'

test('gradient angle dial supports cardinal dragging, numeric drafts and keyboard adjustment on desktop and touch', { skip: !domBrowserExecutable(), timeout: 60_000 }, async t => {
  const source = `import React,{useState} from '${root}/node_modules/react/index.js';
import {createRoot} from '${root}/node_modules/react-dom/client.js';
import {ThemeGradientAngle} from '${root}/src/components/theme-gradient-angle.tsx';
import {ColorPicker} from '${root}/packages/ui/src/color-picker.tsx';
import {themeBackgroundImage} from '${root}/src/utils/theme-color.ts';
function Fixture(){
  const [angle,setAngle]=useState(135);
  return <main className="p-4"><div className="flex flex-wrap items-center gap-2">
    <ColorPicker compact swatchOnly value="#223344" defaultValue="#223344" onChange={()=>{}} labels={{color:'배경색',hex:'배경색 HEX',hue:'색조',saturation:'채도',brightness:'밝기',reset:'초기화',close:'닫기'}}/>
    <ThemeGradientAngle value={angle} onChange={setAngle} label="${label}"/>
  </div><div id="preview" className="mt-3 h-20 w-40" style={{backgroundColor:'#102030',backgroundImage:themeBackgroundImage({background:'#102030',text:'#ffffff',primary:'#99ddbb',gradient:{colors:['#112233','#aabbcc'],angle,animated:false}})}}/>
  <button type="button" className="mt-3">다음 설정</button></main>;
}
createRoot(document.getElementById('root')).render(<React.StrictMode><Fixture/></React.StrictMode>);`
  const bundle = await build({
    input: 'virtual:theme-gradient-angle.tsx', write: false, platform: 'browser', output: { format: 'iife' },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
    onwarn(warning, warn) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning) },
    plugins: [{ name: 'theme-gradient-angle-fixture', resolveId(id) { if (id === 'virtual:theme-gradient-angle.tsx') return id }, load(id) { if (id === 'virtual:theme-gradient-angle.tsx') return source } }],
  })
  const chunk = bundle.output.find(item => item.type === 'chunk'); assert.ok(chunk)
  const sources = await Promise.all(['src/components/theme-gradient-angle.tsx', 'packages/ui/src/color-picker.tsx'].map(file => fs.readFile(path.join(root, file), 'utf8')))
  const compiler = await compile(await fs.readFile(path.join(root, 'src/index.css'), 'utf8'), { base: path.join(root, 'src'), onDependency() {} })
  const css = compiler.build([...new Set((source + sources.join('\n')).match(/[A-Za-z0-9_@!&:/.[\]()%,-]+/g))])
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  t.after(() => browser.close())

  for (const touch of [false, true]) await t.test(touch ? '390px touch' : '1100px desktop', async () => {
    const context = await browser.newContext({ viewport: { width: touch ? 390 : 1100, height: 700 }, hasTouch: touch, isMobile: touch })
    try {
      const page = await context.newPage()
      page.setDefaultTimeout(3000)
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('http://localhost:48982/**', async route => {
        const pathname = new URL(route.request().url()).pathname
        if (pathname.startsWith('/fonts/ibm-plex/')) {
          await route.fulfill({ contentType: pathname.endsWith('.css') ? 'text/css' : 'font/woff2', body: await fs.readFile(path.join(root, 'public', pathname.slice(1))) })
          return
        }
        await route.fulfill(pathname === '/app.js'
          ? { contentType: 'text/javascript', body: chunk.code }
          : { contentType: 'text/html', body: `<!doctype html><html class="dark"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script src="/app.js"></script></html>` })
      })
      await page.goto('http://localhost:48982/')
      const dial = page.getByRole('slider', { name: label, exact: true })
      const input = page.getByRole('spinbutton', { name: label, exact: true })
      await dial.waitFor()
      const read = async () => Number(await dial.getAttribute('aria-valuenow'))
      const expectAngle = async (angle: number) => {
        for (let attempt = 0; attempt < 100; attempt++) {
          if (await read() === angle && await input.inputValue() === String(angle)) break
          await page.waitForTimeout(10)
        }
        assert.equal(await read(), angle)
        assert.equal(await dial.getAttribute('aria-valuetext'), `${angle}°`)
        assert.equal(await input.inputValue(), String(angle))
      }
      const svg = await dial.locator('svg').boundingBox()
      const swatch = await page.getByRole('button', { name: '배경색', exact: true }).locator('span').first().boundingBox()
      const box = await dial.boundingBox()
      assert.ok(svg && swatch && box)
      assert.deepEqual({ width: svg.width, height: svg.height }, { width: 24, height: 24 }, 'the circular graphic remains the same size as a color swatch')
      assert.equal(svg.width, swatch.width)
      assert.equal(svg.height, swatch.height)
      assert.equal(box.width, touch ? 44 : 32, 'touch grows the hit area without enlarging the graphic')
      assert.equal(box.height, touch ? 44 : 32)
      assert.equal(await dial.getAttribute('aria-valuemin'), '0')
      assert.equal(await dial.getAttribute('aria-valuemax'), '359')
      assert.equal(await input.getAttribute('inputmode'), 'numeric')
      const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 }

      await input.fill('201'); await expectAngle(201)
      await input.fill(''); assert.equal(await input.inputValue(), '')
      assert.equal(await read(), 201, 'an empty numeric draft keeps the current angle')
      await dial.focus(); await expectAngle(201)
      for (const [entered, angle] of [['360', 0], ['-1', 359], ['721', 1], ['17.6', 18], ['-720', 0]] as const) {
        await input.fill(entered)
        await expectAngle(angle)
      }
      await input.press('Enter'); await expectAngle(0)
      assert.equal(await input.evaluate(el => el.ownerDocument.activeElement === el), false, 'Enter commits the numeric field and leaves editing')
      await input.fill(''); await input.press('Enter'); await expectAngle(0)

      await input.fill('359'); await dial.focus()
      for (const [key, angle] of [['ArrowRight', 0], ['ArrowUp', 1], ['ArrowLeft', 0], ['ArrowDown', 359], ['PageUp', 9], ['PageDown', 359], ['Home', 0], ['PageDown', 350], ['End', 359]] as const) {
        await dial.press(key)
        await expectAngle(angle)
      }
      for (const modifier of ['altKey', 'ctrlKey', 'metaKey']) {
        await dial.dispatchEvent('keydown', { key: 'ArrowRight', [modifier]: true })
        await expectAngle(359)
      }
      await dial.press('Tab')
      assert.equal(await input.evaluate(el => el.ownerDocument.activeElement === el), true, 'Tab reaches the paired numeric field')

      for (const [angle, x, y, position] of [[0, 0, -1, '50% 12%'], [90, 1, 0, '88% 50%'], [180, 0, 1, '50% 88%'], [270, -1, 0, '12% 50%']] as const) {
        await page.mouse.move(center.x + x * 10, center.y + y * 10)
        await page.mouse.down(); await page.mouse.up()
        await expectAngle(angle)
        assert.equal(await dial.evaluate(el => el.ownerDocument.activeElement === el), true, 'pointer adjustment focuses the dial')
        const direction = await dial.locator('svg g').evaluate(el => {
          const group = el as typeof el & { getScreenCTM(): { c: number; d: number } }
          const matrix = group.getScreenCTM()
          const dx = -matrix.c, dy = -matrix.d, length = Math.hypot(dx, dy)
          return { x: dx / length, y: dy / length }
        })
        assert.ok(Math.abs(direction.x - x) < .001 && Math.abs(direction.y - y) < .001, 'the needle points toward the selected gradient color')
        assert.ok((await page.locator('#preview').evaluate(el => el.style.backgroundImage)).includes(`at ${position},`), 'the needle and the actual theme gradient use the same cardinal orientation')
      }

      await input.fill('135')
      await page.mouse.click(center.x, center.y)
      await expectAngle(135)
      await page.mouse.click(center.x + 10, center.y, { button: 'right' })
      await expectAngle(135)
      await dial.dispatchEvent('pointerdown', { pointerId: 77, pointerType: 'touch', isPrimary: false, button: 0, clientX: center.x + 10, clientY: center.y })
      await dial.dispatchEvent('pointermove', { pointerId: 77, pointerType: 'touch', isPrimary: false, buttons: 1, clientX: center.x, clientY: center.y + 10 })
      await dial.dispatchEvent('pointerup', { pointerId: 77, pointerType: 'touch', isPrimary: false, button: 0 })
      await expectAngle(135)

      await page.mouse.move(center.x, center.y - 10)
      await page.mouse.down(); await expectAngle(0)
      await page.mouse.move(center.x + 100, center.y); await expectAngle(90)
      await page.mouse.move(center.x, center.y + 100); await expectAngle(180)
      await page.mouse.up()
      await page.mouse.move(center.x + 100, center.y)
      await expectAngle(180)

      if (touch) {
        const session = await context.newCDPSession(page)
        try {
          await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: center.x, y: center.y - 10, id: 1 }] })
          await expectAngle(0)
          await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: center.x + 100, y: center.y, id: 1 }] })
          await expectAngle(90)
          await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: center.x, y: center.y + 100, id: 1 }] })
          await expectAngle(180)
          await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
          await expectAngle(180)
          await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: center.x, y: center.y - 10, id: 2 }] })
          await expectAngle(0)
          await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: center.x + 100, y: center.y, id: 2 }] })
          await expectAngle(90)
          await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
          await expectAngle(90)
          await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: center.x, y: center.y + 10, id: 3 }] })
          await expectAngle(180)
          await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
          await expectAngle(180)
          assert.equal(await page.locator('body').evaluate(el => el.ownerDocument.defaultView!.scrollY), 0, 'dial dragging does not scroll the touch viewport')
        } finally { await session.detach() }
      }
      assert.deepEqual(errors, [])
    } finally { await context.close() }
  })
})
