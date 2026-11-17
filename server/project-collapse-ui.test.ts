import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { connectTestBrowser } from './test-browser.ts'

const root = path.resolve(import.meta.dirname, '..')
test('project selection starts collapsed, supports nested expansion, search and root reordering', { timeout: 60_000 }, async () => {
  const source = `import React,{useState} from '${root}/node_modules/react/index.js';
import {createRoot} from '${root}/node_modules/react-dom/client.js';
import {I18nProvider} from '${root}/src/i18n.tsx';
import {ProjectCatalogPanel} from '${root}/src/components/project-catalog-panel.tsx';
function Fixture(){const [paths,setPaths]=useState(['/a','/b']);return <ProjectCatalogPanel selection paths={paths} onOpen={()=>{}} onFavoritesChange={paths=>{window.reordered=paths;setPaths(paths)}}/>}
createRoot(document.getElementById('root')).render(<I18nProvider><Fixture/></I18nProvider>);`
  const bundle = await build({ input: 'virtual:fixture.tsx', write: false, platform: 'browser', output: { format: 'iife', codeSplitting: false }, onLog(level, log, handler) { if (log.code !== 'MODULE_LEVEL_DIRECTIVE') handler(level, log) }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } }, plugins: [{
    name: 'fixture', resolveId(id) { if (id === 'virtual:fixture.tsx') return id; if (id.endsWith('.css')) return 'virtual:style' },
    async load(id) { if (id === 'virtual:fixture.tsx') return source; if (id === 'virtual:style') return ''; if (id.endsWith('?raw')) return `export default ${JSON.stringify(await fs.readFile(id.slice(0, -4), 'utf8'))}` },
  }] })
  const chunk = bundle.output.find(item => item.type === 'chunk')!
  const browser = await connectTestBrowser()
  try {
    for (const width of [1100, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 700 }, locale: 'en-US' })
      const projects = ['/a','/a/child','/a/child/deep','/b'].map(value => ({ path: value, name: value.split('/').pop(), icon: null, mine: true, managed: false }))
      await page.route('http://mew-collapse.test/**', route => {
        const pathname = new URL(route.request().url()).pathname
        if (pathname === '/app.js') return route.fulfill({ contentType: 'text/javascript; charset=utf-8', body: chunk.code })
        if (pathname === '/api/project-registry') return route.fulfill({ json: { projects } })
        return route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><div id="root"></div><script src="/app.js"></script>' })
      })
      await page.goto('http://mew-collapse.test/')
      const rows = () => page.locator('[data-catalog-project]').evaluateAll(els => els.map(el => el.getAttribute('data-catalog-project')))
      const row = (project: string) => page.locator(`[data-catalog-project="${project}"]`)
      await row('/a').waitFor()
      assert.deepEqual(await rows(), ['/a', '/b'])
      const toggle = row('/a').getByRole('button', { name: 'a · +' })
      assert.equal(await toggle.getAttribute('aria-expanded'), 'false')
      await row('/a').getByRole('button', { name: /reorder/i }).press('ArrowDown')
      assert.deepEqual(await rows(), ['/b', '/a'], 'collapsed subprojects do not prevent parent reordering')
      await toggle.click()
      assert.deepEqual(await rows(), ['/b', '/a', '/a/child'])
      await row('/a/child').getByRole('button', { name: 'child · +' }).click()
      assert.deepEqual(await rows(), ['/b', '/a', '/a/child', '/a/child/deep'])
      await row('/a').getByRole('button', { name: 'a · −' }).click()
      const search = page.getByRole('textbox', { name: 'Search projects' })
      await search.fill('deep')
      assert.deepEqual(await rows(), ['/a', '/a/child', '/a/child/deep'], 'search exposes matching descendants and ancestors')
      assert.equal(await row('/a').getByRole('button', { name: 'a · −' }).getAttribute('aria-expanded'), 'true')
      await search.fill('')
      assert.deepEqual(await rows(), ['/b', '/a'], 'clearing search restores the collapsed state')
      await page.close()
    }
  } finally { await browser.close() }
})
