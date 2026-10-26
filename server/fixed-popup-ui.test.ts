import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { chromium, type Locator, type Page } from 'playwright-core'
import { domBrowserExecutable } from './browser-dom-executable.ts'

const root = path.resolve(import.meta.dirname, '..')

async function assertVisibleItems(menu: Locator, selector: string) {
  const hits = await menu.evaluate((element, itemSelector) => {
    const rect = element.getBoundingClientRect()
    return Array.from<typeof element>(element.querySelectorAll(itemSelector)).flatMap(item => {
      const box = item.getBoundingClientRect()
      const top = Math.max(rect.top + 2, box.top), bottom = Math.min(rect.bottom - 2, box.bottom)
      if (bottom - top < 6) return []
      const hit = element.ownerDocument.elementFromPoint((box.left + box.right) / 2, (top + bottom) / 2)
      return [{ text: item.textContent, reachable: !!hit && item.contains(hit) }]
    })
  }, selector)
  assert.ok(hits.length > 0, 'the popup has visible items')
  assert.ok(hits.every(item => item.reachable), `visible items receive pointer input: ${JSON.stringify(hits)}`)
}

async function assertSelectPosition(page: Page, direction: 'above' | 'below', clipped: boolean) {
  const field = page.getByRole('combobox', { name: 'Folder order' })
  const menu = page.getByRole('listbox', { name: 'Folder order' })
  await menu.waitFor()
  const trigger = await field.boundingBox(), popup = await menu.boundingBox()
  assert.ok(trigger && popup)
  assert.ok(Math.abs(popup.x - trigger.x) < 1, `popup starts at the trigger: ${JSON.stringify({ trigger, popup })}`)
  assert.ok(Math.abs(popup.width - trigger.width) < 1, 'popup preserves trigger width')
  const gap = direction === 'below' ? popup.y - trigger.y - trigger.height : trigger.y - popup.y - popup.height
  assert.ok(Math.abs(gap - 4) < 1, `${page.url()}: ${direction} popup keeps a 4px anchor gap; got ${gap}`)
  if (clipped) {
    const bounds = await page.locator('#dialog').evaluate(element => {
      const rect = element.getBoundingClientRect()
      const scaleX = rect.width / element.offsetWidth, scaleY = rect.height / element.offsetHeight
      return { left: rect.left + element.clientLeft * scaleX, top: rect.top + element.clientTop * scaleY,
        right: rect.left + (element.clientLeft + element.clientWidth) * scaleX,
        bottom: rect.top + (element.clientTop + element.clientHeight) * scaleY }
    })
    assert.ok(popup.x >= bounds.left && popup.x + popup.width <= bounds.right)
    assert.ok(popup.y >= bounds.top && popup.y + popup.height <= bounds.bottom,
      `popup stays inside the clipping dialog: ${JSON.stringify({ bounds, popup })}`)
  }
  assert.equal(await menu.evaluate(element => element.closest('[role="dialog"]')?.id), 'dialog', 'popup stays within modal focus scope')
  await assertVisibleItems(menu, '[role="option"]')
}

