import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { compile } from '@tailwindcss/node'
import { build } from 'rolldown'
import { connectTestBrowser } from './test-browser.ts'

const root = path.resolve(import.meta.dirname, '..')

test('attachment errors cover the dock and follow the visible workspace and overlay stack', { timeout: 90_000 }, async t => {
  const source = `import React,{useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {DialogFrame} from '@mew/ui';
import {AgentPanel} from '${root}/src/components/AgentPanel.tsx';
import {DockPanel,DockWorkspace} from '${root}/src/components/DockWorkspace.tsx';
import {WorkspaceViewProvider} from '${root}/src/workspace/workspace-view-context.ts';
import {I18nProvider} from '${root}/src/i18n.tsx';
localStorage.setItem('mew:locale','ko');
Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.copied=text}}});
class Socket {
 static OPEN=1; readyState=1;
 constructor(){setTimeout(()=>{this.onopen?.();this.emit({type:'replay',events:[]});this.emit({type:'models',models:{currentModelId:'test',availableModels:[{modelId:'test',name:'Test'}]}});this.emit({type:'meta',meta:{sessionId:'test-session',startedAt:new Date().toISOString(),turns:0,busy:false,queued:[],usage:null,canLoad:false,canList:false}})},20)}
 emit(value){this.onmessage?.({data:JSON.stringify(value)})} send(){} close(){}
}
window.WebSocket=Socket;
function Fixture(){
 const [layout,setLayout]=useState(null),[foreground,setForeground]=useState('agent'),[active,setActive]=useState(true),[nested,setNested]=useState(false),rootRef=useRef(null);
 window.setForeground=setForeground;window.setWorkspaceActive=setActive;window.openNested=()=>setNested(true);
 return <WorkspaceViewProvider value={{id:'fixture',compact:true,active,root:rootRef}}><main ref={rootRef} className="mew-workspace flex h-full flex-col">
  <div className="mew-workspace-content relative flex min-h-0 flex-1 overflow-hidden"><DockWorkspace value={layout} onChange={setLayout} foreground={foreground} apiRef={null} onEditorDrop={()=>'main'}>
   <DockPanel id="editor:main" kind="editor" tabs={['main']}>Editor</DockPanel>
   <AgentPanel project="test" workspacePath="/workspace" tree={[]} focusedFilePath={null} onOpenFile={()=>{}} onClose={()=>{}}/>
  </DockWorkspace></div>
  <nav className="mobile-dock" data-test-dock><button onClick={()=>window.dockClicks++}>Dock</button></nav>
  {nested&&<DialogFrame labelledBy="nested-title" onClose={()=>setNested(false)}><h2 id="nested-title">Nested dialog</h2><button onClick={()=>setNested(false)}>Close nested</button></DialogFrame>}
 </main></WorkspaceViewProvider>
}
window.dockClicks=0;
createRoot(document.getElementById('root')).render(<I18nProvider><Fixture/></I18nProvider>);`
  const bundle = await build({
    input: 'virtual:attachment-error.tsx', write: false, platform: 'browser', output: { format: 'iife', codeSplitting: false },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
    onLog(level, log, handler) { if (log.code !== 'MODULE_LEVEL_DIRECTIVE') handler(level, log) },
    plugins: [{ name: 'fixture', async resolveId(id, importer) {
      if (id === 'virtual:attachment-error.tsx') return id
      if (id === '@mew/tmux-term') return 'virtual:terminal'
      if (id.endsWith('.css')) return 'virtual:style'
      if (id.endsWith('?raw')) { const resolved = await this.resolve(id.slice(0, -4), importer, { skipSelf: true }); if (resolved) return `${resolved.id}?raw` }
    }, async load(id) {
      if (id === 'virtual:attachment-error.tsx') return source
      if (id === 'virtual:terminal') return 'export const isHiddenTmuxSession=()=>false;export function TmuxTerminal(){return null}'
      if (id === 'virtual:style') return ''
      if (id.endsWith('?raw')) return `export default ${JSON.stringify(await fs.readFile(id.slice(0, -4), 'utf8'))}`
    } }],
  })
  const chunk = bundle.output.find(item => item.type === 'chunk'); assert.ok(chunk)
  const files = ['src/components/AgentPanel.tsx', 'src/components/DockWorkspace.tsx', 'src/components/MentionTextarea.tsx', 'packages/ui/src/dialog-frame.tsx']
  const content = (await Promise.all(files.map(file => fs.readFile(path.join(root, file), 'utf8')))).join('\n')
  const compiler = await compile(await fs.readFile(`${root}/src/index.css`, 'utf8'), { base: `${root}/src`, onDependency() {} })
  const css = compiler.build([...new Set((source + content).match(/[A-Za-z0-9_@!&:/.[\]()%,-]+/g))])
  const browser = await connectTestBrowser()
  t.after(() => browser.close())

  for (const width of [1100, 390]) await t.test(`${width}px`, async matrix => {
    const page = await browser.newPage({ viewport: { width, height: 844 }, hasTouch: width < 768, locale: 'ko-KR' })
    matrix.after(() => page.close())
    page.setDefaultTimeout(6000)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    let holdUpload = false
    let releaseUpload: (() => void) | undefined
    let markHeld: (() => void) | undefined
    let tabsState = { tabs: [{ id: 'first', label: 'First', runtime: 'codex', cwd: '/workspace', renamed: true }, { id: 'second', label: 'Second', runtime: 'codex', cwd: '/workspace', renamed: true }], activeId: 'first' }
    await page.route('https://mew-attachment-error.test/**', async route => {
      const pathname = new URL(route.request().url()).pathname
      if (pathname === '/app.js') return route.fulfill({ contentType: 'text/javascript', body: chunk.code })
      if (pathname === '/api/upload-into') {
        if (holdUpload) await new Promise<void>(resolve => { releaseUpload = resolve; markHeld?.() })
        return route.fulfill({ status: 503, json: { error: '첨부 서버 오류 상세' } })
      }
      if (pathname === '/api/user-ui/agent-tabs') {
        if (route.request().method() === 'PUT') {
          const { tabs, activeId } = route.request().postDataJSON()
          tabsState = { tabs, activeId }
        }
        return route.fulfill({ json: { state: tabsState, claims: [] } })
      }
      if (pathname === '/api/agent-cwd') return route.fulfill({ json: { cwd: '/workspace' } })
      if (pathname === '/api/projects') return route.fulfill({ json: [] })
      if (pathname.startsWith('/api/')) return route.fulfill({ json: { settings: null, skills: [], jobs: [], runtimes: [], commands: [] } })
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html class="dark" lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}html,body,#root{height:100%;margin:0}#root{position:relative;z-index:10;transform:translateZ(0);overflow:hidden}.mobile-dock[data-test-dock]:not([hidden]){position:fixed;top:50%;left:0;width:100%;height:50px;z-index:40;background:#334}</style><div id="root"></div><script src="/app.js"></script></html>` })
    })
    await page.goto('https://mew-attachment-error.test/')
    const input = page.locator('[contenteditable="true"][aria-placeholder="텍스트 입력"]:visible')
    await input.waitFor()
    const upload = async () => {
      const request = page.waitForRequest(request => new URL(request.url()).pathname === '/api/upload-into')
      await input.evaluate(element => {
        const view = element.ownerDocument.defaultView!
        const transfer = new view.DataTransfer()
        transfer.items.add(new view.File([new Uint8Array([137, 80, 78, 71])], 'screenshot.png', { type: 'image/png' }))
        element.dispatchEvent(new view.DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }))
      })
      await request
    }
    const dialog = page.getByRole('dialog', { name: '에이전트 오류 상세', exact: true })
    await upload()
    await dialog.waitFor()
    assert.equal(await dialog.getByText('파일 첨부 실패', { exact: true }).count(), 1)
    assert.equal(await dialog.getByText('첨부 서버 오류 상세', { exact: true }).count(), 1)
    const paint = await dialog.evaluate(element => {
      const doc = element.ownerDocument, rect = element.getBoundingClientRect(), overlay = element.parentElement!, dock = doc.querySelector('[data-test-dock]')!
      const dockRect = dock.getBoundingClientRect(), x = rect.x + rect.width / 2, y = dockRect.y + dockRect.height / 2
      return { portal: overlay.parentElement === doc.body, overlaps: y >= rect.top && y <= rect.bottom, dialogOnTop: element.contains(doc.elementFromPoint(x, y)), backdropOnTop: overlay.contains(doc.elementFromPoint(1, y)), dialogRect: rect.toJSON(), dockRect: dockRect.toJSON() }
    })
    assert.ok(paint.portal && paint.overlaps && paint.dialogOnTop && paint.backdropOnTop, `both the error surface and its backdrop intercept the overlapping dock: ${JSON.stringify(paint)}`)
    await dialog.getByRole('button', { name: '오류 상세 복사', exact: true }).click()
    assert.equal(await page.evaluate('window.copied'), '첨부 서버 오류 상세')
    await dialog.evaluate(element => {
      const doc = element.ownerDocument
      const view = doc.defaultView!
      const result = view as unknown as { fallbackCopy?: string }
      Object.defineProperty(view.navigator, 'clipboard', { configurable: true, value: undefined })
      doc.execCommand = () => {
        const active = doc.activeElement
        result.fallbackCopy = active instanceof view.HTMLTextAreaElement && active.selectionStart === 0 && active.selectionEnd === active.value.length ? active.value : ''
        return !!result.fallbackCopy
      }
    })
    await dialog.getByRole('button', { name: '오류 상세 복사', exact: true }).click()
    assert.equal(await page.evaluate('window.fallbackCopy'), '첨부 서버 오류 상세', 'copy works without the Clipboard API while modal focus is contained')
    assert.equal(await dialog.getByRole('button', { name: '오류 상세 복사', exact: true }).evaluate(element => element === element.ownerDocument.activeElement), true, 'fallback copying restores the focused button')
    await page.evaluate('window.openNested()')
    const nested = page.getByRole('dialog', { name: 'Nested dialog' })
    await nested.waitFor()
    await page.keyboard.press('Escape')
    await nested.waitFor({ state: 'detached' })
    assert.equal(await dialog.count(), 1, 'Escape dismisses only the topmost dialog')
    await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'detached' })
    assert.equal(await page.evaluate('window.dockClicks'), 0)

    holdUpload = true
    let held = new Promise<void>(resolve => { markHeld = resolve })
    await upload()
    await held
    await page.locator('[aria-label="첨부 중…"]').waitFor({ state: 'attached' })
    await page.evaluate("window.setForeground('editor')")
    let response = page.waitForResponse(response => new URL(response.url()).pathname === '/api/upload-into')
    releaseUpload!()
    await response
    await page.locator('[aria-label="첨부 중…"]').waitFor({ state: 'detached' })
    assert.equal(await dialog.count(), 0, 'a failure from a hidden dock body does not cover the visible panel')
    await page.evaluate("window.setForeground('agent')")
    await dialog.waitFor()
    await dialog.getByRole('button', { name: '닫기', exact: true }).click()
    await dialog.waitFor({ state: 'detached' })

    releaseUpload = undefined
    held = new Promise<void>(resolve => { markHeld = resolve })
    await upload()
    await held
    await page.locator('[aria-label="첨부 중…"]').waitFor({ state: 'attached' })
    await page.evaluate('window.setWorkspaceActive(false)')
    response = page.waitForResponse(response => new URL(response.url()).pathname === '/api/upload-into')
    releaseUpload!()
    await response
    await page.locator('[aria-label="첨부 중…"]').waitFor({ state: 'detached' })
    assert.equal(await dialog.count(), 0, 'an inactive project cannot interrupt the active workspace')
    await page.evaluate('window.setWorkspaceActive(true)')
    await dialog.waitFor()
    await page.evaluate('history.back()')
    await dialog.waitFor({ state: 'detached' })

    releaseUpload = undefined
    held = new Promise<void>(resolve => { markHeld = resolve })
    await upload()
    await held
    await page.locator('[aria-label="첨부 중…"]').waitFor({ state: 'attached' })
    await page.getByRole('tab').filter({ hasText: 'Second' }).click()
    await page.getByRole('tab', { selected: true }).filter({ hasText: 'Second' }).waitFor()
    response = page.waitForResponse(response => new URL(response.url()).pathname === '/api/upload-into')
    releaseUpload!()
    await response
    await page.locator('[aria-label="첨부 중…"]').waitFor({ state: 'detached' })
    assert.equal(await dialog.count(), 0, 'an inactive agent tab cannot cover the current tab')
    await page.getByRole('tab').filter({ hasText: 'First' }).click()
    await dialog.waitFor()
    await page.mouse.click(1, 1)
    await dialog.waitFor({ state: 'detached' })
    assert.equal(await page.evaluate('window.dockClicks'), 0, 'the outside press dismisses the backdrop without activating the dock')
    assert.deepEqual(errors, [])
  })
})
