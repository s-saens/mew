import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { connectTestBrowser } from './test-browser.ts'

const root = path.resolve(import.meta.dirname, '..')
const token = 'a'.repeat(43)
const guest = { authenticated: false, email: null, role: 'guest', mustChangePassword: false, displayName: null, avatarDataUrl: null }
const owner = { ...guest, authenticated: true, email: 'owner@example.test', role: 'owner' }

test('first owner setup handles trusted launch, validation, account creation and existing installations', { timeout: 90_000 }, async t => {
  const source = `import React from '${root}/node_modules/react/index.js';
import {createRoot} from '${root}/node_modules/react-dom/client.js';
import AppBootstrap from '${root}/src/AppBootstrap.tsx';
import {I18nProvider} from '${root}/src/i18n.tsx';
import {applyThemePalette,THEME_PRESETS} from '${root}/src/utils/theme-color.ts';
applyThemePalette(THEME_PRESETS.find(preset=>preset.id===(innerWidth<500?'midnight':'light')).palette);
localStorage.setItem('mew:locale','en');
createRoot(document.getElementById('root')).render(<React.StrictMode><I18nProvider><AppBootstrap /></I18nProvider></React.StrictMode>);`
  const bundle = await build({
    input: 'virtual:first-owner.tsx', write: false, platform: 'browser', output: { format: 'iife', codeSplitting: false },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
    onwarn(warning, warn) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning) },
    plugins: [{
      name: 'first-owner-fixture',
      resolveId(id, importer) {
        if (id === 'virtual:first-owner.tsx') return id
        if (importer?.endsWith('/AppBootstrap.tsx') && id === './App.tsx') return 'virtual:workspace.tsx'
        if (id.endsWith('/PortPreviewPage.tsx')) return 'virtual:preview.tsx'
        if (id.endsWith('.css')) return 'virtual:style'
      },
      load(id) {
        if (id === 'virtual:first-owner.tsx') return source
        if (id === 'virtual:workspace.tsx') return 'window.workspaceImports=(window.workspaceImports??0)+1;export default function Workspace({auth,onRequestLogin}){return <main data-test-workspace>{auth.email??"Guest workspace"}<button onClick={onRequestLogin}>Sign in</button></main>}'
        if (id === 'virtual:preview.tsx') return 'export default function Preview(){return <main>Port preview</main>}'
        if (id === 'virtual:style') return ''
      },
    }],
  })
  const code = bundle.output.filter(item => item.type === 'chunk').map(item => item.code).join('\n')
  const compiler = await compile(await fs.readFile(`${root}/src/index.css`, 'utf8'), { base: `${root}/src`, onDependency() {} })
  const components = await Promise.all(['FirstOwnerSetup', 'LoginPage'].map(name => fs.readFile(`${root}/src/components/${name}.tsx`, 'utf8')))
  const css = compiler.build([...new Set((source + components.join('\n')).match(/[A-Za-z0-9_@!:/.[\]()%,-]+/g))])
  const browser = await connectTestBrowser()
  t.after(() => browser.close())

  for (const width of [1100, 390]) {
    await t.test(`${width}px: validation, URL cleanup and direct owner entry`, async () => {
      const page = await browser.newPage({ viewport: { width, height: 844 }, hasTouch: width < 500, reducedMotion: 'reduce' })
      page.setDefaultTimeout(6000)
      const requests: { url: string; body: unknown }[] = [], errors: string[] = []
      let created = false
      page.on('pageerror', error => errors.push(error.message))
      await page.route('http://first-owner.test/**', async route => {
        const request = route.request(), url = new URL(request.url())
        requests.push({ url: request.url(), body: request.postDataJSON() })
        if (url.pathname === '/app.js') return route.fulfill({ contentType: 'text/javascript', body: code })
        if (url.pathname === '/api/auth/me') return route.fulfill({ json: created ? owner : { ...guest, setupRequired: true } })
        if (url.pathname === '/api/auth/setup') {
          assert.deepEqual(request.postDataJSON(), { token, email: 'owner@example.test', password: 'a long password' })
          created = true
          return route.fulfill({ status: 201, json: owner })
        }
        return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html class="${width < 500 ? 'dark' : ''}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}html,body,#root{height:100%;margin:0}</style><div id="root"></div><script src="/app.js"></script></html>` })
      })
      await page.goto(`http://first-owner.test/?retained=yes#setup=${token}&tab=retained`)
      await page.getByRole('heading', { name: 'Create your administrator account' }).waitFor()
      assert.equal(new URL(page.url()).hash, '#tab=retained')
      assert.equal(new URL(page.url()).search, '?retained=yes')
      assert.equal(await page.locator('[data-test-workspace]').count(), 0)
      assert.equal(await page.locator('[name=email]').getAttribute('autocomplete'), 'username')
      assert.equal(await page.locator('[name=password]').getAttribute('autocomplete'), 'new-password')
      await page.screenshot({ path: `/tmp/mew-first-owner-${width}.png` })
      const bounds = await page.locator('section').boundingBox()
      assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width && bounds.y >= 0 && bounds.y + bounds.height <= 844)
      const email = page.getByRole('textbox', { name: 'Email', exact: true })
      const password = page.getByLabel('Password', { exact: true })
      const confirmation = page.getByLabel('Confirm password', { exact: true })
      const submit = page.getByRole('button', { name: 'Create account and start' })
      await email.fill('owner@example.test')
      await password.fill('short')
      await confirmation.fill('short')
      await submit.click()
      await page.getByRole('alert').filter({ hasText: 'Password must be at least 10 characters' }).waitFor()
      await password.fill('a long password')
      await confirmation.fill('different password')
      await submit.click()
      await page.getByRole('alert').filter({ hasText: 'The passwords do not match' }).waitFor()
      await password.fill('owner@example.test')
      await confirmation.fill('owner@example.test')
      await submit.click()
      await page.getByRole('alert').filter({ hasText: 'Use a password different from your email' }).waitFor()
      assert.equal(requests.filter(request => request.url.endsWith('/api/auth/setup')).length, 0)
      await password.fill('a long password')
      await confirmation.fill('a long password')
      await confirmation.press('Enter')
      await page.locator('[data-test-workspace]').filter({ hasText: owner.email }).waitFor()
      assert.equal(await page.getByRole('heading', { name: 'Create your administrator account' }).count(), 0)
      assert.equal(requests.filter(request => request.url.endsWith('/api/auth/setup')).length, 1)
      assert.ok(requests.every(request => !request.url.includes(token)), 'launch token never enters request URLs')
      assert.equal(await page.evaluate(`JSON.stringify({...localStorage,...sessionStorage}).includes('${token}')`), false, 'launch token is not persisted in browser storage')
      assert.deepEqual(errors, [])
      await page.close()
    })
  }

  for (const scenario of ['missing-token', 'invalid-token', 'rejected-token', 'already-initialized', 'existing-install', 'invalid-fields', 'connection-error', 'rate-limited'] as const) {
    await t.test(scenario, async () => {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
      page.setDefaultTimeout(6000)
      let requests = 0, initialized = scenario === 'existing-install'
      await page.route('http://first-owner.test/**', async route => {
        const url = new URL(route.request().url())
        if (url.pathname === '/app.js') return route.fulfill({ contentType: 'text/javascript', body: code })
        if (url.pathname === '/api/auth/me') return route.fulfill({ json: initialized ? guest : { ...guest, setupRequired: true } })
        if (url.pathname === '/api/auth/setup') {
          requests++
          if (scenario === 'connection-error') return route.abort('failed')
          if (scenario === 'already-initialized') initialized = true
          return route.fulfill({ status: scenario === 'already-initialized' ? 409 : scenario === 'rate-limited' ? 429 : scenario === 'invalid-fields' ? 400 : 403, json: { error: 'Setup unavailable' } })
        }
        return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html class="dark"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}html,body,#root{height:100%;margin:0}</style><div id="root"></div><script src="/app.js"></script></html>` })
      })
      await page.goto(`http://first-owner.test/${scenario === 'missing-token' ? '' : `#setup=${scenario === 'invalid-token' ? 'invalid' : token}`}`)
      if (scenario === 'existing-install') {
        await page.locator('[data-test-workspace]').waitFor()
        await page.getByRole('button', { name: 'Sign in' }).click()
        await page.getByRole('dialog', { name: 'Log in' }).waitFor()
        assert.equal(await page.getByRole('heading', { name: 'Create your administrator account' }).count(), 0)
      } else if (scenario === 'missing-token' || scenario === 'invalid-token') {
        await page.getByRole('status').filter({ hasText: 'Reopen Mew on the PC where you installed it.' }).waitFor()
        assert.equal(await page.locator('form').count(), 0)
      } else {
        await page.getByRole('textbox', { name: 'Email', exact: true }).fill('owner@example.test')
        await page.getByLabel('Password', { exact: true }).fill('a long password')
        await page.getByLabel('Confirm password', { exact: true }).fill('a long password')
        await page.getByRole('button', { name: 'Create account and start' }).click()
        if (scenario === 'rejected-token') {
          await page.getByRole('status').filter({ hasText: 'Reopen Mew on the PC where you installed it.' }).waitFor()
          assert.equal(await page.locator('form').count(), 0)
        } else if (scenario === 'already-initialized') {
          await page.getByRole('dialog', { name: 'Log in' }).waitFor()
          assert.equal(await page.locator('[data-test-workspace]').count(), 0)
        } else {
          await page.getByRole('alert').filter({ hasText: scenario === 'rate-limited' ? 'Too many attempts' : scenario === 'invalid-fields' ? 'Check the email and password' : 'Could not create the account' }).waitFor()
          assert.equal(await page.getByRole('button', { name: 'Create account and start' }).isEnabled(), true)
        }
        assert.equal(requests, 1)
      }
      assert.ok(!page.url().includes('setup='), 'valid and invalid setup fragments are removed')
      await page.close()
    })
  }
})
