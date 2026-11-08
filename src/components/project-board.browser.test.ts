import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { build } from 'rolldown'
import type { Page } from 'playwright-core'
import { connectTestBrowser } from '../../server/test-browser.ts'

const origin = 'http://project-board.test'
async function fixtureBundle() {
  const component = new URL('./project-board.tsx', import.meta.url).pathname
  const model = new URL('../utils/project-board.ts', import.meta.url).pathname
  const source = `
    import React from 'react';import{createRoot}from'react-dom/client';
    import{ProjectBoard}from${JSON.stringify(component)};import{createProjectBoard,projectBoardReducer}from${JSON.stringify(model)};
    window.mounts={};window.unmounts={};window.selected=[];
    function Tool({panel}){React.useEffect(()=>{window.mounts[panel.id]=(window.mounts[panel.id]??0)+1;return()=>{window.unmounts[panel.id]=(window.unmounts[panel.id]??0)+1}},[]);return <><textarea aria-label={'Draft '+panel.id} defaultValue={'Original '+panel.id}/><button onClick={()=>{}}>Local action {panel.id}</button></>}
    const labels={board:'Project board',add:'Add project panel',select:'Choose project',close:'Close project panel',move:'Move project panel',resizeColumn:'Resize project column',resizeRow:'Resize project rows'};
    const retained=new URLSearchParams(location.search).has('retained')?[{id:'x',projectPath:'/x',workingRoot:'/x'}]:[];
    function Fixture(){const[state,setState]=React.useState(()=>createProjectBoard({id:'a',projectPath:'/a',workingRoot:'/a'}));const[mode,setMode]=React.useState('board'),[singlePanelId,setSinglePanelId]=React.useState();const next=React.useRef(0);window.board=state;
      return <><nav><button onClick={()=>setMode(mode==='board'?'single':'board')}>Switch mode</button>{retained.length>0&&<><button onClick={()=>{setSinglePanelId('x');setMode('single')}}>Open retained project</button><button onClick={()=>{setState(current=>projectBoardReducer(current,{type:'add',panel:retained[0],availableWidth:1800}));setMode('board')}}>Add retained project</button></>}</nav><ProjectBoard value={state} onChange={setState} presentation={mode} retainedPanels={retained} singlePanelId={singlePanelId} labels={labels} getPanelLabel={panel=>panel.id.toUpperCase()} renderPanel={panel=><Tool panel={panel}/>} onSelectProject={id=>window.selected.push(id)} onAdd={()=>{const id=String.fromCharCode(98+next.current++);setState(current=>projectBoardReducer(current,{type:'add',panel:{id,projectPath:'/'+id,workingRoot:'/'+id},availableWidth:1800}))}}/></>
    };createRoot(document.getElementById('root')).render(<Fixture/>);
  `
  const bundle = await build({ input: 'virtual:project-board.tsx', write: false, platform: 'browser', output: { format: 'esm' }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('production') } }, onLog(level, log, handler) { if (log.code !== 'MODULE_LEVEL_DIRECTIVE') handler(level, log) }, plugins: [{ name: 'project-board-fixture', resolveId(id) { if (id.startsWith('virtual:')) return id }, load(id) { if (id === 'virtual:project-board.tsx') return source; if (id.endsWith('.css')) return { code: '', moduleType: 'js' } } }] })
  const scripts = new Map(bundle.output.filter(chunk => chunk.type === 'chunk').map(chunk => ['/' + chunk.fileName, chunk.code]))
  const entry = bundle.output.find(chunk => chunk.type === 'chunk' && chunk.isEntry)!
  const css = fs.readFileSync(new URL('./project-board.css', import.meta.url), 'utf8')
  return { scripts, html: `<html><head><style>:root{--color-edge:#445;--color-ink:#ddd;--color-ink-secondary:#aaa;--color-ink-muted:#999;--color-surface:#112a;--color-surface-raised:#234}*{box-sizing:border-box}body{margin:0;font:14px sans-serif;background:linear-gradient(120deg,#123,#325);color:var(--color-ink)}#root{height:100vh;display:flex;flex-direction:column}nav{height:30px;flex-shrink:0}button{border:0;background:none;color:inherit;cursor:pointer}textarea{flex:1;min-height:0;background:transparent;color:inherit}section .mew-project-board-header>button:last-child{width:24px;height:24px}${css}</style></head><body><div id="root"></div><script type="module" src="/${entry.fileName}"></script></body></html>` }
}
async function install(page: Page, fixture: Awaited<ReturnType<typeof fixtureBundle>>, path = '') {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.setDefaultTimeout(5000)
  await page.route(`${origin}/**`, route => {
    const script = fixture.scripts.get(new URL(route.request().url()).pathname)
    return route.fulfill(script ? { contentType: 'text/javascript', body: script } : { contentType: 'text/html', body: fixture.html })
  })
  await page.goto(origin + path)
  await page.getByRole('textbox', { name: 'Draft a', exact: true }).waitFor()
  return errors
}
const paint = (page: Page) => page.locator('body').evaluate(element => new Promise<void>(resolve => element.ownerDocument.defaultView!.requestAnimationFrame(() => element.ownerDocument.defaultView!.requestAnimationFrame(() => resolve()))))
const columns = (page: Page) => page.evaluate('window.board.columns.map(column=>column.rows.map(row=>row.panelId))')
const finishPanelAnimations = async (page: Page) => {
  await paint(page)
  await page.locator('[data-project-panel]').evaluateAll(elements => elements.forEach(element => element.getAnimations().forEach(animation => animation.finish())))
}

