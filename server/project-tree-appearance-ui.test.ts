import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { connectTestBrowser } from './test-browser.ts'

const root = path.resolve(import.meta.dirname, '..')

test('project tree guides follow hierarchy while drag handles stay aligned', { timeout: 45_000 }, async () => {
  const source = `import React from '${root}/node_modules/react/index.js';
import {createRoot} from '${root}/node_modules/react-dom/client.js';
import {I18nProvider} from '${root}/src/i18n.tsx';
import {ProjectCatalogPanel} from '${root}/src/components/project-catalog-panel.tsx';
createRoot(document.getElementById('root')).render(<I18nProvider><ProjectCatalogPanel selection paths={['/a','/b','/a/child','/a/child/deep']} onOpen={()=>{}} onFavoritesChange={()=>{}}/></I18nProvider>);`
  const bundle = await build({ input: 'virtual:tree.tsx', write: false, platform: 'browser', output: { format: 'iife', codeSplitting: false }, onLog(level, log, handler) { if (log.code !== 'MODULE_LEVEL_DIRECTIVE') handler(level, log) }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } }, plugins: [{
    name: 'fixture', resolveId(id) { if (id === 'virtual:tree.tsx') return id; if (id.endsWith('.css')) return 'virtual:style' },
    async load(id) { if (id === 'virtual:tree.tsx') return source; if (id === 'virtual:style') return ''; if (id.endsWith('?raw')) return `export default ${JSON.stringify(await fs.readFile(id.slice(0, -4), 'utf8'))}` },
  }] })
  const chunk = bundle.output.find(item => item.type === 'chunk')!
  const css = (await Promise.all(['src/components/project-sidebar.css', 'packages/ui/src/action-menu.css'].map(file => fs.readFile(path.join(root, file), 'utf8')))).join('\n')
  const browser = await connectTestBrowser()
  try {
    for (const width of [320, 390, 1100]) {
      const page = await browser.newPage({ viewport: { width, height: 700 }, locale: 'en-US' })
      await page.route('http://tree-appearance.test/**', route => {
        const pathname = new URL(route.request().url()).pathname
        if (pathname === '/app.js') return route.fulfill({ contentType: 'text/javascript', body: chunk.code })
        if (pathname === '/api/project-registry') return route.fulfill({ json: { projects: ['/a', '/a/child', '/a/child/deep', '/b'].map(path => ({ path, name: path.split('/').pop(), icon: null, inManagedRoot: true })) } })
        return route.fulfill({ contentType: 'text/html', body: `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{--color-edge-strong:#888;--color-ink-muted:#888}body{margin:0}${css}</style><div id="root"></div><script src="/app.js"></script>` })
      })
      await page.goto('http://tree-appearance.test/')
      const row = (project: string) => page.locator(`[data-catalog-project="${project}"]`)
      await row('/a').waitFor()
      assert.equal(await page.locator('[data-project-tree-guide]').count(), 0, 'collapsed roots have no guides')
      await row('/a').locator('button[aria-expanded]').click()
      await row('/a/child').locator('button[aria-expanded]').click()
      assert.equal(await row('/a/child').locator('[data-project-tree-guide]').count(), 1)
      assert.equal(await row('/a/child/deep').locator('[data-project-tree-guide]').count(), 2)
      const handles = await Promise.all(['/a', '/a/child', '/a/child/deep', '/b'].map(project => row(project).locator('.mew-menu-reorder-handle').boundingBox()))
      assert.ok(handles.every(box => box && Math.abs(box.x - handles[0]!.x) < 1), 'handles remain in the same column at every depth')
      assert.equal(await row('/a').locator('.mew-menu-reorder-handle[aria-expanded="true"]').count(), 1, 'the expander is also the only reorder handle')
      assert.equal(await row('/b').locator('button[aria-expanded]').count(), 0, 'leaf rows keep only their drag handle')
      assert.equal(await row('/b').locator('.mew-menu-reorder-handle circle').count(), 6, 'the leaf handle keeps its dotted icon')
      const roots = await Promise.all(['/a', '/b'].map(project => row(project).locator('.mew-project-catalog-open').boundingBox()))
      assert.ok(roots[0] && roots[1] && Math.abs(roots[0].x - roots[1].x) < 1, 'root icons align whether or not the row has children')
      const parent = await row('/a').locator('.mew-project-catalog-open').boundingBox()
      const child = await row('/a/child').locator('.mew-project-catalog-open').boundingBox()
      const deep = await row('/a/child/deep').locator('.mew-project-catalog-open').boundingBox()
      assert.ok(parent && child && deep && child.x > parent.x && deep.x > child.x, 'content is indented by hierarchy depth')
      const guideColor = await row('/a/child').locator('[data-project-tree-guide]').evaluate(element => element.ownerDocument.defaultView!.getComputedStyle(element).backgroundColor)
      assert.equal(guideColor, 'rgb(136, 136, 136)', 'guides use the explorer edge color')
      await page.getByRole('textbox', { name: 'Search projects' }).fill('deep')
      assert.equal(await row('/a/child/deep').locator('[data-project-tree-guide]').count(), 2, 'search preserves ancestor guides')
      await page.close()
    }
  } finally { await browser.close() }
})
