import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { connectTestBrowser } from './test-browser.ts'

const root = path.resolve(import.meta.dirname, '..')

test('standalone account settings preserves profile, password, dismissal, and external-only actions in compact layouts', { timeout: 60_000 }, async () => {
  const source = `import React,{useState} from '${root}/node_modules/react/index.js';
import {createRoot} from '${root}/node_modules/react-dom/client.js';
import {AccountSettingsModal} from '${root}/src/components/AccountSettingsModal.tsx';
import {I18nProvider} from '${root}/src/i18n.tsx';
import {applyThemePalette,THEME_PRESETS} from '${root}/src/utils/theme-color.ts';
localStorage.setItem('mew:locale','en');
const params=new URL(location.href).searchParams;
applyThemePalette(THEME_PRESETS.find(theme=>theme.id===(params.get('theme')||'midnight')).palette);
window.profileChanges=[];window.loggedOut=false;
function Fixture(){const [open,setOpen]=useState(false);return <><button onClick={()=>setOpen(true)}>Open account</button>{open&&<AccountSettingsModal email="profile.long-email@example.test" displayName="Mew User" avatarDataUrl={null} hasPassword={!params.has('external')} authenticationMethod={params.has('external')?'mewlink':'password'} onClose={()=>setOpen(false)} onProfileChanged={profile=>window.profileChanges.push(profile)} onLoggedOut={()=>{window.loggedOut=true;setOpen(false)}}/>}</>}
createRoot(document.getElementById('root')).render(<I18nProvider><Fixture/></I18nProvider>);`
  const bundle = await build({
    input: 'virtual:account-settings.tsx', write: false, platform: 'browser',
    onLog(level, log, handler) { if (log.code !== 'MODULE_LEVEL_DIRECTIVE') handler(level, log) },
    output: { format: 'iife', codeSplitting: false },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
    plugins: [{
      name: 'account-settings-fixture',
      resolveId(id) { if (id === 'virtual:account-settings.tsx') return id; if (id.endsWith('.css')) return 'virtual:style' },
      async load(id) {
        if (id === 'virtual:account-settings.tsx') return source
        if (id === 'virtual:style') return ''
        if (id.endsWith('?raw')) return `export default ${JSON.stringify(await fs.readFile(id.slice(0, -4), 'utf8'))}`
      },
    }],
  })
  const chunk = bundle.output.find(item => item.type === 'chunk')
  assert.ok(chunk)
  const content = (await Promise.all([
    'src/components/AccountSettingsModal.tsx', 'src/components/account-profile-form.tsx',
    'packages/ui/src/dialog-frame.tsx', 'packages/ui/src/action-menu.tsx',
  ].map(file => fs.readFile(`${root}/${file}`, 'utf8')))).join('\n')
  const compiler = await compile(await fs.readFile(`${root}/src/index.css`, 'utf8'), { base: `${root}/src`, onDependency() {} })
  const css = compiler.build([...new Set((source + content).match(/[A-Za-z0-9_@!&:/.[\]()%,-]+/g))])
  const browser = await connectTestBrowser()
  const screenshots = process.env.MEW_ACCOUNT_SETTINGS_SCREENSHOTS
  if (screenshots) await fs.mkdir(screenshots, { recursive: true })
  try {
    for (const [width, theme] of [[1100, 'midnight'], [390, 'light'], [320, 'midnight']] as const) {
      const page = await browser.newPage({ viewport: { width, height: 720 }, isMobile: width < 768, hasTouch: width < 768 })
      page.setDefaultTimeout(4000)
      const errors: string[] = []
      const passwordRequests: unknown[] = []
      let failPassword = false
      let failLogout = false
      page.on('pageerror', error => errors.push(error.message))
      await page.route('http://mew-account-settings.test/**', async route => {
        const pathname = new URL(route.request().url()).pathname
        if (pathname === '/api/auth/profile') {
          const profile = route.request().postDataJSON()
          return route.fulfill({ json: { ok: true, profile } })
        }
        if (pathname === '/api/auth/change-password') {
          passwordRequests.push(route.request().postDataJSON())
          return route.fulfill(failPassword ? { status: 500, json: { error: 'Password request failed' } } : { json: { ok: true } })
        }
        if (pathname === '/api/auth/logout') return route.fulfill(failLogout ? { status: 500, json: { error: 'Offline' } } : { json: { ok: true } })
        return route.fulfill({ contentType: 'text/html', body: `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script>${chunk.code}</script>` })
      })
      const url = `http://mew-account-settings.test/?theme=${theme}`
      await page.goto(url)
      const trigger = page.getByRole('button', { name: 'Open account', exact: true })
      const modal = page.getByRole('dialog', { name: 'My account', exact: true })
      const avatar = modal.getByRole('button', { name: 'Change profile photo', exact: true })
      await trigger.click()
      await modal.waitFor()
      const bounds = await modal.boundingBox()
      assert.ok(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width && bounds.y + bounds.height <= 720)
      assert.equal(await page.locator('html').evaluate(el => el.scrollWidth <= el.clientWidth), true)
      assert.equal(await modal.getByRole('navigation').count(), 0)
      await avatar.press('ArrowDown')
      const menu = modal.getByRole('menu')
      await menu.waitFor()
      assert.equal(await menu.getByRole('menuitem').first().evaluate(el => el.ownerDocument.activeElement === el), true)
      await page.keyboard.press('Escape')
      await menu.waitFor({ state: 'hidden' })
      assert.equal(await modal.isVisible(), true, 'photo menu consumes Escape first')
      assert.equal(await avatar.evaluate(el => el.ownerDocument.activeElement === el), true)
      await modal.getByRole('textbox', { name: 'Display name', exact: true }).fill('Updated name')
      await modal.getByRole('button', { name: 'Save', exact: true }).click()
      await modal.getByRole('status').getByText('Profile saved', { exact: true }).waitFor()
      assert.deepEqual(await page.evaluate('window.profileChanges'), [{ displayName: 'Updated name', avatarDataUrl: null }])
      const current = modal.getByLabel('Current password', { exact: true })
      const next = modal.getByLabel('New password', { exact: true })
      const confirm = modal.getByLabel('Confirm new password', { exact: true })
      const change = modal.getByRole('button', { name: 'Change', exact: true })
      await current.fill('current-password')
      await next.fill('short')
      await confirm.fill('short')
      await change.click()
      await modal.getByRole('alert').getByText('Password must be at least 10 characters', { exact: true }).waitFor()
      assert.equal(passwordRequests.length, 0)
      await next.fill('new-password-123')
      await change.click()
      await modal.getByRole('alert').getByText('The new passwords do not match', { exact: true }).waitFor()
      assert.equal(passwordRequests.length, 0)
      await confirm.fill('new-password-123')
      failPassword = true
      await change.click()
      await modal.getByRole('alert').getByText('Password request failed', { exact: true }).waitFor()
      assert.equal(await next.inputValue(), 'new-password-123', 'failed requests preserve the password draft')
      failPassword = false
      await change.click()
      await modal.getByRole('status').getByText('Password changed · Sign in again on other devices', { exact: true }).waitFor()
      assert.deepEqual(passwordRequests.at(-1), { currentPassword: 'current-password', newPassword: 'new-password-123' })
      assert.equal(await current.inputValue(), '')
      assert.equal(await next.inputValue(), '')
      assert.equal(await confirm.inputValue(), '')
      if (screenshots) await page.screenshot({ path: path.join(screenshots, `account-${width}-${theme}.png`) })
      await page.keyboard.press('Escape')
      await modal.waitFor({ state: 'hidden' })
      assert.equal(await trigger.evaluate(el => el.ownerDocument.activeElement === el), true)
      await trigger.click()
      await page.waitForFunction('!!history.state?.mewOverlayGuard')
      await modal.evaluate(el => el.ownerDocument.defaultView!.history.back())
      await modal.waitFor({ state: 'hidden' })
      await trigger.click()
      await modal.getByRole('button', { name: 'Close', exact: true }).click()
      await modal.waitFor({ state: 'hidden' })
      await trigger.click()
      failLogout = true
      await modal.getByRole('button', { name: 'Log out', exact: true }).click()
      await modal.waitFor({ state: 'hidden' })
      assert.equal(await page.evaluate('window.loggedOut'), true, 'local logout completes when the server rejects the request')
      await page.goto(`${url}&external=1`)
      await trigger.click()
      await modal.waitFor()
      assert.equal(await modal.locator('input[type=password]').count(), 0, 'external-only accounts have no password form')
      assert.equal(await modal.getByRole('button', { name: 'Log out', exact: true }).isVisible(), true)
      assert.deepEqual(errors, [])
      await page.close()
    }
  } finally { await browser.close() }
})