test('board geometry, grip-only movement, accessible resizing, and mode changes retain live project hosts and drafts', { timeout: 45_000 }, async t => {
  const fixture = await fixtureBundle(), browser = await connectTestBrowser()
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  const errors = await install(page, fixture)
  const first = page.locator('[data-project-panel="a"]')
  const box = await first.boundingBox()
  assert.ok(box && box.width === 400 && box.height === 970)
  assert.equal(await first.evaluate(element => getComputedStyle(element).backgroundImage), 'none', 'panels share the page gradient')
  await page.getByRole('textbox', { name: 'Draft a', exact: true }).fill('Unsaved A')
  await page.getByRole('button', { name: 'Add project panel', exact: true }).click()
  const second = page.locator('[data-project-panel="b"]')
  await second.waitFor()
  await page.getByRole('textbox', { name: 'Draft b', exact: true }).fill('Unsent B')
  const name = page.getByRole('button', { name: 'Choose project: B', exact: true })
  await name.click()
  assert.deepEqual(await page.evaluate('window.selected'), ['b'])
  const titleBox = (await name.boundingBox())!
  await page.mouse.move(titleBox.x + 50, titleBox.y + 10)
  await page.mouse.down()
  await page.mouse.move(1100, 250, { steps: 5 })
  await page.mouse.up()
  assert.deepEqual(await columns(page), [['a'], ['b']], 'dragging the title does not move a panel')

  const handle = page.getByRole('button', { name: 'Move project panel: B', exact: true })
  await handle.focus(); await handle.press('ArrowLeft')
  assert.deepEqual(await columns(page), [['b', 'a']])
  assert.deepEqual(await page.evaluate('window.mounts'), { a: 1, b: 1 })
  assert.ok(await second.evaluate(element => element.getAnimations().length > 0), 'keyboard movement animates the panel')
  await finishPanelAnimations(page)
  const beforeRow = (await second.boundingBox())!.height
  const rowResize = page.getByRole('separator', { name: 'Resize project rows', exact: true })
  await rowResize.focus(); await rowResize.press('ArrowDown')
  assert.ok(Math.abs((await second.boundingBox())!.height - beforeRow - 16) < 1)
  const widthResize = page.getByRole('separator', { name: 'Resize project column', exact: true })
  await widthResize.focus(); await widthResize.press('ArrowRight')
  assert.equal((await second.boundingBox())!.width, 416)

  const grip = (await handle.boundingBox())!
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
  await page.mouse.down(); await page.mouse.move(1000, 250, { steps: 8 }); await page.mouse.up()
  await paint(page)
  assert.deepEqual(await columns(page), [['a'], ['b']])
  assert.deepEqual(await page.evaluate('window.mounts'), { a: 1, b: 1 })
  assert.equal(await page.getByRole('textbox', { name: 'Draft a', exact: true }).inputValue(), 'Unsaved A')
  assert.equal(await page.getByRole('textbox', { name: 'Draft b', exact: true }).inputValue(), 'Unsent B')

  await page.getByRole('button', { name: 'Switch mode', exact: true }).click()
  assert.equal(await first.isVisible(), false)
  assert.ok(Math.abs((await second.boundingBox())!.width - 1600) < 0.01)
  assert.equal(await handle.isVisible(), false)
  await page.getByRole('textbox', { name: 'Draft b', exact: true }).fill('Edited in single mode')
  await page.getByRole('button', { name: 'Switch mode', exact: true }).click()
  assert.equal(await first.isVisible(), true)
  assert.equal(await page.getByRole('textbox', { name: 'Draft b', exact: true }).inputValue(), 'Edited in single mode')
  assert.deepEqual(await page.evaluate('window.mounts'), { a: 1, b: 1 })
  assert.deepEqual(await page.evaluate('window.unmounts'), {})
  await page.getByRole('button', { name: 'Close project panel: B', exact: true }).click()
  await page.getByRole('button', { name: 'Close project panel: A', exact: true }).click()
  assert.equal(await page.locator('[data-project-panel]').count(), 0)
  assert.equal(await page.getByRole('button', { name: 'Add project panel', exact: true }).isVisible(), true)
  assert.deepEqual(await page.evaluate('window.unmounts'), { b: 1, a: 1 })
  assert.deepEqual(errors, [])
})

