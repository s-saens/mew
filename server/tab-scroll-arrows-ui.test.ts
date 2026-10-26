import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { chromium } from 'playwright-core'
import { domBrowserExecutable } from './browser-dom-executable.ts'

const root = path.resolve(import.meta.dirname, '..')

test('tab chevrons overlay overflowing edges and scroll half the strip without changing focus or selection', { skip: !domBrowserExecutable(), timeout: 30_000 }, async t => {
  const source = `import React from '${root}/node_modules/react/index.js';
import {createRoot} from '${root}/node_modules/react-dom/client.js';
import {TabBar} from '${root}/src/components/TabBar.tsx';
import {setUiLocale} from '${root}/packages/ui/src/i18n-core.ts';
function Fixture(){
  const [count,setCount]=React.useState(10),[active,setActive]=React.useState('1');
  window.setCount=setCount;window.selectTab=setActive;window.setLocale=setUiLocale;
  const tabs=Array.from({length:count},(_,i)=>({id:String(i+1),path:'note-'+(i+1)+'.md',preview:false}));
  return <section><div id="tabs"><TabBar tabs={tabs} activeId={active} activePath={null} presence={{}} onActivate={(_,id)=>setActive(id)} onPin={()=>{}} onClose={()=>{}} onReorder={()=>{}}/></div><textarea id="input" aria-label="Draft" defaultValue="Keep writing here"/></section>
}
createRoot(document.getElementById('root')).render(<React.StrictMode><Fixture/></React.StrictMode>);`
  const bundle = await build({
    input: 'virtual:tab-scroll-arrows.tsx', write: false, platform: 'browser', output: { format: 'iife' },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
    onwarn(warning, warn) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning) },
    plugins: [{ name: 'tab-scroll-arrows-fixture', resolveId(id) { if (id === 'virtual:tab-scroll-arrows.tsx') return id }, load(id) { if (id === 'virtual:tab-scroll-arrows.tsx') return source; if (id.endsWith('.css')) return { code: '', moduleType: 'js' } } }],
  })
  const code = bundle.output.filter(item => item.type === 'chunk').map(item => item.code).join('\n')
  const sources = await Promise.all(['src/components/TabBar.tsx', 'packages/ui/src/tab-scroll-area.tsx'].map(file => fs.readFile(`${root}/${file}`, 'utf8')))
  const compiler = await compile(await fs.readFile(`${root}/src/index.css`, 'utf8'), { base: `${root}/src`, onDependency() {} })
  const css = compiler.build([...new Set((source + sources.join('\n')).match(/[A-Za-z0-9_@:/.[\]()%,-]+/g))])
  const autoCss = await fs.readFile(`${root}/packages/ui/src/tab-auto-scroll.css`, 'utf8')
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  t.after(() => browser.close())
  for (const width of [1100, 390]) {
    await t.test(`${width}px ${width > 500 ? 'dark' : 'light'} tabs`, async () => {
      const page = await browser.newPage({ viewport: { width, height: 420 }, hasTouch: width < 500 })
      page.setDefaultTimeout(3000)
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.setContent(`<!doctype html><html class="${width > 500 ? 'dark' : ''}"><meta charset="utf-8"><style>${css}\n${autoCss}
        body { margin:0; padding:32px; background:${width > 500 ? '#171922' : '#f5f6f9'}; color:${width > 500 ? '#ededf5' : '#272936'} }
        #root { width:${width > 500 ? 420 : 326}px }
        #input { margin-top:16px; width:100%; height:80px; padding:8px; resize:none; border:1px solid #777; border-radius:4px }
      </style><div id="root"></div></html>`)
      await page.addScriptTag({ content: code })
      const viewport = page.locator('.mew-tab-scroll-viewport')
      const left = page.locator('[data-tab-scroll-direction="left"]')
      const right = page.locator('[data-tab-scroll-direction="right"]')
      const input = page.locator('#input')
      const until = async (check: () => Promise<boolean>) => {
        for (let attempt = 0; attempt < 150; attempt++) {
          if (await check()) return
          await page.waitForTimeout(20)
        }
        assert.fail('tab arrows did not reach their expected state')
      }
      await until(() => right.isVisible())
      assert.equal(await left.isVisible(), false, 'the leftmost position offers only a right arrow')
      const stripWidth = await viewport.evaluate(el => el.clientWidth)
      const arrowBox = (await right.boundingBox())!, stripBox = (await viewport.boundingBox())!
      assert.ok(Math.abs(arrowBox.x + arrowBox.width - stripBox.x - stripBox.width) < 1, 'the arrow is pinned to the visible edge')
      assert.ok(await viewport.getByRole('tab').evaluateAll(tabs => {
        const edge = tabs[0].parentElement!.getBoundingClientRect().right
        return tabs.some(tab => { const rect = tab.getBoundingClientRect(); return rect.left < edge && rect.right >= edge })
      }), 'a tab remains underneath the overlaid arrow')
      const appearance = await right.evaluate(el => {
        const win = el.ownerDocument.defaultView!, style = win.getComputedStyle(el)
        return { background: style.backgroundColor, border: style.borderWidth, shadow: win.getComputedStyle(el.querySelector('svg')!).filter }
      })
      assert.equal(appearance.background, 'rgba(0, 0, 0, 0)')
      assert.equal(appearance.border, '0px')
      assert.match(appearance.shadow, /drop-shadow/)
      await input.focus()
      if (width < 500) await right.tap(); else await right.click()
      await until(() => viewport.evaluate((el, target) => el.scrollLeft > 0 && el.scrollLeft < target - 1, stripWidth * 0.5))
      await until(() => viewport.evaluate((el, target) => Math.abs(el.scrollLeft - target) < 1, stripWidth * 0.5))
      assert.equal(await left.isVisible(), true)
      assert.equal(await right.isVisible(), true)
      assert.equal(await input.evaluate(el => el.ownerDocument.activeElement === el), true, 'pointer navigation preserves the draft focus')
      assert.equal(await viewport.locator('[aria-selected="true"]').getAttribute('data-editor-tab-id'), '1', 'scrolling does not activate a tab')
      assert.equal(await viewport.evaluate(el => el.clientWidth), stripWidth, 'arrows reserve no tab space')
      await page.mouse.move(10, 10)
      await page.screenshot({ path: `/tmp/mew-tab-arrows-${width}.png` })

      await left.click()
      await until(() => viewport.evaluate(el => el.scrollLeft < 1))
      await until(async () => !await left.isVisible())
      const maximum = await viewport.evaluate(el => el.scrollWidth - el.clientWidth)
      while (await right.isVisible()) {
        const before = await viewport.evaluate(el => el.scrollLeft)
        const target = Math.min(maximum, before + stripWidth * 0.5)
        await right.click()
        await until(() => viewport.evaluate((el, target) => Math.abs(el.scrollLeft - target) < 1, target))
        if (target === maximum) break
      }
      await until(async () => !await right.isVisible())
      assert.equal(await left.isVisible(), true, 'the rightmost position offers only a left arrow')

      await page.evaluate('window.selectTab("10")')
      await until(async () => await viewport.locator('[aria-selected="true"]').getAttribute('data-editor-tab-id') === '10')
      await page.evaluate('window.selectTab("1")')
      await until(() => viewport.evaluate(el => el.scrollLeft < 1))
      await viewport.evaluate(el => { el.ownerDocument.getElementById('root')!.style.width = '1600px' })
      await until(async () => !await left.isVisible() && !await right.isVisible())
      await viewport.evaluate((el, size) => { el.ownerDocument.getElementById('root')!.style.width = size + 'px' }, stripWidth)
      await until(() => right.isVisible())
      await page.evaluate('window.setCount(2)')
      await until(async () => !await left.isVisible() && !await right.isVisible())
      await page.evaluate('window.setCount(10)')
      await until(() => right.isVisible())

      await page.emulateMedia({ reducedMotion: 'reduce' })
      await input.focus()
      await right.click()
      await viewport.evaluate(el => new Promise<void>(resolve => el.ownerDocument.defaultView!.requestAnimationFrame(() => resolve())))
      assert.ok(Math.abs(await viewport.evaluate(el => el.scrollLeft) - stripWidth * 0.5) < 1, 'reduced motion uses immediate half-width scrolling')
      await page.evaluate('window.setLocale("en")')
      await until(async () => await right.getAttribute('aria-label') === 'Scroll tabs right')
      await right.focus()
      await page.keyboard.press('Enter')
      assert.equal(await viewport.locator('[aria-selected="true"]').getAttribute('data-editor-tab-id'), '1', 'keyboard navigation does not select a different tab')
      assert.deepEqual(errors, [])
      await page.close()
    })
  }
})
