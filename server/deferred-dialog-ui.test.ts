import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { connectTestBrowser } from './test-browser.ts'

const root = path.resolve(import.meta.dirname, '..')
test('deferred dialogs show a dismissible shell before imports and commit ready content without a Suspense retry', { timeout: 60_000 }, async t => {
  const source = `import React,{useState,useLayoutEffect} from 'react';import {createRoot} from 'react-dom/client';
import {I18nProvider,useI18n} from '${root}/src/i18n.tsx';
import {deferredDialog} from '${root}/src/components/deferred-dialog.tsx';
import {DialogFrame} from '@mew/ui';
const gates={};window.loads={settings:0,account:0,admin:0};
const titles={settings:'settings.title',account:'settings.myAccount',admin:'admin.title'};
const sizes={settings:'settings',account:'default',admin:'settings'};
function Ready({kind,label,onClose}){const {t}=useI18n();return <DialogFrame labelledBy="ready-title" size={sizes[kind]} onClose={onClose} className="flex max-w-[740px] flex-col"><h2 id="ready-title">{t(titles[kind])}</h2><p data-ready>{label}</p><button onClick={onClose}>Close ready</button></DialogFrame>}
const dialogs=Object.fromEntries(Object.keys(titles).map(kind=>[kind,deferredDialog(()=>{window.loads[kind]++;return new Promise((resolve,reject)=>gates[kind]={resolve,reject})},{title:t=>t(titles[kind]),size:sizes[kind],className:'flex max-w-[740px] flex-col',overlayClassName:kind==='settings'?'z-[var(--layer-settings)]':undefined})]));
window.finishModule=kind=>gates[kind].resolve({default:Ready});
window.failModule=kind=>gates[kind].reject(new Error('download failed'));
function Fixture(){const [kind,setKind]=useState(null),[label,setLabel]=useState('old');window.changeLabel=setLabel;const {setLocale}=useI18n();window.setLocale=setLocale;const Dialog=dialogs[kind];useLayoutEffect(()=>{if(kind)window.openSnapshots=(window.openSnapshots||[]).concat(!!document.querySelector('[data-ready]'))},[kind]);return <><main><input aria-label="Existing draft" defaultValue="Unsaved work"/>{Object.keys(titles).map(id=><button key={id} onClick={()=>setKind(id)}>{id}</button>)}</main>{Dialog&&<Dialog kind={kind} label={label} onClose={()=>setKind(null)}/>}</>}
createRoot(document.getElementById('root')).render(<I18nProvider><Fixture/></I18nProvider>);`
  const bundle = await build({ input: 'virtual:deferred-dialog.tsx', write: false, platform: 'browser', output: { format: 'iife', minify: true }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('production') } }, onLog(level, log, handler) { if (log.code !== 'MODULE_LEVEL_DIRECTIVE') handler(level, log) }, plugins: [{ name: 'fixture', resolveId(id) { if (id === 'virtual:deferred-dialog.tsx') return id; if (id.endsWith('.css')) return 'virtual:style' }, load(id) { if (id === 'virtual:deferred-dialog.tsx') return source; if (id === 'virtual:style') return '' } }] })
  const content = source + (await Promise.all(['src/components/deferred-dialog.tsx', 'src/components/panel-close-button.tsx', 'packages/ui/src/dialog-frame.tsx'].map(file => fs.readFile(path.join(root, file), 'utf8')))).join('\n')
  const compiler = await compile(await fs.readFile(path.join(root, 'src/index.css'), 'utf8'), { base: path.join(root, 'src'), onDependency() {} })
  const css = compiler.build([...new Set(content.match(/[A-Za-z0-9_@!:/.[\]()%,-]+/g))]) + await fs.readFile(path.join(root, 'packages/ui/src/loading-indicator.css'), 'utf8')
  const browser = await connectTestBrowser()
  t.after(() => browser.close())
  for (const width of [390, 1100]) for (const kind of ['settings', 'account', 'admin']) {
    const page = await browser.newPage({ viewport: { width, height: 800 }, hasTouch: width === 390 })
    page.setDefaultTimeout(4000)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(`
      localStorage.setItem('mew:locale', 'en');
      const nativeSet=window.setTimeout.bind(window),nativeClear=window.clearTimeout.bind(window),held=new Set();
      window.heldRetries=[];
      window.setTimeout=(callback,delay,...args)=>{
        if(typeof callback==='function'&&typeof delay==='number'&&delay>10&&delay<=300&&callback.name.startsWith('bound ')){
          const id=nativeSet(()=>{},60000);held.add(id);window.heldRetries.push(delay);return id;
        }
        return nativeSet(callback,delay,...args);
      };
      window.clearTimeout=id=>{if(!held.delete(Number(id)))nativeClear(id)};
    `)
    await page.route('http://mew-deferred-dialog.test/**', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html class="dark"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script>${bundle.output.find(item => item.type === 'chunk')!.code}</script></html>` }))
    await page.goto('http://mew-deferred-dialog.test/')
    assert.deepEqual(await page.evaluate('window.loads'), { settings: 0, account: 0, admin: 0 }, 'closed dialogs do not download their code')
    const trigger = page.getByRole('button', { name: kind, exact: true })
    await trigger.click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('status', { name: 'Loading…', exact: true }).waitFor()
    assert.equal(await dialog.getAttribute('aria-busy'), null, 'loading never disables dismissal')
    assert.equal(await dialog.getByRole('button', { name: 'Close', exact: true }).evaluate(el => el === el.ownerDocument.activeElement), true)
    if (kind === 'settings') await page.screenshot({ path: `/tmp/mew-immediate-dialog-${width}.png` })
    const bounds = (await dialog.boundingBox())!
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width && bounds.y >= 0 && bounds.y + bounds.height <= 800)
    if (kind === 'settings') assert.equal(await dialog.evaluate(el => el.parentElement!.ownerDocument.defaultView!.getComputedStyle(el.parentElement!).zIndex), '1800')
    await page.evaluate('window.changeLabel("current")')
    if (kind === 'account') {
      await page.keyboard.press('Escape')
      await dialog.waitFor({ state: 'detached' })
      assert.equal(await trigger.evaluate(el => el === el.ownerDocument.activeElement), true)
      await page.evaluate(`window.finishModule('${kind}')`)
      assert.equal(await dialog.count(), 0, 'late imports do not reopen dismissed dialogs')
      await trigger.click()
    } else if (kind === 'admin') {
      await page.evaluate(`window.failModule('${kind}')`)
      await dialog.getByRole('alert').waitFor()
      assert.equal(await page.getByRole('textbox', { name: 'Existing draft' }).inputValue(), 'Unsaved work')
      await dialog.getByRole('button', { name: 'Retry', exact: true }).click()
      await page.waitForFunction('window.loads.admin === 2')
      await page.evaluate(`window.finishModule('${kind}')`)
    } else {
      await page.evaluate('window.setLocale("ko")')
      await page.getByRole('dialog', { name: '설정', exact: true }).waitFor()
      await page.evaluate(`window.finishModule('${kind}')`)
    }
    await dialog.locator('[data-ready]').waitFor()
    assert.equal(await dialog.locator('[data-ready]').innerText(), 'current', 'ready components receive current props')
    await page.evaluate('history.back()')
    await dialog.waitFor({ state: 'detached' })
    assert.equal(await trigger.evaluate(el => el === el.ownerDocument.activeElement), true, 'Back restores trigger focus after shell replacement')
    await trigger.click()
    await dialog.locator('[data-ready]').waitFor()
    assert.equal(await page.evaluate('window.openSnapshots.at(-1)'), true, 'prepared public code renders in the first warm commit')
    assert.equal(await page.evaluate(`window.loads.${kind}`), kind === 'admin' ? 2 : 1)
    await dialog.getByRole('button', { name: 'Close ready' }).click()
    assert.equal(await page.getByRole('textbox', { name: 'Existing draft' }).inputValue(), 'Unsaved work')
    assert.deepEqual(errors, [])
    await page.close()
  }
})