test('pointer cancellation and touch grip movement keep project selection separate', { timeout: 30_000 }, async t => {
  const fixture = await fixtureBundle(), browser = await connectTestBrowser()
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, hasTouch: true })
  const errors = await install(page, fixture)
  await page.getByRole('button', { name: 'Add project panel', exact: true }).click()
  const grip = (await page.locator('[data-project-panel-handle="b"]').boundingBox())!
  await page.mouse.move(grip.x + 10, grip.y + 12); await page.mouse.down(); await page.mouse.move(200, 700, { steps: 6 })
  await page.keyboard.press('Escape'); await page.mouse.up()
  assert.deepEqual(await columns(page), [['a'], ['b']])
  assert.equal(await page.locator('.mew-project-board-drop').count(), 0)
  await finishPanelAnimations(page)
  const cdp = await page.context().newCDPSession(page)
  const point = { x: grip.x + 10, y: grip.y + 12 }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] })
  for (let step = 1; step <= 8; step++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x + (200 - point.x) * step / 8, y: point.y + (700 - point.y) * step / 8 }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()
  await paint(page)
  assert.deepEqual(await columns(page), [['a', 'b']])
  assert.deepEqual(await page.evaluate('window.selected'), [])
  assert.deepEqual(await page.evaluate('window.mounts'), { a: 1, b: 1 })
  assert.deepEqual(errors, [])
})

