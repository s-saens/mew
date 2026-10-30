import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { chromium } from 'playwright-core'
import { domBrowserExecutable } from './browser-dom-executable.ts'

const root = path.resolve(import.meta.dirname, '..')

test('public share controls publish, edit, revoke, handle errors and restrict management on desktop and mobile', { skip: !domBrowserExecutable(), timeout: 40_000 }, async () => {
  const source = `import React,{useState} from '${root}/node_modules/react/index.js';
import {createRoot} from '${root}/node_modules/react-dom/client.js';
import {I18nProvider,useI18n} from '${root}/src/i18n.tsx';
import {FileTree} from '${root}/src/components/FileTree.tsx';
import {configurePortPreviewBaseUrl} from '${root}/src/utils/port-preview-url.ts';
const noop=()=>{};
function Fixture(){const [manage,setManage]=useState(true);const [pages,setPages]=useState(false);const {setLocale}=useI18n();window.fixture={setManage,setPages,setLocale,invalidateBase:()=>configurePortPreviewBaseUrl(null)};
return <aside className="h-dvh w-full max-w-sm bg-surface-deep text-ink"><FileTree project=".workspace" tree={[{name:'MOC.md',path:'MOC.md',type:'file'},{name:'README.md',path:'README.md',type:'file'},{name:'private.txt',path:'private.txt',type:'file'},{name:'notes',path:'notes',type:'dir',children:[{name:'child.md',path:'notes/child.md',type:'file'}]}]} documentPages={pages} selectedPath={null} readOnly={false} canManagePublicShares={manage} newFileSignal={{n:0,parentPath:null}} revealSignal={0} presence={{}} onSelect={noop} onFileCreated={noop} onFolderCreated={noop} onRenamed={noop} onDeleted={noop} onNotice={noop}/></aside>}
createRoot(document.getElementById('root')).render(<I18nProvider><Fixture/></I18nProvider>);`
  const bundle = await build({ input: 'virtual:public-sharing.tsx', logLevel: 'silent', write: false, platform: 'browser', output: { format: 'iife' }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } }, plugins: [{ name: 'fixture', resolveId(id) { if (id === 'virtual:public-sharing.tsx') return id; if (id.endsWith('.css')) return 'virtual:style' }, async load(id) { if (id === 'virtual:public-sharing.tsx') return source; if (id === 'virtual:style') return ''; if (id.endsWith('?raw')) return 'export default ' + JSON.stringify(await fs.readFile(id.slice(0, -4), 'utf8')) } }] })
  const chunk = bundle.output.find(item => item.type === 'chunk')!
  const files = ['src/components/FileTree.tsx', 'src/components/file-action-menu.tsx', 'src/components/public-share-dialog.tsx', 'packages/ui/src/dialog-frame.tsx', 'packages/ui/src/action-menu.tsx']
  const content = (await Promise.all(files.map(file => fs.readFile(path.join(root, file), 'utf8')))).join('\n')
  const compiler = await compile(await fs.readFile(`${root}/src/index.css`, 'utf8'), { base: `${root}/src`, onDependency() {} })
  const css = compiler.build([...new Set((source + content).match(/[A-Za-z0-9_@:/.[\]()%,-]+/g))])
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  try {
    const context = await browser.newContext({ viewport: { width: 1100, height: 800 }, hasTouch: true })
    const page = await context.newPage()
    page.setDefaultTimeout(4000)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    const shares = new Map<string, { id: string; type: 'f' | 'd'; path: string; mode: string; url: string }>()
    const writes: string[] = []
    let failWrite = false
    let failLoad = false
    let holdWrite: Promise<void> | null = null
    await page.route('http://mew-share.test/**', async route => {
      const url = new URL(route.request().url())
      if (url.pathname === '/api/public-shares/list') { await route.fulfill({ json: { shares: [...shares.values()] } }); return }
      if (url.pathname === '/api/public-shares') {
        if (route.request().method() !== 'PUT') {
          if (failLoad) { failLoad = false; await route.fulfill({ status: 503, json: { error: 'unavailable' } }); return }
          await route.fulfill({ json: { share: shares.get(url.searchParams.get('path')!) ?? null } }); return
        }
        const payload = route.request().postDataJSON()
        writes.push(payload.mode)
        if (holdWrite) await holdWrite
        if (failWrite) { failWrite = false; await route.fulfill({ status: 500, json: { error: 'failed' } }); return }
        if (payload.mode === 'off') shares.delete(payload.path)
        else {
          const type = payload.path === 'notes' ? 'd' as const : 'f' as const
          const id = shares.get(payload.path)?.id ?? (payload.path === 'notes' ? 'd' : 'f').repeat(43)
          shares.set(payload.path, { id, type, path: payload.path, mode: payload.mode, url: '/share/' + type + '/' + id })
        }
        await route.fulfill({ json: { share: shares.get(payload.path) ?? null } }); return
      }
      if (url.pathname.startsWith('/api/')) { await route.fulfill({ json: {} }); return }
      await route.fulfill(url.pathname === '/app.js' ? { contentType: 'text/javascript', body: chunk.code } : { contentType: 'text/html', body: `<!doctype html><html class="dark"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script src="/app.js"></script></html>` })
    })
    await page.addInitScript("localStorage.setItem('mew:locale','en');Object.defineProperty(navigator,'clipboard',{value:{writeText:async value=>window.copied=value}})")
    await page.goto('http://mew-share.test/')
    const row = (name: string) => page.locator(`button[data-path="${name}"]`)
    const openSettings = async (name: string) => {
      await row(name).click({ button: 'right' })
      await page.getByRole('menuitem', { name: 'Publish', exact: true }).click()
      await page.getByRole('dialog').waitFor()
    }
    await row('README.md').waitFor()
    assert.equal(await page.locator('[data-public-share]').count(), 0)
    await openSettings('README.md')
    await page.getByRole('radio', { name: 'Not public', exact: true }).waitFor()
    await page.getByRole('radio', { name: 'Not public', exact: true }).isChecked().then(assert.ok)
    assert.equal(await page.getByRole('radio').count(), 3)
    assert.equal(await page.locator('select').count(), 0)
    let release: () => void = () => {}
    holdWrite = new Promise<void>(resolve => { release = resolve })
    await page.getByRole('radio', { name: 'Public viewing', exact: true }).click()
    await page.getByRole('dialog').getAttribute('aria-busy').then(value => assert.equal(value, 'true'))
    assert.ok(await page.getByRole('radio', { name: 'Allow editing', exact: true }).isDisabled())
    holdWrite = null
    release()
    await row('README.md').locator('[data-public-share="view"]').waitFor()
    const url = await page.getByRole('textbox', { name: 'Public link' }).inputValue()
    assert.equal(url, 'http://mew-share.test/share/f/' + 'f'.repeat(43))
    await page.getByRole('button', { name: 'Copy link', exact: true }).click()
    await page.getByRole('button', { name: 'Link copied', exact: true }).waitFor()
    assert.equal(await page.evaluate('window.copied'), url)
    assert.equal(await page.getByRole('link', { name: 'Open public link' }).getAttribute('href'), url)
    await page.screenshot({ path: '/tmp/mew-public-share-desktop.png' })
    await page.getByRole('radio', { name: 'Allow editing', exact: true }).click()
    await row('README.md').locator('[data-public-share="edit"]').waitFor()
    assert.equal(await page.getByRole('textbox', { name: 'Public link' }).inputValue(), url)
    failWrite = true
    await page.getByRole('radio', { name: 'Not public', exact: true }).click()
    await page.getByRole('alert').waitFor()
    assert.ok(await page.getByRole('radio', { name: 'Allow editing', exact: true }).isChecked())
    assert.equal(await row('README.md').locator('[data-public-share="edit"]').count(), 1)
    await page.getByRole('radio', { name: 'Not public', exact: true }).click()
    await row('README.md').locator('[data-public-share]').waitFor({ state: 'detached' })
    assert.equal(await page.getByRole('textbox', { name: 'Public link' }).count(), 0)
    assert.equal(shares.has('README.md'), false)
    await page.getByRole('dialog').press('Escape')
    await page.getByRole('dialog').waitFor({ state: 'detached' })
    assert.deepEqual(writes, ['view', 'edit', 'off', 'off'])

    failLoad = true
    await openSettings('MOC.md')
    await page.getByRole('alert').waitFor()
    assert.ok(await page.getByRole('radio', { name: 'Public viewing', exact: true }).isDisabled())
    await page.getByRole('button', { name: 'Try again', exact: true }).click()
    await page.getByRole('radio', { name: 'Public viewing', exact: true }).click()
    await row('MOC.md').locator('[data-public-share="view"]').waitFor()
    await page.getByRole('button', { name: 'Close', exact: true }).click()

    await page.setViewportSize({ width: 390, height: 844 })
    await row('notes').evaluate(el => {
      const rect = el.getBoundingClientRect()
      const browserWindow = el.ownerDocument.defaultView!
      const touch = new browserWindow.Touch({ identifier: 1, target: el, clientX: rect.x + 30, clientY: rect.y + rect.height / 2 })
      el.dispatchEvent(new browserWindow.TouchEvent('touchstart', { bubbles: true, touches: [touch], changedTouches: [touch] }))
      setTimeout(() => el.dispatchEvent(new browserWindow.TouchEvent('touchend', { bubbles: true, touches: [], changedTouches: [touch] })), 600)
    })
    await page.getByRole('menuitem', { name: 'Publish', exact: true }).click()
    await page.getByRole('radio', { name: 'Allow editing', exact: true }).click()
    await page.locator('button[data-path="notes"]').locator('..').locator('[data-public-share="edit"]').waitFor()
    assert.match(await page.getByRole('textbox', { name: 'Public link' }).inputValue(), /\/share\/d\//)
    const dialog = await page.getByRole('dialog').boundingBox()
    assert.ok(dialog && dialog.x >= 0 && dialog.x + dialog.width <= 390)
    await page.screenshot({ path: '/tmp/mew-public-share-mobile.png' })
    await page.getByRole('button', { name: 'Close', exact: true }).click()
    await row('notes').click()
    assert.equal(await row('notes/child.md').locator('[data-public-share]').count(), 0, 'folder publication does not mark children as explicitly published')
    await page.evaluate('window.fixture.setPages(true)')
    await page.locator('[data-document-page="notes"] [data-public-share="edit"]').waitFor()
    for (const locale of ['ko', 'ja', 'zh-CN']) {
      await page.evaluate(`window.fixture.setLocale(${JSON.stringify(locale)})`)
      await row('README.md').click({ button: 'right' })
      await page.getByRole('menuitem', { name: locale === 'ko' ? '공개' : '公开', exact: true }).or(page.getByRole('menuitem', { name: '公開', exact: true })).click()
      assert.equal(await page.getByRole('radio').count(), 3)
      await page.getByRole('dialog').press('Escape')
    }
    await page.evaluate("window.fixture.setLocale('en');window.fixture.invalidateBase()")
    await openSettings('MOC.md')
    await page.getByRole('alert').filter({ hasText: 'The public address is unavailable.' }).waitFor()
    assert.ok(await page.getByRole('radio', { name: 'Public viewing', exact: true }).isChecked(), 'a missing remote address preserves the stored sharing mode')
    assert.equal(await page.getByRole('textbox', { name: 'Public link' }).count(), 0)
    assert.equal(shares.get('MOC.md')?.mode, 'view')
    await page.getByRole('button', { name: 'Close', exact: true }).click()
    await page.evaluate('window.fixture.setManage(false)')
    await row('README.md').click({ button: 'right' })
    await page.getByRole('menu').waitFor()
    assert.equal(await page.getByRole('menuitem', { name: 'Publish', exact: true }).count(), 0, 'file write access alone cannot manage public links')
    assert.deepEqual(errors, [])
  } finally { await browser.close() }
})
