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

test('Hotview file mentions find unopened folders and keep requests scoped to the current document', { skip: !domBrowserExecutable(), timeout: 45_000 }, async t => {
  const source = `
    import React from 'react';import {createRoot} from 'react-dom/client';
    import {EditorPane} from '${repo}/src/components/EditorPane.tsx';
    import {useTabs} from '${repo}/src/hooks/useTabs.ts';
    import {I18nProvider} from '${repo}/src/i18n.tsx';
    import {editorTabPath} from '${repo}/src/utils/editor-files.ts';
    const noop=()=>{},tree=[{name:'root-visible.md',path:'root-visible.md',type:'file'},{name:'closed',path:'closed',type:'dir'}];
    function Fixture(){
      const tabs=useTabs('.workspace',noop,noop,'fixture');
      window.tabs=tabs;
      const callbacks=Object.fromEntries(['registerHandle','registerElement','registerTabBar','onPin','onCloseTab','onReorder','onOpenHistory','onSetTocOpen','onOpenSidebar','onTabDragMove','onTabDrop'].map(key=>[key,noop]));
      return <div className="flex h-dvh flex-col"><nav>
        <button onClick={()=>tabs.openFile(editorTabPath('docs','current/start.md'),{preview:false})}>Docs</button>
        <button onClick={()=>tabs.openFile('notes.md',{preview:false})}>Workspace</button></nav>
        {tabs.panes.map(pane=><EditorPane key={pane.id} {...callbacks} pane={pane} role="owner" authEmail={null} project=".workspace"
          tree={tree} presence={{}} focused isGuest={false} canCollaborate={false} showSidebarButton={false} tocOpen={false} dropZone={null}
          onFocus={()=>tabs.focusPane(pane.id)} onActivate={path=>tabs.setActivePath(path,pane.id)} onSetViewMode={tabs.setTabViewMode}
          onChangeContent={tabs.updateTabContent} onOpenLink={noop}/>)}
      </div>
    }
    createRoot(document.getElementById('root')).render(<I18nProvider><Fixture/></I18nProvider>);
  `
  const candidates = [source], styles: string[] = []
  const bundle = await build({
    onLog(level, log, handler) { if (log.code !== 'MODULE_LEVEL_DIRECTIVE') handler(level, log) },
    input: 'virtual:file-mentions.tsx', write: false, platform: 'browser', output: { format: 'esm' },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
    plugins: [{ name: 'file-mentions-fixture', resolveId(id) {
      if (id === 'virtual:file-mentions.tsx') return id
      if (id === '@mew/editor') return path.join(repo, 'packages/editor/src/index.ts')
      if (id === '@mew/editor/frontmatter') return path.join(repo, 'packages/editor/src/utils/frontmatter.ts')
    }, load(id) {
      if (id === 'virtual:file-mentions.tsx') return source
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
    const page = await browser.newPage({ viewport: { width, height: 800 }, hasTouch: width < 768 })
    page.setDefaultTimeout(5000)
    const errors: string[] = [], requests: string[] = [], writes = new Map<string, string>()
    const target = 'closed/deep/needle (#1)?.md'
    let releaseTree: (() => void) | undefined, holdTree = true, denyTree = false
    const files: Record<string, string> = {
      'docs:current/start.md': 'Start body\n',
      [`docs:${target}`]: '---\ntitle: "참조 [문서]"\n---\n\nTarget body\n',
      'docs:root-visible.md': 'Root body\n',
      '.workspace:notes.md': 'Workspace body\n',
      '.workspace:other/deep/workspace-target.md': '---\ntitle: "Workspace target"\n---\n',
      '.workspace:root-visible.md': 'Root body\n',
    }
    page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(() => { localStorage.setItem('mew:locale', 'ko'); localStorage.setItem('mew:ui-locale', 'ko') })
    await page.route('http://mew-file-mentions.test/**', async route => {
      const url = new URL(route.request().url()), method = route.request().method()
      const json = (value: unknown) => route.fulfill({ json: value })
      if (url.pathname === '/api/tree') {
        const project = url.searchParams.get('project')!
        requests.push(project)
        assert.equal(url.searchParams.has('path'), false, 'mention candidates request the full tree')
        if (holdTree) { holdTree = false; await new Promise<void>(resolve => { releaseTree = resolve }) }
        if (denyTree) return route.fulfill({ status: 503, json: { error: 'Unavailable' } })
        return json(project === 'docs'
          ? [{ name: 'closed', path: 'closed', type: 'dir', children: [{ name: 'deep', path: 'closed/deep', type: 'dir', children: [{ name: 'needle (#1)?.md', path: target, type: 'file' }] }] }]
          : [{ name: 'other', path: 'other', type: 'dir', children: [{ name: 'deep', path: 'other/deep', type: 'dir', children: [{ name: 'workspace-target.md', path: 'other/deep/workspace-target.md', type: 'file' }] }] }])
      }
      if (url.pathname === '/api/file') {
        const body = method === 'PUT' ? route.request().postDataJSON() : null
        const project = body?.project ?? url.searchParams.get('project') ?? 'docs'
        const rel = body?.path ?? url.searchParams.get('path')!
        const key = `${project}:${rel}`
        if (body) { files[key] = body.content; writes.set(key, body.content); return json({ ok: true, commit: null }) }
        return json({ path: rel, content: files[key] ?? '', editable: true })
      }
      if (url.pathname === '/api/rules') return json({ violations: [], archived: false })
      if (url.pathname === '/api/file-access') return json({ view: true, edit: true })
      if (url.pathname === '/api/comments') return json({ threads: [] })
      if (url.pathname === '/api/members') return json({ members: [] })
      if (url.pathname === '/api/table-layout') return json({ tables: [] })
      if (url.pathname.startsWith('/api/')) return json([])
      if (url.pathname === '/app.js' || scripts.has(url.pathname)) return route.fulfill({ contentType: 'text/javascript', body: url.pathname === '/app.js' ? entry.code : scripts.get(url.pathname)! })
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html class="dark"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script type="module" src="/app.js"></script></html>` })
    })
    await page.goto('http://mew-file-mentions.test/')
    await page.getByRole('button', { name: 'Docs', exact: true }).click()
    const editor = page.locator('.tiptap')
    await editor.getByText('Start body', { exact: true }).waitFor()
    assert.deepEqual(requests, [], 'opening a document does not fetch the full tree')
    const mention = async (query: string) => {
      await editor.click(); await page.keyboard.press('ControlOrMeta+End'); await page.keyboard.press('Enter')
      await page.keyboard.type('@' + query)
    }
    await mention('needle')
    await page.getByText('불러오는 중…', { exact: true }).waitFor()
    assert.deepEqual(requests, ['docs'], 'query changes share one candidate request')
    releaseTree!(); releaseTree = undefined
    const candidate = page.getByRole('button', { name: `needle (#1)? ${target}`, exact: true })
    await candidate.waitFor()
    if (width > 768) await page.keyboard.press('Enter')
    else await candidate.tap()
    const link = editor.getByRole('link', { name: '참조 [문서]', exact: true })
    await link.waitFor()
    assert.equal(await link.getAttribute('href'), '../closed/deep/needle%20%28%231%29%3F.md')
    await page.waitForTimeout(600)
    assert.ok(writes.get('docs:current/start.md')?.includes('../closed/deep/needle%20%28%231%29%3F.md'))
    // A late response from the previous document must not populate another scope.
    holdTree = true
    await mention('needle')
    await page.getByText('불러오는 중…', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'Workspace', exact: true }).click()
    await editor.getByText('Workspace body', { exact: true }).waitFor()
    releaseTree!(); releaseTree = undefined
    await mention('workspace')
    const workspaceCandidate = page.getByRole('button', { name: 'workspace-target other/deep/workspace-target.md', exact: true })
    await workspaceCandidate.waitFor()
    assert.equal(await candidate.count(), 0)
    assert.deepEqual(requests, ['docs', 'docs', '.workspace'])
    await workspaceCandidate.click()
    await editor.getByRole('link', { name: 'Workspace target', exact: true }).waitFor()
    // Failed refreshes retain the host's already loaded candidates.
    denyTree = true
    await mention('root')
    await page.getByRole('button', { name: 'root-visible root-visible.md', exact: true }).click()
    await editor.getByRole('link', { name: 'root-visible', exact: true }).waitFor()
    assert.deepEqual(errors, [])
    await page.close()
  }
})