test('project panel follows its handle and both panels animate from their visual positions after dropping', { timeout: 30_000 }, async t => {
  const fixture = await fixtureBundle(), browser = await connectTestBrowser()
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } }), errors = await install(page, fixture)
  await page.getByRole('button', { name: 'Add project panel', exact: true }).click()
  const second = page.locator('[data-project-panel="b"]')
  await page.getByRole('textbox', { name: 'Draft b', exact: true }).fill('Unsent while moving')
  const initial = (await second.boundingBox())!, grip = (await page.locator('[data-project-panel-handle="b"]').boundingBox())!
  const start = { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 }, end = { x: 25, y: 200 }
  await page.mouse.move(start.x, start.y); await page.mouse.down()
  await page.mouse.move(end.x, end.y, { steps: 5 }); await paint(page)
  const dragged = (await second.boundingBox())!
  assert.ok(Math.abs(dragged.x - initial.x - (end.x - start.x)) < 2, 'panel tracks horizontal pointer motion')
  assert.ok(Math.abs(dragged.y - initial.y - (end.y - start.y)) < 2, 'panel tracks vertical pointer motion')
  await page.mouse.up()
  assert.deepEqual(await columns(page), [['b'], ['a']])
  const positions = await page.locator('[data-project-panel]').evaluateAll(elements => elements.map(element => {
    const animation = element.getAnimations()[0]
    if (!animation) return { id: element.getAttribute('data-project-panel'), animation: false }
    animation.pause()
    const duration = Number(animation.effect!.getComputedTiming().duration)
    const position = (time: number) => { animation.currentTime = time; const rect = element.getBoundingClientRect(); return { x: rect.x, y: rect.y } }
    return { id: element.getAttribute('data-project-panel'), animation: true, duration, start: position(0), middle: position(duration / 2), end: position(duration) }
  }))
  const a = positions.find(position => position.id === 'a')!, b = positions.find(position => position.id === 'b')!
  assert.ok(a.animation && a.start && a.middle && a.end, 'displaced panel animates')
  assert.ok(b.animation && b.start && b.middle && b.end, 'dragged panel animates to its destination')
  assert.ok(Math.abs(a.start.x) < 2, 'displaced panel starts at its original position')
  assert.ok(a.middle.x > a.start.x && a.middle.x < a.end.x, 'displaced panel interpolates between positions')
  assert.ok(Math.abs(b.start.x - dragged.x) < 2 && Math.abs(b.start.y - dragged.y) < 2, 'drop starts at the last visible drag position')
  assert.ok(b.middle.y < b.start.y && b.middle.y > b.end.y, 'dragged panel settles smoothly')
  await finishPanelAnimations(page)
  assert.equal(await page.getByRole('textbox', { name: 'Draft b', exact: true }).inputValue(), 'Unsent while moving')
  assert.deepEqual(await page.evaluate('window.mounts'), { a: 1, b: 1 })
  assert.deepEqual(errors, [])
})

test('panel remains under the pointer as the board scrolls during a drag', { timeout: 30_000 }, async t => {
  const fixture = await fixtureBundle(), browser = await connectTestBrowser()
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } }), errors = await install(page, fixture)
  const add = page.getByRole('button', { name: 'Add project panel', exact: true })
  await add.click(); await add.click(); await add.click()
  const board = page.locator('[data-project-board]'), second = page.locator('[data-project-panel="b"]')
  await board.evaluate(element => { element.scrollLeft = 0 })
  const original = (await second.boundingBox())!, grip = (await page.locator('[data-project-panel-handle="b"]').boundingBox())!
  const start = { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 }, end = { x: 1190, y: 200 }
  await page.mouse.move(start.x, start.y); await page.mouse.down()
  await page.mouse.move(end.x, end.y, { steps: 8 }); await page.mouse.move(end.x, end.y); await paint(page)
  const scroll = await board.evaluate(element => element.scrollLeft)
  assert.ok(scroll >= 32, 'dragging near the edge scrolls across the column boundary')
  const dragged = (await second.boundingBox())!
  assert.ok(Math.abs(dragged.x - original.x - (end.x - start.x)) < 2, 'scrolling does not pull the panel away from the pointer')
  assert.ok(Math.abs(dragged.y - original.y - (end.y - start.y)) < 2)
  const indicator = (await page.locator('.mew-project-board-drop').boundingBox())!
  assert.ok(Math.abs(indicator.x - (1212 - scroll)) < 2, 'indicator reflects the destination after scrolling')
  await page.mouse.up(); await finishPanelAnimations(page)
  assert.deepEqual(await columns(page), [['a'], ['c'], ['b'], ['d']], 'drop uses the destination shown after scrolling')
  assert.deepEqual(errors, [])
})

