import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { chromium } from 'playwright-core'
import { domBrowserExecutable } from './browser-dom-executable.ts'

test('shared action data renders vertically or as an accessible horizontal icon menu with bounded tooltips and overflow', {
  skip: !domBrowserExecutable(), timeout: 45_000,
}, async t => {
  const repo = path.resolve(import.meta.dirname, '..')
  const source = `import React from 'react';import {createRoot} from 'react-dom/client';
import {ActionMenu,ActionMenuItem,ActionMenuSeparator,DialogFrame} from '@mew/ui';
import {Copy,PasteClipboard,Trash,Check} from 'iconoir-react';
window.actions=[];
function Fixture(){const [state,setState]=React.useState({open:false,orientation:'vertical',many:false,top:false,modal:false});const trigger=React.useRef(null);
const show=(orientation,many=false,top=false,modal=false)=>setState({open:true,orientation,many,top,modal});
const action=label=>()=>window.actions.push(label);
const controls=<><button ref={trigger} onClick={()=>show('vertical')}>Vertical</button><button onClick={()=>show('horizontal')}>Horizontal</button><button onClick={()=>show('horizontal',true)}>Many</button><button onClick={()=>show('horizontal',false,true)}>Top</button><button onClick={()=>show('horizontal',false,false,true)}>Modal</button>
{state.open&&<ActionMenu label="Shared actions" orientation={state.orientation} x={innerWidth-2} y={state.top?0:innerHeight-2} trigger={trigger.current} onClose={()=>setState(old=>({...old,open:false}))}>
<ActionMenuItem icon={<Copy/>} aria-label="Copy" hint="Ctrl+C" onClick={action('Copy')}>Copy</ActionMenuItem>
<ActionMenuItem icon={<PasteClipboard/>} data-tip="Unavailable in this document" disabled onClick={action('Unavailable')}>Unavailable</ActionMenuItem>
<ActionMenuSeparator/>
<ActionMenuItem icon={<Trash/>} aria-label="Delete" danger onClick={action('Delete')}><strong>Delete</strong></ActionMenuItem>
<ActionMenuItem icon={<Check/>} checked closeOnSelect={false} onClick={action('Toggle')}>Toggle</ActionMenuItem>
{state.many&&Array.from({length:40},(_,i)=><ActionMenuItem key={i} icon={<Copy/>} onClick={action('Extra '+i)}>{'Extra '+i}</ActionMenuItem>)}
</ActionMenu>}</>;
return state.modal?<DialogFrame className="max-w-md min-h-40 max-h-[90dvh] overflow-y-auto" labelledBy="title" onClose={()=>setState(old=>({...old,open:false,modal:false}))}><h2 id="title">Menu dialog</h2>{controls}</DialogFrame>:controls;
}createRoot(document.getElementById('root')).render(<Fixture/>);`
  const candidates = [source], styles: string[] = []
  const bundle = await build({ input: 'virtual:horizontal-menu.tsx', write: false, platform: 'browser', output: { format: 'iife' },
    onwarn(warning, warn) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning) },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
    plugins: [{ name: 'fixture', resolveId(id) { if (id === 'virtual:horizontal-menu.tsx') return id }, async load(id) {
      if (id === 'virtual:horizontal-menu.tsx') return source
      if (id.endsWith('.tsx')) candidates.push(await fs.readFile(id, 'utf8'))
      if (id.endsWith('.css')) { styles.push(await fs.readFile(id, 'utf8')); return { code: '', moduleType: 'js' } }
    } }],
  })
  const compiler = await compile(await fs.readFile(path.join(repo, 'src/index.css'), 'utf8'), { base: path.join(repo, 'src'), onDependency() {} })
  const css = compiler.build([...new Set(candidates.join('\n').match(/[A-Za-z0-9_@!:/.[\]()%,-]+/g))]) + styles.join('\n')
  const chunk = bundle.output.find(item => item.type === 'chunk')!
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  t.after(() => browser.close())
  for (const [width, theme] of [[1280, 'dark'], [390, 'light'], [320, 'dark']] as const) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, hasTouch: width < 768 })
    page.setDefaultTimeout(3000)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('http://mew-horizontal-menu.test/**', route => route.fulfill({ contentType: 'text/html',
      body: `<!doctype html><html class="${theme === 'dark' ? 'dark' : ''}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script>${chunk.code}</script></html>` }))
    await page.goto('http://mew-horizontal-menu.test/')
    const menu = page.getByRole('menu', { name: 'Shared actions' })
    const copy = menu.getByRole('menuitem', { name: 'Copy', exact: true })
    const unavailable = menu.getByRole('menuitem', { name: 'Unavailable', exact: true })
    const deletion = menu.getByRole('menuitem', { name: 'Delete', exact: true })
    const toggle = menu.getByRole('menuitemcheckbox', { name: 'Toggle', exact: true })
    await page.getByRole('button', { name: 'Vertical', exact: true }).click()
    await menu.waitFor()
    assert.equal(await menu.getAttribute('aria-orientation'), 'vertical')
    assert.ok((await copy.boundingBox())!.y < (await deletion.boundingBox())!.y)
    assert.equal(await copy.getAttribute('data-icon-only'), null)
    await page.keyboard.press('ArrowDown')
    await deletion.waitFor()
    assert.equal(await deletion.evaluate(el => el === el.ownerDocument.activeElement), true, 'vertical navigation still skips disabled actions')
    await page.keyboard.press('Escape')

    await page.getByRole('button', { name: 'Horizontal', exact: true }).click()
    await menu.waitFor()
    assert.equal(await menu.getAttribute('aria-orientation'), 'horizontal')
    const first = (await copy.boundingBox())!
    for (const item of [copy, unavailable, deletion, toggle]) {
      const box = (await item.boundingBox())!
      assert.equal(box.y, first.y)
      assert.equal(box.width, width < 768 ? 36 : 32)
      assert.equal(box.height, width < 768 ? 36 : 32)
      assert.equal(await item.getAttribute('data-icon-only'), 'true')
      assert.equal(await item.evaluate(el => [...el.querySelectorAll('.sr-only')].every(label => label.getBoundingClientRect().width <= 1)), true)
    }
    assert.equal(await menu.getByRole('separator').getAttribute('aria-orientation'), 'vertical')
    assert.equal(await toggle.getAttribute('aria-checked'), 'true')
    assert.equal(await unavailable.isDisabled(), true)
    await unavailable.hover()
    const tip = page.getByRole('tooltip')
    await tip.waitFor()
    assert.equal(await tip.textContent(), 'Unavailable in this document', 'disabled actions retain custom tooltip descriptions')
    assert.ok(Number(await tip.evaluate(el => el.ownerDocument.defaultView!.getComputedStyle(el).zIndex)) > Number(await menu.evaluate(el => el.ownerDocument.defaultView!.getComputedStyle(el).zIndex)))
    const tipBox = (await tip.boundingBox())!
    assert.ok(tipBox.y >= 0 && tipBox.y + tipBox.height <= 844)
    await page.mouse.move(0, 100)
    await tip.waitFor({ state: 'hidden' })
    await copy.dispatchEvent('pointerover', { pointerType: 'touch' })
    assert.equal(await tip.count(), 0, 'touch has no hover tooltip')
    await page.keyboard.press('ArrowRight')
    assert.equal(await deletion.evaluate(el => el === el.ownerDocument.activeElement), true)
    await page.keyboard.press('End')
    assert.equal(await toggle.evaluate(el => el === el.ownerDocument.activeElement), true)
    await page.keyboard.press('Enter')
    assert.equal(await menu.isVisible(), true, 'closeOnSelect is shared in either orientation')
    await page.keyboard.press('Home')
    await page.keyboard.press('Enter')
    await menu.waitFor({ state: 'hidden' })
    assert.deepEqual(await page.evaluate('window.actions'), ['Toggle', 'Copy'])

    await page.getByRole('button', { name: 'Many', exact: true }).click()
    await menu.waitFor()
    assert.equal(await menu.evaluate(el => el.scrollWidth > el.clientWidth), true)
    await page.keyboard.press('End')
    const last = menu.getByRole('menuitem', { name: 'Extra 39', exact: true })
    assert.equal(await last.evaluate(el => el === el.ownerDocument.activeElement), true)
    const lastBox = (await last.boundingBox())!, menuBox = (await menu.boundingBox())!
    assert.ok(lastBox.x >= menuBox.x && lastBox.x + lastBox.width <= menuBox.x + menuBox.width + 1, 'keyboard navigation reveals overflowing icons')
    assert.ok(menuBox.x >= 0 && menuBox.x + menuBox.width <= width)
    if (process.env.MEW_HORIZONTAL_MENU_SCREENSHOT_DIR) {
      await fs.mkdir(process.env.MEW_HORIZONTAL_MENU_SCREENSHOT_DIR, { recursive: true })
      await page.screenshot({ path: `${process.env.MEW_HORIZONTAL_MENU_SCREENSHOT_DIR}/${width}-${theme}-overflow.png` })
    }
    await page.keyboard.press('Escape')

    await page.getByRole('button', { name: 'Top', exact: true }).click()
    await copy.hover()
    await tip.waitFor()
    const topTip = (await tip.boundingBox())!
    assert.ok(topTip.y >= 0 && topTip.y + topTip.height <= 844, 'top-edge tooltip flips into view')
    if (process.env.MEW_HORIZONTAL_MENU_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.MEW_HORIZONTAL_MENU_SCREENSHOT_DIR}/${width}-${theme}-top.png` })
    await page.keyboard.press('Escape')

    await page.getByRole('button', { name: 'Modal', exact: true }).click()
    await copy.hover()
    await tip.waitFor()
    assert.equal(await tip.evaluate(el => !!el.closest('[role="dialog"]')), true, 'tooltip stays in the menu portal container')
    await page.keyboard.press('Escape')
    assert.equal(await page.getByRole('dialog').isVisible(), true, 'closing a menu preserves its dialog')
    await page.keyboard.press('Escape')
    assert.deepEqual(errors, [])
    await page.close()
  }
})
