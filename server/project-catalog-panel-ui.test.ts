import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { connectTestBrowser } from './test-browser.ts'

const root = path.resolve(import.meta.dirname, '..')

test('workspace import loads inside Add, preserves hierarchy, and adds personal shortcuts before opening', { timeout: 60_000 }, async () => {
  const source = `import React,{useState} from '${root}/node_modules/react/index.js';
import {createRoot} from '${root}/node_modules/react-dom/client.js';
import {ProjectAddInline} from '${root}/src/components/project-add-inline.tsx';
import {ProjectSwitcher} from '${root}/src/components/ProjectSwitcher.tsx';
import {I18nProvider} from '${root}/src/i18n.tsx';
window.opens=[];window.events=[];window.changes=0;window.addTarget='/projects/main/nested';
function Fixture(){const [paths,setPaths]=useState(['/projects/main']);const [width,setWidth]=useState(240);const [switcher,setSwitcher]=useState(false);
window.setPanelWidth=setWidth;window.showSwitcher=setSwitcher;
return <main className="h-screen bg-surface text-ink"><section id="catalog-host" className={width===390?'mew-mobile-project-panel':''} style={{width,maxWidth:'100%',height:'100%',display:'flex',flexDirection:'column',minWidth:0}}>
<div>My projects</div><ProjectAddInline paths={paths} basePath="/projects" onOpen={async p=>{window.events.push('open');window.opens.push(p)}} beforeMutation={async()=>{window.events.push('before')}} onProjectsChanged={async()=>{window.events.push('changed');window.changes++;setPaths(prev=>prev.includes(window.addTarget)?prev:[...prev,window.addTarget])}}/>
</section>{switcher&&<header style={{position:'fixed',top:0,right:0}}><ProjectSwitcher paths={['/projects/main/nested','/other','/projects/main','/projects/main/nested/deep']} activePath='/projects/main' fallbackLabel='work' canOpen canChangeIcon={false} icons={{}} onActivate={p=>window.opens.push(p)} onIconChange={()=>{}} onOpen={()=>{}}/></header>}</main>}
createRoot(document.getElementById('root')).render(<I18nProvider><Fixture/></I18nProvider>);`
  const bundle = await build({
    input: 'virtual:project-catalog.tsx', onLog(level, log, handler) { if (log.code !== 'MODULE_LEVEL_DIRECTIVE') handler(level, log) }, write: false, platform: 'browser', output: { format: 'iife' },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
    plugins: [{ name: 'fixture', resolveId(id) { if (id === 'virtual:project-catalog.tsx') return id; if (id === './LoginDesktopViewer') return 'virtual:login.tsx'; if (id.endsWith('.css')) return 'virtual:style' }, async load(id) { if (id === 'virtual:project-catalog.tsx') return source; if (id === 'virtual:login.tsx') return 'export function LoginDesktopViewer(){return null}'; if (id === 'virtual:style') return ''; if (id.endsWith('?raw')) return 'export default ' + JSON.stringify(await fs.readFile(id.slice(0, -4), 'utf8')) } }],
  })
  const chunk = bundle.output.find(item => item.type === 'chunk')!
  const content = (await Promise.all(['src/components/project-add-inline.tsx', 'src/components/project-catalog-panel.tsx', 'src/components/ProjectSwitcher.tsx', 'packages/ui/src/dialog-frame.tsx'].map(file => fs.readFile(path.join(root, file), 'utf8')))).join('\n')
  const compiler = await compile(await fs.readFile(`${root}/src/index.css`, 'utf8'), { base: `${root}/src`, onDependency() {} })
  const css = compiler.build([...new Set((source + content).match(/[A-Za-z0-9_@!:/.[\]()%,-]+/g))])
  const browser = await connectTestBrowser()
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
        const body = route.request().postDataJSON() as { path: string }
        mutations.push(body)
        await page.evaluate('window.events.push("put")')
        if (!failPin) await page.evaluate(projectPath => { (globalThis as unknown as { addTarget: string }).addTarget = projectPath }, body.path)
        return route.fulfill(failPin ? { status: 503, json: { error: 'Shortcut save failed' } } : { json: { ok: true } })
      }
      if (url.pathname === '/app.js') return route.fulfill({ contentType: 'text/javascript', body: chunk.code })
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html class="dark"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script src="/app.js"></script></html>` })
    })
    await page.addInitScript("localStorage.setItem('mew:locale','en')")
    await page.goto('http://mew-project-catalog.test/')
    const add = page.getByRole('button', { name: 'Add project', exact: true })
    const importMode = page.getByRole('button', { name: 'Import project', exact: true })
    const workspaceMode = page.getByRole('button', { name: 'Import from this workspace', exact: true })
    const back = page.getByRole('button', { name: 'Previous choices', exact: true })
    const search = page.getByRole('textbox', { name: 'Search projects', exact: true })
    const row = (project: string) => page.locator(`[data-catalog-project="${project}"]`)
    const visibleRows = () => page.locator('[data-catalog-project]').evaluateAll(elements => elements.map(element => element.getAttribute('data-catalog-project')))
    await add.waitFor()
    assert.equal(queries, 0, 'closed Add does not fetch the workspace catalog')
    assert.equal(await search.count(), 0)
    assert.equal(await page.getByRole('button', { name: 'All projects', exact: true }).count(), 0)
    await add.focus(); await page.keyboard.press('Enter')
    await importMode.click()
    assert.equal(queries, 0, 'choosing import still waits for a source')
    await workspaceMode.click()
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
    assert.equal(await page.getByRole('button', { name: 'main (/projects/main) · In My projects', exact: true }).isEnabled(), true, 'an existing personal shortcut can still be opened')
    assert.equal(await page.getByRole('button', { name: 'main (/other/main) · Add to My projects', exact: true }).count(), 1)
    assert.equal(await row('/projects/main/nested').getByRole('button').count(), 1, 'one row action imports and opens the project')

    await search.fill('deep')
    assert.deepEqual(await visibleRows(), ['/projects/main', '/projects/main/nested', '/projects/main/nested/deep'], 'search retains all project ancestors')
    await search.fill('no-matching-project')
    assert.equal(await page.locator('[data-catalog-project]').count(), 0)
    assert.equal(await page.getByText('No matching projects.').isVisible(), true)
    await search.fill('/other/')
    assert.deepEqual(await visibleRows(), ['/other/main'], 'path search distinguishes duplicate project names')
    await search.fill('')
    await row('/projects/main/nested').locator('.mew-project-catalog-open').focus()
    await page.keyboard.press('Enter')
    await page.waitForFunction('window.opens.length===1')
    assert.deepEqual(mutations, [{ path: '/projects/main/nested', added: true }])
    assert.deepEqual(await page.evaluate('window.events'), ['before', 'put', 'changed', 'open'])
    assert.deepEqual(await page.evaluate('window.opens'), ['/projects/main/nested'], 'import adds the personal shortcut before opening')
    await add.waitFor()
    await add.click(); await importMode.click(); await workspaceMode.click()
    const importedNested = page.getByRole('button', { name: 'nested · In My projects', exact: true })
    await importedNested.click()
    await page.waitForFunction('window.opens.length===2')
    assert.deepEqual(mutations, [{ path: '/projects/main/nested', added: true }], 'opening an imported project reuses its shortcut')
    await add.click(); await importMode.click(); await workspaceMode.click()

    failPin = true
    await page.getByRole('button', { name: 'deep · Add to My projects', exact: true }).click()
    await page.getByRole('alert').waitFor()
    assert.match(await page.getByRole('alert').textContent() ?? '', /Shortcut save failed/)
    assert.equal(await page.evaluate('window.changes'), 2, 'failed shortcut mutation does not refresh personal paths or open the project')
    assert.deepEqual(await page.evaluate('window.opens'), ['/projects/main/nested', '/projects/main/nested'])
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
          assert.ok(box.x >= 0 && box.x + box.width <= panelWidth + 1, 'import actions remain inside the panel')
          if (viewport === 390) assert.ok(box.height >= 44, 'mobile project actions retain touch-sized controls')
        }
        await page.screenshot({ path: `/tmp/mew-project-catalog-${panelWidth}-${theme}.png` })
      }
    }
    await back.focus(); await page.keyboard.press('Space')
    assert.equal(await workspaceMode.isVisible(), true)
    assert.equal(await workspaceMode.evaluate(element => element === element.ownerDocument.activeElement), true, 'returning to import sources restores focus')
    assert.equal(await page.locator('[data-catalog-project]').count(), 0)
    const previousQueries = queries
    await workspaceMode.click()
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
