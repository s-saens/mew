import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { build } from 'rolldown'
import { connectTestBrowser } from '../../server/test-browser.ts'

const root = path.resolve(import.meta.dirname, '../..')

test('embedded remote desktop stays within its panel and leaves other panels interactive', { timeout: 30_000 }, async t => {
  const source = `import React from 'react';import{createRoot}from'react-dom/client';import{RemoteDesktop}from${JSON.stringify(path.join(root, 'src/components/remote-desktop.tsx'))};import{I18nProvider}from${JSON.stringify(path.join(root, 'src/i18n.tsx'))};function App(){const[open,setOpen]=React.useState(true);return <><button id="other">Other panel</button><div id="panel" style={{position:'relative',width:400,height:300}}>{open&&<RemoteDesktop embedded onClose={()=>setOpen(false)}/>}</div></>}createRoot(document.getElementById('root')).render(<I18nProvider><App/></I18nProvider>);`
  const result = await build({ input: 'virtual:entry.tsx', write: false, platform: 'browser', output: { format: 'iife', inlineDynamicImports: true }, transform: { jsx: 'react-jsx' }, onLog(level, log, handler) { if (log.code !== 'MODULE_LEVEL_DIRECTIVE') handler(level, log) }, plugins: [{ name: 'fixture', resolveId(id) { if (id === 'virtual:entry.tsx' || id.endsWith('.css')) return id }, load(id) {
    if (id === 'virtual:entry.tsx') return source
    if (id.endsWith('.css')) return { code: '', moduleType: 'js' }
    if (id.endsWith('/desktop-connection.ts')) return `export function connectDesktop(){return {input:{release(){},releasePhysical(){}},close(){},fail(){}}}`
  } }] })
  const chunk = result.output.find(item => item.type === 'chunk')!
  const css = await fs.readFile(path.join(root, 'src/components/remote-desktop.css'), 'utf8')
  const browser = await connectTestBrowser()
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } })
  await page.route('http://desktop-fixture.test/**', route => route.fulfill({ contentType: 'text/html', body: `<style>${css}</style><div id="root"></div><script>${chunk.code}</script>` }))
  await page.goto('http://desktop-fixture.test/')
  const viewer = page.locator('.remote-desktop[data-embedded]')
  await viewer.waitFor()
  assert.equal(await viewer.getAttribute('role'), 'region')
  assert.equal(await viewer.getAttribute('aria-modal'), null)
  assert.deepEqual(await viewer.evaluate(element => { const r = element.getBoundingClientRect(); return [r.width, r.height] }), [400, 300])
  await page.locator('#other').click()
  assert.equal(await page.locator('#other').evaluate(element => element.ownerDocument.activeElement === element), true)
  await viewer.locator('.desktop-close').click()
  await viewer.waitFor({ state: 'detached' })
})
