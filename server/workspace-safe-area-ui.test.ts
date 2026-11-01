import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { chromium } from 'playwright-core'
import { domBrowserExecutable } from './browser-dom-executable.ts'

const root = path.resolve(import.meta.dirname, '..')

test('direct app opts into the device safe-area viewport', async () => {
  const html = await fs.readFile(path.join(root, 'index.html'), 'utf8')
  assert.match(html, /name="viewport"[^>]*viewport-fit=cover/)
  assert.match(html, /name="viewport"[^>]*interactive-widget=resizes-content/)
})

test('workspace header, all dock edges and portaled dialogs stay inside safe areas', { skip: !domBrowserExecutable(), timeout: 30_000 }, async () => {
  const source = `import React from '${root}/node_modules/react/index.js';
import {createRoot} from '${root}/node_modules/react-dom/client.js';
import {I18nProvider} from '${root}/src/i18n.tsx';
import {MobileDock} from '${root}/src/components/mobile-dock.tsx';
import {DialogFrame} from '${root}/packages/ui/src/dialog-frame.tsx';
import {SettingsModal} from '${root}/src/components/SettingsModal.tsx';
function Fixture(){const [position,setPosition]=React.useState('bottom');const [hidden,setHidden]=React.useState(false);const [dialog,setDialog]=React.useState(null);
window.setDockPosition=setPosition;window.setDockHidden=setHidden;return <><div className="mew-workspace flex flex-col overflow-hidden bg-surface text-ink" data-mobile-keyboard={hidden||undefined} style={{height:'var(--app-height,100dvh)'}}>
<div className="flex shrink-0 flex-col"><header className="flex h-9 items-stretch border-b border-edge pr-2 md:h-11"><button onClick={()=>setDialog('settings')}>Projects</button><button onClick={()=>setDialog('default')}>Menu</button><button onClick={()=>setDialog('preferences')}>Preferences</button></header></div>
<div className="workspace-dock-layout" data-dock-position={position}><div className="desktop-dock-rail"><MobileDock position={position} active="editor" available={['sidebar','editor','agent']} hidden={hidden} onSelect={()=>{}} onNavigate={()=>{}}/></div><main className="mew-workspace-content relative flex min-h-0 flex-1 overflow-hidden"><textarea aria-label="Editor" className="min-h-0 w-full"/></main></div></div>
{dialog==='preferences'?<SettingsModal email={null} displayName={null} avatarDataUrl={null} canEditIgnore={false} theme="dark" fontPreferences={{ui:'Arial',markdown:'Arial',mono:'monospace'}} themeColor="#9082da" mewcatSkin={null} mewcatHideDesktop={false} onClose={()=>setDialog(null)} onLoggedOut={()=>{}} onProfileChanged={()=>{}} onToggleTheme={()=>{}} onFontPreferencesChange={()=>{}} onThemeColorChange={()=>{}} onMewcatSkinChange={()=>{}} onMewcatHideDesktopChange={()=>{}}/>:dialog&&<DialogFrame size={dialog} labelledBy="dialog-title" onClose={()=>setDialog(null)} className="flex flex-col"><header className="flex h-9 shrink-0"><h1 id="dialog-title">{dialog==='settings'?'Projects':'Menu'}</h1><button onClick={()=>setDialog(null)}>Close</button></header><div className="min-h-0 flex-1 overflow-auto">{Array.from({length:80},(_,i)=><p key={i}>Project {i}</p>)}</div><button onClick={()=>setDialog(null)}>Done</button></DialogFrame>}</>}
createRoot(document.getElementById('root')).render(<I18nProvider><Fixture/></I18nProvider>);`
  const bundle = await build({ input: 'virtual:safe-area.tsx', write: false, platform: 'browser', output: { format: 'iife' }, onLog(level, log, handler) { if (log.code !== 'MODULE_LEVEL_DIRECTIVE') handler(level, log) }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } }, plugins: [{ name: 'fixture', resolveId(id) {
    if (id === 'virtual:safe-area.tsx') return id
    if (id.endsWith('.css')) return 'virtual:style'
  }, async load(id) {
    if (id === 'virtual:safe-area.tsx') return source
    if (id === 'virtual:style') return ''
    if (id.endsWith('?raw')) return `export default ${JSON.stringify(await fs.readFile(id.slice(0, -4), 'utf8'))}`
  } }] })
  const chunk = bundle.output.find(item => item.type === 'chunk')!
  const compiler = await compile(await fs.readFile(path.join(root, 'src/index.css'), 'utf8'), { base: path.join(root, 'src'), onDependency() {} })
  const content = source + (await Promise.all(['src/components/mobile-dock.tsx', 'src/components/SettingsModal.tsx', 'packages/ui/src/dialog-frame.tsx'].map(file => fs.readFile(path.join(root, file), 'utf8')))).join('\n')
  // Chromium has no device cutout here; substitute only env() values, preserving all production layout rules.
  const css = compiler.build([...new Set(content.match(/[A-Za-z0-9_@:/.[\]()%,-]+/g))])
    .replace(/env\(safe-area-inset-(top|right|bottom|left)(?:,\s*0px)?\)/g, 'var(--test-safe-$1, 0px)')
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true })
    page.setDefaultTimeout(3000)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('http://mew-safe-area.test/**', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html class="dark"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${css}</style><div id="root"></div><script>${chunk.code}</script></html>` }))
    await page.goto('http://mew-safe-area.test/')
    for (const scenario of [
      { name: 'portrait', width: 390, height: 844, top: 59, right: 0, bottom: 34, left: 0 },
      { name: 'landscape', width: 844, height: 390, top: 0, right: 59, bottom: 21, left: 59 },
      { name: 'narrow-landscape', width: 667, height: 375, top: 0, right: 44, bottom: 21, left: 44 },
      { name: 'keyboard', width: 390, height: 480, top: 59, right: 0, bottom: 0, left: 0 },
      { name: 'desktop', width: 1280, height: 800, top: 0, right: 0, bottom: 0, left: 0 },
    ]) {
      await page.setViewportSize({ width: scenario.width, height: scenario.height })
      await page.locator('html').evaluate((el, safe) => {
        for (const edge of ['top', 'right', 'bottom', 'left'] as const) el.style.setProperty(`--test-safe-${edge}`, `${safe[edge]}px`)
      }, scenario)
      const insideSafeArea = async (selector: string) => {
        const box = (await page.locator(selector).boundingBox())!
        assert.ok(box.x >= scenario.left && box.y >= scenario.top, `${scenario.name}: ${selector} clears the top/left cutout`)
        assert.ok(box.x + box.width <= scenario.width - scenario.right && box.y + box.height <= scenario.height - scenario.bottom, `${scenario.name}: ${selector} clears the bottom/right cutout`)
        return box
      }
      const header = await insideSafeArea('.mew-workspace header')
      assert.equal(header.y, scenario.top, 'top inset is applied exactly once')
      assert.equal(header.height, scenario.width < 768 ? 36 : 44, 'existing compact header height is preserved')
      for (const position of ['top', 'bottom', 'left', 'right']) {
        await page.evaluate(`window.setDockPosition('${position}')`)
        await page.locator(`.mobile-dock[data-position="${position}"]`).waitFor()
        const dock = await insideSafeArea('.mobile-dock')
        await insideSafeArea('main')
        if (scenario.width < 768) assert.equal(position === 'left' || position === 'right' ? dock.width : dock.height, 48, 'dock does not add a second safe-area inset')
      }
      await page.evaluate('window.setDockHidden(true)')
      await page.locator('.mobile-dock').waitFor({ state: 'hidden' })
      const withoutDock = await insideSafeArea('main')
      assert.equal(withoutDock.y + withoutDock.height, scenario.height - scenario.bottom, 'hidden dock preserves the safe footer boundary')
      await page.evaluate('window.setDockHidden(false)')
      await page.locator('.mobile-dock').waitFor({ state: 'visible' })
      for (const name of ['Projects', 'Menu']) {
        await page.getByRole('button', { name, exact: true }).click()
        await insideSafeArea('[role="dialog"]')
        await insideSafeArea('[role="dialog"] header')
        await page.getByRole('button', { name: 'Close', exact: true }).click()
        await page.getByRole('dialog').waitFor({ state: 'detached' })
      }
      await page.getByRole('button', { name: 'Preferences', exact: true }).click()
      await insideSafeArea('[role="dialog"] > div:first-child')
      await insideSafeArea('[role="dialog"] nav > button:first-of-type')
      await page.keyboard.press('Escape')
      await page.getByRole('dialog').waitFor({ state: 'detached' })
      assert.equal(await page.locator('html').evaluate(el => el.scrollWidth <= el.clientWidth), true, 'safe-area padding causes no horizontal overflow')
      if (scenario.name === 'portrait' || scenario.name === 'landscape' || scenario.name === 'desktop') await page.screenshot({ path: `/tmp/mew-safe-area-${scenario.name}.png` })
    }
    assert.deepEqual(errors, [])
  } finally { await browser.close() }
})
