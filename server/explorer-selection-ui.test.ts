import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { chromium, type Page } from 'playwright-core'
import { domBrowserExecutable } from './browser-dom-executable.ts'

const root = path.resolve(import.meta.dirname, '..')

test('explorer separates selection, opening, selected-item menus and bulk actions across input modes', { skip: !domBrowserExecutable(), timeout: 60_000 }, async () => {
  const source = `import React from '${root}/node_modules/react/index.js';
import {createRoot} from '${root}/node_modules/react-dom/client.js';
import {I18nProvider} from '${root}/src/i18n.tsx';
import {FileTree} from '${root}/src/components/FileTree.tsx';
import {readFileClipboard} from '${root}/src/utils/fileClipboard.ts';
const noop=()=>{};const file=(path,extra={})=>({path,name:path.split('/').pop(),type:'file',...extra});const dir=(path,children=[],extra={})=>({path,name:path.split('/').pop(),type:'dir',children,...extra});
window.opened=[];window.matches=[];window.deleted=[];window.renamed=[];
const match={line:3,column:0,text:'needle',matchStart:0,matchEnd:6};
function Fixture(){const [settings,setSettings]=React.useState({mode:'files',readOnly:false,n:0});window.fixture={clipboard:readFileClipboard,reset:(mode='files',readOnly=false)=>{window.opened=[];window.matches=[];window.deleted=[];window.renamed=[];setSettings(old=>({mode,readOnly,n:old.n+1}))}};const tree=settings.mode==='virtual'?Array.from({length:600},(_,i)=>file('item-'+String(i).padStart(4,'0')+'.md')):[file('MOC.md'),file('first.md'),dir('folder',[file('folder/MOC.md'),file('folder/child.md'),dir('folder/nested',[dir('folder/nested/deep')])]),file('last.md'),file('locked.md',{editable:false}),dir('target'),dir('locked-dir',[file('locked-dir/inside.md')],{editable:false})];return <div className="h-dvh w-80 bg-surface-deep text-ink"><FileTree key={settings.n} project=".workspace" stateKey={'selection-'+settings.n} accountState={{openDirs:['folder'],scrollTop:0}} tree={tree} selectedPath="last.md" readOnly={settings.readOnly} documentPages={settings.mode==='documents'} search={settings.mode==='search'?{query:'needle',paths:['first.md','folder/child.md'],matches:new Map([['first.md',[match]],['folder/child.md',[match]]]),onOpenMatch:(...args)=>window.matches.push(args)}:undefined} newFileSignal={{n:0,parentPath:null}} revealSignal={0} presence={{}} onSelect={(...args)=>window.opened.push(args)} onFileCreated={noop} onFolderCreated={noop} onRenamed={(...args)=>window.renamed.push(args)} onDeleted={(...args)=>window.deleted.push(args)} onNotice={noop}/></div>}
createRoot(document.getElementById('root')).render(<React.StrictMode><I18nProvider><Fixture/></I18nProvider></React.StrictMode>);`
  const bundle = await build({ input: 'virtual:explorer-selection.tsx', write: false, platform: 'browser', onLog(level, log, handler) { if (log.code !== 'MODULE_LEVEL_DIRECTIVE') handler(level, log) }, output: { format: 'iife' }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } }, plugins: [{ name: 'fixture', resolveId(id) { if (id === 'virtual:explorer-selection.tsx') return id; if (id.endsWith('.css')) return 'virtual:style' }, async load(id) { if (id === 'virtual:explorer-selection.tsx') return source; if (id === 'virtual:style') return ''; if (id.endsWith('?raw')) return 'export default ' + JSON.stringify(await fs.readFile(id.slice(0, -4), 'utf8')) } }] })
  const chunk = bundle.output.find(item => item.type === 'chunk')!
  const content = (await Promise.all(['src/components/FileTree.tsx', 'src/components/file-action-menu.tsx', 'packages/ui/src/action-menu.tsx', 'packages/ui/src/ConfirmDialog.tsx', 'packages/ui/src/dialog-frame.tsx'].map(file => fs.readFile(path.join(root, file), 'utf8')))).join('\n')
  const compiler = await compile(await fs.readFile(`${root}/src/index.css`, 'utf8'), { base: `${root}/src`, onDependency() {} })
  const css = compiler.build([...new Set((source + content).match(/[A-Za-z0-9_@:/.[\]()%,-]+/g))])
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  try {
    const errors: string[] = []
    const writes: Array<{ endpoint: string; payload: Record<string, unknown> }> = []
    const failRenames = new Set<string>()
    let delayedRename: { path: string; pending: Promise<void> } | undefined
    const setup = async (page: Page) => {
      page.setDefaultTimeout(3000)
      page.on('pageerror', error => errors.push(error.message))
      await page.route('http://mew-selection.test/**', async route => {
        const request = route.request(), url = new URL(request.url())
        if (url.pathname === '/api/copy-into') {
          const payload = request.postDataJSON()
          writes.push({ endpoint: url.pathname, payload })
          await route.fulfill({ json: { relPath: `${payload.destDir}/${payload.srcPath.split('/').pop()}`, hidden: false } }); return
        }
        if (url.pathname === '/api/file' && request.method() === 'DELETE') {
          writes.push({ endpoint: url.pathname, payload: Object.fromEntries(url.searchParams) })
          await route.fulfill({ json: { ok: true, commit: null } }); return
        }
        if (url.pathname === '/api/rename') {
          const payload = request.postDataJSON()
          writes.push({ endpoint: url.pathname, payload })
          if (delayedRename && delayedRename.path === payload.oldPath) await delayedRename.pending
          if (failRenames.delete(payload.oldPath)) { await route.fulfill({ status: 409, json: { error: 'Target temporarily busy' } }); return }
          await route.fulfill({ json: { relPath: payload.newPath, hidden: false } }); return
        }
        if (url.pathname === '/api/copy') {
          const payload = request.postDataJSON()
          writes.push({ endpoint: url.pathname, payload })
          await route.fulfill({ json: { relPath: 'first-copy.md', hidden: false } }); return
        }
        if (url.pathname === '/api/upload-into') {
          const body = request.postData() ?? ''
          writes.push({ endpoint: url.pathname, payload: { destDir: body.match(/name="destDir"\r?\n\r?\n([^\r\n]*)/)?.[1], project: body.match(/name="project"\r?\n\r?\n([^\r\n]*)/)?.[1], file: body.match(/filename="([^"]+)"/)?.[1] } })
          await route.fulfill({ json: { relPath: 'external.txt', hidden: false } }); return
        }
        if (url.pathname === '/api/docs/pages/copy') {
          writes.push({ endpoint: url.pathname, payload: request.postDataJSON() })
          await route.fulfill({ json: { path: 'folder-copy/_folder-copy.md', moves: [], changed: [] } }); return
        }
        if (url.pathname.startsWith('/api/')) { await route.fulfill({ json: {} }); return }
        await route.fulfill(url.pathname === '/app.js' ? { contentType: 'text/javascript', body: chunk.code } : { contentType: 'text/html', body: `<!doctype html><html class="dark"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script src="/app.js"></script></html>` })
      })
      await page.addInitScript("localStorage.setItem('mew:locale','en')")
      await page.goto('http://mew-selection.test/')
      await page.locator('button[data-path="first.md"]').waitFor().catch(error => { assert.deepEqual(errors, []); throw error })
    }
    const page = await browser.newPage({ viewport: { width: 1100, height: 844 } })
    await setup(page)
    const row = (file: string) => page.locator(`button[data-path="${file}"]`)
    const menu = (name: string) => page.getByRole('menuitem', { name, exact: true })
    const selected = () => page.locator('button[data-path][data-selected="true"]').evaluateAll(els => els.map(el => el.getAttribute('data-path')))
    const visible = () => page.locator('button[data-path]').evaluateAll(els => els.map(el => el.getAttribute('data-path')))
    const reset = async (mode = 'files', readOnly = false) => {
      const oldKey = await page.locator('[data-tree-key]').getAttribute('data-tree-key')
      await page.evaluate(`window.fixture.reset(${JSON.stringify(mode)},${readOnly})`)
      await page.waitForFunction(`document.querySelector('[data-tree-key]')?.dataset.treeKey !== ${JSON.stringify(oldKey)}`)
    }
    const assertSelected = async (paths: string[]) => {
      assert.deepEqual(await selected(), paths)
      assert.deepEqual(await page.locator('button[data-path][aria-pressed="true"]').evaluateAll(els => els.map(el => el.getAttribute('data-path'))), paths)
    }
    const blank = async (button: 'left' | 'right' = 'left') => {
      const scroller = page.locator('[data-tree-key] > div').last()
      await scroller.click({ button, position: { x: 180, y: 640 } })
    }

    assert.deepEqual(await selected(), [], 'active editor tab does not imply an explorer selection')
    for (const file of ['first.md', 'MOC.md', 'folder/MOC.md']) {
      await row(file).click()
      await assertSelected([file])
      assert.deepEqual(await page.evaluate('window.opened'), [], 'single click only selects')
      await row(file).dblclick()
      assert.deepEqual(await page.evaluate('window.opened'), [[file, { preview: false }]], 'double click opens exactly once')
      await reset()
    }
    await row('first.md').click()
    await row('last.md').click({ modifiers: ['Shift'] })
    const order = await visible()
    await assertSelected(order.slice(order.indexOf('first.md'), order.indexOf('last.md') + 1) as string[])
    await row('first.md').click({ modifiers: ['Control'] })
    assert.equal(await row('first.md').getAttribute('data-selected'), null, 'Ctrl toggles a selected row off')
    await row('first.md').click({ modifiers: ['Meta'] })
    assert.equal(await row('first.md').getAttribute('data-selected'), 'true', 'Cmd toggles the row back on')
    await row('locked.md').click({ modifiers: ['Control', 'Shift'] })
    await assertSelected(order.slice(order.indexOf('first.md'), order.indexOf('locked.md') + 1) as string[])
    assert.deepEqual(await page.evaluate('window.opened'), [])
    await row('first.md').dblclick({ modifiers: ['Control'] })
    assert.deepEqual(await page.evaluate('window.opened'), [], 'modified double click remains selection only')
    await row('first.md').click()
    await row('locked.md').click({ modifiers: ['Control'] })
    await row('folder').click({ modifiers: ['Control', 'Shift'] })
    await assertSelected(order.slice(order.indexOf('first.md'), order.indexOf('locked.md') + 1) as string[])
    assert.equal(await row('first.md').getAttribute('data-selected'), 'true', 'Ctrl+Shift preserves selections outside the new range')
    await row('MOC.md').click()
    await row('last.md').click({ modifiers: ['Shift'] })
    await assertSelected(order.slice(0, order.indexOf('last.md') + 1) as string[])
    await row('first.md').click({ button: 'right' })
    await menu('Copy').waitFor()
    await menu('Cut').waitFor()
    await menu('Delete').waitFor()
    assert.equal(await menu('Rename').count(), 0, 'multi-selection hides single-item actions')
    assert.equal(await menu('Duplicate').count(), 0)
    await assertSelected(order.slice(0, order.indexOf('last.md') + 1) as string[])
    await page.keyboard.press('Escape')
    await row('locked.md').click({ button: 'right' })
    await menu('New file').waitFor()
    await menu('New folder').waitFor()
    assert.equal(await menu('Rename').count(), 0)
    assert.equal(await menu('Delete').count(), 0, 'right click on an unselected row is the root menu')
    await assertSelected([])
    await page.keyboard.press('Escape')
    await row('first.md').click()
    await blank()
    await assertSelected([])
    await blank('right')
    await menu('New file').waitFor()
    assert.equal(await menu('Copy').count(), 0)
    await page.keyboard.press('Escape')

    await row('folder').click({ modifiers: ['Control'] })
    assert.equal(await row('folder/child.md').count(), 1, 'modified folder selection preserves expansion')
    await row('folder').click()
    assert.equal(await row('folder/child.md').count(), 0, 'plain folder selection still toggles expansion')
    await assertSelected(['folder'])
    await row('folder').click()
    await row('first.md').focus()
    await page.keyboard.press('Space')
    await assertSelected(['first.md'])
    assert.deepEqual(await page.evaluate('window.opened'), [])
    await page.keyboard.press('Enter')
    assert.deepEqual(await page.evaluate('window.opened'), [['first.md', { preview: false }]])
    await page.keyboard.press('Escape')
    await assertSelected([])
    await page.keyboard.press('Control+a')
    await assertSelected(await visible() as string[])
    await page.keyboard.press('Escape')
    await assertSelected([])
    await row('folder').click()
    assert.equal(await row('folder').evaluate(el => el.ownerDocument.activeElement === el), true, 'folder collapse preserves keyboard focus')
    await page.keyboard.press('Control+a')
    await assertSelected(await visible() as string[])
    assert.equal(await row('folder/child.md').count(), 0, 'select all does not reveal collapsed children')
    await row('folder').click()

    await row('first.md').click()
    for (const modifier of ['Control', 'Meta'] as const) {
      await row('last.md').dblclick({ modifiers: [modifier] })
      await assertSelected(['first.md'])
    }
    const duplicated = page.waitForResponse(response => new URL(response.url()).pathname === '/api/copy')
    await page.keyboard.press('Control+d')
    await duplicated
    assert.deepEqual(writes.filter(write => write.endpoint === '/api/copy').map(write => write.payload), [{ path: 'first.md', project: '.workspace' }], 'duplicate uses the selected row after a focused row was toggled off')

    await row('first.md').click()
    await row('folder').click({ modifiers: ['Control'] })
    await row('folder/child.md').click({ modifiers: ['Control'] })
    await page.keyboard.press('Control+c')
    await row('target').click()
    const copied = Promise.all(['first.md', 'folder'].map(file => page.waitForResponse(response => new URL(response.url()).pathname === '/api/copy-into' && response.request().postDataJSON()?.srcPath === file)))
    await page.keyboard.press('Control+v')
    await copied
    assert.deepEqual(writes.filter(write => write.endpoint === '/api/copy-into').map(write => write.payload), [
      { srcPath: 'first.md', destDir: 'target', project: '.workspace' },
      { srcPath: 'folder', destDir: 'target', project: '.workspace' },
    ], 'bulk paste copies each selected top-level item once')
    await row('first.md').click()
    await row('folder').click({ modifiers: ['Control'] })
    await row('folder/child.md').click({ modifiers: ['Control'] })
    await page.keyboard.press('Delete')
    await page.getByRole('dialog').waitFor()
    await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click()
    await page.getByRole('dialog').waitFor({ state: 'detached' })
    assert.deepEqual(writes.filter(write => write.endpoint === '/api/file').map(write => write.payload.path), ['first.md', 'folder'], 'bulk delete suppresses selected descendants')
    await row('first.md').click()
    await row('locked.md').click({ modifiers: ['Control'] })
    await page.keyboard.press('Delete')
    assert.equal(await page.getByRole('dialog').count(), 0, 'keyboard cannot mutate a read-only member of the selection')
    await row('first.md').click({ button: 'right' })
    assert.equal(await menu('Delete').count(), 0)
    assert.equal(await menu('Cut').count(), 0, 'read-only rows prevent mutation of a mixed selection')
    await page.keyboard.press('Escape')
    await page.keyboard.press('Delete')
    assert.equal(await page.getByRole('dialog').count(), 0)

    await reset()
    await row('first.md').click()
    await row('last.md').click({ modifiers: ['Control'] })
    await page.keyboard.press('Control+x')
    await row('target').click()
    failRenames.add('last.md')
    const firstPaste = Promise.all(['first.md', 'last.md'].map(file => page.waitForResponse(response => new URL(response.url()).pathname === '/api/rename' && response.request().postDataJSON()?.oldPath === file)))
    await page.keyboard.press('Control+v')
    await firstPaste
    await page.getByRole('dialog').waitFor()
    assert.match(await page.getByRole('dialog').innerText(), /Target temporarily busy/)
    await page.getByRole('dialog').getByRole('button').last().click()
    assert.deepEqual(await page.evaluate('window.fixture.clipboard().items.map(item=>item.path)'), ['last.md'], 'a partially failed cut retains only the failed item for retry')
    await row('target').focus()
    const retryPaste = page.waitForResponse(response => new URL(response.url()).pathname === '/api/rename' && response.request().postDataJSON()?.oldPath === 'last.md')
    await page.keyboard.press('Control+v')
    await retryPaste
    assert.deepEqual(writes.filter(write => write.endpoint === '/api/rename').map(write => write.payload), [
      { oldPath: 'first.md', newPath: 'target/first.md', project: '.workspace' },
      { oldPath: 'last.md', newPath: 'target/last.md', project: '.workspace' },
      { oldPath: 'last.md', newPath: 'target/last.md', project: '.workspace' },
    ], 'retry does not repeat successful cut moves')
    await page.waitForFunction('window.fixture.clipboard() === null')
    const afterCut = writes.length
    await page.keyboard.press('Control+v')
    await page.waitForTimeout(80)
    assert.equal(writes.length, afterCut, 'successful cut empties its clipboard')

    await reset()
    await row('first.md').click()
    await row('last.md').click({ modifiers: ['Control'] })
    await page.keyboard.press('Control+x')
    await row('target').click()
    let releaseRename!: () => void
    delayedRename = { path: 'first.md', pending: new Promise<void>(resolve => { releaseRename = resolve }) }
    try {
      const beforePendingPaste = writes.length
      const pendingRequest = page.waitForRequest(request => new URL(request.url()).pathname === '/api/rename' && request.postDataJSON()?.oldPath === 'first.md')
      await page.keyboard.press('Control+v')
      await pendingRequest
      await page.keyboard.press('Control+v')
      await page.keyboard.press('Control+v')
      assert.equal(writes.length, beforePendingPaste + 1, 'repeated paste shortcuts do not overlap a pending operation')
      await row('folder/child.md').click()
      await page.keyboard.press('Control+c')
      const lastMove = page.waitForResponse(response => new URL(response.url()).pathname === '/api/rename' && response.request().postDataJSON()?.oldPath === 'last.md')
      releaseRename()
      await lastMove
      await page.waitForFunction('window.renamed.length === 2')
      assert.deepEqual(await page.evaluate('window.fixture.clipboard().items.map(item=>item.path)'), ['folder/child.md'], 'an old cut finishing preserves files copied while it was pending')
      assert.deepEqual(writes.slice(beforePendingPaste).map(write => write.payload.oldPath), ['first.md', 'last.md'])
    } finally { releaseRename(); delayedRename = undefined }

    await reset()
    await row('first.md').click()
    await row('folder').click({ modifiers: ['Control'] })
    await row('folder/child.md').click({ modifiers: ['Control'] })
    const beforeDrag = writes.length
    const dragged = Promise.all(['first.md', 'folder'].map(file => page.waitForResponse(response => new URL(response.url()).pathname === '/api/rename' && response.request().postDataJSON()?.oldPath === file)))
    await row('first.md').dragTo(row('target'))
    await dragged
    assert.deepEqual(writes.slice(beforeDrag).map(write => write.payload), [
      { oldPath: 'first.md', newPath: 'target/first.md', project: '.workspace' },
      { oldPath: 'folder', newPath: 'target/folder', project: '.workspace' },
    ], 'dragging a selected row moves the selected top-level group once')
    await reset()
    await row('first.md').click()
    await row('locked.md').click({ modifiers: ['Control'] })
    const beforeLockedDrag = writes.length
    await row('first.md').dragTo(row('target'))
    await page.waitForTimeout(80)
    assert.equal(writes.length, beforeLockedDrag, 'mixed read-only selections cannot be dragged into a mutation')

    for (const shortcut of ['Control+c', 'Control+x']) {
      await reset()
      await row('first.md').click()
      await page.keyboard.press(shortcut)
      await row('locked-dir').click()
      const beforeLockedPaste = writes.length
      await page.keyboard.press('Control+v')
      await page.waitForTimeout(80)
      assert.equal(writes.length, beforeLockedPaste, 'keyboard paste cannot write into a read-only directory')
      assert.equal(await page.getByRole('dialog').count(), 0)
    }
    await reset()
    await row('folder/nested').click()
    await row('folder/child.md').click()
    await row('folder/nested').click({ modifiers: ['Control'] })
    const beforeInvalidDrop = writes.length
    const dragData = await page.evaluateHandle('new DataTransfer()')
    try {
      for (const destination of ['folder/nested', 'folder/nested/deep', 'locked-dir']) {
        await row('folder/nested').dispatchEvent('dragstart', { dataTransfer: dragData })
        await row(destination).dispatchEvent('dragover', { dataTransfer: dragData })
        await row(destination).dispatchEvent('drop', { dataTransfer: dragData })
        await row('folder/nested').dispatchEvent('dragend', { dataTransfer: dragData })
      }
      await page.waitForTimeout(80)
      assert.equal(writes.length, beforeInvalidDrop, 'self, descendant and read-only drops cannot bubble into a root move')
    } finally { await dragData.dispose() }

    await reset('documents')
    await row('folder').click()
    await assertSelected(['folder'])
    assert.deepEqual(await page.evaluate('window.opened'), [])
    await row('folder').dblclick()
    assert.deepEqual(await page.evaluate('window.opened'), [['folder/MOC.md', { preview: false, replaceActive: true }]])
    await row('first.md').click()
    await row('first.md').dblclick()
    assert.deepEqual(await page.evaluate('window.opened'), [
      ['folder/MOC.md', { preview: false, replaceActive: true }],
      ['first.md', { preview: false, replaceActive: true }],
    ])
    await row('MOC.md').click()
    await row('MOC.md').dblclick()
    assert.deepEqual((await page.evaluate('window.opened') as unknown[]).at(-1), ['MOC.md', { preview: false, replaceActive: true }])
    const beforeArrow = await page.evaluate('window.opened')
    await page.locator('[data-document-page="folder"]').getByRole('button', { expanded: true }).click()
    assert.equal(await row('folder/child.md').count(), 0)
    assert.deepEqual(await page.evaluate('window.opened'), beforeArrow, 'document disclosure only expands or collapses')
    const externalFiles = await page.evaluateHandle('(() => { const data = new DataTransfer(); data.items.add(new File(["outside"], "external.txt", { type: "text/plain" })); return data })()')
    try {
      const uploaded = page.waitForResponse(response => new URL(response.url()).pathname === '/api/upload-into')
      await row('folder').dispatchEvent('dragover', { dataTransfer: externalFiles })
      await row('folder').dispatchEvent('drop', { dataTransfer: externalFiles })
      await uploaded
      assert.deepEqual(writes.filter(write => write.endpoint === '/api/upload-into').map(write => write.payload), [{ destDir: '', project: '.workspace', file: 'external.txt' }], 'external files dropped on a Documents page retain root upload handling')
    } finally { await externalFiles.dispose() }
    await row('folder').click()
    await row('first.md').click({ modifiers: ['Control'] })
    await row('first.md').click({ modifiers: ['Control'] })
    const copiedPage = page.waitForResponse(response => new URL(response.url()).pathname === '/api/docs/pages/copy')
    await page.keyboard.press('Control+d')
    await copiedPage
    assert.equal(writes.filter(write => write.endpoint === '/api/docs/pages/copy').at(-1)?.payload.path, 'folder', 'duplicating a selected parent uses page operations even when another row has focus')

    await reset('search')
    await row('first.md').click()
    await assertSelected(['first.md'])
    assert.deepEqual(await page.evaluate('window.matches'), [], 'search click does not activate a content match')
    await row('first.md').dblclick()
    assert.equal((await page.evaluate('window.matches') as unknown[]).length, 1)
    assert.deepEqual(await page.evaluate('window.opened'), [])

    for (const theme of ['dark', 'light']) {
      await reset()
      await page.locator('html').evaluate((el, value) => { el.classList.toggle('dark', value === 'dark') }, theme)
      await row('first.md').click()
      await row('last.md').click({ modifiers: ['Control'] })
      await assertSelected(['first.md', 'last.md'])
      const colors = await row('first.md').evaluate(el => { const view = el.ownerDocument.defaultView!; return { selected: view.getComputedStyle(el).backgroundColor, surface: view.getComputedStyle(el.closest('[data-tree-key]')!).backgroundColor } })
      assert.notEqual(colors.selected, 'rgba(0, 0, 0, 0)')
      assert.notEqual(colors.selected, colors.surface, `${theme} selection remains visibly distinct`)
      const hoveredColor = await row('last.md').evaluate(el => el.ownerDocument.defaultView!.getComputedStyle(el).backgroundColor)
      assert.equal(hoveredColor.split(' / ')[0], colors.selected.split(' / ')[0], `${theme} hovered selection retains the group accent hue`)
      await page.screenshot({ path: `/tmp/mew-explorer-selection-${theme}.png` })
    }
    await reset('files', true)
    await row('first.md').click()
    await assertSelected(['first.md'])
    await row('first.md').dblclick()
    assert.deepEqual(await page.evaluate('window.opened'), [['first.md', { preview: false }]], 'read-only trees retain navigation')
    await page.keyboard.press('Delete')
    assert.equal(await page.getByRole('dialog').count(), 0)

    await reset('virtual')
    await row('item-0000.md').click()
    const virtualScroller = page.locator('[data-tree-key] > div').last()
    assert.ok(await page.locator('button[data-path]').count() < 150, 'large fixture actually uses virtualized rows')
    await virtualScroller.evaluate(el => { el.scrollTop = el.scrollHeight })
    await row('item-0599.md').waitFor()
    await row('item-0599.md').click({ modifiers: ['Shift'] })
    await page.keyboard.press('Control+c')
    const fullRange = Array.from({ length: 600 }, (_, i) => `item-${String(i).padStart(4, '0')}.md`)
    assert.deepEqual(await page.evaluate('window.fixture.clipboard().items.map(item=>item.path)'), fullRange, 'range selection includes unmounted rows between its endpoints')
    await virtualScroller.evaluate(el => { el.scrollTop = el.scrollHeight / 2 })
    await row('item-0300.md').waitFor({ state: 'attached' })
    await assertSelected(await visible() as string[])
    await row('item-0300.md').focus()
    await page.keyboard.press('Escape')
    await page.keyboard.press('Control+a')
    await page.keyboard.press('Control+c')
    assert.deepEqual(await page.evaluate('window.fixture.clipboard().items.map(item=>item.path)'), fullRange, 'select all includes all visible-tree rows regardless of virtualization')

    const touchContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
    const touchPage = await touchContext.newPage()
    await setup(touchPage)
    const touchRow = touchPage.locator('button[data-path="first.md"]')
    await touchRow.tap()
    assert.equal(await touchRow.getAttribute('data-selected'), 'true')
    assert.deepEqual(await touchPage.evaluate('window.opened'), [], 'touch tap selects without opening')
    await touchPage.waitForTimeout(500)
    await touchRow.tap()
    await touchRow.tap()
    assert.deepEqual(await touchPage.evaluate('window.opened'), [['first.md', { preview: false }]], 'touch double tap opens exactly once')
    await touchPage.screenshot({ path: '/tmp/mew-explorer-selection-touch.png' })
    assert.deepEqual(errors, [])
    await touchContext.close()
  } finally { await browser.close() }
})
