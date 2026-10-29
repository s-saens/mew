import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { chromium } from 'playwright-core'
import { domBrowserExecutable } from './browser-dom-executable.ts'

const root = path.resolve(import.meta.dirname, '..')

test('settings Back returns mobile details to categories before dismissing the modal', { skip: !domBrowserExecutable(), timeout: 60_000 }, async () => {
  const source = `import React,{useState} from '${root}/node_modules/react/index.js';
import {createRoot} from '${root}/node_modules/react-dom/client.js';
import {I18nProvider} from '${root}/src/i18n.tsx';
import {SettingsModal} from '${root}/src/components/SettingsModal.tsx';
import {useOverlayDismiss} from '${root}/packages/ui/src/useOverlayDismiss.ts';
import {applyThemePalette,THEME_PRESETS} from '${root}/src/utils/theme-color.ts';
localStorage.setItem('mew:locale','en');
const params=new URL(location.href).searchParams;
const palette=THEME_PRESETS.find(theme=>theme.id===params.get('theme')).palette;
applyThemePalette(palette);
const noop=()=>{};
function Background(){
  const [background,setBackground]=useState(true);
  useOverlayDismiss(background&&(()=>setBackground(false)));
  return <div data-background>{background?'open':'closed'}</div>;
}
function Fixture(){
  const [open,setOpen]=useState(true);
  return <><Background/>
    <button onClick={()=>setOpen(true)}>Open settings</button>
    {open&&<SettingsModal email={null} displayName={null} avatarDataUrl={null} canEditIgnore={false}
      themeSettings={{palette,custom:[]}} fontPreferences={{ui:'Arial',markdown:'Arial',mono:'monospace'}}
      mewcatRequest={params.has('mewcat')?1:undefined} mewcatSkin={null} mewcatHideDesktop={false}
      onClose={()=>setOpen(false)} onLoggedOut={noop} onProfileChanged={noop}
      onFontPreferencesChange={noop} onThemeSettingsChange={noop} onMewcatSkinChange={noop} onMewcatHideDesktopChange={noop}/>}</>;
}
createRoot(document.getElementById('root')).render(<I18nProvider><Fixture/></I18nProvider>);`
  const bundle = await build({
    input: 'virtual:settings-navigation.tsx', write: false, platform: 'browser',
    output: { format: 'iife', codeSplitting: false },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
    plugins: [{
      name: 'settings-navigation-fixture',
      resolveId(id) {
        if (id === 'virtual:settings-navigation.tsx') return id
        if (id.endsWith('.css')) return 'virtual:style'
      },
      async load(id) {
        if (id === 'virtual:settings-navigation.tsx') return source
        if (id === 'virtual:style') return ''
        if (id.endsWith('?raw')) return `export default ${JSON.stringify(await fs.readFile(id.slice(0, -4), 'utf8'))}`
      },
    }],
  })
  const chunk = bundle.output.find(item => item.type === 'chunk')
  assert.ok(chunk)
  const compiler = await compile(await fs.readFile(`${root}/src/index.css`, 'utf8'), { base: `${root}/src`, onDependency() {} })
  const content = (await Promise.all([
    'src/components/SettingsModal.tsx', 'src/components/theme-settings.tsx',
    'src/components/dock-settings-panel.tsx', 'packages/ui/src/select-field.tsx',
  ].map(file => fs.readFile(`${root}/${file}`, 'utf8')))).join('\n')
  const css = compiler.build([...new Set((source + content).match(/[A-Za-z0-9_@!&:/.[\]()%,-]+/g))])
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  try {
    for (const theme of ['dark', 'light']) {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
      page.setDefaultTimeout(3000)
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('http://mew-settings-navigation.test/**', route => {
        const pathname = new URL(route.request().url()).pathname
        if (pathname.startsWith('/api/')) return route.fulfill({ json: { skins: [], canManage: false } })
        return route.fulfill({ contentType: 'text/html', body: `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script>${chunk.code}</script>` })
      })
      const url = `http://mew-settings-navigation.test/?theme=${theme}`
      await page.goto(url)
      const modal = page.getByRole('dialog', { name: 'Settings', exact: true })
      const categories = modal.getByRole('navigation')
      const backButton = modal.getByRole('button', { name: 'Back', exact: true })
      const background = page.locator('[data-background]')
      const back = async () => {
        await page.waitForFunction('!!history.state?.mewOverlayGuard')
        await background.evaluate(el => el.ownerDocument.defaultView!.history.back())
      }
      await categories.waitFor()
      await categories.getByRole('button', { name: 'Appearance', exact: true }).tap()
      await backButton.waitFor()
      await back()
      await categories.waitFor()
      assert.equal(await modal.isVisible(), true, 'Back from details must retain Settings')
      assert.equal(await background.textContent(), 'open')

      // Each new detail visit must consume exactly one Back before the category list.
      for (const name of ['Dock', 'Shortcuts', 'Appearance']) {
        await categories.getByRole('button', { name, exact: true }).tap()
        await backButton.waitFor()
        await back()
        await categories.waitFor()
      }
      await categories.getByRole('button', { name: 'Appearance', exact: true }).tap()
      await modal.getByRole('combobox', { name: 'Language', exact: true }).tap()
      await page.getByRole('listbox').waitFor()
      await back()
      await page.getByRole('listbox').waitFor({ state: 'hidden' })
      assert.equal(await backButton.isVisible(), true, 'dropdown consumes Back before details')
      await back()
      await categories.waitFor()

      // The on-screen arrow uses the same category destination without dismissing Settings.
      await categories.getByRole('button', { name: 'Appearance', exact: true }).tap()
      await backButton.tap()
      await categories.waitFor()
      await back()
      await modal.waitFor({ state: 'hidden' })
      assert.equal(await background.textContent(), 'open', 'category Back closes only Settings')

      // Close and Esc still dismiss directly from a detail screen.
      for (const action of ['close', 'escape']) {
        await page.getByRole('button', { name: 'Open settings', exact: true }).tap()
        await categories.getByRole('button', { name: 'Appearance', exact: true }).tap()
        if (action === 'close') await modal.getByRole('button', { name: 'Close', exact: true }).last().tap()
        else await page.keyboard.press('Escape')
        await modal.waitFor({ state: 'hidden' })
        assert.equal(await background.textContent(), 'open')
      }

      // Direct section entry and resizing use the current responsive layout.
      await page.goto(`${url}&mewcat=1`)
      await backButton.waitFor()
      await back()
      await categories.waitFor()
      await page.setViewportSize({ width: 768, height: 844 })
      await categories.getByRole('button', { name: 'Appearance', exact: true }).click()
      await back()
      await modal.waitFor({ state: 'hidden' })
      assert.equal(await background.textContent(), 'open', 'desktop Back dismisses directly')

      await page.getByRole('button', { name: 'Open settings', exact: true }).click()
      await categories.getByRole('button', { name: 'Appearance', exact: true }).click()
      await page.setViewportSize({ width: 767, height: 844 })
      await backButton.waitFor()
      await back()
      await categories.waitFor()
      assert.equal(await modal.isVisible(), true)
      assert.deepEqual(errors, [])
      await page.close()
    }
  } finally { await browser.close() }
})
