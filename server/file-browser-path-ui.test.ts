import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { chromium, type Route } from 'playwright-core'
import { domBrowserExecutable } from './browser-dom-executable.ts'

const root = path.resolve(import.meta.dirname, '..')

test('file browser paths show known suggestions immediately and preserve keyboard, composition and latest-response boundaries', { skip: !domBrowserExecutable(), timeout: 45_000 }, async () => {
  const source = `import React,{useState} from '${root}/node_modules/react/index.js';
import {createRoot} from '${root}/node_modules/react-dom/client.js';
import {FileBrowserPath} from '${root}/src/components/file-browser-path.tsx';
import {DialogFrame} from '${root}/packages/ui/src/dialog-frame.tsx';
import {I18nProvider} from '${root}/src/i18n.tsx';
localStorage.setItem('mew:locale','en');window.navigations=[];
const result={path:'/home/test',parent:'/home',entries:[...Array.from({length:24},(_,i)=>({name:i===0?'mew':i===1?'memo':'project-'+String(i).padStart(2,'0'),path:'/home/test/'+(i===0?'mew':i===1?'memo':'project-'+String(i).padStart(2,'0')),type:'dir',size:null})),{name:'meeting.md',path:'/home/test/meeting.md',type:'file',size:null}]};
function Fixture(){const [draft,setDraft]=useState('/home/test');const [open,setOpen]=useState(false);return <><button onClick={()=>setOpen(true)}>Open</button>{open&&<DialogFrame labelledBy='title' onClose={()=>setOpen(false)} className='flex h-[min(640px,90dvh)] max-w-xl flex-col'><h2 id='title' data-dialog-autofocus tabIndex={-1} className='p-3'>Choose folder</h2><FileBrowserPath draft={draft} result={result} disabled={false} autoFocus={false} label='Folder path' onDraftChange={setDraft} onNavigate={p=>{window.navigations.push(p);setDraft(p)}}/><div className='flex-1'/><button className='m-3 min-h-9' onClick={()=>{}}>Other action</button></DialogFrame>}</>}
createRoot(document.getElementById('root')).render(<I18nProvider><Fixture/></I18nProvider>);`
  const bundle = await build({ input: 'virtual:path.tsx', write: false, platform: 'browser', onLog(level, log, handler) { if (log.code !== 'MODULE_LEVEL_DIRECTIVE') handler(level, log) }, output: { format: 'iife' }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } }, plugins: [{ name: 'fixture', resolveId(id) { if (id === 'virtual:path.tsx') return id; if (id.endsWith('.css')) return 'virtual:style' }, load(id) { if (id === 'virtual:path.tsx') return source; if (id === 'virtual:style') return '' } }] })
  const chunk = bundle.output.find(item => item.type === 'chunk')!
  const files = ['src/components/file-browser-path.tsx', 'packages/ui/src/dialog-frame.tsx', 'packages/ui/src/loading-indicator.tsx']
  const content = (await Promise.all(files.map(file => fs.readFile(path.join(root, file), 'utf8')))).join('\n')
  const compiler = await compile(await fs.readFile(`${root}/src/index.css`, 'utf8'), { base: `${root}/src`, onDependency() {} })
  const css = compiler.build([...new Set((source + content).match(/[A-Za-z0-9_@!:/.[\]()%,-]+/g))])
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  try {
    const context = await browser.newContext({ viewport: { width: 1100, height: 800 }, hasTouch: true })
    const pending = new Map<string, (route: Route) => void>()
    const requests: string[] = []
    await context.route('http://mew-path.test/**', route => {
      const url = new URL(route.request().url())
      if (url.pathname === '/app.js') return route.fulfill({ contentType: 'text/javascript', body: chunk.code })
      if (url.pathname === '/api/agent-cwd/suggestions') {
        const input = url.searchParams.get('input')!
        requests.push(input)
        if (input === '/remote/a' || input === '/remote/b') { pending.get(input)!(route); return }
        if (input === '/denied') return route.fulfill({ status: 403, json: { error: 'Folder access denied' } })
        return route.fulfill({ json: { directory: '/remote', prefix: '', dirs: [] } })
      }
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script src="/app.js"></script></html>` })
    })
    const page = await context.newPage()
    page.setDefaultTimeout(4000)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto('http://mew-path.test/')
    await page.getByRole('button', { name: 'Open', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Choose folder' })
    const field = dialog.getByRole('combobox', { name: 'Folder path' })
    await field.focus()
    const list = dialog.getByRole('listbox', { name: 'Folder path' })
    await list.getByRole('option', { name: 'mew /home/test/mew', exact: true }).waitFor()
    assert.equal(await list.getByRole('option').count(), 24, 'known child folders appear without requesting the filesystem again')
    assert.deepEqual(requests, [])
    assert.equal(await list.getByRole('option', { selected: true }).count(), 0, 'focus never silently selects the first suggestion')
    await field.fill('/home/test/me')
    assert.equal(await list.getByRole('option').count(), 2)
    await field.press('Enter')
    assert.deepEqual(await page.evaluate('window.navigations'), ['/home/test/me'], 'Enter follows the typed path until arrows explicitly choose a candidate')
    await field.fill('/home/test/me')
    await field.press('ArrowDown')
    assert.equal(await list.getByRole('option', { selected: true }).textContent(), 'mew/home/test/mew')
    assert.ok(await field.getAttribute('aria-activedescendant'))
    await field.press('ArrowDown')
    await field.press('Enter')
    assert.equal(await page.evaluate('window.navigations.at(-1)'), '/home/test/memo')
    assert.equal(await field.getAttribute('aria-expanded'), 'false')
    await field.fill('mew')
    await field.press('Enter')
    assert.equal(await page.evaluate('window.navigations.at(-1)'), '/home/test/mew', 'relative navigation shares the displayed current-folder base')

    await field.fill('/home/test/me')
    const beforeComposition = await page.evaluate<number>('window.navigations.length')
    await field.evaluate(el => {
      const view = el.ownerDocument.defaultView!
      el.dispatchEvent(new view.CompositionEvent('compositionstart', { bubbles: true }))
      el.dispatchEvent(new view.KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true, bubbles: true, cancelable: true }))
      el.dispatchEvent(new view.CompositionEvent('compositionend', { bubbles: true }))
    })
    assert.equal(await page.evaluate('window.navigations.length'), beforeComposition, 'IME confirmation cannot navigate')

    const arrivesA = new Promise<Route>(resolve => pending.set('/remote/a', resolve))
    await field.fill('/remote/a')
    await list.getByRole('status').waitFor()
    const routeA = await arrivesA
    const arrivesB = new Promise<Route>(resolve => pending.set('/remote/b', resolve))
    await field.fill('/remote/b')
    const routeB = await arrivesB
    await routeB.fulfill({ json: { directory: '/remote', prefix: 'b', dirs: [{ name: 'beta', path: '/remote/beta' }] } })
    await list.getByRole('option', { name: 'beta /remote/beta', exact: true }).waitFor()
    await routeA.fulfill({ json: { directory: '/remote', prefix: 'a', dirs: [{ name: 'alpha', path: '/remote/alpha' }] } })
    assert.equal(await list.getByRole('option', { name: 'alpha /remote/alpha', exact: true }).count(), 0, 'an earlier response cannot replace the current query')
    await field.fill('/home/test/no-match')
    await list.getByRole('status').waitFor()
    assert.equal(await list.getByRole('option').count(), 0)
    await field.fill('/denied')
    await list.getByRole('alert').filter({ hasText: 'Folder access denied' }).waitFor()

    await field.fill('/home/test')
    await field.press('ArrowDown')
    await field.press('ArrowUp')
    assert.equal(await list.getByRole('option', { selected: true }).textContent(), 'project-23/home/test/project-23')
    const scrolling = await list.evaluate(el => ({ top: el.scrollTop, height: el.clientHeight, content: el.scrollHeight }))
    assert.ok(scrolling.top > 0 && scrolling.content > scrolling.height, 'arrow navigation reveals distant options inside the popup')
    await field.press('Escape')
    await list.waitFor({ state: 'detached' })
    assert.equal(await dialog.count(), 1, 'Escape closes only the suggestions')
    await field.press('ArrowDown')
    await list.waitFor()
    assert.equal(await list.getByRole('option', { selected: true }).count(), 1, 'ArrowDown can reopen and select without an effect clearing it')
    await page.evaluate('history.back()')
    await list.waitFor({ state: 'detached' })
    assert.equal(await dialog.count(), 1, 'browser Back closes only the nested list')
    await field.fill('/home/test/me')
    await list.getByRole('option', { name: 'memo /home/test/memo', exact: true }).click()
    assert.equal(await page.evaluate('window.navigations.at(-1)'), '/home/test/memo', 'mouse activation survives the input blur boundary')
    await list.waitFor({ state: 'detached' })

    for (const [width, height, light] of [[1100, 800, false], [390, 680, true], [320, 440, false]] as const) {
      await page.setViewportSize({ width, height })
      await page.locator('html').evaluate((el, isLight) => el.classList.toggle('dark', !isLight), light)
      await field.click()
      await field.fill('/home/test')
      await list.getByRole('option').last().waitFor()
      const bounds = await list.boundingBox()
      assert.ok(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width + 1 && bounds.y + bounds.height <= height + 1, `the popup stays inside ${width}x${height}`)
      assert.equal(await list.evaluate(el => el.closest('.mew-dialog')?.getAttribute('role')), 'dialog', 'the portal stays inside modal focus containment')
      await page.screenshot({ path: `/tmp/mew-project-path-${width}.png` })
      if (width === 390) {
        await list.getByRole('option').last().scrollIntoViewIfNeeded()
        await list.getByRole('option').last().tap()
        assert.equal(await page.evaluate('window.navigations.at(-1)'), '/home/test/project-23', 'a touch tap selects a distant option after scrolling')
        await list.waitFor({ state: 'detached' })
        assert.equal(await field.evaluate(el => el.ownerDocument.activeElement === el), false, 'touch selection does not reopen the software keyboard')
        await field.click()
        await field.fill('/home/test')
      }
      await field.press('Tab')
      await list.waitFor({ state: 'detached' })
      assert.equal(await dialog.count(), 1, 'normal Tab leaves the path without selecting a folder')
    }
    await field.focus()
    await list.waitFor()
    await field.press('Escape')
    await field.press('Escape')
    await dialog.waitFor({ state: 'detached' })
    assert.deepEqual(errors, [])
  } finally { await browser.close() }
})
