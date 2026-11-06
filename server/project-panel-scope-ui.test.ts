import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { connectTestBrowser } from './test-browser.ts'

const root = path.resolve(import.meta.dirname, '..')

test('Projects shares explorer scope controls and keeps My order, All discovery and explicit imports on desktop and mobile', { timeout: 60_000 }, async t => {
  const source = `import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ProjectSwitcher} from '${root}/src/components/ProjectSwitcher.tsx';
import {ProjectAddInline} from '${root}/src/components/project-add-inline.tsx';
import {ScopeToggle} from '${root}/src/components/scope-toggle.tsx';
import {I18nProvider} from '${root}/src/i18n.tsx';
window.events=[];window.failOpen=false;
function Fixture(){
 const [desktop,setDesktop]=useState(()=>matchMedia('(min-width:768px)').matches);
 const [host,setHost]=useState(null),[open,setOpen]=useState(true),[width,setWidth]=useState(240);
 const [paths,setPaths]=useState(['/mine/Beta','/mine/Alpha/nested','/mine/Alpha']);
 const [active,setActive]=useState('/mine/Beta'),[explorer,setExplorer]=useState('docs');
 useEffect(()=>{const query=matchMedia('(min-width:768px)'),change=()=>setDesktop(query.matches);query.addEventListener('change',change);return()=>query.removeEventListener('change',change)},[]);
 window.setWidth=setWidth;window.setExplorer=setExplorer;
 const imported=async path=>{window.events.push(['open',path]);if(window.failOpen)return false;setPaths(previous=>previous.includes(path)?previous:[...previous,path]);setActive(path);return true};
 return <main className="flex h-screen flex-col bg-surface-deep text-ink">
  <header className="flex h-11 shrink-0"><ProjectSwitcher paths={paths} activePath={active} fallbackLabel="Workspace" canOpen canChangeIcon={false} icons={{}} onActivate={path=>{window.events.push(['activate',path]);setActive(path)}} onIconChange={()=>{}} onReorder={setPaths} onOpen={()=>{}}
   sidebarHost={host} sidebarEnabled={desktop} sidebarOpen={open} onSidebarOpenChange={setOpen} sidebarWidth={width}
   beforeProjectMutation={async()=>{window.events.push(['before'])}} onOpenCatalogProject={imported}
   projectAdd={<ProjectAddInline basePath="/mine" paths={paths} onOpen={imported}/>}/></header>
  <div className="flex min-h-0 flex-1"><div ref={setHost} className="mew-project-sidebar-host"/>
   <section id="explorer-reference" style={{width:desktop?width-4:'100%',maxWidth:'100%'}}>
    <div data-explorer-toggle className="flex shrink-0 items-center gap-1 border-b border-edge p-1"><ScopeToggle label="Explorer scope" value={explorer} options={[{value:'docs',label:'Documents'},{value:'files',label:'Files'}]} onChange={setExplorer}/></div>
   </section></div>
 </main>}
createRoot(document.getElementById('root')).render(<I18nProvider><Fixture/></I18nProvider>);`
  const candidates = [source]
  const bundle = await build({
    input: 'virtual:project-scopes.tsx', write: false, platform: 'browser', output: { format: 'iife' },
    onwarn(warning, warn) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning) },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
    plugins: [{ name: 'project-scope-fixture', resolveId(id) {
      if (id === 'virtual:project-scopes.tsx') return id
      if (id.endsWith('.css')) return 'virtual:style'
    }, async load(id) {
      if (id === 'virtual:project-scopes.tsx') return source
      if (id === 'virtual:style') return ''
      if (id.endsWith('?raw')) return `export default ${JSON.stringify(await fs.readFile(id.slice(0, -4), 'utf8'))}`
      if (id.endsWith('.tsx')) candidates.push(await fs.readFile(id, 'utf8'))
    } }],
  })
  const chunk = bundle.output.find(item => item.type === 'chunk')!
  const compiler = await compile(await fs.readFile(`${root}/src/index.css`, 'utf8'), { base: `${root}/src`, onDependency() {} })
  const css = compiler.build([...new Set(candidates.join('\n').match(/[A-Za-z0-9_@!:/.[\]()%,-]+/g))])
  const browser = await connectTestBrowser()
  t.after(() => browser.close())
  for (const [viewport, panelWidth] of [[1100, 200], [1100, 360], [390, 390], [320, 320]]) {
    const page = await browser.newPage({ viewport: { width: viewport, height: 760 }, hasTouch: viewport < 768 })
    page.setDefaultTimeout(4000)
    const errors: string[] = [], pins: { path: string; added: boolean }[] = []
    let queries = 0, holdPin = false, failPin = false
    let releasePin: () => void = () => {}
    let pinReleased = Promise.resolve()
    const projects = [
      { path: '/catalog/Atlas', name: 'Atlas' },
      { path: '/mine/Alpha/nested', name: 'nested', parentPath: '/mine/Alpha' },
      { path: '/mine/Alpha', name: 'Alpha' },
      { path: '/mine/Beta', name: 'Beta' },
      { path: '/catalog/a-very-long-project-name-that-cannot-widen-the-project-panel', name: 'a-very-long-project-name-that-cannot-widen-the-project-panel' },
    ].map(project => ({ ...project, managed: false, mine: project.path.startsWith('/mine/'), icon: null }))
    page.on('pageerror', error => errors.push(error.message))
    await page.route('http://mew-project-scopes.test/**', async route => {
      const url = new URL(route.request().url())
      if (url.pathname === '/app.js') return route.fulfill({ contentType: 'text/javascript', body: chunk.code })
      if (url.pathname === '/api/project-registry') { queries++; return route.fulfill({ json: { projects } }) }
      if (url.pathname === '/api/project-registry/mine') {
        const body = route.request().postDataJSON() as { path: string; added: boolean }
        pins.push(body)
        await page.evaluate('window.events.push(["pin"])')
        if (holdPin) await pinReleased
        return route.fulfill(failPin ? { status: 503, json: { error: 'Shortcut save failed' } } : { json: { ok: true } })
      }
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html class="dark"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}html,body,#root{height:100%;margin:0;font-family:Arial,sans-serif}</style><div id="root"></div><script src="/app.js"></script></html>` })
    })
    await page.addInitScript("localStorage.setItem('mew:locale','en')")
    await page.goto('http://mew-project-scopes.test/')
    await page.evaluate(width => { (globalThis as unknown as { setWidth: (width: number) => void }).setWidth(width) }, panelWidth)
    const panel = page.locator(viewport >= 768 ? '[data-project-sidebar]' : '[data-mobile-project-panel]')
    if (viewport < 768) await page.locator('[data-project-switcher]').click()
    await panel.waitFor()
    const scope = panel.locator('[data-project-scope]')
    const mine = scope.getByRole('button', { name: 'My', exact: true })
    const all = scope.getByRole('button', { name: 'All', exact: true })
    const add = panel.getByRole('button', { name: 'Add project', exact: true })
    const personalOrder = () => panel.locator('[data-project-option]').evaluateAll(elements => elements.map(element => element.getAttribute('data-project-option')))
    const catalogOrder = () => panel.locator('[data-catalog-project]').evaluateAll(elements => elements.map(element => element.getAttribute('data-catalog-project')))
    const reference = page.locator('#explorer-reference [data-scope-toggle]')
    const toggleMetrics = (control: typeof scope) => control.evaluate(async element => {
      await Promise.all(element.getAnimations({ subtree: true }).map((animation: { finished: Promise<unknown> }) => animation.finished.catch(() => {})))
      const view = element.ownerDocument.defaultView!
      const group = element.matches('[data-scope-toggle]') ? element : element.querySelector('[data-scope-toggle]')!
      const metrics = (item: typeof group) => {
        const style = view.getComputedStyle(item)
        return { height: item.getBoundingClientRect().height, padding: style.padding, radius: style.borderRadius,
          font: style.font, lineHeight: style.lineHeight, background: style.backgroundColor, color: style.color }
      }
      return { row: metrics(group.parentElement!), group: metrics(group), buttons: Array.from(group.querySelectorAll('button')).map(metrics) }
    })
    const assertBounds = async () => {
      const box = await panel.boundingBox(); assert.ok(box)
      assert.ok(box.x >= 0 && box.x + box.width <= viewport + 1, 'project panel stays within the viewport')
      assert.equal(await panel.evaluate(element => element.scrollWidth <= element.clientWidth), true, 'project panel does not overflow horizontally')
      for (const control of await panel.locator('[data-project-scope] button, .mew-project-catalog-open, .mew-project-add-trigger').all()) {
        const bounds = await control.boundingBox(); assert.ok(bounds)
        assert.ok(bounds.x >= box.x && bounds.x + bounds.width <= box.x + box.width + 1, 'scope, catalog and Add controls fit the project panel')
      }
    }
    assert.equal(await panel.locator('.mew-project-sidebar-heading').textContent(), 'Projects')
    assert.equal(await mine.getAttribute('aria-pressed'), 'true')
    assert.equal(await all.getAttribute('aria-pressed'), 'false')
    assert.equal(queries, 0, 'opening My does not query the shared workspace catalog')
    assert.deepEqual(await personalOrder(), ['/mine/Beta', '/mine/Alpha', '/mine/Alpha/nested'])
    assert.equal(await add.textContent(), '', 'the full-width Add action retains its centered plus icon')
    const header = await panel.locator('.mew-project-sidebar-heading').boundingBox(), switchBox = await scope.boundingBox()
    assert.ok(header && switchBox && Math.abs(switchBox.y - header.y - header.height) < 1, 'My/All sits directly below the Projects header')
    for (const theme of ['dark', 'light']) {
      await page.locator('html').evaluate((element, theme) => { element.className = theme }, theme)
      await mine.click()
      await page.evaluate('window.setExplorer("docs")')
      assert.deepEqual(await toggleMetrics(scope), await toggleMetrics(reference), `${panelWidth}px ${theme}: project and explorer toggles share exact geometry, typography and colors`)
      await assertBounds()
      await all.click()
      await panel.locator('[data-catalog-project="/catalog/Atlas"]').waitFor()
      await page.evaluate('window.setExplorer("files")')
      assert.deepEqual(await toggleMetrics(scope), await toggleMetrics(reference), `${panelWidth}px ${theme}: selected All matches selected Files`)
      assert.equal(await add.isVisible(), true, 'Add remains available in All')
      assert.equal(await personalOrder().then(paths => paths.length), 0, 'All displays the catalog without personal reorder rows')
      await assertBounds()
      await page.screenshot({ path: `/tmp/mew-project-scope-${viewport}-${panelWidth}-${theme}.png` })
    }
    assert.deepEqual(pins, [], 'catalog discovery never implicitly imports a project')
    await mine.click(); await mine.focus(); await page.keyboard.press('ArrowRight')
    assert.equal(await all.getAttribute('aria-pressed'), 'true')
    assert.equal(await all.evaluate(element => element === element.ownerDocument.activeElement), true)
    await page.keyboard.press('ArrowLeft')
    assert.equal(await mine.getAttribute('aria-pressed'), 'true')
    assert.equal(await mine.evaluate(element => element === element.ownerDocument.activeElement), true)
    await page.keyboard.press('End')
    assert.equal(await all.getAttribute('aria-pressed'), 'true')
    await page.keyboard.press('Home')
    assert.equal(await mine.getAttribute('aria-pressed'), 'true')
    assert.deepEqual(await personalOrder(), ['/mine/Beta', '/mine/Alpha', '/mine/Alpha/nested'], 'scope changes preserve personal order')
    await all.click()
    await panel.locator('[data-catalog-project="/mine/Alpha/nested"]').waitFor()
    const search = panel.getByRole('textbox', { name: 'Search projects', exact: true })
    await search.fill('nested')
    await panel.locator('[data-catalog-project="/catalog/Atlas"]').waitFor({ state: 'detached' })
    assert.deepEqual(await catalogOrder(), ['/mine/Alpha', '/mine/Alpha/nested'], 'All search retains matching project ancestors')
    await search.fill('Atlas')
    await panel.locator('[data-catalog-project="/catalog/Atlas"]').waitFor()
    assert.deepEqual(await catalogOrder(), ['/catalog/Atlas'])
    await page.evaluate('window.failOpen=true;window.events=[]')
    holdPin = true
    pinReleased = new Promise<void>(resolve => { releasePin = resolve })
    await panel.getByRole('button', { name: 'Atlas · Add to My projects', exact: true }).click()
    await page.waitForFunction(element => element?.hasAttribute('disabled'), await mine.elementHandle())
    assert.equal(await all.isDisabled(), true, 'scope changes cannot unmount an import that is being saved')
    assert.equal(await add.evaluate(element => !!element.closest('[inert]')), true, 'Add waits for the current project import')
    if (viewport < 768) {
      await page.keyboard.press('Escape')
      await page.evaluate('new Promise(resolve=>{window.addEventListener("popstate",()=>resolve(),{once:true});history.back()})')
      assert.equal(await panel.isVisible(), true, 'mobile dismissal waits for the project import')
    }
    releasePin()
    await panel.getByRole('alert').waitFor()
    assert.deepEqual(pins, [{ path: '/catalog/Atlas', added: true }])
    assert.deepEqual(await page.evaluate('window.events'), [['before'], ['pin'], ['open', '/catalog/Atlas']], 'explicit open imports before switching projects')
    assert.equal(await panel.isVisible(), true, 'a failed open keeps the project panel and error available')
    await page.evaluate('window.failOpen=false')
    await panel.getByRole('button', { name: 'Atlas · In My projects', exact: true }).click()
    assert.equal(pins.length, 1, 'retrying an imported project does not import it twice')
    if (viewport < 768) {
      await panel.waitFor({ state: 'detached' })
      await page.locator('[data-project-switcher]').click()
      await panel.waitFor()
    }
    await mine.click()
    assert.deepEqual(await personalOrder(), ['/mine/Beta', '/mine/Alpha', '/mine/Alpha/nested', '/catalog/Atlas'])
    assert.equal(await add.isVisible(), true)
    await add.click()
    const addDialog = page.getByRole('dialog', { name: 'Add project', exact: true })
    await addDialog.waitFor()
    await addDialog.locator('[data-project-add-close]').click()
    assert.equal(await panel.isVisible(), true, 'closing Add preserves its surrounding Projects panel')
    if (viewport === 1100 && panelWidth === 200) {
      await all.click()
      const pendingProject = '/catalog/a-very-long-project-name-that-cannot-widen-the-project-panel'
      const pendingRow = panel.locator(`[data-catalog-project="${pendingProject}"]`)
      await pendingRow.waitFor()
      failPin = true
      pinReleased = new Promise<void>(resolve => { releasePin = resolve })
      await pendingRow.getByRole('button').click()
      await page.waitForFunction(element => element?.hasAttribute('disabled'), await mine.elementHandle())
      await page.setViewportSize({ width: 390, height: 760 })
      await panel.waitFor({ state: 'detached' })
      const failedSave = page.waitForResponse(response => new URL(response.url()).pathname === '/api/project-registry/mine' && response.status() === 503)
      releasePin()
      await failedSave
      await page.locator('[data-project-switcher]').click()
      const mobilePanel = page.locator('[data-mobile-project-panel]')
      await mobilePanel.waitFor()
      const mobileMine = mobilePanel.getByRole('button', { name: 'My', exact: true })
      await page.waitForFunction(element => !element?.hasAttribute('disabled'), await mobileMine.elementHandle())
      assert.equal(await mobilePanel.getByRole('button', { name: 'All', exact: true }).isEnabled(), true, 'a failed import releases scope controls after its original catalog unmounts on resize')
      const mobileAdd = mobilePanel.getByRole('button', { name: 'Add project', exact: true })
      assert.equal(await mobileAdd.evaluate(element => !!element.closest('[inert]')), false, 'a failed import releases Add after switching desktop to mobile')
      await mobileMine.click()
      await mobileAdd.click()
      await page.getByRole('dialog', { name: 'Add project', exact: true }).waitFor()
      await page.locator('[data-project-add-close]').click()
      assert.equal(await mobilePanel.isVisible(), true)
    }
    assert.deepEqual(errors, [])
    await page.close()
  }
})
