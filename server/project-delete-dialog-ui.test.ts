import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { connectTestBrowser } from './test-browser.ts'

const root = path.resolve(import.meta.dirname, '..')

test('project deletion expands its existing menu and confirms permanent deletion with safe focus, cancellation and retry', { timeout: 60_000 }, async t => {
  const source = `import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ProjectSwitcher} from '${root}/src/components/ProjectSwitcher.tsx';
import {I18nProvider} from '${root}/src/i18n.tsx';
window.deletions=[];window.removals=[];window.holdDelete=false;window.failDelete=false;
function Fixture(){
 const [desktop,setDesktop]=useState(()=>matchMedia('(min-width:768px)').matches);
 const [host,setHost]=useState(null),[open,setOpen]=useState(true),[allowed,setAllowed]=useState(true);
 const [paths,setPaths]=useState(['/alpha','/beta']);
 useEffect(()=>{const query=matchMedia('(min-width:768px)'),update=()=>setDesktop(query.matches);query.addEventListener('change',update);return()=>query.removeEventListener('change',update)},[]);
 window.setAllowed=setAllowed;
 return <main className="flex h-screen flex-col bg-surface-deep text-ink"><header className="flex h-11 shrink-0">
  <ProjectSwitcher paths={paths} activePath="/alpha" fallbackLabel="Workspace" canOpen canChangeIcon canDelete={allowed} icons={{}} onActivate={()=>{}} onIconChange={()=>{}} onOpen={()=>{}}
   sidebarHost={host} sidebarEnabled={desktop} sidebarOpen={open} onSidebarOpenChange={setOpen}
   onRemove={path=>{window.removals.push(path);setPaths(previous=>previous.filter(project=>project!==path))}}
   onDelete={async path=>{window.deletions.push(path);if(window.holdDelete)await new Promise(resolve=>{window.finishDelete=resolve});if(window.failDelete)throw new Error('Folder is read-only');setPaths(previous=>previous.filter(project=>project!==path))}}/>
 </header><div className="flex min-h-0 flex-1"><div ref={setHost} className="mew-project-sidebar-host"/></div></main>}
createRoot(document.getElementById('root')).render(<I18nProvider><Fixture/></I18nProvider>);`
  const candidates = [source]
  const bundle = await build({
    input: 'virtual:project-delete.tsx', write: false, platform: 'browser', output: { format: 'iife' },
    onwarn(warning, warn) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning) },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
    plugins: [{ name: 'project-delete-fixture', resolveId(id) {
      if (id === 'virtual:project-delete.tsx') return id
      if (id.endsWith('.css')) return 'virtual:style'
    }, async load(id) {
      if (id === 'virtual:project-delete.tsx') return source
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
  for (const width of [1100, 390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 700 }, hasTouch: width < 768 })
    page.setDefaultTimeout(4000)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('http://mew-project-delete.test/**', route => route.fulfill(new URL(route.request().url()).pathname === '/app.js'
      ? { contentType: 'text/javascript', body: chunk.code }
      : { contentType: 'text/html', body: `<!doctype html><html class="dark" lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}html,body,#root{height:100%;margin:0}</style><div id="root"></div><script src="/app.js"></script></html>` }))
    await page.addInitScript("localStorage.setItem('mew:locale','ko');localStorage.setItem('mew:ui-locale','ko')")
    await page.goto('http://mew-project-delete.test/')
    if (width < 768) await page.locator('[data-project-switcher]').click()
    const panel = page.locator(width >= 768 ? '[data-project-sidebar]' : '[data-mobile-project-panel]')
    await panel.waitFor()
    const row = (project: string) => panel.locator(`[data-project-option="${project}"]`)
    const dialog = page.getByRole('dialog', { name: '프로젝트를 완전히 삭제할까요?', exact: true })
    const cancel = dialog.locator('[data-project-delete-cancel]')
    const confirm = dialog.locator('[data-project-delete-confirm]')
    const chooseDelete = async (project: string) => {
      await row(project).focus(); await page.keyboard.press('Shift+F10')
      const actions = page.getByRole('menu', { name: project.slice(1), exact: true })
      await actions.waitFor()
      assert.deepEqual(await actions.getByRole('menuitem').allTextContents(), ['편집', '삭제'], 'project actions start with the simple Edit/Delete choices')
      await actions.evaluate(element => element.setAttribute('data-test-retained', 'original'))
      await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter')
      const remove = actions.getByRole('menuitem', { name: '내 프로젝트에서 삭제하기', exact: true })
      await remove.waitFor()
      assert.equal(await actions.getAttribute('data-test-retained'), 'original', 'Delete replaces choices in the same open ActionMenu')
      assert.equal(await actions.getByRole('menuitem', { name: '편집', exact: true }).count(), 0)
      await page.waitForFunction(element => element === element?.ownerDocument.activeElement, await remove.elementHandle())
      return actions
    }
    const openPermanent = async (project: string) => {
      const actions = await chooseDelete(project)
      await actions.getByRole('menuitem', { name: '완전히 삭제하기', exact: true }).click()
      await dialog.waitFor()
      await page.waitForFunction(element => element === element?.ownerDocument.activeElement, await cancel.elementHandle())
    }
    for (const theme of ['dark', 'light']) {
      await page.locator('html').evaluate((element, theme) => { element.className = theme }, theme)
      await openPermanent('/alpha')
      assert.deepEqual(await page.evaluate('window.deletions'), [], 'menu selection alone never deletes project files')
      assert.equal(await dialog.getByText('/alpha', { exact: true }).isVisible(), true)
      assert.match(await dialog.textContent() ?? '', /프로젝트 폴더와 모든 파일이 삭제됩니다/)
      const bounds = await dialog.boundingBox(); assert.ok(bounds)
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1 && bounds.y >= 0 && bounds.y + bounds.height <= 701)
      assert.equal(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth), true)
      await page.screenshot({ path: `/tmp/mew-project-delete-${width}-${theme}.png` })
      await page.keyboard.press('Enter')
      await dialog.waitFor({ state: 'detached' })
      assert.deepEqual(await page.evaluate('window.deletions'), [], 'Enter initially activates Cancel')
      assert.equal(await panel.isVisible(), true)
      await page.waitForFunction(element => element === element?.ownerDocument.activeElement, await row('/alpha').elementHandle())
    }
    await openPermanent('/alpha')
    await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'detached' })
    assert.deepEqual(await page.evaluate('window.deletions'), [])
    await openPermanent('/beta')
    const buttons = dialog.getByRole('button')
    await buttons.last().focus(); await page.keyboard.press('Tab')
    assert.equal(await buttons.first().evaluate(element => element === element.ownerDocument.activeElement), true, 'Tab wraps inside the destructive confirmation')
    await page.evaluate('window.holdDelete=true;window.failDelete=true')
    await confirm.click()
    await page.waitForFunction(element => element?.hasAttribute('disabled'), await confirm.elementHandle())
    assert.equal(await dialog.getAttribute('aria-busy'), 'true')
    assert.equal(await cancel.isDisabled(), true)
    await confirm.evaluate(element => element.click())
    await page.keyboard.press('Escape')
    await page.evaluate('new Promise(resolve=>{window.addEventListener("popstate",()=>resolve(),{once:true});history.back()})')
    await page.mouse.click(2, 2)
    assert.equal(await dialog.isVisible(), true, 'busy confirmations block Escape, Back and outside dismissal')
    assert.deepEqual(await page.evaluate('window.deletions'), ['/beta'], 'busy confirmation prevents duplicate deletion requests')
    await page.evaluate('window.finishDelete()')
    await dialog.getByRole('alert').waitFor()
    assert.match(await dialog.getByRole('alert').textContent() ?? '', /Folder is read-only/)
    assert.equal(await cancel.isEnabled(), true)
    assert.equal(await confirm.isEnabled(), true)
    assert.equal(await row('/beta').count(), 1, 'a failed deletion leaves the project available')
    await page.evaluate('window.holdDelete=false;window.failDelete=false')
    await confirm.click()
    await dialog.waitFor({ state: 'detached' })
    assert.deepEqual(await page.evaluate('window.deletions'), ['/beta', '/beta'])
    assert.equal(await row('/beta').count(), 0, 'a successful retry removes the deleted project')
    assert.equal(await panel.isVisible(), true)
    await page.evaluate('window.setAllowed(false)')
    const managerActions = await chooseDelete('/alpha')
    assert.deepEqual(await managerActions.getByRole('menuitem').allTextContents(), ['내 프로젝트에서 삭제하기'], 'permanent deletion is absent without owner permission')
    await managerActions.getByRole('menuitem', { name: '내 프로젝트에서 삭제하기', exact: true }).click()
    assert.deepEqual(await page.evaluate('window.removals'), ['/alpha'])
    assert.deepEqual(await page.evaluate('window.deletions'), ['/beta', '/beta'], 'removing a shortcut does not call permanent deletion')
    assert.deepEqual(errors, [])
    await page.close()
  }
})
