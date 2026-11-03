import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { chromium } from 'playwright-core'
import { domBrowserExecutable } from './browser-dom-executable.ts'

const root = path.resolve(import.meta.dirname, '..')

test('inline project catalog loads on expansion, preserves hierarchy and separates opening from personal shortcuts', { skip: !domBrowserExecutable(), timeout: 60_000 }, async () => {
  const source = `import React,{useState} from '${root}/node_modules/react/index.js';
import {createRoot} from '${root}/node_modules/react-dom/client.js';
import {ProjectCatalogPanel} from '${root}/src/components/project-catalog-panel.tsx';
import {ProjectSwitcher} from '${root}/src/components/ProjectSwitcher.tsx';
import {I18nProvider} from '${root}/src/i18n.tsx';
window.opens=[];window.events=[];window.changes=0;window.addTarget='/projects/main/nested';
function Fixture(){const [paths,setPaths]=useState(['/projects/main']);const [width,setWidth]=useState(240);const [switcher,setSwitcher]=useState(false);
window.setPanelWidth=setWidth;window.showSwitcher=setSwitcher;
return <main className="h-screen bg-surface text-ink"><section id="catalog-host" className={width===390?'mew-mobile-project-panel':''} style={{width,maxWidth:'100%',height:'100%',display:'flex',flexDirection:'column',minWidth:0}}>
<div style={{flex:1}}>My projects</div><ProjectCatalogPanel paths={paths} onOpen={async p=>{window.opens.push(p)}} beforeMutation={async()=>{window.events.push('before')}} onProjectsChanged={async()=>{window.events.push('changed');window.changes++;setPaths(prev=>[...prev,window.addTarget])}}/>
</section>{switcher&&<header style={{position:'fixed',top:0,right:0}}><ProjectSwitcher paths={['/projects/main/nested','/other','/projects/main','/projects/main/nested/deep']} activePath='/projects/main' fallbackLabel='work' canOpen canChangeIcon={false} icons={{}} onActivate={p=>window.opens.push(p)} onIconChange={()=>{}} onOpen={()=>{}}/></header>}</main>}
createRoot(document.getElementById('root')).render(<I18nProvider><Fixture/></I18nProvider>);`
  const bundle = await build({
    input: 'virtual:project-catalog.tsx', onLog(level, log, handler) { if (log.code !== 'MODULE_LEVEL_DIRECTIVE') handler(level, log) }, write: false, platform: 'browser', output: { format: 'iife' },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
    plugins: [{ name: 'fixture', resolveId(id) { if (id === 'virtual:project-catalog.tsx') return id; if (id.endsWith('.css')) return 'virtual:style' }, async load(id) { if (id === 'virtual:project-catalog.tsx') return source; if (id === 'virtual:style') return ''; if (id.endsWith('?raw')) return 'export default ' + JSON.stringify(await fs.readFile(id.slice(0, -4), 'utf8')) } }],
  })
  const chunk = bundle.output.find(item => item.type === 'chunk')!
  const content = (await Promise.all(['src/components/project-catalog-panel.tsx', 'src/components/ProjectSwitcher.tsx', 'packages/ui/src/dialog-frame.tsx'].map(file => fs.readFile(path.join(root, file), 'utf8')))).join('\n')
  const compiler = await compile(await fs.readFile(`${root}/src/index.css`, 'utf8'), { base: `${root}/src`, onDependency() {} })
  const css = compiler.build([...new Set((source + content).match(/[A-Za-z0-9_@!:/.[\]()%,-]+/g))])
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  try {
    const context = await browser.newContext({ viewport: { width: 1100, height: 700 }, hasTouch: true })
    const page = await context.newPage()
    page.setDefaultTimeout(4000)
    const pageErrors: string[] = []
    page.on('pageerror', error => pageErrors.push(error.message))
    let queries = 0
    let failQuery = true
    let failPin = false
    const mutations: unknown[] = []
    const projects = [
      { path: '/projects/main/nested/deep', name: 'deep', parentPath: '/projects/main/nested' },
      { path: '/projects/main', name: 'main' },
      { path: '/projects/main/nested', name: 'nested', parentPath: '/projects/main' },
      { path: '/other/main', name: 'main' },
      { path: '/projects/a-very-long-project-name-that-must-fit-even-in-a-narrow-sidebar', name: 'a-very-long-project-name-that-must-fit-even-in-a-narrow-sidebar' },
    ].map(project => ({ ...project, managed: false, mine: project.path === '/projects/main', icon: null }))
    await context.route('http://mew-project-catalog.test/**', async route => {
      const url = new URL(route.request().url())
      if (url.pathname === '/api/project-registry') {
        queries++
        return route.fulfill(failQuery ? { status: 503, json: { error: 'Catalog unavailable' } } : { json: { projects } })
      }
      if (url.pathname === '/api/project-registry/mine') {
        mutations.push(route.request().postDataJSON())
        await page.evaluate('window.events.push("put")')
        return route.fulfill(failPin ? { status: 503, json: { error: 'Shortcut save failed' } } : { json: { ok: true } })
      }
      if (url.pathname === '/app.js') return route.fulfill({ contentType: 'text/javascript', body: chunk.code })
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html class="dark"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script src="/app.js"></script></html>` })
    })
    await page.addInitScript("localStorage.setItem('mew:locale','en')")
    await page.goto('http://mew-project-catalog.test/')
    const toggle = page.getByRole('button', { name: 'All projects', exact: true })
    const search = page.getByRole('textbox', { name: 'Search projects', exact: true })
    const row = (project: string) => page.locator(`[data-catalog-project="${project}"]`)
    const visibleRows = () => page.locator('[data-catalog-project]').evaluateAll(elements => elements.map(element => element.getAttribute('data-catalog-project')))
    await toggle.waitFor()
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false')
    assert.equal(queries, 0, 'collapsed footer does not fetch the shared catalog')
    assert.equal(await search.count(), 0)
    await toggle.focus(); await page.keyboard.press('Enter')
    await page.getByRole('alert').waitFor()
    assert.match(await page.getByRole('alert').textContent() ?? '', /Catalog unavailable/)
    const retry = page.getByRole('button', { name: 'Try again', exact: true })
    await retry.focus()
    assert.equal(await retry.evaluate(element => element === element.ownerDocument.activeElement), true)
    failQuery = false
    await page.keyboard.press('Enter')
    await row('/projects/main/nested/deep').waitFor()
    assert.equal(queries, 2)
    assert.deepEqual(await visibleRows(), ['/projects/main', '/projects/main/nested', '/projects/main/nested/deep', '/other/main', projects[4].path])
    assert.equal(await row('/projects/main/nested').getAttribute('data-project-depth'), '1')
    assert.equal(await row('/projects/main/nested/deep').getAttribute('data-project-depth'), '2')
    assert.equal(await page.getByRole('button', { name: 'main (/projects/main) · In My projects', exact: true }).isDisabled(), true)
    assert.equal(await page.getByRole('button', { name: 'main (/other/main) · Add to My projects', exact: true }).count(), 1)

    await search.fill('deep')
    assert.deepEqual(await visibleRows(), ['/projects/main', '/projects/main/nested', '/projects/main/nested/deep'], 'search retains all project ancestors')
    await search.fill('no-matching-project')
    assert.equal(await page.locator('[data-catalog-project]').count(), 0)
    assert.equal(await page.getByText('No matching projects.').isVisible(), true)
    await search.fill('')
    await row('/projects/main/nested').locator('.mew-project-catalog-open').focus()
    await page.keyboard.press('Enter')
    assert.deepEqual(await page.evaluate('window.opens'), ['/projects/main/nested'])
    assert.deepEqual(mutations, [], 'opening a shared project does not create a shortcut')
    const addNested = page.getByRole('button', { name: 'nested · Add to My projects', exact: true })
    await addNested.focus()
    await page.keyboard.press('Enter')
    await page.waitForFunction('window.changes===1')
    assert.deepEqual(mutations, [{ path: '/projects/main/nested', added: true }])
    assert.deepEqual(await page.evaluate('window.events'), ['before', 'put', 'changed'])
    assert.equal(await page.getByRole('button', { name: 'nested · In My projects', exact: true }).isDisabled(), true)
    await row('/projects/main/nested').locator('.mew-project-catalog-open:focus').waitFor()
    assert.equal(await row('/projects/main/nested').locator('.mew-project-catalog-open').evaluate(element => element === element.ownerDocument.activeElement), true, 'pinning preserves keyboard focus through personal-list refresh')
    assert.deepEqual(await page.evaluate('window.opens'), ['/projects/main/nested'], 'pinning does not open a project')

    failPin = true
    await page.getByRole('button', { name: 'deep · Add to My projects', exact: true }).click()
    await page.getByRole('alert').waitFor()
    assert.match(await page.getByRole('alert').textContent() ?? '', /Shortcut save failed/)
    assert.equal(await page.evaluate('window.changes'), 1, 'failed shortcut mutation does not refresh personal paths')
    assert.equal(await page.getByRole('button', { name: 'deep · Add to My projects', exact: true }).isEnabled(), true)
    await retry.focus(); await page.keyboard.press('Enter')
    await page.getByRole('alert').waitFor({ state: 'detached' })
    await row('/projects/main/nested/deep').waitFor()

    for (const [viewport, panelWidth] of [[1100, 200], [1100, 240], [390, 390]]) {
      await page.setViewportSize({ width: viewport, height: 700 })
      await page.evaluate(width => { (globalThis as unknown as { setPanelWidth: (value: number) => void }).setPanelWidth(width) }, panelWidth)
      for (const theme of ['dark', 'light']) {
        await page.locator('html').evaluate((element, theme) => { element.className = theme }, theme)
        const bounds = await page.locator('#catalog-host').evaluate(element => ({ width: element.clientWidth, scrollWidth: element.scrollWidth, right: element.getBoundingClientRect().right }))
        assert.equal(bounds.width, panelWidth)
        assert.ok(bounds.scrollWidth <= bounds.width, `${panelWidth}px ${theme} catalog must not overflow horizontally`)
        assert.ok(bounds.right <= viewport)
        for (const button of await page.locator('.mew-project-catalog-row button').all()) {
          const box = await button.boundingBox(); assert.ok(box)
          assert.ok(box.x >= 0 && box.x + box.width <= panelWidth + 1, 'open/pin controls remain inside the panel')
          if (viewport === 390) assert.ok(box.height >= 44, 'mobile project actions retain touch-sized controls')
        }
        await page.screenshot({ path: `/tmp/mew-project-catalog-${panelWidth}-${theme}.png` })
      }
    }
    await toggle.focus(); await page.keyboard.press('Space')
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false')
    assert.equal(await toggle.evaluate(element => element === element.ownerDocument.activeElement), true, 'collapsing retains keyboard focus')
    assert.equal(await page.locator('[data-catalog-project]').count(), 0)
    const previousQueries = queries
    await toggle.click()
    await row('/projects/main').waitFor()
    assert.equal(queries, previousQueries + 1, 'reopening refreshes the catalog')

    await page.setViewportSize({ width: 1100, height: 700 })
    await page.evaluate('window.showSwitcher(true)')
    await page.locator('[data-project-switcher]').click()
    assert.deepEqual(await page.locator('[data-project-row]').evaluateAll(elements => elements.map(element => ({ path: element.getAttribute('data-project-row'), depth: element.getAttribute('data-project-depth') }))), [
      { path: '/other', depth: '0' }, { path: '/projects/main', depth: '0' }, { path: '/projects/main/nested', depth: '1' }, { path: '/projects/main/nested/deep', depth: '2' },
    ], 'My Projects groups nested shortcuts beneath their nearest pinned ancestor')
    await page.keyboard.press('Escape')
    assert.deepEqual(pageErrors, [])
  } finally { await browser.close() }
})
