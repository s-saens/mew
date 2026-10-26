import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import fs from 'node:fs/promises'
import { build } from 'rolldown'
import { chromium } from 'playwright-core'
import { domBrowserExecutable } from './browser-dom-executable.ts'

const root = path.resolve(import.meta.dirname, '..')

test('tab strips smoothly reveal new, selected and focused tabs without moving their surroundings', { skip: !domBrowserExecutable(), timeout: 30_000 }, async t => {
  const source = `
import React from '${root}/node_modules/react/index.js';
import {createRoot} from '${root}/node_modules/react-dom/client.js';
import {TabBar} from '${root}/src/components/TabBar.tsx';
import {useTabAutoScroll} from '${root}/packages/ui/src/use-tab-auto-scroll.ts';
import {activateNumberedPanelTab} from '${root}/src/utils/numbered-panel-tabs.ts';
const initial=Array.from({length:5},(_,i)=>({id:String(i+1),path:'document-'+(i+1)+'.md',preview:false}));
function Fixture(){
  const [tabs,setTabs]=React.useState(initial),[active,setActive]=React.useState('1');
  const [selected,setSelected]=React.useState(1),[picker,setPicker]=React.useState(false);
  const ref=useTabAutoScroll();
  window.addTab=()=>{setTabs(t=>[...t,{id:'6',path:'document-6.md',preview:false}]);setActive('6')};
  window.selectTab=id=>setActive(id);
  window.selectOther=id=>{setPicker(false);setSelected(id)};
  window.openPicker=()=>setPicker(true);
  React.useEffect(()=>{const key=e=>{if(e.ctrlKey&&e.key==='1'){e.preventDefault();activateNumberedPanelTab(document.querySelector('#editor'),0)}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[]);
  return <><section id="editor" data-dock-panel="editor:test"><div data-dock-tab-bar><TabBar tabs={tabs} activeId={active} activePath={null} presence={{}} onActivate={(_,id)=>setActive(id)} onPin={()=>{}} onClose={(_,id)=>{setTabs(t=>t.filter(v=>v.id!==id));setActive('1')}} onReorder={()=>{}}/></div><textarea id="input"/></section>
    <div id="other" ref={ref} className="strip">{Array.from({length:8},(_,i)=><button key={i} role="tab" aria-selected={!picker&&selected===i+1} onClick={()=>{setPicker(false);setSelected(i+1)}}>View {i+1}</button>)}<button data-tab-scroll-active={picker} onClick={()=>setPicker(true)}>+</button></div></>
}
createRoot(document.getElementById('root')).render(<React.StrictMode><Fixture/></React.StrictMode>);`
  const bundle = await build({
    onwarn(warning, warn) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning) },
    input: 'virtual:tab-auto-scroll.tsx', write: false, platform: 'browser', output: { format: 'iife' },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
    plugins: [{ name: 'tab-auto-scroll-fixture', resolveId(id) { if (id === 'virtual:tab-auto-scroll.tsx') return id }, load(id) { if (id === 'virtual:tab-auto-scroll.tsx') return source; if (id.endsWith('.css')) return { code: '', moduleType: 'js' } } }],
  })
  const code = bundle.output.filter(item => item.type === 'chunk').map(item => item.code).join('\n')
  const css = (await Promise.all(['tab-auto-scroll.css', 'tab-scroll-area.css'].map(file => fs.readFile(`${root}/packages/ui/src/${file}`, 'utf8')))).join('\n')
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  t.after(() => browser.close())
  for (const width of [960, 390]) {
    await t.test(`${width}px viewport`, async () => {
      const page = await browser.newPage({ viewport: { width, height: 600 }, hasTouch: width < 500 })
      page.setDefaultTimeout(3000)
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.setContent(`<!doctype html><style>
        ${css}
        body { margin:0; padding-top:160px; min-height:1200px }
        #root { margin-left:12px; width:340px }
        #editor > [data-dock-tab-bar] > div { display:flex; width:340px; height:36px }
        #editor .mew-tab-scroll-area { flex:1; min-width:0; height:36px }
        #editor .mew-tab-scroll-viewport, .strip { display:flex; min-width:0; overflow-x:auto; height:36px }
        #editor [role=tab], .strip button { box-sizing:border-box; flex-shrink:0; width:130px; height:36px; white-space:nowrap }
        #other { width:340px; margin-top:80px; border:3px solid black; padding:0 6px }
      </style><div id="root"></div>`)
      await page.addScriptTag({ content: code })
      const strip = page.locator('#editor [role=tab]').first().locator('..')
      const other = page.locator('#other')
      const visible = async (selector: string) => page.locator(selector).evaluate(el => {
        const bar = el.parentElement!, viewport = bar.getBoundingClientRect(), box = el.getBoundingClientRect()
        const left = viewport.left + bar.clientLeft
        return box.left >= left - 1 && box.right <= left + bar.clientWidth + 1
      })
      const until = async (check: () => Promise<boolean>) => {
        for (let attempt = 0; attempt < 150; attempt++) {
          if (await check()) return
          await page.waitForTimeout(20)
        }
        assert.fail('tab scroll did not reach its expected position')
      }
      await strip.waitFor()
      await page.locator('#input').focus()
      await page.evaluate('window.scrollTo(0, 100); window.addTab()')
      await until(() => page.locator('[data-editor-tab-id="6"]').evaluate(tab => {
        const bar = tab.parentElement!
        return bar.scrollLeft > 0 && tab.getBoundingClientRect().right > bar.getBoundingClientRect().right + 1
      }))
      assert.equal(await page.locator('#input').evaluate(el => el === el.ownerDocument.activeElement), true, 'opening a tab preserves input focus')
      await until(() => visible('[data-editor-tab-id="6"]'))
      assert.equal(await visible('[data-editor-tab-id="6"]'), true)
      assert.equal(await page.evaluate('window.scrollY'), 100, 'only the tab strip scrolls')
      await page.keyboard.press('Control+1')
      await until(() => strip.evaluate(el => el.scrollLeft < 1))
      assert.equal(await visible('[data-editor-tab-id="1"]'), true)
      await strip.evaluate(el => el.scrollTo({ left: 400, behavior: 'instant' }))
      await page.keyboard.press('Control+1')
      await until(() => visible('[data-editor-tab-id="1"]'))
      await page.evaluate('window.selectTab("2")')
      await strip.evaluate(el => new Promise<void>(resolve => el.ownerDocument.defaultView!.requestAnimationFrame(() => resolve())))
      assert.ok(await strip.evaluate(el => el.scrollLeft) < 1, 'a tab already in view does not move the strip')

      await page.evaluate('window.selectTab("6")')
      await strip.evaluate(el => new Promise<void>(resolve => el.ownerDocument.defaultView!.requestAnimationFrame(() => resolve())))
      await page.evaluate('window.selectTab("1")')
      await page.waitForTimeout(500)
      assert.ok(await strip.evaluate(el => el.scrollLeft) < 1, 'rapid switches cancel the previous smooth destination')

      await other.getByRole('tab', { name: 'View 8', exact: true }).evaluate(el => el.focus({ preventScroll: true }))
      await until(() => visible('#other > :nth-child(8)'))
      assert.equal(await visible('#other > :nth-child(8)'), true, 'DOM focus reveals an unselected tab')
      await other.getByRole('tab', { name: 'View 1', exact: true }).evaluate(el => el.focus())
      await until(() => visible('#other > :first-child'))
      assert.equal(await other.evaluate(el => el.ownerDocument.defaultView!.getComputedStyle(el).scrollBehavior), 'smooth', 'native keyboard focus uses the same smooth strip behavior')
      await page.evaluate('window.openPicker()')
      await until(() => visible('#other > :last-child'))
      assert.equal(await visible('#other > :last-child'), true, 'the virtual new-tab picker is revealed')

      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.evaluate('window.selectOther(1)')
      await until(() => visible('#other > :first-child'))
      await page.evaluate('window.selectOther(8)')
      await other.evaluate(el => new Promise<void>(resolve => el.ownerDocument.defaultView!.requestAnimationFrame(() => el.ownerDocument.defaultView!.requestAnimationFrame(() => resolve()))))
      assert.equal(await visible('#other > :nth-child(8)'), true, 'reduced motion reveals immediately')
      await other.evaluate(el => { el.style.width = '160px' })
      await until(() => visible('#other > :nth-child(8)'))
      assert.equal(await visible('#other > :nth-child(8)'), true, 'resizing keeps the active tab visible')

      await other.evaluate(el => { el.style.display = 'none' })
      await page.evaluate('window.selectOther(1)')
      await other.evaluate(el => { el.style.display = 'flex' })
      await until(() => visible('#other > :first-child'))
      assert.equal(await visible('#other > :first-child'), true, 'a restored hidden strip reveals its active tab')
      const beforeDrag = await other.evaluate(el => el.scrollLeft)
      await other.evaluate(el => { el.firstElementChild!.setAttribute('data-tab-drag-placeholder', '') })
      await page.evaluate('window.selectOther(8)')
      await page.waitForTimeout(80)
      assert.equal(await other.evaluate(el => el.scrollLeft), beforeDrag, 'automatic reveal yields during a drag')
      await other.evaluate(el => el.firstElementChild!.removeAttribute('data-tab-drag-placeholder'))
      await until(() => other.evaluate(el => el.scrollLeft > 100))
      assert.equal(await visible('#other > :nth-child(8)'), true)
      assert.equal(await page.evaluate('window.scrollY'), 100)
      if (width === 960) {
        const first = await page.locator('[data-editor-tab-id="1"]').boundingBox()
        const bounds = (await strip.boundingBox())!
        await page.mouse.move(first!.x + 30, first!.y + 18)
        await page.mouse.down()
        await page.mouse.move(bounds.x + bounds.width + 20, first!.y + 18, { steps: 8 })
        await strip.evaluate(el => new Promise<void>(resolve => {
          let frames = 0
          const step = () => { if (++frames === 12) resolve(); else el.ownerDocument.defaultView!.requestAnimationFrame(step) }
          el.ownerDocument.defaultView!.requestAnimationFrame(step)
        }))
        assert.ok(await strip.evaluate(el => el.scrollLeft) > 100, 'drag edge scrolling stays immediate despite native smooth focus')
        await page.mouse.up()
      }
      assert.deepEqual(errors, [])
      await page.close()
    })
  }
})
