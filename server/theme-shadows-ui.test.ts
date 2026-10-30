import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { chromium } from 'playwright-core'
import { domBrowserExecutable } from './browser-dom-executable.ts'

const root = path.resolve(import.meta.dirname, '..')

test('tab arrows, loading logos and notification shadows follow the theme background', { skip: !domBrowserExecutable(), timeout: 30_000 }, async t => {
  const source = `import React from '${root}/node_modules/react/index.js';
import {createRoot} from '${root}/node_modules/react-dom/client.js';
import {TabScrollArea} from '${root}/packages/ui/src/tab-scroll-area.tsx';
import {LoadingIndicator} from '${root}/packages/ui/src/loading-indicator.tsx';
import {applyThemePalette,THEME_PRESETS} from '${root}/src/utils/theme-color.ts';
window.themes=[...THEME_PRESETS,
  {id:'custom-solid',palette:{background:'#b5d6c8',text:'#152c24',primary:'#5642c7'}},
  {id:'custom-gradient',palette:{background:'#382248',text:'#faf3ff',primary:'#b9a1ef',gradient:{colors:['#5f3268','#1b5255'],angle:135,animated:true}}}
];
window.setTheme=palette=>applyThemePalette(palette);
createRoot(document.getElementById('root')).render(<main className="mew-workspace">
  <TabScrollArea><div style={{display:'flex',minWidth:1200,height:40}}>Theme tabs</div></TabScrollArea>
  <div style={{padding:64}}><span className="mew-loading-logo-shadow"><LoadingIndicator variant="logo" size={56}/></span></div>
  <div className="mewcat-notifications"><div className="mewcat-notifications-content">Notification</div></div>
</main>);`
  const bundle = await build({
    input: 'virtual:theme-shadows.tsx', write: false, platform: 'browser', output: { format: 'iife' },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
    onwarn(warning, warn) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning) },
    plugins: [{
      name: 'theme-shadows-fixture',
      resolveId(id) { if (id === 'virtual:theme-shadows.tsx') return id },
      load(id) {
        if (id === 'virtual:theme-shadows.tsx') return source
        if (id.endsWith('.css')) return { code: '', moduleType: 'js' }
      },
    }],
  })
  const code = bundle.output.filter(item => item.type === 'chunk').map(item => item.code).join('\n')
  const compiler = await compile(await fs.readFile(`${root}/src/index.css`, 'utf8'), { base: `${root}/src`, onDependency() {} })
  const css = compiler.build([]) + await fs.readFile(`${root}/packages/ui/src/loading-indicator.css`, 'utf8')
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  t.after(() => browser.close())
  for (const width of [1100, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 480 }, hasTouch: width < 500, reducedMotion: 'reduce' })
    t.after(() => page.close())
    await page.setContent(`<!doctype html><style>${css} #root{width:min(420px,100%)} .mewcat-notifications-content{padding:12px}</style><div id="root"></div>`)
    await page.addScriptTag({ content: code })
    await page.locator('[data-tab-scroll-direction="right"]:visible').waitFor()
    await page.locator('.mew-tab-scroll-viewport').evaluate(el => { el.scrollLeft = 200 })
    await page.locator('[data-tab-scroll-direction="left"]:visible').waitFor()
    const themes = await page.evaluate('window.themes') as { id: string; palette: { background: string } }[]
    for (const theme of themes) {
      await page.evaluate('window.setTheme(' + JSON.stringify(theme.palette) + ')')
      const shadows = await page.locator('body').evaluate((el, background) => {
        const doc = el.ownerDocument, view = doc.defaultView!
        const canvas = doc.createElement('canvas')
        canvas.width = canvas.height = 1
        const context = canvas.getContext('2d')!
        const sample = (color: string) => {
          context.clearRect(0, 0, 1, 1)
          context.fillStyle = color
          context.fillRect(0, 0, 1, 1)
          return [...context.getImageData(0, 0, 1, 1).data]
        }
        const rgb = [1, 3, 5].map(index => parseInt(background.slice(index, index + 2), 16))
        return [
          { selector: '[data-tab-scroll-direction="left"] svg', alphas: [.9, .75], geometry: 'drop-shadow( 0px 1px 2px) drop-shadow( 0px 2px 5px)' },
          { selector: '[data-tab-scroll-direction="right"] svg', alphas: [.9, .75], geometry: 'drop-shadow( 0px 1px 2px) drop-shadow( 0px 2px 5px)' },
          { selector: '.mew-loading-logo-shadow', alphas: [.8, .6], geometry: 'drop-shadow( 0px 3px 4px) drop-shadow( 0px 8px 14px)' },
          { selector: '.mewcat-notifications', alphas: [.24], geometry: 'drop-shadow( 0px 4px 10px)' },
        ].map(({ selector, alphas, geometry }) => {
          const filter = view.getComputedStyle(doc.querySelector(selector)!).filter
          const colors = filter.match(/(?:color|rgba?)\([^)]*\)/g) ?? []
          return {
            selector, geometry, actualGeometry: filter.replace(/(?:color|rgba?)\([^)]*\)/g, ''),
            actual: colors.map(sample), expected: alphas.map(alpha => sample('rgba(' + rgb.join(',') + ',' + alpha + ')')),
          }
        })
      }, theme.palette.background)
      for (const shadow of shadows) {
        const label = `${width}px ${theme.id}: ${shadow.selector}`
        assert.equal(shadow.actualGeometry, shadow.geometry, `${label} preserves offsets, blur and layer count`)
        assert.deepEqual(shadow.actual, shadow.expected, `${label} uses the palette background with the existing opacity`)
      }
      if (['midnight', 'rose'].includes(theme.id)) await page.screenshot({ path: `/tmp/mew-theme-shadows-${width}-${theme.id}.png` })
    }
  }
})
