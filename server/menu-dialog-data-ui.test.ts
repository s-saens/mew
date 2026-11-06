import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { connectTestBrowser } from './test-browser.ts'
import { defaultCapabilities } from '../shared/access-policy.ts'

const root = path.resolve(import.meta.dirname, '..')
const email = 'owner@example.test'

test('menu dialog shells stay interactive while account, permissions, and settings data load', { timeout: 60_000 }, async t => {
  const source = `import React,{useState} from '${root}/node_modules/react/index.js';
import {createRoot} from '${root}/node_modules/react-dom/client.js';
import {I18nProvider} from '${root}/src/i18n.tsx';
import {AccountSettingsModal} from '${root}/src/components/AccountSettingsModal.tsx';
import {AdminSettingsModal} from '${root}/src/components/AdminSettingsModal.tsx';
import {SettingsModal} from '${root}/src/components/SettingsModal.tsx';
import {setRemoteTransport} from '${root}/src/utils/remote-transport.ts';
localStorage.setItem('mew:locale','en');
setRemoteTransport({fetch:(input,init)=>fetch(input,init),socket:()=>{throw new Error('Unexpected socket')},close:()=>{}});
const noop=()=>{};
function Fixture(){const [dialog,setDialog]=useState(null);return <><main><button onClick={()=>setDialog('account')}>Open account</button><button onClick={()=>setDialog('admin')}>Open administration</button><button onClick={()=>setDialog('settings')}>Open settings</button></main>
{dialog==='account'&&<AccountSettingsModal email="${email}" displayName="Owner" avatarDataUrl={null} authenticationMethod="password" onClose={()=>setDialog(null)} onLoggedOut={noop} onProfileChanged={noop}/>}
{dialog==='admin'&&<AdminSettingsModal currentEmail="${email}" onClose={()=>setDialog(null)}/>}
{dialog==='settings'&&<SettingsModal canEditIgnore fontPreferences={{ui:'Arial',markdown:'Arial',mono:'monospace'}} mewcatSkin={null} mewcatHideDesktop={false} onClose={()=>setDialog(null)} onFontPreferencesChange={noop} onThemeSettingsChange={noop} onMewcatSkinChange={noop} onMewcatHideDesktopChange={noop}/>}</>}
createRoot(document.getElementById('root')).render(<I18nProvider><Fixture/></I18nProvider>);`
  const bundle = await build({
    input: 'virtual:menu-dialog-data.tsx', write: false, platform: 'browser', output: { format: 'iife', codeSplitting: false },
    onLog(level, log, handler) { if (log.code !== 'MODULE_LEVEL_DIRECTIVE') handler(level, log) },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
    plugins: [{
      name: 'menu-dialog-data-fixture',
      resolveId(id) { if (id === 'virtual:menu-dialog-data.tsx') return id; if (id.endsWith('.css')) return 'virtual:style' },
      async load(id) {
        if (id === 'virtual:menu-dialog-data.tsx') return source
        if (id === 'virtual:style') return ''
        if (id.endsWith('?raw')) return `export default ${JSON.stringify(await fs.readFile(id.slice(0, -4), 'utf8'))}`
      },
    }],
  })
  const chunk = bundle.output.find(item => item.type === 'chunk')
  assert.ok(chunk)
  const content = (await Promise.all([
    'src/components/AccountSettingsModal.tsx', 'src/components/account-profile-form.tsx', 'src/components/mewlink-account-connection.tsx',
    'src/components/AdminSettingsModal.tsx', 'src/components/account-access-matrix.tsx', 'src/components/mewlink-access-settings.tsx',
    'src/components/SettingsModal.tsx', 'packages/ui/src/dialog-frame.tsx',
  ].map(file => fs.readFile(path.join(root, file), 'utf8')))).join('\n')
  const compiler = await compile(await fs.readFile(path.join(root, 'src/index.css'), 'utf8'), { base: path.join(root, 'src'), onDependency() {} })
  const css = compiler.build([...new Set((source + content).match(/[A-Za-z0-9_@!&:/.[\]()%,-]+/g))])
  const browser = await connectTestBrowser()
  t.after(() => browser.close())
  const identity = { issuer: 'https://identity.example.test', subject: 'fixture-person', provider: 'github', displayName: 'Linked owner', username: 'fixture-owner' }
  const accountStatus = { identity, state: 'approved', accountId: email }
  const users = [{ email, role: 'owner', hasPassword: true, mustChangePassword: false, createdAt: 0 }]
  const access = { workspace: '/fixture', rows: [{ subject: email, displayName: 'Owner', role: 'owner', avatarDataUrl: null, capabilities: defaultCapabilities('owner'), overrides: {} }] }
  const overview = { requests: [], links: [] }
  const ignore = { names: ['fixture-ignored-folder'], defaults: [], locked: [] }
  const defaults = new Map<string, unknown>([
    ['/api/auth/mewlink', accountStatus], ['/api/admin/users', users], ['/api/admin/access', access], ['/api/admin/mewlink', overview], ['/api/ignore', ignore],
  ])

  for (const width of [1100, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 800 }, hasTouch: width < 768 })
    page.setDefaultTimeout(4000)
    const errors: string[] = []
    const unexpected: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    type Reply = { json: unknown; status?: number }
    type Hold = { started: Promise<void>; received: () => void; reply: Promise<Reply>; release: (json: unknown, status?: number) => void }
    const pending = new Map<string, Hold>()
    const hold = (pathname: string): Hold => {
      let received!: () => void
      let respond!: (reply: Reply) => void
      const value: Hold = {
        started: new Promise<void>(resolve => { received = resolve }), received: () => received(),
        reply: new Promise<Reply>(resolve => { respond = resolve }),
        release: (json, status) => { if (pending.get(pathname) === value) pending.delete(pathname); respond({ json, status }) },
      }
      pending.set(pathname, value)
      return value
    }
    await page.route('http://mew-menu-dialog-data.test/**', async route => {
      const pathname = new URL(route.request().url()).pathname
      if (pathname.startsWith('/api/')) {
        assert.equal(route.request().method(), 'GET')
        const value = pending.get(pathname)
        if (value) { value.received(); return route.fulfill(await value.reply) }
        if (!defaults.has(pathname)) unexpected.push(pathname)
        return route.fulfill({ json: defaults.get(pathname) ?? {} })
      }
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script>${chunk.code}</script>` })
    })
    await page.goto('http://mew-menu-dialog-data.test/')
    const settle = async () => page.locator('main').evaluate(el => new Promise<void>(resolve => {
      const view = el.ownerDocument.defaultView!
      view.requestAnimationFrame(() => view.requestAnimationFrame(() => resolve()))
    }))
    const account = page.getByRole('dialog', { name: 'My account', exact: true })
    const admin = page.getByRole('dialog', { name: 'Manage accounts', exact: true })
    const settings = page.getByRole('dialog', { name: 'Settings', exact: true })
    try {
      const accountData = hold('/api/auth/mewlink')
      await page.getByRole('button', { name: 'Open account', exact: true }).click()
      await accountData.started
      await account.getByRole('heading', { name: 'My account', exact: true }).waitFor()
      assert.equal(await account.getByRole('button', { name: 'Close', exact: true }).isEnabled(), true)
      const accountElement = await account.elementHandle()
      await account.getByRole('textbox', { name: 'Display name', exact: true }).fill('Local draft')
      accountData.release(accountStatus)
      await account.getByText(`Linked to ${email}`, { exact: true }).waitFor()
      assert.equal(await accountElement!.evaluate(el => el.isConnected), true, 'account data fills the original dialog')
      assert.equal(await account.getByRole('textbox', { name: 'Display name', exact: true }).inputValue(), 'Local draft')
      await account.getByRole('button', { name: 'Close', exact: true }).click()

      const accountFailure = hold('/api/auth/mewlink')
      await page.getByRole('button', { name: 'Open account', exact: true }).click()
      await accountFailure.started
      accountFailure.release({ error: 'Account status unavailable' }, 500)
      await account.getByRole('alert').getByText('Account status unavailable', { exact: true }).waitFor()
      assert.equal(await account.getByRole('textbox', { name: 'Display name', exact: true }).isEnabled(), true)
      await account.getByRole('button', { name: 'Close', exact: true }).click()

      const lateAccount = hold('/api/auth/mewlink')
      await page.getByRole('button', { name: 'Open account', exact: true }).click()
      await lateAccount.started
      await account.getByRole('button', { name: 'Close', exact: true }).click()
      lateAccount.release(accountStatus)
      await settle()
      assert.equal(await account.count(), 0, 'late account data cannot reopen a closed dialog')

      const adminUsers = hold('/api/admin/users'), adminAccess = hold('/api/admin/access'), adminMewlink = hold('/api/admin/mewlink')
      await page.getByRole('button', { name: 'Open administration', exact: true }).click()
      await Promise.all([adminUsers.started, adminMewlink.started])
      await admin.getByRole('heading', { name: 'Manage accounts', exact: true }).waitFor()
      assert.equal(await admin.getByRole('button', { name: 'Close', exact: true }).isEnabled(), true)
      const adminElement = await admin.elementHandle()
      adminUsers.release(users)
      await adminAccess.started
      await admin.getByRole('tab', { name: 'Feature access', exact: true }).waitFor()
      assert.equal(await admin.getByRole('table').count(), 0, 'permission data may remain pending after the header and tabs appear')
      await admin.locator('summary').filter({ hasText: 'Mewlink account access' }).click()
      adminAccess.release(access)
      adminMewlink.release(overview)
      await admin.getByRole('table').waitFor()
      await admin.getByText('No access requests or approved Mewlink accounts.', { exact: true }).waitFor()
      assert.equal(await adminElement!.evaluate(el => el.isConnected), true, 'users and permissions fill the original dialog')
      await admin.getByRole('button', { name: 'Close', exact: true }).click()

      const lateUsers = hold('/api/admin/users')
      await page.getByRole('button', { name: 'Open administration', exact: true }).click()
      await lateUsers.started
      await admin.getByRole('button', { name: 'Close', exact: true }).click()
      lateUsers.release(users)
      await settle()
      assert.equal(await admin.count(), 0, 'late account management data cannot reopen a closed dialog')

      const ignoreData = hold('/api/ignore')
      await page.getByRole('button', { name: 'Open settings', exact: true }).click()
      await settings.getByRole('navigation').getByRole('button', { name: 'Ignore list', exact: true }).click()
      await ignoreData.started
      assert.equal(await settings.getByRole('button', { name: 'Close', exact: true }).last().isVisible(), true)
      const settingsElement = await settings.elementHandle()
      ignoreData.release(ignore)
      await settings.getByText('fixture-ignored-folder', { exact: true }).waitFor()
      assert.equal(await settingsElement!.evaluate(el => el.isConnected), true, 'settings data fills the original dialog')
      await settings.getByRole('button', { name: 'Close', exact: true }).last().click()

      const lateIgnore = hold('/api/ignore')
      await page.getByRole('button', { name: 'Open settings', exact: true }).click()
      await settings.getByRole('navigation').getByRole('button', { name: 'Ignore list', exact: true }).click()
      await lateIgnore.started
      await settings.getByRole('button', { name: 'Close', exact: true }).last().click()
      lateIgnore.release(ignore)
      await settle()
      assert.equal(await settings.count(), 0, 'late settings data cannot reopen a closed dialog')
      assert.deepEqual(unexpected, [])
      assert.deepEqual(errors, [])
    } finally {
      for (const [pathname, value] of pending) value.release(defaults.get(pathname))
      await page.close()
    }
  }
})