test('modal selects and action menus keep viewport anchors through blur, borders, scrolling and nested portals', { skip: !domBrowserExecutable(), timeout: 30_000 }, async () => {
  const source = `import React,{useLayoutEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {SelectField} from '${root}/packages/ui/src/select-field.tsx';
import {ActionMenu,ActionMenuItem} from '${root}/packages/ui/src/action-menu.tsx';
import {HoverTipLayer} from '${root}/packages/ui/src/HoverTipLayer.tsx';
const params=new URLSearchParams(location.search),effect=params.get('effect')||'none';
const bottom=params.has('bottom'),nested=params.has('nested'),scroll=params.has('scroll')?72:0;
const options=Array.from({length:9},(_,index)=>({value:String(index),label:'Folder '+index}));
function Fixture(){
 const [host,setHost]=useState(null),[portal,setPortal]=useState(null),[value,setValue]=useState('0'),[action,setAction]=useState(null);
 useLayoutEffect(()=>{if(host)host.scrollTop=scroll},[host]);
 return <div id="dialog" role="dialog" aria-label="File explorer" ref={setHost} data-effect={effect}>
  <div className="content"><div id="portal" ref={setPortal}/>
   <div className="field-slot" style={{top:(bottom?290:22)+scroll}}>
    <SelectField label="Folder order" value={value} options={options} onChange={setValue} portalContainer={nested?portal:host}/>
    <button id="actions" onClick={event=>{const rect=event.currentTarget.getBoundingClientRect();setAction({x:rect.left,y:rect.bottom,trigger:event.currentTarget})}}>Actions</button>
    <HoverTipLayer placement="bottom" portalTarget={nested?portal:host}><button id="help" data-tip="Order options">Help</button></HoverTipLayer>
   </div>
  </div>
  {action&&<ActionMenu {...action} portalContainer={nested?portal:host} label="File actions" onClose={()=>setAction(null)}>
   {options.map(option=><ActionMenuItem key={option.value} onClick={()=>setValue(option.value)}>{option.label}</ActionMenuItem>)}
  </ActionMenu>}
  <output>{value}</output>
 </div>
}
createRoot(document.getElementById('root')).render(<Fixture/>);`
  const bundle = await build({ input: 'virtual:fixed-popup.tsx', write: false, platform: 'browser', output: { format: 'iife' }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } }, plugins: [{
    name: 'fixture', resolveId(id) { if (id === 'virtual:fixed-popup.tsx') return id; if (id.endsWith('.css')) return 'virtual:style' },
    load(id) { if (id === 'virtual:fixed-popup.tsx') return source; if (id === 'virtual:style') return '' },
  }] })
  const chunk = bundle.output.find(item => item.type === 'chunk'); assert.ok(chunk)
  const components = (await Promise.all(['select-field.tsx', 'HoverTipLayer.tsx'].map(file => fs.readFile(path.join(root, 'packages/ui/src', file), 'utf8')))).join('\n')
  const compiler = await compile(await fs.readFile(path.join(root, 'src/index.css'), 'utf8'), { base: path.join(root, 'src'), onDependency() {} })
  const css = compiler.build([...new Set((source + components).match(/[A-Za-z0-9_@:/.[\]()%,-]+/g))])
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 800 } })
    page.setDefaultTimeout(3000)
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
    await page.route('http://mew-fixed-popup.test/**', route => route.fulfill(new URL(route.request().url()).pathname === '/app.js'
      ? { contentType: 'text/javascript', body: chunk.code }
      : { contentType: 'text/html', body: `<!doctype html><html class="dark"><meta charset="utf-8"><style>${css}
        body{margin:0}#dialog{position:absolute;left:230px;top:130px;width:460px;height:360px;border:5px solid #777;overflow:auto;background:#ddd}
        .content{position:relative;height:750px}.field-slot{position:absolute;left:22px;width:180px}#actions{margin-top:6px}#help{margin-left:90px}
        #dialog[data-effect="blur"]{backdrop-filter:blur(6px)}#dialog[data-effect="filter"]{filter:brightness(1)}
        #dialog[data-effect="translate"]{transform:translate(37px,19px)}
        #dialog[data-effect="scale"]{transform:translate(37px,19px) scale(.9)}
        html:not(.dark) #dialog[data-effect="theme"]{backdrop-filter:blur(6px)}
        @media(max-width:767px){#dialog{left:16px;top:80px;width:calc(100vw - 32px)}}
      </style><div id="root"></div><script src="/app.js"></script></html>` }))
    for (const effect of ['none', 'blur', 'filter', 'translate', 'scale']) {
      for (const bottom of [false, true]) {
        for (const nested of [false, true]) {
          const query = new URLSearchParams({ effect, ...(bottom ? { bottom: '' } : {}), ...(nested ? { nested: '' } : {}), scroll: '' })
          await page.goto(`http://mew-fixed-popup.test/?${query}`)
          const field = page.getByRole('combobox', { name: 'Folder order' })
          await field.click()
          await assertSelectPosition(page, bottom && effect !== 'none' ? 'above' : 'below', effect !== 'none')
          if (effect === 'blur' && !bottom && nested) {
            await page.locator('#dialog').evaluate(element => { element.scrollTop += 12 })
            await page.getByRole('listbox').evaluate(element => new Promise<void>(resolve => {
              const view = element.ownerDocument.defaultView!
              view.requestAnimationFrame(() => view.requestAnimationFrame(() => resolve()))
            }))
            await assertSelectPosition(page, 'below', true)
          }
          await page.getByRole('option', { name: 'Folder 1', exact: true }).click()
          assert.equal(await field.getAttribute('aria-expanded'), 'false')
          assert.equal(await page.locator('output').textContent(), '1')
          assert.equal(await field.evaluate(element => element.ownerDocument.activeElement === element), true)
          await page.locator('#actions').click()
          const menu = page.getByRole('menu', { name: 'File actions' })
          await menu.waitFor()
          await assertVisibleItems(menu, '[role="menuitem"]')
          await page.keyboard.press('Escape')
          if (!bottom) {
            await page.locator('#help').hover()
            const tooltip = page.getByRole('tooltip')
            await tooltip.waitFor()
            const help = await page.locator('#help').boundingBox(), tip = await tooltip.boundingBox()
            assert.ok(help && tip)
            assert.ok(Math.abs(tip.y - help.y - help.height - 6) < 1, 'tooltip retains its 6px gap inside the scrolled host')
            assert.ok(Math.abs(tip.x + tip.width / 2 - help.x - help.width / 2) < 1, 'tooltip remains centered on its trigger')
          }
        }
      }
    }
    await page.goto('http://mew-fixed-popup.test/?effect=theme&bottom&scroll&nested')
    await page.getByRole('combobox', { name: 'Folder order' }).click()
    await assertSelectPosition(page, 'below', false)
    await page.locator('html').evaluate(element => element.classList.remove('dark'))
    await page.getByRole('listbox').evaluate(element => new Promise<void>(resolve => element.ownerDocument.defaultView!.requestAnimationFrame(() => resolve())))
    await assertSelectPosition(page, 'above', true)
    for (const width of [1100, 390]) for (const dark of [false, true]) {
      await page.setViewportSize({ width, height: 800 })
      await page.goto('http://mew-fixed-popup.test/?effect=blur&nested&scroll')
      await page.locator('html').evaluate((element, isDark) => element.classList.toggle('dark', isDark), dark)
      await page.getByRole('combobox', { name: 'Folder order' }).click()
      await assertSelectPosition(page, 'below', true)
      if (process.env.MEW_FIXED_POPUP_SCREENSHOTS) {
        await fs.mkdir(process.env.MEW_FIXED_POPUP_SCREENSHOTS, { recursive: true })
        await page.screenshot({ path: path.join(process.env.MEW_FIXED_POPUP_SCREENSHOTS, `popup-${width}-${dark ? 'dark' : 'light'}.png`) })
      }
    }
    assert.deepEqual(errors, [])
  } finally { await browser.close() }
})