test('cancelled project panel movement returns smoothly without changing the board', { timeout: 30_000 }, async t => {
  const fixture = await fixtureBundle(), browser = await connectTestBrowser()
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } }), errors = await install(page, fixture)
  await page.getByRole('button', { name: 'Add project panel', exact: true }).click()
  const second = page.locator('[data-project-panel="b"]'), original = (await second.boundingBox())!
  const grip = (await page.locator('[data-project-panel-handle="b"]').boundingBox())!
  const start = { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 }
  await page.mouse.move(start.x, start.y); await page.mouse.down()
  await page.mouse.move(start.x - 150, start.y + 100, { steps: 4 }); await paint(page)
  const dragged = (await second.boundingBox())!
  await page.keyboard.press('Escape'); await page.mouse.up()
  assert.deepEqual(await columns(page), [['a'], ['b']])
  assert.equal(await page.locator('.mew-project-board-drop').count(), 0)
  const positions = await second.evaluate(element => {
    const animation = element.getAnimations()[0]
    if (!animation) return null
    animation.pause()
    const duration = Number(animation.effect!.getComputedTiming().duration)
    const position = (time: number) => { animation.currentTime = time; const rect = element.getBoundingClientRect(); return { x: rect.x, y: rect.y } }
    return { start: position(0), middle: position(duration / 2), end: position(duration) }
  })
  assert.ok(positions, 'cancelled panel animates back')
  assert.ok(Math.abs(positions.start.x - dragged.x) < 2 && Math.abs(positions.start.y - dragged.y) < 2)
  assert.ok(positions.middle.x > positions.start.x && positions.middle.x < positions.end.x)
  assert.ok(Math.abs(positions.end.x - original.x) < 2 && Math.abs(positions.end.y - original.y) < 2)
  await finishPanelAnimations(page)
  assert.deepEqual(errors, [])
})

test('reduced motion keeps direct dragging and keyboard moves without settling animations', { timeout: 30_000 }, async t => {
  const fixture = await fixtureBundle(), browser = await connectTestBrowser()
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, reducedMotion: 'reduce' }), errors = await install(page, fixture)
  await page.getByRole('button', { name: 'Add project panel', exact: true }).click()
  const second = page.locator('[data-project-panel="b"]'), before = (await second.boundingBox())!
  const grip = (await page.locator('[data-project-panel-handle="b"]').boundingBox())!
  const start = { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 }, end = { x: 25, y: 200 }
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y, { steps: 5 }); await paint(page)
  assert.ok(Math.abs((await second.boundingBox())!.x - before.x - (end.x - start.x)) < 2, 'direct pointer tracking remains available')
  await page.mouse.up(); await paint(page)
  assert.deepEqual(await columns(page), [['b'], ['a']])
  assert.equal(await page.locator('[data-project-panel]').evaluateAll(elements => elements.flatMap(element => element.getAnimations()).length), 0)
  const handle = page.getByRole('button', { name: 'Move project panel: B', exact: true })
  await handle.focus(); await handle.press('ArrowRight'); await paint(page)
  assert.deepEqual(await columns(page), [['b', 'a']])
  assert.equal(await page.locator('[data-project-panel]').evaluateAll(elements => elements.flatMap(element => element.getAnimations()).length), 0)
  assert.deepEqual(errors, [])
})

test('single mode can retain a project outside the saved board and add its existing host without losing drafts', { timeout: 20_000 }, async t => {
  const fixture = await fixtureBundle(), browser = await connectTestBrowser()
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }), errors = await install(page, fixture, '/?retained=1')
  assert.equal(await page.locator('[data-project-panel="x"]').isVisible(), false)
  await page.getByRole('button', { name: 'Open retained project', exact: true }).click()
  const draft = page.getByRole('textbox', { name: 'Draft x', exact: true })
  await draft.fill('Unsent retained project draft')
  assert.equal(await page.locator('[data-project-panel="a"]').isVisible(), false)
  assert.deepEqual(await columns(page), [['a']], 'single mode does not mutate the stored board')
  await page.getByRole('button', { name: 'Switch mode', exact: true }).click()
  assert.equal(await draft.isVisible(), false)
  assert.equal(await page.locator('[data-project-panel="a"]').isVisible(), true)
  await page.getByRole('button', { name: 'Add retained project', exact: true }).click()
  assert.deepEqual(await columns(page), [['a'], ['x']])
  assert.equal(await draft.isVisible(), true)
  assert.equal(await draft.inputValue(), 'Unsent retained project draft')
  assert.deepEqual(await page.evaluate('window.mounts'), { a: 1, x: 1 })
  assert.deepEqual(await page.evaluate('window.unmounts'), {})
  assert.deepEqual(errors, [])
})
