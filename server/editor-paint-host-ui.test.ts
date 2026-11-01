import './test-isolated-data.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { chromium } from 'playwright-core'
import { domBrowserExecutable } from './browser-dom-executable.ts'

const repo = path.resolve(import.meta.dirname, '..')

test('Hotview opens the shared drawing editor and uploads a PNG without agent history access', { skip: !domBrowserExecutable(), timeout: 60_000 }, async t => {
  const source = `
    import React from 'react';import {createRoot} from 'react-dom/client';
    import {EditorPane} from '${repo}/src/components/EditorPane.tsx';
    import {useTabs} from '${repo}/src/hooks/useTabs.ts';
    import {I18nProvider} from '${repo}/src/i18n.tsx';
    import {editorTabPath} from '${repo}/src/utils/editor-files.ts';
    const noop=()=>{},workspace={path:'/workspace',docsPath:'/workspace/.mew/docs'};
    function Fixture(){
      const tabs=useTabs('.workspace',noop,noop,'fixture');
      const callbacks=Object.fromEntries(['registerHandle','registerElement','registerTabBar','onPin','onCloseTab','onReorder','onOpenHistory','onSetTocOpen','onOpenSidebar','onTabDragMove','onTabDrop'].map(key=>[key,noop]));
      return <div className="flex h-dvh flex-col"><nav><button onClick={()=>tabs.openFile(editorTabPath('docs','guide.md'),{preview:false})}>Open document</button></nav>
        {tabs.panes.map(pane=><EditorPane key={pane.id} {...callbacks} pane={pane} role="owner" authEmail={null} project=".workspace" workspace={workspace}
          tree={[]} presence={{}} focused isGuest={false} canCollaborate={false} showSidebarButton={false} tocOpen={false} dropZone={null}
          onFocus={()=>tabs.focusPane(pane.id)} onActivate={path=>tabs.setActivePath(path,pane.id)} onSetViewMode={tabs.setTabViewMode}
          onChangeContent={tabs.updateTabContent} onOpenLink={noop}/>)}</div>
    }
    createRoot(document.getElementById('root')).render(<I18nProvider><Fixture/></I18nProvider>);
  `
  const candidates = [source], styles: string[] = []
  const bundle = await build({
    onLog(level, log, handler) { if (log.code !== 'MODULE_LEVEL_DIRECTIVE') handler(level, log) },
    input: 'virtual:editor-paint-host.tsx', write: false, platform: 'browser', output: { format: 'esm' },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
    plugins: [{ name: 'editor-paint-host-fixture', resolveId(id) {
      if (id === 'virtual:editor-paint-host.tsx') return id
      if (id === '@mew/editor') return path.join(repo, 'packages/editor/src/index.ts')
      if (id === '@mew/editor/frontmatter') return path.join(repo, 'packages/editor/src/utils/frontmatter.ts')
    }, load(id) {
      if (id === 'virtual:editor-paint-host.tsx') return source
      if (id.endsWith('.tsx')) candidates.push(fs.readFileSync(id, 'utf8'))
      if (id.endsWith('.css')) { styles.push(fs.readFileSync(id, 'utf8')); return { code: '', moduleType: 'js' } }
    } }],
  })
  const chunks = bundle.output.filter(item => item.type === 'chunk'), entry = chunks.find(item => item.isEntry)!
  const scripts = new Map(chunks.map(item => [`/${item.fileName}`, item.code]))
  const compiler = await compile(fs.readFileSync(path.join(repo, 'src/index.css'), 'utf8'), { base: path.join(repo, 'src'), onDependency() {} })
  const css = compiler.build([...new Set(candidates.join('\n').match(/[A-Za-z0-9_@!:/.[\]()%,-]+/g))]) + styles.join('\n')
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  t.after(() => browser.close())
  for (const width of [1100, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, hasTouch: width < 768 })
    page.setDefaultTimeout(5000)
    const errors: string[] = [], uploads: Buffer[] = [], writes: string[] = [], historyRequests: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(() => { localStorage.setItem('mew:locale', 'ko'); localStorage.setItem('mew:ui-locale', 'ko') })
    await page.route('http://mew-editor-paint-host.test/**', async route => {
      const request = route.request(), url = new URL(request.url())
      if (url.pathname === '/api/file') {
        if (request.method() === 'PUT') { writes.push(request.postDataJSON().content); return route.fulfill({ json: { ok: true, commit: null } }) }
        return route.fulfill({ json: { path: 'guide.md', content: 'Original body\n', editable: true } })
      }
      if (url.pathname.startsWith('/api/agent/drawings')) {
        historyRequests.push(url.pathname)
        return route.fulfill({ status: 403, json: { error: 'Agent access disabled' } })
      }
      if (url.pathname === '/api/upload') {
        uploads.push(request.postDataBuffer()!)
        return route.fulfill({ json: { path: '.mew/temp/assets/drawing.png', name: 'drawing.png', mimetype: 'image/png' } })
      }
      if (url.pathname === '/api/asset') return route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg==', 'base64') })
      if (url.pathname === '/api/rules') return route.fulfill({ json: { violations: [], archived: false } })
      if (url.pathname === '/api/file-access') return route.fulfill({ json: { view: true, edit: true } })
      if (url.pathname === '/api/comments') return route.fulfill({ json: { threads: [] } })
      if (url.pathname === '/api/members') return route.fulfill({ json: { members: [] } })
      if (url.pathname === '/api/table-layout') return route.fulfill({ json: { tables: [] } })
      if (url.pathname.startsWith('/api/')) return route.fulfill({ json: [] })
      if (scripts.has(url.pathname)) return route.fulfill({ contentType: 'text/javascript', body: scripts.get(url.pathname)! })
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html class="dark"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script type="module" src="/${entry.fileName}"></script></html>` })
    })
    await page.goto('http://mew-editor-paint-host.test/')
    await page.getByRole('button', { name: 'Open document', exact: true }).click()
    const editor = page.locator('.tiptap')
    await editor.getByText('Original body', { exact: true }).waitFor()
    await editor.click(); await page.keyboard.press('ControlOrMeta+End'); await page.keyboard.press('Enter')
    await page.keyboard.insertText(width > 768 ? '/paint' : '/그림')
    await page.getByRole('button', { name: '그림판 그림을 그려 이미지로 삽입', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '그림판', exact: true })
    await dialog.waitFor()
    const canvas = dialog.locator('[data-drawing-canvas]')
    await canvas.focus(); await canvas.press('r')
    const box = await canvas.boundingBox()
    assert.ok(box)
    await page.mouse.move(box.x + 60, box.y + 60); await page.mouse.down()
    await page.mouse.move(box.x + 160, box.y + 140, { steps: 6 }); await page.mouse.up()
    await canvas.locator('[data-drawing-object]').waitFor()
    await page.getByRole('button', { name: '저장', exact: true }).click()
    await dialog.waitFor({ state: 'hidden' })
    await editor.getByRole('img', { name: 'drawing', exact: true }).waitFor()
    assert.equal(uploads.length, 1)
    assert.ok(uploads[0].includes(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'the drawing exports a PNG to the document upload API')
    assert.match(uploads[0].toString('latin1'), /name="project"\r\n\r\ndocs/)
    assert.deepEqual(historyRequests, [], 'document drawings never require the agent history API')
    await page.waitForTimeout(650)
    assert.ok(writes.some(value => value.includes('Original body') && value.includes('![drawing](/api/asset?') && value.includes('project=docs')))
    assert.equal(await editor.evaluate(el => el.ownerDocument.activeElement === el), true)
    assert.deepEqual(errors, [])
    await page.close()
  }
})
