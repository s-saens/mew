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

test('project drag and keyboard reorder stay within sibling groups and carry expanded subtrees', { timeout: 60_000 }, async () => {
  const source = `import React,{useState} from '${root}/node_modules/react/index.js';
import {createRoot} from '${root}/node_modules/react-dom/client.js';
import {I18nProvider} from '${root}/src/i18n.tsx';
import {ProjectCatalogPanel} from '${root}/src/components/project-catalog-panel.tsx';
function Fixture(){const [paths,setPaths]=useState(['/a','/a/one','/a/one/deep','/a/two','/b','/b/leaf','/c']);return <ProjectCatalogPanel selection paths={paths} onOpen={()=>{}} onFavoritesChange={next=>{window.moves.push(next);setPaths(next)}}/>}
window.moves=[];createRoot(document.getElementById('root')).render(<I18nProvider><Fixture/></I18nProvider>);`
  const bundle = await build({ input: 'virtual:drag-fixture.tsx', write: false, platform: 'browser', output: { format: 'iife', codeSplitting: false }, onLog(level, log, handler) { if (log.code !== 'MODULE_LEVEL_DIRECTIVE') handler(level, log) }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } }, plugins: [{
    name: 'fixture', resolveId(id) { if (id === 'virtual:drag-fixture.tsx') return id; if (id.endsWith('.css')) return 'virtual:style' },
    async load(id) { if (id === 'virtual:drag-fixture.tsx') return source; if (id === 'virtual:style') return ''; if (id.endsWith('?raw')) return `export default ${JSON.stringify(await fs.readFile(id.slice(0, -4), 'utf8'))}` },
  }] })
  const chunk = bundle.output.find(item => item.type === 'chunk')!
  const browser = await connectTestBrowser()
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 900 }, hasTouch: true, reducedMotion: 'reduce', locale: 'en-US' })
    const projects = ['/a','/a/one','/a/one/deep','/a/two','/b','/b/leaf','/c'].map(value => ({ path: value, name: value.split('/').pop(), icon: null, mine: true, managed: false, inManagedRoot: true }))
    await page.route('http://mew-drag.test/**', route => {
      const pathname = new URL(route.request().url()).pathname
      if (pathname === '/app.js') return route.fulfill({ contentType: 'text/javascript', body: chunk.code })
      if (pathname === '/api/project-registry') return route.fulfill({ json: { projects } })
      return route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><style>[data-catalog-project]{display:flex;align-items:center;height:44px}[data-catalog-project] button{height:38px}.mew-menu-reorder-handle{touch-action:none}</style><div id="root"></div><script src="/app.js"></script>' })
    })
    await page.goto('http://mew-drag.test/')
    const row = (project: string) => page.locator(`[data-catalog-project="${project}"]`)
    const rows = () => page.locator('[data-catalog-project]').evaluateAll(elements => elements.map(element => element.getAttribute('data-catalog-project')))
    await row('/a').waitFor()
    await row('/a').getByRole('button', { name: 'a · +' }).click()
    await row('/a/one').getByRole('button', { name: 'one · +' }).click()
    await row('/b').getByRole('button', { name: 'b · +' }).click()
    assert.deepEqual(await rows(), ['/a', '/a/one', '/a/one/deep', '/a/two', '/b', '/b/leaf', '/c'])
    const drag = async (sourcePath: string, destinations: string[]) => {
      const handle = row(sourcePath).getByRole('button', { name: /reorder/i })
      const start = (await handle.boundingBox())!
      await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
      await page.mouse.down()
      for (const destination of destinations) {
        const box = (await row(destination).boundingBox())!
        await page.mouse.move(start.x + start.width / 2, box.y + box.height / 2 + (box.y < start.y ? -2 : 2), { steps: 5 })
      }
      await page.mouse.up()
    }
    const before = await rows()
    await drag('/a/one/deep', ['/c'])
    assert.deepEqual(await rows(), before, 'a single child never previews or commits an unrelated root move')
    assert.deepEqual(await page.evaluate('window.moves'), [])
    await row('/a/one').getByRole('button', { name: /reorder/i }).press('ArrowDown')
    assert.deepEqual(await rows(), ['/a', '/a/two', '/a/one', '/a/one/deep', '/b', '/b/leaf', '/c'], 'keyboard moves a sibling with its expanded subtree')
    await drag('/a/one', ['/a/two'])
    assert.deepEqual(await rows(), before, 'dragging swaps siblings with their descendants intact')
    await drag('/a', ['/b', '/c'])
    assert.deepEqual(await rows(), ['/b', '/b/leaf', '/c', '/a', '/a/one', '/a/one/deep', '/a/two'], 'continuous dragging moves the root and its expanded subtree through two roots')
    const touch = await page.context().newCDPSession(page)
    const start = (await row('/a').getByRole('button', { name: /reorder/i }).boundingBox())!
    const destination = (await row('/b').boundingBox())!
    const x = start.x + start.width / 2, startY = start.y + start.height / 2, endY = destination.y + destination.height / 2 - 2
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: startY }] })
    for (let step = 1; step <= 10; step++) await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: startY + (endY - startY) * step / 10 }] })
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await touch.detach()
    assert.deepEqual(await rows(), before, 'touch drag restores the root and all expanded descendants across siblings')
    await page.close()
  } finally { await browser.close() }
})
