import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { chromium } from 'playwright-core'
import { domBrowserExecutable } from './browser-dom-executable.ts'

const root = path.resolve(import.meta.dirname, '..')

test('desktop projects remain in a resizable workspace panel while mobile keeps the project dropdown', { skip: !domBrowserExecutable(), timeout: 60_000 }, async () => {
  const source = `import React,{useEffect,useState} from '${root}/node_modules/react/index.js';
import {createRoot} from '${root}/node_modules/react-dom/client.js';
import {ProjectSwitcher} from '${root}/src/components/ProjectSwitcher.tsx';
import {CommandButtonMenu} from '${root}/src/components/CommandButtonMenu.tsx';
import {usePanelWidth} from '${root}/src/hooks/usePanelWidth.ts';
import {I18nProvider} from '${root}/src/i18n.tsx';
import {applyThemePalette,THEME_PRESETS} from '${root}/src/utils/theme-color.ts';
window.setFixtureTheme=id=>applyThemePalette(THEME_PRESETS.find(theme=>theme.id===id).palette);
window.activations=[];window.previews=[];window.opens=0;window.removals=[];window.outsideClicks=0;
function Fixture(){
const [paths,setPaths]=useState(['/alpha','/beta','/gamma','/work/project-with-a-long-name']);
const [active,setActive]=useState(()=>localStorage.getItem('fixture:active')??'/alpha');
const [desktop,setDesktop]=useState(()=>matchMedia('(min-width:768px)').matches);
const [host,setHost]=useState(null),[open,setOpen]=useState(()=>localStorage.getItem('fixture:projects-open')==='1');
const [enabled,setEnabled]=useState(true),[dialog,setDialog]=useState(false),[maximized,setMaximized]=useState(false);
const {width,restoreWidth,startResize}=usePanelWidth('fixture:projects-width',{min:200,max:360,initial:240});
useEffect(()=>{const q=matchMedia('(min-width:768px)'),update=()=>setDesktop(q.matches);q.addEventListener('change',update);return()=>q.removeEventListener('change',update)},[]);
window.active=active;window.setEnabled=setEnabled;window.setDialog=setDialog;window.setMaximized=setMaximized;
const showing=desktop&&open&&enabled;
const changeOpen=value=>{setOpen(value);localStorage.setItem('fixture:projects-open',value?'1':'0')};
return <main className="mew-workspace flex h-screen flex-col overflow-hidden bg-surface text-ink">
<header className="flex h-11 shrink-0 items-stretch border-b border-edge">
<ProjectSwitcher paths={paths} activePath={active} fallbackLabel="work" canOpen={enabled} canChangeIcon={enabled} icons={{'/alpha':'i:folder','/beta':'i:code','/gamma':'🌱'}}
onActivate={p=>{window.activations.push(p);setActive(p);localStorage.setItem('fixture:active',p)}} onIconChange={()=>{}} onReorder={setPaths}
onRemove={p=>{window.removals.push(p);setPaths(s=>s.filter(x=>x!==p))}} onOpen={()=>window.opens++} onPreview={p=>window.previews.push(p)}
sidebarHost={host} sidebarEnabled={desktop} sidebarOpen={showing} onSidebarOpenChange={changeOpen} sidebarWidth={width}
onSidebarResize={startResize} onSidebarWidthChange={restoreWidth} canUseCommands activeWorkingPath={active+'-worktree'}/>
{!showing&&<div data-header-command className="flex items-center"><CommandButtonMenu project=".workspace" title="현재 프로젝트 명령어"/></div>}
</header>
<div className="mew-workspace-content relative flex min-h-0 flex-1 overflow-hidden">
<div className="desktop-dock-rail" data-sidebar-dock><span className="p-2 text-ink-muted">⌘</span></div>
<div ref={setHost} className="mew-project-sidebar-host"/>
<section data-sidebar className="hidden w-56 shrink-0 border-r border-edge bg-surface-deep md:order-first md:block"><div className="flex h-9 items-center border-b border-edge px-3 text-xs text-ink-secondary">파일 탐색기</div><div className="px-3 py-2 text-sm text-ink-muted">▾ Documents<br/>　설계 문서.md<br/><br/>▾ Files<br/>　README.md<br/>　src</div></section>
<div data-dock-workspace data-dock-maximized={maximized?'fixture':undefined} className="min-w-0 flex-1 bg-surface-deep p-4"><div className="mb-3 border-b border-edge pb-2 text-xs text-ink-muted">README.md</div><h1 className="mb-4 text-lg">Workspace</h1><textarea aria-label="문서 입력" className="w-full rounded border border-edge p-2" defaultValue="Projects, documents, and tools in one workspace."/><button id="outside" className="mt-3 rounded bg-surface-raised px-3 py-1 text-sm" onClick={()=>window.outsideClicks++}>본문 작업</button></div>
</div>
<div role="dialog" hidden={!dialog}><input id="modal-input"/></div>
</main>}
createRoot(document.getElementById('root')).render(<I18nProvider><Fixture/></I18nProvider>);`
  const bundle = await build({ input: 'virtual:project-sidebar.tsx', write: false, platform: 'browser', onwarn(warning, warn) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning) }, output: { format: 'iife' }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } }, plugins: [{ name: 'fixture', resolveId(id) { if (id === 'virtual:project-sidebar.tsx') return id; if (id.endsWith('.css')) return 'virtual:style' }, async load(id) { if (id === 'virtual:project-sidebar.tsx') return source; if (id === 'virtual:style') return ''; if (id.endsWith('?raw')) return 'export default ' + JSON.stringify(await fs.readFile(id.slice(0, -4), 'utf8')) } }] })
  const chunk = bundle.output.find(item => item.type === 'chunk')!
  const content = (await Promise.all(['src/components/ProjectSwitcher.tsx', 'src/components/CommandButtonMenu.tsx', 'src/components/panel-close-button.tsx', 'packages/ui/src/action-menu.tsx', 'packages/ui/src/dialog-frame.tsx', 'src/components/IconPicker.tsx'].map(file => fs.readFile(path.join(root, file), 'utf8')))).join('\n')
  const compiler = await compile(await fs.readFile(`${root}/src/index.css`, 'utf8'), { base: `${root}/src`, onDependency() {} })
  const css = compiler.build([...new Set((source + content).match(/[A-Za-z0-9_@:/.[\]()%,-]+/g))])
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 700 }, hasTouch: true })
    page.setDefaultTimeout(4000)
    const errors: string[] = []
    const requests: { method: string; workspacePath?: string; name?: string }[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('http://mew-project-sidebar.test/**', route => {
      const request = route.request(), url = new URL(request.url()), method = request.method()
      if (url.pathname === '/api/cmd-buttons' || url.pathname === '/api/cmd-buttons/run') {
        const body = method === 'GET' ? null : request.postDataJSON()
        requests.push({ method, workspacePath: body?.workspacePath ?? url.searchParams.get('workspacePath') ?? undefined, ...(body?.name ? { name: body.name } : {}) })
        return route.fulfill({ json: url.pathname.endsWith('/run') ? { ok: true, session: 'mewcmd-fixture' } : { buttons: [{ name: '검사 실행', command: 'npm test', session: 'mewcmd-fixture', running: false, oneShot: false }] } })
      }
      return route.fulfill(url.pathname === '/app.js' ? { contentType: 'text/javascript', body: chunk.code } : { contentType: 'text/html', body: `<!doctype html><html lang="ko" class="dark"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}body{margin:0;font-family:Arial,sans-serif}</style><div id="root"></div><script src="/app.js"></script></html>` })
    })
    await page.addInitScript("localStorage.setItem('mew:locale','ko')")
    await page.goto('http://mew-project-sidebar.test/')
    const trigger = page.locator('button[data-project-switcher]')
    const sidebar = page.locator('[data-project-sidebar]')
    const menu = page.getByRole('menu', { name: '프로젝트 선택', exact: true })
    const option = (project: string) => page.locator(`[data-project-option="${project}"]`)
    const row = (project: string) => page.locator(`[data-project-row="${project}"]`)
    const order = () => page.locator('[data-project-option]').evaluateAll(elements => elements.map(el => el.getAttribute('data-project-option')))
    const close = () => sidebar.getByRole('button', { name: '프로젝트 · 닫기', exact: true })

    await trigger.waitFor()
    assert.equal(await sidebar.count(), 0)
    assert.equal(await page.locator('[data-header-command]').count(), 1)
    await trigger.click()
    await sidebar.waitFor()
    assert.equal(await menu.count(), 1)
    assert.equal(await trigger.getAttribute('aria-haspopup'), null)
    assert.equal(await trigger.getAttribute('aria-controls'), await sidebar.getAttribute('id'))
    assert.equal(await sidebar.locator('[data-project-drag-handle]').count(), 4)
    assert.equal(await sidebar.locator('.mew-project-command').count(), 4)
    assert.equal(await page.locator('[data-header-command]').count(), 0)
    assert.equal(await option('/alpha').getAttribute('aria-checked'), 'true')
    assert.deepEqual(await sidebar.locator('kbd').allTextContents(), ['Alt+1', 'Alt+2', 'Alt+3', 'Alt+4'])
    const panelBox = await sidebar.boundingBox(), explorerBox = await page.locator('[data-sidebar]').boundingBox()
    assert.ok(panelBox && explorerBox && panelBox.x + panelBox.width <= explorerBox.x + 1, 'project panel precedes the file explorer without covering it')
    assert.equal(await sidebar.evaluate(el => el.parentElement?.parentElement?.classList.contains('mew-workspace-content')), true)

    await page.locator('#outside').click()
    assert.equal(await page.evaluate('window.outsideClicks'), 1, 'the persistent panel does not block the workspace')
    await page.keyboard.press('Escape')
    assert.equal(await sidebar.isVisible(), true, 'Escape preserves workspace panels')
    await option('/beta').click()
    assert.equal(await page.evaluate('window.active'), '/beta')
    assert.equal(await sidebar.isVisible(), true, 'selecting a project preserves the panel')
    await page.keyboard.press('Alt+p')
    assert.equal(await option('/alpha').evaluate(el => el === el.ownerDocument.activeElement), true)
    await page.keyboard.press('ArrowDown')
    assert.equal(await option('/beta').evaluate(el => el === el.ownerDocument.activeElement), true)
    await page.keyboard.press('ArrowRight')
    assert.equal(await row('/beta').locator('.mew-project-command').evaluate(el => el === el.ownerDocument.activeElement), true)
    await page.keyboard.press('ArrowLeft')
    assert.equal(await option('/beta').evaluate(el => el === el.ownerDocument.activeElement), true)

    await option('/gamma').focus(); await page.keyboard.press('Shift+ArrowUp')
    assert.deepEqual(await order(), ['/alpha', '/gamma', '/beta', '/work/project-with-a-long-name'])
    assert.equal(await option('/gamma').getAttribute('aria-keyshortcuts'), 'Alt+2')
    assert.equal(await option('/beta').locator('kbd').textContent(), 'Alt+3')
    await page.locator('[data-project-drag-handle="/gamma"]').focus(); await page.keyboard.press('ArrowDown')
    assert.deepEqual(await order(), ['/alpha', '/beta', '/gamma', '/work/project-with-a-long-name'])
    const handleBox = await page.locator('[data-project-drag-handle="/gamma"]').boundingBox(), firstBox = await option('/alpha').boundingBox()
    assert.ok(handleBox && firstBox)
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2)
    await page.mouse.down(); await page.mouse.move(handleBox.x + handleBox.width / 2, firstBox.y + 2, { steps: 12 }); await page.mouse.up()
    assert.deepEqual(await order(), ['/gamma', '/alpha', '/beta', '/work/project-with-a-long-name'])
    assert.equal(await page.evaluate('window.active'), '/beta', 'reordering does not activate a project')
    assert.equal(await option('/gamma').locator('kbd').textContent(), 'Alt+1')

    await option('/gamma').click({ button: 'right' })
    await page.getByRole('menuitem', { name: '삭제', exact: true }).waitFor()
    await page.keyboard.press('Escape')
    assert.equal(await sidebar.isVisible(), true)
    assert.equal(await option('/gamma').evaluate(el => el === el.ownerDocument.activeElement), true)
    await option('/gamma').focus(); await page.keyboard.press('Shift+F10')
    await page.getByRole('menuitem', { name: '삭제', exact: true }).click()
    assert.deepEqual(await page.evaluate('window.removals'), ['/gamma'])
    assert.equal(await sidebar.isVisible(), true)

    const separator = sidebar.getByRole('separator')
    await separator.focus(); await page.keyboard.press('ArrowRight')
    assert.equal(await separator.getAttribute('aria-valuenow'), '256')
    await page.keyboard.press('Home')
    assert.equal(await separator.getAttribute('aria-valuenow'), '200')
    await page.keyboard.press('End'); await page.keyboard.press('ArrowRight')
    assert.equal(await separator.getAttribute('aria-valuenow'), '360', 'keyboard resizing respects the width limit')
    await page.keyboard.press('Home')
    const resizeBox = await separator.boundingBox(); assert.ok(resizeBox)
    await page.mouse.move(resizeBox.x + resizeBox.width / 2, resizeBox.y + 80)
    await page.mouse.down(); await page.mouse.move(resizeBox.x + resizeBox.width / 2 + 48, resizeBox.y + 80, { steps: 8 }); await page.mouse.up()
    assert.equal(await separator.getAttribute('aria-valuenow'), '248')

    await row('/alpha').locator('.mew-project-command').click()
    const commands = page.locator('[data-cmd-overlay]')
    await commands.getByRole('button', { name: '검사 실행', exact: true }).waitFor()
    assert.ok(requests.some(request => request.method === 'GET' && request.workspacePath === '/alpha'))
    await Promise.all([
      page.waitForResponse(response => response.url().endsWith('/api/cmd-buttons/run')),
      commands.getByRole('button', { name: '검사 실행', exact: true }).click(),
    ])
    assert.ok(requests.some(request => request.method === 'POST' && request.workspacePath === '/alpha' && request.name === '검사 실행'))
    assert.equal(await page.evaluate('window.active'), '/beta', 'inactive project commands preserve the active project')
    await page.keyboard.press('Escape')
    assert.equal(await commands.count(), 0)
    assert.equal(await sidebar.isVisible(), true)
    await page.keyboard.press('Alt+r')
    await commands.getByRole('button', { name: '검사 실행', exact: true }).waitFor()
    assert.ok(requests.some(request => request.method === 'GET' && request.workspacePath === '/beta-worktree'), 'active row commands target the working tree')
    await page.keyboard.press('Escape')

    const surface = (locator: typeof sidebar) => locator.evaluate(el => {
      const style = el.ownerDocument.defaultView!.getComputedStyle(el)
      return { background: style.backgroundColor, blur: style.backdropFilter, surface: style.getPropertyValue('--color-surface').trim() }
    })
    for (const theme of ['dark', 'light', 'midnight', 'forest', 'paper', 'rose', 'ocean']) {
      await page.evaluate(`window.setFixtureTheme(${JSON.stringify(theme)})`)
      const projects = await surface(sidebar), files = await surface(page.locator('[data-sidebar]'))
      assert.equal(projects.background, files.background, `${theme}: projects share the file explorer background`)
      const list = await surface(menu)
      assert.equal(list.background, 'rgba(0, 0, 0, 0)', `${theme}: persistent project rows have no popup fill`)
      assert.equal(list.blur, 'none', `${theme}: persistent project rows have no popup blur`)
      assert.equal(list.surface, projects.surface, `${theme}: rows inherit panel theme colors`)
      await row('/beta').locator('.mew-project-command').click()
      await commands.getByRole('button', { name: '검사 실행', exact: true }).waitFor()
      assert.equal((await surface(commands)).blur, ['light', 'paper', 'midnight', 'rose', 'ocean'].includes(theme) ? 'blur(6px)' : 'none', `${theme}: actual command popups retain their overlay treatment`)
      await page.keyboard.press('Escape')
      if (['dark', 'light', 'midnight'].includes(theme)) await page.screenshot({ path: `/tmp/mew-project-sidebar-desktop-${theme}.png` })
    }
    await page.evaluate('window.setMaximized(true)')
    assert.equal(await sidebar.isVisible(), false, 'workspace maximize hides the project panel')
    await page.evaluate('window.setMaximized(false)')
    assert.equal(await sidebar.isVisible(), true)
    await close().click()
    assert.equal(await sidebar.count(), 0)
    assert.equal(await trigger.textContent(), 'beta')
    assert.equal(await trigger.evaluate(el => el === el.ownerDocument.activeElement), true)
    assert.equal(await page.locator('[data-header-command]').count(), 1)
    await page.evaluate('window.setDialog(true)'); await page.locator('#modal-input').focus(); await page.keyboard.press('Alt+p')
    assert.equal(await sidebar.count(), 0, 'modal inputs keep their keyboard scope')
    await page.evaluate('window.setDialog(false)'); await page.getByRole('textbox', { name: '문서 입력' }).focus(); await page.keyboard.press('Alt+p')
    await sidebar.waitFor()
    await page.reload()
    await sidebar.waitFor()
    assert.equal(await sidebar.getByRole('separator').getAttribute('aria-valuenow'), '248', 'saved panel width survives reload')
    assert.equal(await trigger.textContent(), 'beta')

    await page.evaluate("window.setFixtureTheme('midnight')")
    await page.setViewportSize({ width: 390, height: 700 })
    await sidebar.waitFor({ state: 'detached' })
    await trigger.click()
    await menu.waitFor()
    assert.equal(await menu.locator('.mew-project-command').count(), 0, 'mobile keeps the original project menu rows')
    assert.equal((await surface(menu)).blur, 'blur(6px)', 'mobile dropdowns retain the gradient popup treatment')
    const mobileBox = await menu.boundingBox(); assert.ok(mobileBox && mobileBox.x >= 0 && mobileBox.x + mobileBox.width <= 390)
    await page.screenshot({ path: '/tmp/mew-project-sidebar-mobile.png' })
    await option('/alpha').click()
    assert.equal(await menu.count(), 0)
    assert.equal(await page.evaluate('window.active'), '/alpha')
    await page.keyboard.press('Alt+p')
    await menu.waitFor()
    await page.keyboard.press('Escape')
    assert.equal(await menu.count(), 0)
    assert.equal(await trigger.evaluate(el => el === el.ownerDocument.activeElement), true)
    await trigger.click()
    await page.setViewportSize({ width: 1100, height: 700 })
    await sidebar.waitFor()
    assert.equal(await menu.count(), 1, 'resizing replaces the mobile menu with exactly one sidebar list')
    assert.equal(await menu.evaluate(el => !!el.closest('[data-project-sidebar]')), true)
    await trigger.click()
    assert.equal(await sidebar.count(), 0, 'the header trigger toggles the desktop panel')
    await page.evaluate('window.setEnabled(false)'); await page.keyboard.press('Alt+p')
    assert.equal(await sidebar.count(), 0)
    assert.equal(await menu.count(), 0)
    assert.deepEqual(errors, [])
  } finally { await browser.close() }
})
