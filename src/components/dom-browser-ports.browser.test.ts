import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { compile } from '@tailwindcss/node'
import { build } from 'rolldown'
import { chromium, type Route } from 'playwright-core'
import { domBrowserExecutable } from '../../server/browser-dom-executable.ts'

const root = path.resolve(import.meta.dirname, '../..')

test('localhost browser start page lists safe ports, blocks Mew and recovers without stale requests', { skip: !domBrowserExecutable(), timeout: 45_000 }, async t => {
  const component = path.join(root, 'src/components/DomBrowserPorts.tsx')
  const source = `import React from ${JSON.stringify(import.meta.resolve('react'))};
    import {createRoot} from ${JSON.stringify(import.meta.resolve('react-dom/client'))};
    import {setUiLocale} from ${JSON.stringify(path.join(root, 'packages/ui/src/i18n-core.ts'))};
    import {DomBrowserPorts} from ${JSON.stringify(component)};
    setUiLocale('en');window.opened=[];window.portRequests=[];
    window.mewFetch=(input,init)=>{const request={url:String(input),aborted:false};window.portRequests.push(request);init.signal.addEventListener('abort',()=>request.aborted=true,{once:true});return fetch(input,{...init,signal:location.search.includes('ignore-abort')?undefined:init.signal})};
    function Fixture(){const [open,setOpen]=React.useState(true);return <><button id="toggle" onClick={()=>setOpen(value=>!value)}>Toggle fixture</button><main style={{height:440}}>{open&&<DomBrowserPorts onOpen={url=>window.opened.push(url)}/>}</main></>}
    createRoot(document.getElementById('root')).render(<Fixture/>);`
  const bundle = await build({ input: 'virtual:ports.tsx', write: false, logLevel: 'silent', platform: 'browser', output: { format: 'esm' }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('production') } }, plugins: [{
    name: 'isolated-localhost-ports',
    resolveId(id) { if (id.startsWith('virtual:')) return id; if (id.endsWith('/remote-transport')) return 'virtual:transport'; if (id.endsWith('.css')) return 'virtual:style' },
    load(id) {
      if (id === 'virtual:ports.tsx') return source
      if (id === 'virtual:transport') return 'export const mewFetch=(input,init)=>window.mewFetch(input,init)'
      if (id === 'virtual:style') return ''
    },
  }] })
  const chunks = bundle.output.filter(item => item.type === 'chunk'), entry = chunks.find(item => item.isEntry)!
  const scripts = new Map(chunks.map(item => [`/${item.fileName}`, item.code]))
  const content = (await Promise.all([component, path.join(root, 'packages/ui/src/HoverTipLayer.tsx')].map(file => fs.readFile(file, 'utf8')))).join('\n')
  const compiler = await compile(await fs.readFile(path.join(root, 'src/index.css'), 'utf8'), { base: path.join(root, 'src'), onDependency() {} })
  const css = compiler.build([...new Set(content.match(/[A-Za-z0-9_@:/.[\]()%,-]+/g))]) + await fs.readFile(path.join(root, 'packages/ui/src/loading-indicator.css'), 'utf8')
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  t.after(() => browser.close())

  const fixture = async (width = 1100, ignoreAbort = false) => {
    const page = await browser.newPage({ viewport: { width, height: 650 }, hasTouch: width < 600, isMobile: width < 600 })
    page.setDefaultTimeout(5000)
    const errors: string[] = [], routes: Route[] = [], waiters = new Map<number, (route: Route) => void>()
    page.on('pageerror', error => errors.push(error.message))
    await page.route('https://ports.test/**', async route => {
      const pathname = new URL(route.request().url()).pathname
      if (scripts.has(pathname)) { await route.fulfill({ contentType: 'text/javascript', body: scripts.get(pathname)! }); return }
      if (pathname === '/api/dom-browser/ports') { const index = routes.push(route) - 1; waiters.get(index)?.(route); waiters.delete(index); return }
      await route.fulfill({ contentType: 'text/html', body: `<html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}body{margin:0;background:var(--color-surface-deep);color:var(--color-ink);font-family:system-ui}#toggle{position:fixed;bottom:0}</style></head><body><div id="root"></div><script type="module" src="/${entry.fileName}"></script></body></html>` })
    })
    await page.goto(`https://ports.test/${ignoreAbort ? '?ignore-abort' : ''}`)
    return { page, errors, request: (index: number) => routes[index] ? Promise.resolve(routes[index]) : new Promise<Route>(resolve => waiters.set(index, resolve)) }
  }

  for (const width of [1100, 390]) await t.test(width === 1100 ? 'desktop safe selection and refresh' : 'mobile safe selection and refresh', async () => {
    const { page, errors, request } = await fixture(width)
    try {
      await page.getByRole('status', { name: 'Loading…' }).waitFor()
      await (await request(0)).fulfill({ json: { ports: [
        { port: 5173, kind: 'app' }, { port: 5000, kind: 'mew' }, { port: 9222, kind: 'blocked' }, { port: 3000, kind: 'app' },
        { port: 0, kind: 'app' }, { port: 65536, kind: 'app' }, { port: '8000', kind: 'app' }, { port: 8001, kind: 'unknown' },
        { port: 5000, kind: 'app' }, { port: 3000, kind: 'app' },
      ] } })
      await page.getByRole('button', { name: 'Mew 5000', exact: true }).waitFor()
      assert.equal(await page.getByRole('button', { name: 'Mew 5000', exact: true }).isDisabled(), true)
      assert.equal(await page.getByRole('button', { name: '(Unnamed) 9222 Unavailable', exact: true }).isDisabled(), true)
      assert.deepEqual(await page.locator('li button').allTextContents(), ['(Unnamed)3000', 'Mew5000', '(Unnamed)5173', '(Unnamed)9222Unavailable'])
      assert.deepEqual(await page.evaluate('window.opened'), [])
      assert.equal(await page.locator('[data-dom-browser-ports]').evaluate(element => element.scrollWidth <= element.clientWidth), true)
      if (process.env.MEW_BROWSER_CAPTURE_DIR) {
        await fs.mkdir(process.env.MEW_BROWSER_CAPTURE_DIR, { recursive: true })
        await page.screenshot({ path: path.join(process.env.MEW_BROWSER_CAPTURE_DIR, `ports-${width === 1100 ? 'desktop' : 'mobile'}.png`), fullPage: true })
      }
      await page.getByRole('button', { name: '(Unnamed) 5173', exact: true }).click()
      assert.deepEqual(await page.evaluate('window.opened'), ['http://localhost:5173/'])
      await page.getByRole('button', { name: 'Refresh', exact: true }).click()
      await (await request(1)).fulfill({ json: { ports: [{ port: 8080, kind: 'app' }] } })
      await page.getByRole('button', { name: '(Unnamed) 8080', exact: true }).waitFor()
      assert.equal(await page.locator('li').count(), 1)
      assert.deepEqual(errors, [])
    } finally { await page.close() }
  })

  for (const width of [1100, 390]) await t.test(`page titles stay readable and safe at ${width}px`, async () => {
    const { page, errors, request } = await fixture(width)
    const longTitle = 'My development app · ' + 'Long page title '.repeat(25)
    try {
      await (await request(0)).fulfill({ json: { ports: [
        { port: 3000, kind: 'app', title: '  Along · Team workspace  ' },
        { port: 5173, kind: 'app', title: longTitle },
        { port: 8080, kind: 'app', title: '<img src=x onerror="window.titleScriptRan=true">' },
        { port: 8081, kind: 'app', title: { invalid: true } },
        { port: 8082, kind: 'app', title: '   ' },
        { port: 8083, kind: 'app', title: 'X' + '🐈'.repeat(200) },
        { port: 5000, kind: 'mew', title: 'Wrong title' },
        { port: 9222, kind: 'blocked', title: 'Hidden title' },
      ] } })
      const app = page.getByRole('button', { name: 'Along · Team workspace 3000', exact: true })
      await app.waitFor()
      assert.equal(await page.getByRole('button', { name: 'Mew 5000', exact: true }).isDisabled(), true)
      assert.equal(await page.getByRole('button', { name: '(Unnamed) 9222 Unavailable', exact: true }).isDisabled(), true)
      await page.getByRole('button', { name: '(Unnamed) 8081', exact: true }).waitFor()
      await page.getByRole('button', { name: '(Unnamed) 8082', exact: true }).waitFor()
      const title = page.locator('li button [data-tip]').filter({ hasText: 'My development app' })
      assert.equal((await title.textContent())?.length, 200)
      const unicodeTitle = page.locator('li').filter({ has: page.locator('[data-port-badge]', { hasText: /^8083$/ }) }).locator('[data-tip]')
      assert.equal(await unicodeTitle.textContent(), 'X' + '🐈'.repeat(199), 'title limits preserve complete Unicode characters')
      assert.equal(await title.evaluate(element => element.scrollWidth > element.clientWidth), true)
      assert.equal(await page.locator('[data-dom-browser-ports]').evaluate(element => element.scrollWidth <= element.clientWidth), true)
      assert.equal(await page.locator('li img').count(), 0)
      assert.equal(await page.evaluate('Boolean(window.titleScriptRan)'), false)
      assert.equal(await app.locator('[data-port-name]').textContent(), 'Along · Team workspace')
      assert.equal(await app.locator('[data-port-badge]').textContent(), '3000')
      const labelBounds = await app.locator('[data-port-name]').boundingBox()
      const tagBounds = await app.locator('[data-port-badge]').boundingBox()
      assert.ok(labelBounds && tagBounds && labelBounds.x + labelBounds.width <= tagBounds.x, 'title precedes the port tag')
      assert.notEqual(await app.locator('[data-port-badge]').evaluate(element => element.ownerDocument.defaultView!.getComputedStyle(element).backgroundColor), 'rgba(0, 0, 0, 0)')
      if (process.env.MEW_BROWSER_CAPTURE_DIR) {
        await fs.mkdir(process.env.MEW_BROWSER_CAPTURE_DIR, { recursive: true })
        await page.screenshot({ path: path.join(process.env.MEW_BROWSER_CAPTURE_DIR, `port-titles-${width}.png`), fullPage: true })
      }
      await app.click()
      assert.deepEqual(await page.evaluate('window.opened'), ['http://localhost:3000/'])
      await page.getByRole('button', { name: 'Refresh', exact: true }).click()
      await (await request(1)).fulfill({ json: { ports: [{ port: 3000, kind: 'app', title: 'Renamed app' }] } })
      await page.getByRole('button', { name: 'Renamed app 3000', exact: true }).waitFor()
      assert.deepEqual(errors, [])
    } finally { await page.close() }
  })

  for (const width of [1100, 390]) await t.test(`page titles take priority over actual listener names at ${width}px`, async () => {
    const { page, errors, request } = await fixture(width)
    try {
      await (await request(0)).fulfill({ json: { ports: [
        { port: 5432, kind: 'app', processName: 'postgres' },
        { port: 22, kind: 'app', processName: '  sshd  ' },
        { port: 5173, kind: 'app', title: 'Along', processName: 'node' },
        { port: 5000, kind: 'mew', processName: 'Ignore me', title: 'Wrong title' },
        { port: 6379, kind: 'app', processName: { invalid: true } },
        { port: 9222, kind: 'blocked', processName: 'node' },
      ] } })
      await page.getByRole('button', { name: 'postgres 5432', exact: true }).waitFor()
      assert.deepEqual(await page.locator('[data-port-name]').allTextContents(), ['sshd', 'Mew', 'Along', 'postgres', '(Unnamed)', 'node'])
      assert.deepEqual(await page.locator('[data-port-badge]').allTextContents(), ['22', '5000', '5173', '5432', '6379', '9222'])
      assert.equal(await page.getByRole('button', { name: 'Mew 5000', exact: true }).isDisabled(), true)
      assert.equal(await page.getByRole('button', { name: 'node 9222 Unavailable', exact: true }).isDisabled(), true)
      assert.equal(await page.locator('[data-dom-browser-ports]').evaluate(element => element.scrollWidth <= element.clientWidth), true)
      if (process.env.MEW_BROWSER_CAPTURE_DIR) {
        await fs.mkdir(process.env.MEW_BROWSER_CAPTURE_DIR, { recursive: true })
        await page.screenshot({ path: path.join(process.env.MEW_BROWSER_CAPTURE_DIR, `port-services-${width}.png`), fullPage: true })
      }
      await page.getByRole('button', { name: 'Along 5173', exact: true }).click()
      assert.deepEqual(await page.evaluate('window.opened'), ['http://localhost:5173/'])
      assert.deepEqual(errors, [])
    } finally { await page.close() }
  })

  await t.test('empty results, request errors and invalid responses recover with retry', async () => {
    const { page, errors, request } = await fixture()
    try {
      await (await request(0)).fulfill({ json: { ports: [] } })
      await page.getByText('No open ports.', { exact: true }).waitFor()
      await page.getByRole('button', { name: 'Refresh', exact: true }).click()
      await (await request(1)).fulfill({ status: 503, json: { error: 'Temporary failure' } })
      await page.getByRole('alert').waitFor()
      assert.match(await page.getByRole('alert').innerText(), /Could not load ports/)
      await page.getByRole('button', { name: 'Retry', exact: true }).click()
      await (await request(2)).fulfill({ json: { ports: 'invalid' } })
      await page.getByRole('alert').waitFor()
      await page.getByRole('button', { name: 'Retry', exact: true }).click()
      await (await request(3)).fulfill({ json: { ports: [{ port: 8080, kind: 'app' }] } })
      await page.getByRole('button', { name: '(Unnamed) 8080', exact: true }).waitFor()
      assert.equal(await page.getByRole('alert').count(), 0)
      assert.equal(await page.getByText('No open ports.', { exact: true }).count(), 0)
      assert.deepEqual(errors, [])
    } finally { await page.close() }
  })

  await t.test('missing port APIs explain the required server restart and recover after it is available', async () => {
    for (const missing of [
      { status: 404, json: { error: 'Not found' } },
      { status: 404, contentType: 'text/html', body: '<!doctype html><html><body>Mew</body></html>' },
      { status: 200, contentType: 'text/html', body: '<!doctype html><html><body>Mew</body></html>' },
    ]) {
      const { page, errors, request } = await fixture(390)
      try {
        await (await request(0)).fulfill(missing)
        await page.getByRole('alert').getByText('Restart the Mew server with the latest code to load ports.', { exact: true }).waitFor({ timeout: 700 })
        assert.equal(await page.getByText('No open ports.', { exact: true }).count(), 0)
        assert.deepEqual(await page.evaluate('window.opened'), [])
        await page.getByRole('button', { name: 'Retry', exact: true }).click()
        await (await request(1)).fulfill({ json: { ports: [{ port: 5173, kind: 'app' }] } })
        await page.getByRole('button', { name: '(Unnamed) 5173', exact: true }).waitFor()
        assert.equal(await page.getByRole('alert').count(), 0)
        assert.deepEqual(errors, [])
      } finally { await page.close() }
    }
  })

  await t.test('refresh aborts the prior request and rejects stale results', async () => {
    const { page, errors, request } = await fixture(1100, true)
    try {
      const stale = await request(0)
      await page.getByRole('button', { name: 'Refresh', exact: true }).click()
      await (await request(1)).fulfill({ json: { ports: [{ port: 8080, kind: 'app' }] } })
      await page.getByRole('button', { name: '(Unnamed) 8080', exact: true }).waitFor()
      assert.equal(await page.evaluate('window.portRequests[0].aborted'), true)
      await stale.fulfill({ json: { ports: [{ port: 3000, kind: 'app' }] } })
      await page.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
      assert.deepEqual(await page.locator('li button').allTextContents(), ['(Unnamed)8080'])
      assert.deepEqual(await page.evaluate('window.opened'), [])
      assert.deepEqual(errors, [])
    } finally { await page.close() }
  })

  await t.test('unmount cancels loading and a remount starts a fresh request', async () => {
    const { page, errors, request } = await fixture()
    try {
      await request(0)
      await page.getByRole('button', { name: 'Toggle fixture', exact: true }).click()
      assert.equal(await page.evaluate('window.portRequests[0].aborted'), true)
      assert.equal(await page.locator('[data-dom-browser-ports]').count(), 0)
      await page.getByRole('button', { name: 'Toggle fixture', exact: true }).click()
      await (await request(1)).fulfill({ json: { ports: [] } })
      await page.getByText('No open ports.', { exact: true }).waitFor()
      assert.deepEqual(errors, [])
    } finally { await page.close() }
  })
})
