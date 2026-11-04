import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import type { Locator, Page } from 'playwright-core'
import { connectTestBrowser } from './test-browser.ts'

const root = path.resolve(import.meta.dirname, '..')
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < .02, `${actual} should be near ${expected}`)

async function drag(page: Page, canvas: Locator, start: { x: number; y: number }, end: { x: number; y: number }): Promise<void> {
  const box = await canvas.boundingBox()
  assert.ok(box)
  await page.mouse.move(box.x + start.x, box.y + start.y)
  await page.mouse.down()
  await page.mouse.move(box.x + end.x, box.y + end.y, { steps: 12 })
  await page.mouse.up()
}

async function touchDrag(page: Page, canvas: Locator, start: { x: number; y: number }, end: { x: number; y: number }): Promise<void> {
  const box = await canvas.boundingBox()
  assert.ok(box)
  const session = await page.context().newCDPSession(page)
  try {
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + start.x, y: box.y + start.y }] })
    for (let step = 1; step <= 12; step++) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + start.x + (end.x - start.x) * step / 12, y: box.y + start.y + (end.y - start.y) * step / 12 }] })
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  } finally { await session.detach() }
}

async function origin(object: Locator): Promise<{ x: number; y: number }> {
  const transform = (await object.getAttribute('transform'))!.match(/translate\(([-\d.]+) ([-\d.]+)\)/)!
  return { x: Number(transform[1]), y: Number(transform[2]) }
}

