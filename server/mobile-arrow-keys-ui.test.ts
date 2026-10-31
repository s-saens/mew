import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { chromium } from 'playwright-core'
import { domBrowserExecutable } from './browser-dom-executable.ts'

test('mobile arrows press on contact, repeat while held, and track mouse and captured touch drags', {
  skip: !domBrowserExecutable(), timeout: 45_000,
}, async t => {
  const root = path.resolve(import.meta.dirname, '..')
  const source = `import React from 'react';import {createRoot} from 'react-dom/client';
import {MobileKeyBar} from '${root}/packages/mobile-keys/src/MobileKeyBar.tsx';
import {useMobilePanelSwipe} from '${root}/src/hooks/use-mobile-panel-swipe.ts';
window.arrows=[];window.otherKeys=0;window.swipes=0;
function Fixture(){const [visible,setVisible]=React.useState(true);window.hideKeys=()=>setVisible(false);
 const swipe=useMobilePanelSwipe(()=>window.swipes++),other=()=>window.otherKeys++;
 return <div ref={swipe} data-workspace-panel="editor" data-mobile-tab-swipe="key-bar" style={{height:'100dvh',display:'flex',flexDirection:'column'}}>
 <textarea data-editor defaultValue="Preserve this selected text" style={{height:100}}/>
 <div data-neutral onPointerDown={event=>event.preventDefault()} style={{flex:1}}>Neutral space</div>
 {visible&&<MobileKeyBar placement={new URLSearchParams(location.search).get('placement')} stretch ctrlActive={false} shiftActive={false}
 onToggleCtrl={other} onToggleShift={other} onEsc={other} onTab={other} onArrow={direction=>window.arrows.push(direction)}/>}</div>}
createRoot(document.getElementById('root')).render(<React.StrictMode><Fixture/></React.StrictMode>);`
  const candidates = [source]
  const bundle = await build({
    input: 'virtual:mobile-arrows.tsx', write: false, platform: 'browser', output: { format: 'esm', codeSplitting: false },
    onwarn(warning, warn) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning) },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
    plugins: [{ name: 'fixture', resolveId(id) { if (id === 'virtual:mobile-arrows.tsx') return id }, async load(id) {
      if (id === 'virtual:mobile-arrows.tsx') return source
      if (id.endsWith('.tsx')) candidates.push(await fs.readFile(id, 'utf8'))
      if (id.endsWith('.css')) return { code: '', moduleType: 'js' }
    } }],
  })
  const compiler = await compile(await fs.readFile(path.join(root, 'src/index.css'), 'utf8'), { base: path.join(root, 'src'), onDependency() {} })
  const css = compiler.build([...new Set(candidates.join('\n').match(/[A-Za-z0-9_@!:/.[\]()%,-]+/g))])
  const entry = bundle.output.find(item => item.type === 'chunk' && item.isEntry)!
  assert.ok(entry.type === 'chunk')
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  t.after(() => browser.close())

  for (const placement of ['fixed', 'flow']) await t.test(placement, async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 700 }, hasTouch: true })
    page.setDefaultTimeout(3000)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('http://mew-mobile-arrows.test/**', route => route.fulfill(new URL(route.request().url()).pathname === '/app.js'
      ? { contentType: 'text/javascript', body: entry.code }
      : { contentType: 'text/html', body: `<!doctype html><html class="dark"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}\nhtml,body,#root{height:100%;margin:0}</style><div id="root"></div><script type="module" src="/app.js"></script></html>` }))
    await page.goto(`http://mew-mobile-arrows.test/?placement=${placement}`)
    const arrow = (direction: string) => page.locator(`[data-mobile-arrow="${direction}"]`)
    await arrow('left').waitFor()
    await page.clock.install()
    await page.clock.pauseAt(new Date(Date.now() + 1000))
    const point = async (direction: string) => {
      const box = (await arrow(direction).boundingBox())!
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    }
    const left = await point('left'), right = await point('right'), up = await point('up')
    const neutral = { x: 20, y: 200 }
    const events = () => page.evaluate<string[]>('window.arrows')
    const clear = () => page.evaluate('window.arrows=[]')
    const editor = page.locator('[data-editor]')
    await editor.evaluate(el => { const input = el.ownerDocument.querySelector('textarea')!; input.focus(); input.setSelectionRange(9, 13) })
    const preserved = () => editor.evaluate(el => {
      const input = el.ownerDocument.querySelector('textarea')!
      return { focused: input === el.ownerDocument.activeElement, start: input.selectionStart, end: input.selectionEnd }
    })

    await page.mouse.move(left.x, left.y)
    await page.mouse.down()
    assert.deepEqual(await events(), ['left'], 'pointerdown moves immediately, before release')
    await page.clock.runFor(349)
    assert.deepEqual(await events(), ['left'], 'holding waits for the repeat delay')
    await page.clock.runFor(121)
    assert.deepEqual(await events(), ['left', 'left', 'left', 'left'], 'holding repeats every 60ms after 350ms')
    await page.mouse.move(up.x, up.y)
    assert.equal((await events()).at(-1), 'up', 'a pressed mouse immediately activates the arrow it enters')
    await page.mouse.move(neutral.x, neutral.y)
    const paused = await events()
    await page.clock.runFor(500)
    assert.deepEqual(await events(), paused, 'leaving the arrows pauses repetition')
    await page.mouse.move(right.x, right.y)
    assert.deepEqual(await events(), [...paused, 'right'], 'reentering an arrow immediately starts a new press')
    await page.mouse.up()
    const released = await events()
    await page.clock.runFor(500)
    assert.deepEqual(await events(), released, 'release stops repetition and its click does not press again')
    assert.deepEqual(await preserved(), { focused: true, start: 9, end: 13 }, 'arrows preserve editor focus and selection')

    await clear()
    await page.mouse.move(neutral.x, neutral.y)
    await page.mouse.down()
    await page.mouse.move(left.x, left.y)
    assert.deepEqual(await events(), ['left'], 'a pointer already pressed elsewhere activates an entered arrow')
    const ctrl = (await page.getByRole('button', { name: 'Ctrl', exact: true }).boundingBox())!
    await page.mouse.move(ctrl.x + ctrl.width / 2, ctrl.y + ctrl.height / 2)
    await page.mouse.up()
    assert.equal(await page.evaluate('window.otherKeys'), 0, 'dragging across ordinary keys never activates them')
    await page.mouse.move(left.x, left.y)
    await page.mouse.down({ button: 'right' })
    await page.mouse.up({ button: 'right' })
    assert.deepEqual(await events(), ['left'], 'secondary mouse buttons do not move the cursor')

    await clear()
    const cdp = await page.context().newCDPSession(page)
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', points: Array<{ x: number; y: number }>) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points })
    await touch('touchStart', [left])
    assert.deepEqual(await events(), ['left'], 'real touch moves immediately on contact')
    await touch('touchMove', [right])
    assert.deepEqual(await events(), ['left', 'right'], 'touch follows hit coordinates despite implicit pointer capture')
    await page.clock.runFor(350)
    assert.deepEqual(await events(), ['left', 'right', 'right'])
    await touch('touchCancel', [])
    const cancelled = await events()
    await page.clock.runFor(500)
    assert.deepEqual(await events(), cancelled, 'touch cancellation stops repetition')
    assert.equal(await page.evaluate('window.swipes'), 0, 'an arrow drag never switches editor tabs')
    await clear()
    await touch('touchStart', [up])
    await touch('touchEnd', [])
    assert.deepEqual(await events(), ['up'], 'the compatibility click after a touch does not duplicate the press')
    assert.deepEqual(await preserved(), { focused: true, start: 9, end: 13 })

    await clear()
    await arrow('left').focus()
    await page.keyboard.press('Enter')
    await page.keyboard.press('Space')
    await arrow('right').dispatchEvent('click', { detail: 0 })
    assert.deepEqual(await events(), ['left', 'left', 'right'], 'keyboard and assistive clicks retain normal button behavior')

    for (const signal of ['blur', 'hidden', 'unmount']) {
      await clear()
      await page.mouse.move(left.x, left.y)
      await page.mouse.down()
      assert.deepEqual(await events(), ['left'])
      if (signal === 'blur') await page.evaluate('window.dispatchEvent(new Event("blur"))')
      if (signal === 'hidden') await page.locator('html').evaluate(el => {
        const doc = el.ownerDocument
        Object.defineProperty(doc, 'visibilityState', { configurable: true, value: 'hidden' })
        doc.dispatchEvent(new doc.defaultView!.Event('visibilitychange'))
      })
      if (signal === 'unmount') {
        await page.evaluate('window.hideKeys()')
        await arrow('left').waitFor({ state: 'detached' })
      }
      await page.clock.runFor(500)
      assert.deepEqual(await events(), ['left'], `${signal} stops pending arrow repetition`)
      await page.mouse.up()
      if (signal === 'hidden') await page.locator('html').evaluate(el => Reflect.deleteProperty(el.ownerDocument, 'visibilityState'))
    }
    assert.deepEqual(errors, [])
    await page.close()
  })
})
