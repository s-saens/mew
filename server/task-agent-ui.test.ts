import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { connectTestBrowser } from './test-browser.ts'

const root = path.resolve(import.meta.dirname, '..')

test('file AI action covers every format and view, uses current content, and handles pending requests and failures', { timeout: 90_000 }, async t => {
  const source = `
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {EditorPane} from '${root}/src/components/EditorPane.tsx';
    import {I18nProvider} from '${root}/src/i18n.tsx';
    const noop=()=>{};
    window.requests=[];
    function Fixture(){
      const [path,setPath]=React.useState('.mew/tasks/Task.md');
      const [content,setContent]=React.useState('---\\ntitle: Current task\\n---\\n\\nTask body');
      const [editable,setEditable]=React.useState(true),[guest,setGuest]=React.useState(false),[enabled,setEnabled]=React.useState(true),[viewMode,setViewMode]=React.useState('hotview'),[loading,setLoading]=React.useState(false);
      window.setLoading=setLoading;
      window.changeContent=setContent;
      const callbacks=Object.fromEntries(['registerHandle','registerElement','registerTabBar','onFocus','onActivate','onPin','onCloseTab','onReorder','onOpenHistory','onSetTocOpen','onOpenSidebar','onTabDragMove','onTabDrop','onOpenLink','onChangeContent','onSetViewMode'].map(key=>[key,noop]));
      const run=(path,content)=>{window.requests.push({path,content});return new Promise((resolve,reject)=>{window.finishRun=resolve;window.failRun=()=>reject(new Error('Task request failed'));})};
      const choose=(path,canEdit=true,mode='hotview')=>{setPath(path);setEditable(canEdit);setViewMode(mode);setGuest(false);setEnabled(true)};
      return <div className="flex h-dvh flex-col">
        <nav><button onClick={()=>choose('.mew/tasks/Task.md')}>Task</button><button onClick={()=>choose('notes.md')}>Normal</button>
          <button onClick={()=>choose('.mew/tasks/_tasks.md')}>Guide</button><button onClick={()=>choose('docs/tasks/Legacy.md')}>Legacy</button>
          <button onClick={()=>choose('.mew/tasks/Done/Finished.md')}>Done</button><button onClick={()=>choose('.mew/tasks/Task.md',false)}>Readonly</button>
          <button onClick={()=>choose('notes.md',true,'plain')}>Plain</button>
          {['src/main.ts','report.pdf','picture.png','vector.svg','audio.mp3','video.mp4','sheet.xlsx','archive.zip','LICENSE','mew:file:docs/guides/Guide.md','@fs:/outside/External.md'].map(file=><button key={file} onClick={()=>choose(file,true,file.endsWith('.ts')||file==='LICENSE'?'plain':'hotview')}>{file}</button>)}
          <button onClick={()=>setGuest(true)}>Guest</button><button onClick={()=>setEnabled(false)}>No callback</button></nav>
        <EditorPane {...callbacks} pane={{id:'one',activePath:path,tabs:[{path,content,editable,viewMode,loading}]}}
          role={guest?'guest':'owner'} authEmail={null} project=".workspace" workspace={{path:'/fixture',docsPath:'/fixture/docs'}}
          tree={[]} presence={{}} focused isGuest={guest} canCollaborate={false} showSidebarButton={false} tocOpen={false} dropZone={null}
          onAskAgent={enabled?run:undefined}/>
      </div>;
    }
    createRoot(document.getElementById('root')).render(<I18nProvider><Fixture/></I18nProvider>);
  `
  const candidates = [source], styles: string[] = []
  const bundle = await build({
    onLog(level, log, handler) { if (log.code !== 'MODULE_LEVEL_DIRECTIVE') handler(level, log) },
    input: 'virtual:task-agent.tsx', write: false, platform: 'browser', output: { format: 'esm' },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
    plugins: [{ name: 'task-agent-fixture', resolveId(id) {
      if (id === 'virtual:task-agent.tsx') return id
      if (id === '@mew/editor') return path.join(root, 'packages/editor/src/index.ts')
      if (id === '@mew/editor/frontmatter') return path.join(root, 'packages/editor/src/utils/frontmatter.ts')
    }, load(id) {
      if (id === 'virtual:task-agent.tsx') return source
      if (id.endsWith('/src/components/pdf-viewer.tsx')) return {code:'export default function PdfViewer(){return null}',moduleType:'jsx'}
      if (id.endsWith('/src/components/SheetViewer.tsx')) return {code:'export function SheetViewer(){return null}',moduleType:'jsx'}
      if (id.endsWith('.tsx')) candidates.push(fs.readFileSync(id, 'utf8'))
      if (id.endsWith('.css')) { styles.push(fs.readFileSync(id, 'utf8')); return { code: '', moduleType: 'js' } }
    } }],
  })
  const chunks = bundle.output.filter(item => item.type === 'chunk')
  const entry = chunks.find(item => item.isEntry)!
  const scripts = new Map(chunks.map(item => [`/${item.fileName}`, item.code]))
  const compiler = await compile(fs.readFileSync(`${root}/src/index.css`, 'utf8'), { base: `${root}/src`, onDependency() {} })
  const css = compiler.build([...new Set(candidates.join('\n').match(/[A-Za-z0-9_@!:/.[\]()%,-]+/g))]) + styles.join('\n')
  const browser = await connectTestBrowser()
  t.after(() => browser.close())
  for (const [locale, label, width] of [['ko', '에이전트', 1100], ['ko', '에이전트', 390], ['en', 'Agent', 1100], ['ja', 'エージェント', 1100], ['zh-CN', '代理', 1100]] as const) {
    const page = await browser.newPage({ viewport: { width, height: 800 }, hasTouch: width < 768 })
    page.setDefaultTimeout(5_000)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(({ locale }) => { localStorage.setItem('mew:locale', locale); localStorage.setItem('mew:ui-locale', locale) }, { locale })
    await page.route('http://mew-task-agent.test/**', route => {
      const url = new URL(route.request().url())
      if (url.pathname === '/app.js' || scripts.has(url.pathname)) return route.fulfill({ contentType: 'text/javascript', body: url.pathname === '/app.js' ? entry.code : scripts.get(url.pathname)! })
      if (url.pathname === '/api/rules') return route.fulfill({ json: { violations: [], archived: false } })
      if (url.pathname === '/api/file-access') return route.fulfill({ json: { view: true, edit: true } })
      if (url.pathname === '/api/comments') return route.fulfill({ json: { threads: [] } })
      if (url.pathname === '/api/members') return route.fulfill({ json: { members: [] } })
      if (url.pathname === '/api/table-layout') return route.fulfill({ json: { tables: [] } })
      if (url.pathname.startsWith('/api/')) return route.fulfill({ json: [] })
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html class="${width > 768 ? 'dark' : ''}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script type="module" src="/app.js"></script></html>` })
    })
    await page.goto('http://mew-task-agent.test/')
    const action = page.getByRole('button', { name: label, exact: true })
    await action.waitFor()
    assert.equal(await action.getAttribute('data-tip'), label)
    assert.equal(await page.locator('[data-editor-tools] > :last-child').getAttribute('aria-label'), label)
    const bounds = await action.boundingBox()
    assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width, 'the action fits desktop and mobile viewports')
    await page.locator('.ProseMirror').waitFor()
    await page.evaluate('window.changeContent("---\\ntitle: Updated task\\n---\\n\\nLatest unsaved body")')
    await page.getByText('Latest unsaved body', { exact: true }).waitFor()
    await action.click()
    assert.equal(await action.isDisabled(), true, 'a pending request blocks duplicate clicks')
    assert.deepEqual(await page.evaluate('window.requests'), [{ path: '.mew/tasks/Task.md', content: '---\ntitle: Updated task\n---\n\nLatest unsaved body' }])
    await page.evaluate('window.failRun()')
    await page.getByText('Task request failed', { exact: true }).waitFor()
    assert.equal(await action.isEnabled(), true, 'a failed request can be retried')
    await action.click()
    await page.evaluate('window.finishRun()')
    await page.waitForFunction('window.requests.length===2')
    await action.and(page.locator(':enabled')).waitFor()
    assert.equal(await action.isEnabled(), true)
    for (const name of ['Guest', 'No callback']) {
      await page.getByRole('button', { name: 'Task', exact: true }).click()
      await page.locator('nav').getByRole('button', { name, exact: true }).click()
      assert.equal(await action.count(), 0, `${name} does not expose an agent action`)
    }
    await page.getByRole('button', { name: 'Readonly', exact: true }).click()
    assert.equal(await action.isEnabled(), true, 'read-only documents can prepare a file reference')
    await page.evaluate('window.setLoading(true)')
    await action.and(page.locator(':disabled')).waitFor({ state: 'attached' })
    assert.equal(await action.isDisabled(), true, 'loading prevents a premature reference request')
    await page.evaluate('window.setLoading(false)')
    await action.and(page.locator(':enabled')).waitFor()
    for (const name of ['Normal', 'Guide', 'Legacy', 'Done', 'Plain', 'src/main.ts', 'report.pdf', 'picture.png', 'vector.svg', 'audio.mp3', 'video.mp4', 'sheet.xlsx', 'archive.zip', 'LICENSE', 'mew:file:docs/guides/Guide.md', '@fs:/outside/External.md']) {
      await page.locator('nav').getByRole('button', { name, exact: true }).click()
      assert.equal(await action.isEnabled(), true, `${name} exposes the same agent action`)
      assert.equal(await page.locator('[data-editor-tools] > :last-child').getAttribute('aria-label'), label)
      if (name === 'archive.zip') {
        const download = page.getByRole('button', { name: ({ko:'다운로드',en:'Download',ja:'ダウンロード','zh-CN':'下载'})[locale], exact: true })
        await download.waitFor()
        if (locale === 'ko') await page.screenshot({ path: `/tmp/mew-file-ai-${width}.png` })
      }
      const box = await action.boundingBox()
      assert.ok(box && box.x >= 0 && box.x + box.width <= width, `${name} action remains visible`)
      if (name === 'report.pdf' || name === 'Plain' || name === 'mew:file:docs/guides/Guide.md') {
        await action.click()
        await page.evaluate('window.finishRun()')
        await action.and(page.locator(':enabled')).waitFor()
      }
    }
    assert.equal(await page.evaluate('window.requests.length'), 5)
    assert.deepEqual(await page.evaluate('window.requests.slice(2).map(request=>request.path)'), ['notes.md', 'report.pdf', 'mew:file:docs/guides/Guide.md'])
    assert.deepEqual(errors, [])
    await page.close()
  }
})
