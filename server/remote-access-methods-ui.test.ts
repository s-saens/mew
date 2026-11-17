import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { connectTestBrowser } from './test-browser.ts'

const root = path.resolve(import.meta.dirname, '..')

test('the shared remote-access popup offers three methods, keyboard navigation, registration and mobile dismissal', { timeout: 45_000 }, async t => {
  const source = `import React from 'react';import {createRoot} from 'react-dom/client';
    import {I18nProvider} from '${root}/src/i18n.tsx';
    import {RemoteAccessModal} from '${root}/src/components/remote-access-settings.tsx';
    localStorage.setItem('mew:locale','en');
    function Fixture(){const [open,setOpen]=React.useState(false);return <I18nProvider><button onClick={()=>setOpen(true)}>Mewlink</button>{open&&<RemoteAccessModal onClose={()=>setOpen(false)}/>}</I18nProvider>}
    createRoot(document.getElementById('root')).render(<Fixture/>);`
  const bundle = await build({
    input: 'virtual:remote-methods.tsx', write: false, platform: 'browser', output: { format: 'iife' },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
    onLog(level, log, handler) { if (log.code !== 'MODULE_LEVEL_DIRECTIVE') handler(level, log) },
    plugins: [{ name: 'remote-methods-fixture', resolveId(id) { if (id === 'virtual:remote-methods.tsx') return id; if (id.endsWith('.css')) return 'virtual:style' }, load(id) { if (id === 'virtual:remote-methods.tsx') return source; if (id === 'virtual:style') return '' } }],
  })
  const code = bundle.output.filter(item => item.type === 'chunk').map(item => item.code).join('\n')
  const content = (await Promise.all(['src/components/remote-access-settings.tsx', 'packages/ui/src/dialog-frame.tsx'].map(file => fs.readFile(path.join(root, file), 'utf8')))).join('\n')
  const compiler = await compile(await fs.readFile(path.join(root, 'src/index.css'), 'utf8'), { base: path.join(root, 'src'), onDependency() {} })
  const css = compiler.build([...new Set(content.match(/[A-Za-z0-9_@!:/.[\]()%,-]+/g))])
  const browser = await connectTestBrowser()
  t.after(() => browser.close())
  for (const width of [1100, 390]) await t.test(`${width}px shared remote methods`, async () => {
    const context = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: 'reduce' })
    const page = await context.newPage()
    page.setDefaultTimeout(6000)
    let registrations = 0
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('http://127.0.0.1:5127/**', route => {
      const url = new URL(route.request().url())
      if (url.pathname === '/app.js') return route.fulfill({ contentType: 'text/javascript', body: code })
      if (url.pathname === '/api/remote-access/register') { registrations++; return route.fulfill({ json: { enabled: false, state: 'registering', registrationUrl: 'https://link.mew.run/register/example' } }) }
      if (url.pathname === '/api/remote-access') return route.fulfill({ json: { enabled: false, state: 'disabled' } })
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html class="dark"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}html,body{margin:0;color:#dbe7f5;background:#101827}</style><div id="root"></div><script src="/app.js"></script></html>` })
    })
    await page.goto('http://127.0.0.1:5127/')
    const menuEntry = page.getByRole('button', { name: 'Mewlink', exact: true })
    await menuEntry.click()
    const dialog = page.getByRole('dialog', { name: 'Connect from another device', exact: true })
    await dialog.waitFor()
    const tabs = dialog.getByRole('tab')
    assert.equal(await tabs.count(), 3)
    const mewlink = tabs.filter({ hasText: 'Mewlink' }), tailscale = tabs.filter({ hasText: 'Tailscale' }), cloudflare = tabs.filter({ hasText: 'Cloudflare Tunnel' })
    assert.equal(await mewlink.getAttribute('aria-selected'), 'true')
    await tailscale.click()
    await dialog.getByText('tailscale serve --bg http://127.0.0.1:5127', { exact: true }).waitFor()
    assert.equal(await dialog.getByRole('link', { name: 'Install Tailscale' }).getAttribute('href'), 'https://tailscale.com/download')
    await tailscale.press('End')
    assert.equal(await cloudflare.getAttribute('aria-selected'), 'true')
    await dialog.getByText('http://127.0.0.1:5127', { exact: true }).waitFor()
    assert.equal(await dialog.getByRole('link', { name: 'Cloudflare Tunnel guide' }).getAttribute('target'), '_blank')
    await cloudflare.press('Home')
    assert.equal(await mewlink.getAttribute('aria-selected'), 'true')
    await dialog.getByRole('button', { name: 'Register device', exact: true }).click()
    await dialog.getByRole('link', { name: 'Sign in to finish registration' }).waitFor()
    assert.equal(registrations, 1)
    const box = await dialog.boundingBox()
    assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= 844)
    await page.screenshot({ path: `/tmp/mew-remote-methods-${width}.png` })
    await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'detached' })
    assert.equal(await menuEntry.evaluate(element => element.ownerDocument.activeElement === element), true, 'dismissal returns focus to the menu entry')
    await menuEntry.click()
    await dialog.waitFor()
    assert.equal(await dialog.getByRole('tab').filter({ hasText: 'Mewlink' }).getAttribute('aria-selected'), 'true')
    await dialog.getByRole('button', { name: 'Close', exact: true }).click()
    await dialog.waitFor({ state: 'detached' })
    assert.deepEqual(errors, [])
    await context.close()
  })
})