test('drawing pen, theme transparency, PNG alpha and configurable snapping work on desktop and narrow mobile', { timeout: 90_000 }, async t => {
  const source = `
import React from '${root}/node_modules/react/index.js';
import {createRoot} from '${root}/node_modules/react-dom/client.js';
import {DrawingEditor} from '${root}/src/components/drawing/DrawingEditor.tsx';
import {I18nProvider} from '${root}/src/i18n.tsx';
localStorage.setItem('mew:locale','ko');
window.savedDrawings=[];
function Fixture(){
 const [open,setOpen]=React.useState(true);
 async function save(file){
  const image=await createImageBitmap(file),canvas=document.createElement('canvas');
  canvas.width=image.width;canvas.height=image.height;
  const context=canvas.getContext('2d');context.drawImage(image,0,0);
  const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;
  let painted=0,transparent=0;
  for(let index=3;index<pixels.length;index+=4){if(pixels[index]>0)painted++;else transparent++}
  window.savedDrawings.push({name:file.name,type:file.type,bytes:file.size,width:image.width,height:image.height,cornerAlpha:pixels[3],painted,transparent});
 }
 return <><button onClick={()=>setOpen(true)}>Open drawing</button>{open&&<DrawingEditor context="document" projectRoot="/workspace" onSave={save} onClose={()=>setOpen(false)}/>}</>
}
createRoot(document.getElementById('root')).render(<I18nProvider><Fixture/></I18nProvider>);`
  const candidates = [source], styles: string[] = []
  const bundle = await build({
    onLog(level, log, handler) { if (log.code !== 'MODULE_LEVEL_DIRECTIVE') handler(level, log) },
    input: 'virtual:drawing-tools.tsx', write: false, platform: 'browser', output: { format: 'iife', codeSplitting: false },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
    plugins: [{ name: 'drawing-tools-fixture', resolveId(id) { if (id === 'virtual:drawing-tools.tsx') return id }, async load(id) {
      if (id === 'virtual:drawing-tools.tsx') return source
      if (id.endsWith('.tsx')) candidates.push(await fs.readFile(id, 'utf8'))
      if (id.endsWith('.css')) { styles.push(await fs.readFile(id, 'utf8')); return { code: '', moduleType: 'js' } }
    } }],
  })
  const chunk = bundle.output.find(item => item.type === 'chunk')!
  const compiler = await compile(await fs.readFile(`${root}/src/index.css`, 'utf8'), { base: `${root}/src`, onDependency() {} })
  const css = compiler.build([...new Set(['bg-surface-inverse', 'text-surface-deep', ...(candidates.join('\n').match(/[A-Za-z0-9_@!:/.[\]()%,-]+/g) ?? [])])]) + styles.join('\n')
  const browser = await connectTestBrowser()
  t.after(() => browser.close())
  for (const width of [1100, 390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, hasTouch: width < 768, locale: 'ko-KR' })
    page.setDefaultTimeout(5000)
    const errors: string[] = [], drawingRequests: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('https://mew-drawing-tools.test/**', route => {
      const pathname = new URL(route.request().url()).pathname
      if (pathname === '/app.js') return route.fulfill({ contentType: 'text/javascript', body: chunk.code })
      if (pathname.startsWith('/api/')) {
        if (pathname.startsWith('/api/agent/drawings')) drawingRequests.push(pathname)
        return route.fulfill({ json: { drawings: [], projectRoot: '/workspace' } })
      }
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html class="dark" lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}\nhtml,body,#root{height:100%;margin:0}html{--color-surface:#233f51}</style><div id="root"></div><script src="/app.js"></script></html>` })
    })
    try {
      await page.goto('https://mew-drawing-tools.test/')
      const dialog = page.getByRole('dialog', { name: '그림판', exact: true })
      const canvas = dialog.locator('[data-drawing-canvas]'), objects = canvas.locator('[data-drawing-object]')
      await canvas.waitFor()
      const stage = dialog.locator('.drawing-stage')
      const transparency = await stage.evaluate(element => {
        const browserWindow = element.ownerDocument.defaultView!
        const style = browserWindow.getComputedStyle(element)
        const surface = element.closest('[role="dialog"]')!
        return { background: style.backgroundColor, image: style.backgroundImage, surface: browserWindow.getComputedStyle(surface).backgroundColor }
      })
      assert.deepEqual(transparency, { background: 'rgba(0, 0, 0, 0)', image: 'none', surface: 'rgb(35, 63, 81)' })
      for (const controls of ['.drawing-toolbar', '.drawing-bottom-left', '.drawing-bottom-right']) {
        const bounds = await dialog.locator(controls).boundingBox()
        assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width, `${controls} fits at ${width}px`)
      }
      await canvas.press('b')
      const penButton = dialog.getByRole('button', { name: '펜', exact: true })
      assert.equal(await penButton.getAttribute('aria-pressed'), 'true')
      const thickness = dialog.getByRole('spinbutton', { name: '선 두께', exact: true })
      await thickness.fill('8'); await thickness.press('Enter')
      await dialog.getByRole('button', { name: '선 색상', exact: true }).click()
      await dialog.getByRole('button', { name: '3 · #ef4444', exact: true }).click()
      await canvas.press('b')
      await drag(page, canvas, { x: 50, y: 140 }, { x: Math.min(width - 70, 260), y: 190 })
      assert.equal(await objects.count(), 1)
      const firstId = await objects.first().getAttribute('data-drawing-object')
      assert.equal(await objects.first().locator('path').getAttribute('stroke-width'), '8')
      assert.equal(await objects.first().locator('path').getAttribute('stroke'), '#ef4444')
      assert.ok((await objects.first().locator('path').getAttribute('d'))!.includes(' C '))
      assert.equal(await penButton.getAttribute('aria-pressed'), 'true', 'B stays active after a stroke')
      await (width < 768 ? touchDrag : drag)(page, canvas, { x: 65, y: 245 }, { x: Math.min(width - 90, 240), y: 280 })
      assert.equal(await objects.count(), 2)
      await canvas.press('Control+z')
      assert.equal(await objects.count(), 1, 'one undo removes exactly the last stroke')
      assert.equal(await objects.first().getAttribute('data-drawing-object'), firstId)
      await canvas.press('Control+Shift+z')
      assert.equal(await objects.count(), 2)
      const completed = await objects.evaluateAll(elements => elements.map(element => element.getAttribute('data-drawing-object')))
      const canvasBox = await canvas.boundingBox()
      assert.ok(canvasBox)
      await page.mouse.move(canvasBox.x + 65, canvasBox.y + 330)
      await page.mouse.down()
      await page.mouse.move(canvasBox.x + Math.min(width - 90, 230), canvasBox.y + 350, { steps: 6 })
      await objects.nth(2).waitFor()
      await page.keyboard.press('Control+z')
      await page.mouse.up()
      assert.deepEqual(await objects.evaluateAll(elements => elements.map(element => element.getAttribute('data-drawing-object'))), completed, 'cancelling an in-progress stroke preserves earlier undo entries')
      await canvas.press('Control+z')
      assert.equal(await objects.count(), 1)
      await canvas.press('Control+Shift+z')
      if (width < 768) await page.touchscreen.tap(canvasBox.x + 85, canvasBox.y + 400)
      else await canvas.click({ position: { x: 85, y: 400 } })
      assert.equal(await objects.count(), 3)
      assert.match((await objects.last().locator('path').getAttribute('d'))!, /0\.001/)
      const dot = await objects.last().locator('path').boundingBox()
      assert.ok(dot && dot.width >= 7 && dot.width <= 9 && dot.height >= 7 && dot.height <= 9, `a tap renders a round dot at the selected stroke width: ${JSON.stringify(dot)}`)
      assert.equal(await penButton.getAttribute('aria-pressed'), 'true')
      await canvas.press('p')
      await drag(page, canvas, { x: 50, y: 470 }, { x: 75, y: 440 })
      await drag(page, canvas, { x: 190, y: 470 }, { x: 215, y: 495 })
      await canvas.press('Enter')
      assert.equal(await objects.count(), 4)
      assert.ok((await objects.last().locator('path').getAttribute('d'))!.includes(' C '), 'P still creates a control-point curve')
      assert.equal(await dialog.getByRole('button', { name: '선택', exact: true }).getAttribute('aria-pressed'), 'true')
      await page.screenshot({ path: `/tmp/mew-paint-freehand-${width}.png` })
      await dialog.getByRole('button', { name: '저장', exact: true }).click()
      await dialog.waitFor({ state: 'detached' })
      const exported = await page.evaluate<{ type: string; bytes: number; cornerAlpha: number; painted: number; transparent: number }>('window.savedDrawings[0]')
      assert.equal(exported.type, 'image/png'); assert.ok(exported.bytes > 100)
      assert.equal(exported.cornerAlpha, 0, 'theme background is absent from exported PNG')
      assert.ok(exported.painted > 100 && exported.transparent > exported.painted, 'PNG contains strokes on transparent pixels')

      await page.getByRole('button', { name: 'Open drawing', exact: true }).click()
      await canvas.waitFor()
      const openSnapping = async () => { await dialog.getByRole('button', { name: '스냅 설정', exact: true }).click() }
      const closeSnapping = async () => { await dialog.locator('.drawing-panel-grid').getByRole('button', { name: '닫기', exact: true }).click() }
      await openSnapping()
      const visible = dialog.getByRole('checkbox', { name: '격자 표시', exact: true })
      const gridSnap = dialog.getByRole('checkbox', { name: '격자에 맞추기', exact: true })
      const objectSnap = dialog.getByRole('checkbox', { name: '개체에 맞추기', exact: true })
      const spacing = dialog.getByRole('spinbutton', { name: '격자 간격', exact: true })
      const tolerance = dialog.getByRole('spinbutton', { name: '개체 스냅 거리', exact: true })
      await visible.uncheck()
      assert.equal(await gridSnap.isChecked(), true)
      await spacing.fill('25'); await spacing.press('Enter')
      await closeSnapping()
      assert.equal(await canvas.locator(':scope > rect').count(), 0, 'hidden grid has no visible dot backdrop')
      await canvas.press('r')
      await drag(page, canvas, { x: 45, y: 80 }, { x: 120, y: 125 })
      assert.equal(await objects.count(), 1)
      const position = await origin(objects.first())
      near(position.x / 25, Math.round(position.x / 25)); near(position.y / 25, Math.round(position.y / 25))
      const rectangle = objects.first().locator('rect'), rectangleWidth = Number(await rectangle.getAttribute('width'))
      near(rectangleWidth / 25, Math.round(rectangleWidth / 25))
      await openSnapping()
      assert.equal(await visible.isChecked(), false); assert.equal(await gridSnap.isChecked(), true)
      assert.equal(await spacing.inputValue(), '25')
      await gridSnap.uncheck(); await objectSnap.check()
      await tolerance.fill('6'); await tolerance.press('Enter')
      await closeSnapping()
      const snapCanvasBox = await canvas.boundingBox()
      assert.ok(snapCanvasBox)
      const corner = await rectangle.evaluate(element => {
        const matrix = (element as unknown as { getScreenCTM(): { a: number; d: number; e: number; f: number } }).getScreenCTM()
        return { x: matrix.e + Number(element.getAttribute('width')) * matrix.a, y: matrix.f + Number(element.getAttribute('height')) * matrix.d }
      })
      const edgeX = corner.x, lineY = corner.y + 50
      await canvas.press('l')
      await page.mouse.move(edgeX + 4, lineY)
      await page.mouse.down()
      await canvas.locator('[data-snap-guide]').first().waitFor({ state: 'attached' })
      await page.screenshot({ path: `/tmp/mew-paint-snap-${width}.png` })
      await page.mouse.move(edgeX + 60, lineY + 20, { steps: 4 })
      await page.mouse.up()
      const snappedLine = await origin(objects.last())
      near(snappedLine.x, position.x + rectangleWidth)
      assert.equal(await canvas.locator('[data-snap-guide]').count(), 0, 'guides clear after a gesture')
      await openSnapping()
      await tolerance.fill('1'); await tolerance.press('Enter')
      await closeSnapping()
      await canvas.press('l')
      await page.mouse.move(edgeX + 4, lineY + 65)
      await page.mouse.down()
      assert.equal(await canvas.locator('[data-snap-guide]').count(), 0, 'one pixel tolerance rejects a four pixel gap')
      await page.mouse.move(edgeX + 70, lineY + 80, { steps: 4 })
      await page.mouse.up()
      const unsnappedLine = await origin(objects.last())
      near(unsnappedLine.x, position.x + rectangleWidth + 4)
      await openSnapping()
      await tolerance.fill('12'); await tolerance.press('Enter')
      await page.screenshot({ path: `/tmp/mew-paint-settings-${width}.png` })
      await closeSnapping()
      await canvas.press('l')
      await page.keyboard.down('Alt')
      await page.mouse.move(edgeX + 4, lineY + 120)
      await page.mouse.down()
      assert.equal(await canvas.locator('[data-snap-guide]').count(), 0)
      await page.mouse.move(edgeX + 70, lineY + 140, { steps: 4 })
      await page.mouse.up()
      await page.keyboard.up('Alt')
      near((await origin(objects.last())).x, position.x + rectangleWidth + 4)
      await openSnapping()
      assert.equal(await objectSnap.isChecked(), true); assert.equal(await gridSnap.isChecked(), false)
      assert.equal(await tolerance.inputValue(), '12')
      await objectSnap.uncheck()
      await closeSnapping()
      await canvas.press('l')
      await drag(page, canvas, { x: edgeX - snapCanvasBox.x + 3, y: lineY - snapCanvasBox.y + 190 }, { x: edgeX - snapCanvasBox.x + 75, y: lineY - snapCanvasBox.y + 205 })
      near((await origin(objects.last())).x, position.x + rectangleWidth + 3)
      assert.deepEqual(drawingRequests, [], 'document drawing never fetches or saves agent drawing history')
      assert.deepEqual(errors, [])
    } catch (error) {
      await page.screenshot({ path: `/tmp/mew-paint-failure-${width}.png` })
      throw error
    } finally { await page.close() }
  }
})
