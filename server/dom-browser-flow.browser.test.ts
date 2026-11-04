import './test-isolated-data.ts'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { once } from 'node:events'
import test from 'node:test'
import { compile } from '@tailwindcss/node'
import { build } from 'rolldown'
import { attachDomBrowserWebSocket, closeDomBrowsers } from './dom-browser.ts'
import { domBrowserExecutable } from './browser-dom-executable.ts'
import { connectTestBrowser } from './test-browser.ts'

const root = path.resolve(import.meta.dirname, '..')
const stop = (server: http.Server) => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()) })
async function listen(server: http.Server) {
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`
}

test('real DOM browser viewer and host relay interactive app mutations, focus, assets, navigation and responsive layout', { skip: !domBrowserExecutable(), timeout: 30_000 }, async t => {
  const app = http.createServer((req, res) => {
    if (req.url === '/mark.svg') {
      res.setHeader('content-type', 'image/svg+xml')
      res.end('<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28"><rect width="28" height="28" rx="5" fill="#67e8a5"/></svg>'); return
    }
    res.setHeader('content-type', 'text/html')
    res.end(`<!doctype html><html><head><title>Local application</title><style>body{margin:20px;background:#fcfcfd;color:#232326;font:15px system-ui}main{max-width:560px}h1{font-size:21px;margin:0 0 18px}label{display:block;margin-bottom:6px}input{box-sizing:border-box;width:100%;padding:8px;font:inherit;border:1px solid #bbb;border-radius:5px}button,a{display:inline-block;margin:12px 8px 0 0;padding:8px 12px;font:inherit}output{display:block;margin-top:12px}img{vertical-align:middle}#scroll{height:80px;overflow:auto;margin-top:15px;border:1px solid #ccc}#scroll>div{height:500px;padding:8px;background-image:url('/mark.svg');background-repeat:no-repeat;background-position:right bottom}@media(prefers-color-scheme:dark){body{background:#18181b;color:#fafafa}}</style></head><body><main><h1><img alt="Local mark" src="/mark.svg"> Development app</h1><form><label for="name">Name</label><input id="name"><button id="save" type="submit">Save</button><button id="count" type="button">Increment</button><a href="/second?from=link#view">Next page</a></form><output id="value">Waiting for input</output><output id="saved">Not saved</output><output id="counter">Count: 0</output><output id="path"></output><output id="scheme"></output><div id="scroll"><div>Scrollable content</div></div></main><script>window.__localAppExecuted=true;const media=matchMedia('(prefers-color-scheme:dark)');const renderScheme=()=>document.querySelector('#scheme').textContent='Host theme: '+(media.matches?'dark':'light');media.addEventListener('change',renderScheme);renderScheme();let count=0;document.querySelector('#name').oninput=e=>document.querySelector('#value').textContent='Value: '+e.target.value;document.querySelector('form').onsubmit=e=>{e.preventDefault();document.querySelector('#saved').textContent='Saved: '+document.querySelector('#name').value};document.querySelector('#count').onclick=()=>document.querySelector('#counter').textContent='Count: '+(++count);document.querySelector('#path').textContent=location.pathname+location.search+location.hash;</script></body></html>`)
  })
  const target = await listen(app); t.after(() => stop(app))
  const screenshotDirectory = process.env.MEW_DOM_BROWSER_SCREENSHOTS
  if (screenshotDirectory) await fs.mkdir(screenshotDirectory, { recursive: true })
  const component = path.join(root, 'src/components/DomBrowserPanel.tsx')
  const source = `import React from ${JSON.stringify(import.meta.resolve('react'))};
    import {createRoot} from ${JSON.stringify(import.meta.resolve('react-dom/client'))};
    import {DomBrowserPanel} from ${JSON.stringify(component)};
    import {I18nProvider} from ${JSON.stringify(path.join(root, 'src/i18n.tsx'))};
    function Fixture(){const [open,setOpen]=React.useState(true);return <I18nProvider>{open&&<div style={{height:'100vh',width:'100vw'}}><DomBrowserPanel url=${JSON.stringify(target + '/first?start=1#top')} onClose={()=>setOpen(false)}/></div>}</I18nProvider>}
    createRoot(document.getElementById('root')).render(<Fixture/>);`
  const bundle = await build({ input: 'virtual:dom-flow.tsx', write: false, logLevel: 'silent', platform: 'browser', output: { format: 'esm' }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('production') } }, plugins: [{
    name: 'dom-flow-fixture', resolveId(id) { if (id.startsWith('virtual:')) return id; if (id.endsWith('.css')) return 'virtual:style' },
    load(id) { if (id === 'virtual:dom-flow.tsx') return source; if (id === 'virtual:style') return '' },
  }] })
  const chunks = bundle.output.filter(chunk => chunk.type === 'chunk'), entry = chunks.find(chunk => chunk.isEntry)!
  const scripts = new Map(chunks.map(chunk => [`/${chunk.fileName}`, chunk.code]))
  const styles = await Promise.all([component, path.join(root, 'src/components/DomBrowserPorts.tsx'), path.join(root, 'src/components/DockWorkspace.tsx'), path.join(root, 'src/components/panel-close-button.tsx'), path.join(root, 'packages/ui/src/HoverTipLayer.tsx')].map(file => fs.readFile(file, 'utf8')))
  const compiler = await compile(await fs.readFile(path.join(root, 'src/index.css'), 'utf8'), { base: path.join(root, 'src'), onDependency() {} })
  const css = compiler.build([...new Set(styles.join('\n').match(/[A-Za-z0-9_@:/.[\]()%,-]+/g))])
  const host = http.createServer((req, res) => {
    if (req.url === '/api/dom-browser/ports') {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ ports: [{ port: Number(new URL(target).port), kind: 'app' }, { port: (host.address() as { port: number }).port, kind: 'mew' }] }))
      return
    }
    const script = scripts.get(req.url ?? '')
    if (script !== undefined) { res.setHeader('content-type', 'text/javascript'); res.end(script); return }
    res.setHeader('content-type', 'text/html')
    res.end(`<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script type="module" src="/${entry.fileName}"></script></body></html>`)
  })
  attachDomBrowserWebSocket(host, () => ({ role: 'owner', email: 'dom-flow@example.test', mustChangePassword: false }))
  const origin = await listen(host)
  t.after(async () => { await closeDomBrowsers(); await stop(host) })
  const browser = await connectTestBrowser()
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1040, height: 700 }, locale: 'en-US', colorScheme: null })
  page.setDefaultTimeout(7000)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(origin)
  const frame = page.frameLocator('[data-dom-browser-surface] iframe'), name = frame.getByRole('textbox', { name: 'Name', exact: true })
  await name.waitFor()
  const background = () => frame.locator('body').evaluate(element => element.ownerDocument.defaultView!.getComputedStyle(element).backgroundColor)
  const waitForBackground = async (color: string) => {
    const until = Date.now() + 5000
    while (Date.now() < until) {
      if (await background() === color) return
      await new Promise(resolve => setTimeout(resolve, 25))
    }
    assert.equal(await background(), color)
  }
  await frame.getByText('Host theme: dark', { exact: true }).waitFor()
  await waitForBackground('rgb(24, 24, 27)')
  assert.equal(await page.evaluate('Boolean(window.__localAppExecuted)'), false)
  await frame.getByText('/first?start=1#top', { exact: true }).waitFor()
  await frame.getByRole('button', { name: 'Increment', exact: true }).click()
  await frame.getByText('Count: 1', { exact: true }).waitFor()
  await page.locator('html').evaluate(element => element.classList.remove('dark'))
  await frame.getByText('Host theme: light', { exact: true }).waitFor()
  await waitForBackground('rgb(252, 252, 253)')
  await page.locator('html').evaluate(element => element.classList.add('dark'))
  await frame.getByText('Host theme: dark', { exact: true }).waitFor()
  await waitForBackground('rgb(24, 24, 27)')
  assert.equal(await frame.locator('#counter').textContent(), 'Count: 1', 'theme changes preserve app state')
  await name.focus()
  await name.fill('Mew DOM 한글')
  await frame.getByText('Value: Mew DOM 한글', { exact: true }).waitFor()
  await name.press('Enter')
  await frame.getByText('Saved: Mew DOM 한글', { exact: true }).waitFor()
  assert.equal(await frame.getByRole('img', { name: 'Local mark', exact: true }).evaluate(element => {
    const image = element as unknown as { complete: boolean; naturalWidth: number }
    return image.complete && image.naturalWidth > 0
  }), true)
  assert.match(await frame.getByRole('img', { name: 'Local mark', exact: true }).getAttribute('src') ?? '', /^data:image\/(?:png|svg\+xml);base64,/)
  assert.match(await frame.locator('#scroll>div').evaluate(element => element.ownerDocument.defaultView!.getComputedStyle(element).backgroundImage), /data:image\/svg\+xml;base64,/)
  if (screenshotDirectory) await page.screenshot({ path: path.join(screenshotDirectory, 'mew-dom-browser-desktop.png') })
  await frame.getByRole('link', { name: 'Next page', exact: true }).click()
  await frame.getByText('/second?from=link#view', { exact: true }).waitFor()
  await frame.getByText('Host theme: dark', { exact: true }).waitFor()
  await waitForBackground('rgb(24, 24, 27)')
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await frame.getByText('/first?start=1#top', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Forward', exact: true }).click()
  await frame.getByText('/second?from=link#view', { exact: true }).waitFor()
  await page.setViewportSize({ width: 390, height: 700 })
  await page.locator('html').evaluate(element => element.classList.remove('dark'))
  await frame.getByText('Host theme: light', { exact: true }).waitFor()
  await waitForBackground('rgb(252, 252, 253)')
  await name.fill('Mobile input')
  await frame.getByText('Value: Mobile input', { exact: true }).waitFor()
  await name.press('Enter')
  await frame.getByText('Saved: Mobile input', { exact: true }).waitFor()
  const toolbar = await page.getByRole('textbox', { name: 'Browser address', exact: true }).boundingBox()
  assert.ok(toolbar && toolbar.width > 100 && toolbar.x + toolbar.width <= 390)
  if (screenshotDirectory) await page.screenshot({ path: path.join(screenshotDirectory, 'mew-dom-browser-mobile.png') })
  await page.getByRole('button', { name: 'Open ports', exact: true }).click()
  const ports = page.locator('[data-dom-browser-ports]')
  const openApp = ports.getByRole('button', { name: `(Unnamed) ${new URL(target).port}`, exact: true })
  await openApp.waitFor()
  assert.equal(await ports.getByRole('button', { name: `Mew ${new URL(origin).port}`, exact: true }).isDisabled(), true)
  assert.equal(await page.locator('[data-dom-browser-surface] iframe').count(), 0)
  if (screenshotDirectory) await page.screenshot({ path: path.join(screenshotDirectory, 'mew-dom-browser-ports-mobile.png') })
  await openApp.click()
  await frame.getByText('Count: 0', { exact: true }).waitFor()
  await frame.getByText('Host theme: light', { exact: true }).waitFor()
  await waitForBackground('rgb(252, 252, 253)')
  await frame.getByRole('button', { name: 'Increment', exact: true }).click()
  await frame.getByText('Count: 1', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Close browser', exact: true }).click()
  assert.equal(await page.locator('[data-dom-browser]').count(), 0)
  assert.deepEqual(errors, [])
})
