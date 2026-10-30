import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { chromium } from 'playwright-core'
import { domBrowserExecutable } from './browser-dom-executable.ts'

test('file icons render in Files, Documents, search and server browsing across themes and sizes', { skip: !domBrowserExecutable(), timeout: 40_000 }, async t => {
  const root = path.resolve(import.meta.dirname, '..')
  const source = `import React from '${root}/node_modules/react/index.js';
import {createRoot} from '${root}/node_modules/react-dom/client.js';
import {FileTree} from '${root}/src/components/FileTree.tsx';
import {FileBrowserEntry} from '${root}/src/components/file-browser.tsx';
import {I18nProvider} from '${root}/src/i18n.tsx';
const noop=()=>{};const file=name=>({name,path:name,type:'file'});const folder={name:'src',path:'src',type:'dir',children:[file('src/child.ts')]};
const props={project:'.workspace',readOnly:true,selectedPath:null,searchFocusSignal:0,newFileSignal:{n:0,parentPath:null},revealSignal:0,presence:{},onSelect:path=>window.selected=path,onFileCreated:noop,onFolderCreated:noop,onRenamed:noop,onDeleted:noop,onNotice:noop,registerSearchCancel:noop};
function Fixture(){const [renamed,setRenamed]=React.useState(false);const [expanded,setExpanded]=React.useState(false);window.rename=()=>setRenamed(true);return <>
<section id="files" style={{height:300}}><FileTree {...props} tree={[...['main.ts','photo.png','archive.zip','unknown.xyz','mew','config.toml',renamed?'note.py':'note.md'].map(file),folder]}/></section>
<section id="docs" style={{height:100}}><FileTree {...props} documentPages tree={[file('note.md')]}/></section>
<section id="search" style={{height:100}}><FileTree {...props} tree={[file('main.ts'),file('photo.png')]} search={{query:'main',paths:['main.ts'],matches:new Map(),onOpenMatch:noop}}/></section>
<section id="server"><FileBrowserEntry entry={{...file('package.json'),path:'/tmp/package.json'}} onClick={()=>window.serverOpened=true}/><FileBrowserEntry entry={{...file('mew'),path:'/tmp/mew'}} onClick={noop}/></section>
<section id="server-folder"><FileBrowserEntry entry={{...folder,path:'/tmp/src'}} expanded={expanded} onClick={()=>setExpanded(value=>!value)}/></section></>}
createRoot(document.getElementById('root')).render(<I18nProvider><Fixture/></I18nProvider>);`
  const bundle = await build({ input: 'virtual:file-icons.tsx', write: false, platform: 'browser', output: { format: 'iife', codeSplitting: false },
    onwarn(warning, defaultHandler) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') defaultHandler(warning) },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
    plugins: [{ name: 'file-icons-fixture', resolveId(id) { if (id === 'virtual:file-icons.tsx') return id; if (id.endsWith('.css')) return 'virtual:style' },
      async load(id) { if (id === 'virtual:file-icons.tsx') return source; if (id === 'virtual:style') return ''; if (id.endsWith('?raw')) return 'export default ' + JSON.stringify(await fs.readFile(id.slice(0, -4), 'utf8')) } }],
  })
  const chunk = bundle.output.find(item => item.type === 'chunk')!
  const content = (await Promise.all(['src/components/FileTree.tsx', 'src/components/file-type-icon.tsx', 'src/components/file-icon-artwork.tsx', 'src/components/file-type-icon-image.tsx', 'src/components/file-browser.tsx'].map(file => fs.readFile(path.join(root, file), 'utf8')))).join('\n')
  const compiler = await compile(await fs.readFile(`${root}/src/index.css`, 'utf8'), { base: `${root}/src`, onDependency() {} })
  const css = compiler.build([...new Set((source + content).match(/[A-Za-z0-9_@:/.[\]()%,-]+/g))])
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  t.after(() => browser.close())
  for (const width of [1100, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, hasTouch: width < 768 })
    page.setDefaultTimeout(5000)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('http://mew-icons.test/**', route => route.fulfill(new URL(route.request().url()).pathname === '/app.js'
      ? { contentType: 'text/javascript', body: chunk.code }
      : { contentType: 'text/html', body: `<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script src="/app.js"></script></html>` }))
    await page.goto('http://mew-icons.test/')
    await page.waitForTimeout(300)
    assert.deepEqual(errors, [])
    for (const theme of ['light', 'dark']) {
      await page.locator('html').evaluate((el, theme) => el.classList.toggle('dark', theme === 'dark'), theme)
      for (const [selector, icon] of [
        ['#files [data-path="main.ts"]', 'typescript'], ['#files [data-path="photo.png"]', 'image'],
        ['#files [data-path="archive.zip"]', 'zip'], ['#files [data-path="unknown.xyz"]', 'file'],
        ['#files [data-path="mew"]', 'file'], ['#files [data-path="src"]', 'folder'],
        ['#files [data-path="config.toml"]', theme === 'light' ? 'toml_light' : 'toml'],
        ['#docs [data-path="note.md"]', 'markdown'], ['#search [data-path="main.ts"]', 'typescript'],
        ['#server [title="/tmp/package.json"]', 'nodejs'], ['#server [title="/tmp/mew"]', 'file'],
        ['#server-folder button', 'folder'],
      ]) {
        const image = page.locator(`${selector} img[data-file-icon="${icon}"]`)
        await image.waitFor()
        await image.evaluate(async el => { await (el as unknown as { decode(): Promise<void> }).decode() })
        assert.equal(await image.getAttribute('alt'), '')
        assert.equal(await image.getAttribute('draggable'), 'false')
        assert.equal(await image.evaluate(el => el.closest('[aria-hidden="true"]') !== null), true)
        const bounds = (await image.boundingBox())!
        assert.equal(bounds.width, 16)
        assert.equal(bounds.height, 16)
      }
      for (const selector of ['#files [data-path="src"]', '#server-folder button']) {
        const folder = page.locator(selector)
        await folder.click()
        await folder.locator('img[data-file-icon="folder-open"]').waitFor()
        assert.equal(await folder.getAttribute('aria-expanded'), 'true')
        if (selector.startsWith('#files')) await page.locator('#files [data-path="src/child.ts"] img[data-file-icon="typescript"]').waitFor()
        await folder.click()
        await folder.locator('img[data-file-icon="folder"]').waitFor()
        assert.equal(await folder.getAttribute('aria-expanded'), 'false')
      }
      await page.screenshot({ path: `/tmp/mew-file-icons-${width}-${theme}.png` })
    }
    await page.locator('#files [data-path="main.ts"]').click()
    assert.equal(await page.evaluate('window.selected'), 'main.ts')
    await page.locator('#server [title="/tmp/package.json"]').click()
    assert.equal(await page.evaluate('window.serverOpened'), true)
    await page.evaluate('window.rename()')
    await page.locator('#files [data-path="note.py"] img[data-file-icon="python"]').waitFor()
    assert.equal(await page.locator('#files [data-path="note.md"]').count(), 0)
    assert.equal(await page.locator('#search [data-path="photo.png"]').count(), 0)
    assert.deepEqual(errors, [])
    await page.close()
  }
})
