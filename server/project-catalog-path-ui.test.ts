import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { build } from 'rolldown'
import { connectTestBrowser } from './test-browser.ts'

const root = path.resolve(import.meta.dirname, '..')

test('project catalog shows external paths beside names and keeps managed paths hidden', { timeout: 30_000 }, async () => {
  const source = `import React from '${root}/node_modules/react/index.js';
import {createRoot} from '${root}/node_modules/react-dom/client.js';
import {ProjectCatalogPanel} from '${root}/src/components/project-catalog-panel.tsx';
import {I18nProvider} from '${root}/src/i18n.tsx';
createRoot(document.getElementById('root')).render(<I18nProvider><ProjectCatalogPanel paths={[]} selection onOpen={()=>{}}/></I18nProvider>);`
  const bundle = await build({ onLog(level, log, handler) { if (log.code !== 'MODULE_LEVEL_DIRECTIVE') handler(level, log) }, input: 'virtual:catalog.tsx', write: false, platform: 'browser', output: { format: 'iife' }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } }, plugins: [{ name: 'fixture', resolveId(id) { if (id === 'virtual:catalog.tsx') return id; if (id.endsWith('.css')) return 'virtual:style' }, load(id) { if (id === 'virtual:catalog.tsx') return source; if (id === 'virtual:style') return '' } }] })
  const chunk = bundle.output.find(item => item.type === 'chunk')!
  const browser = await connectTestBrowser()
  try {
    const context = await browser.newContext()
    const page = await context.newPage()
    await context.route('http://catalog.test/**', route => {
      const url = new URL(route.request().url())
      if (url.pathname === '/api/project-registry') return route.fulfill({ json: { projects: [
        { path: '/home/me/.mew/projects/managed', name: 'managed', inManagedRoot: true, managed: true, mine: false, icon: null },
        { path: '/home/me/code/external', name: 'external', inManagedRoot: false, managed: false, mine: false, icon: null },
      ] } })
      if (url.pathname === '/app.js') return route.fulfill({ contentType: 'text/javascript', body: chunk.code })
      return route.fulfill({ contentType: 'text/html', body: '<div id="root"></div><script src="/app.js"></script>' })
    })
    await page.goto('http://catalog.test/')
    const inside = page.locator('[data-catalog-project="/home/me/.mew/projects/managed"]')
    const outside = page.locator('[data-catalog-project="/home/me/code/external"]')
    await outside.waitFor()
    assert.equal(await inside.locator('.text-xs').count(), 0)
    assert.equal(await outside.locator('.text-xs').textContent(), '/home/me/code/external')
    assert.match((await outside.locator('.mew-project-catalog-open').getAttribute('aria-label'))!, /\/home\/me\/code\/external/)
    await context.close()
  } finally { await browser.close() }
})
