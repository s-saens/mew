import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'rolldown'
import { chromium } from 'playwright-core'
import * as Y from 'yjs'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'
import { readSyncMessage } from 'y-protocols/sync'
import { domBrowserExecutable } from './browser-dom-executable.ts'

test('Markdown stays visible while collaboration catches up with file loading', { skip: !domBrowserExecutable(), timeout: 60_000 }, async t => {
  const bodies: Record<string, string> = {
    'slow.md': 'Slow file body remains visible\n',
    'fast.md': 'Fast file body remains visible\n',
    'shared.md': 'Existing shared body remains visible\n',
  }
  const source = `
import React from ${JSON.stringify(import.meta.resolve('react'))};
import {createRoot} from ${JSON.stringify(import.meta.resolve('react-dom/client'))};
import {I18nProvider} from ${JSON.stringify(new URL('../src/i18n.tsx', import.meta.url).pathname)};
import {EditorPane} from ${JSON.stringify(new URL('../src/components/EditorPane.tsx', import.meta.url).pathname)};
import {useTabs} from ${JSON.stringify(new URL('../src/hooks/useTabs.ts', import.meta.url).pathname)};
import {setContentIdentity,setContentWorkspace,putCachedFile} from ${JSON.stringify(new URL('../src/utils/contentCache.ts', import.meta.url).pathname)};
setContentIdentity('owner@example.test');
setContentWorkspace('/fixture');
putCachedFile('docs','fast.md',{content:'Unverified cached fast body',editable:true});
const noop=()=>{};
const callbacks=Object.fromEntries(['registerHandle','registerElement','registerTabBar','onFocus','onPin','onCloseTab','onReorder','onOpenHistory','onSetTocOpen','onOpenSidebar','onTabDragMove','onTabDrop'].map(key=>[key,noop]));
function Fixture(){
  const tabs=useTabs('docs',noop,message=>{window.lastNotice=message},'/fixture');
  window.tabs=tabs;
  return <div style={{height:700,display:'flex',flexDirection:'column'}}>
    <EditorPane {...callbacks} onActivate={tabs.setActivePath} onChangeContent={tabs.updateTabContent} onSetViewMode={tabs.setTabViewMode} onOpenLink={noop} pane={tabs.panes[0]} role="owner" authEmail="owner@example.test" project="docs" tree={[]} presence={{}} focused isGuest={false} showSidebarButton={false} tocOpen={false} dropZone={null}/>
  </div>;
}
createRoot(document.getElementById('root')).render(<React.StrictMode><I18nProvider><Fixture/></I18nProvider></React.StrictMode>);`
  const bundle = await build({
    onLog(level, log, handler) { if (log.code !== 'MODULE_LEVEL_DIRECTIVE') handler(level, log) },
    input: 'virtual:editor-collab-handoff.tsx', write: false, platform: 'browser', output: { format: 'esm', codeSplitting: false },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
    plugins: [{ name: 'editor-collab-handoff-fixture', resolveId(id) {
      if (id === 'virtual:editor-collab-handoff.tsx') return id
      if (id.endsWith('.css')) return 'virtual:style'
    }, load(id) {
      if (id === 'virtual:editor-collab-handoff.tsx') return source
      if (id === 'virtual:style') return ''
    } }],
  })
  const chunk = bundle.output.find(item => item.type === 'chunk')!
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  try {
    for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
      await t.test(`${viewport.width}px viewport`, async () => {
        const page = await browser.newPage({ viewport })
        page.setDefaultTimeout(5000)
        const errors: string[] = [], writes: string[] = [], updates: string[] = []
        const rooms = new Map<string, Y.Doc>()
        for (const file of Object.keys(bodies)) rooms.set(file, new Y.Doc())
        const paragraph = new Y.XmlElement('paragraph'), text = new Y.XmlText()
        text.insert(0, bodies['shared.md'].trim())
        paragraph.insert(0, [text])
        rooms.get('shared.md')!.getXmlFragment('default').insert(0, [paragraph])
        let releaseFile: (() => void) | undefined
        const fileGate = new Promise<void>(resolve => { releaseFile = resolve })
        const pendingSync = new Map<string, () => void>()
        const syncRequests: string[] = []
        page.on('pageerror', error => errors.push(error.message))
        await page.route('http://mew-handoff.test/**', async route => {
          const request = route.request(), url = new URL(request.url())
          if (url.pathname === '/api/file') {
            if (request.method() !== 'GET') { writes.push(request.postData() ?? ''); return route.fulfill({ json: { ok: true } }) }
            const file = url.searchParams.get('path')!
            if (file === 'fast.md') await fileGate
            return route.fulfill({ json: { path: file, content: bodies[file], editable: true } })
          }
          if (url.pathname === '/api/comments') return route.fulfill({ json: { threads: [] } })
          if (url.pathname === '/api/members') return route.fulfill({ json: { members: [] } })
          if (url.pathname === '/api/table-layout') return route.fulfill({ json: { tables: [] } })
          if (url.pathname.startsWith('/api/')) return route.fulfill({ json: [] })
          return route.fulfill(url.pathname === '/app.js'
            ? { contentType: 'text/javascript', body: chunk.code }
            : { contentType: 'text/html', body: '<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/app.js"></script></html>' })
        })
        await page.routeWebSocket('**/api/collab?**', ws => {
          const file = new URL(ws.url()).searchParams.get('room')!.slice('docs:'.length)
          let closed = false
          ws.onClose(() => { closed = true })
          ws.onMessage(message => {
            if (typeof message === 'string') return
            const decoder = decoding.createDecoder(new Uint8Array(message))
            if (decoding.readVarUint(decoder) !== 0) return
            const encoder = encoding.createEncoder()
            encoding.writeVarUint(encoder, 0)
            const kind = readSyncMessage(decoder, encoder, rooms.get(file)!, null)
            if (kind === 2) updates.push(file)
            if (encoding.length(encoder) <= 1) return
            const respond = () => { if (!closed) ws.send(Buffer.from(encoding.toUint8Array(encoder))) }
            if (kind === 0) {
              syncRequests.push(file)
              if (file === 'fast.md') respond()
              else pendingSync.set(file, respond)
            } else respond()
          })
        })
        try {
          await page.goto('http://mew-handoff.test/')
          await page.waitForFunction('window.tabs?.hydrated')
          await page.locator('html').evaluate(root => {
            const view = root.ownerDocument.defaultView as any
            view.handoffFrames = []
            view.handoffTarget = null
            const sample = () => {
              const target = view.handoffTarget
              if (target && view.tabs?.activePath === target.path) {
                const texts = [...root.ownerDocument.querySelectorAll('.ProseMirror')].map(node => node.textContent ?? '')
                if (texts.some(body => body.includes(target.body))) target.seen = true
                if (target.seen) view.handoffFrames.push(texts)
              }
              view.requestAnimationFrame(sample)
            }
            view.requestAnimationFrame(sample)
          })
          const open = async (file: string) => {
            await page.evaluate(`window.handoffFrames=[];window.handoffTarget={path:${JSON.stringify(file)},body:${JSON.stringify(bodies[file].trim())},seen:false};window.tabs.openFile(${JSON.stringify(file)},{preview:false})`)
            await page.waitForFunction(`window.tabs.activePath === ${JSON.stringify(file)}`)
          }
          const frames = async (count: number) => {
            await page.locator('html').evaluate((root, frames) => new Promise<void>(resolve => {
              const view = root.ownerDocument.defaultView!
              let remaining = frames
              const next = () => { if (--remaining === 0) resolve(); else view.requestAnimationFrame(next) }
              view.requestAnimationFrame(next)
            }), count)
          }
          const assertVisibleFrames = async (label: string) => {
            const observed = await page.evaluate('window.handoffFrames') as string[][]
            assert.ok(observed.length >= 10, `${label}: monitor observed readable content over multiple frames`)
            const empty = observed.map((texts, frame) => ({ texts, frame })).filter(({ texts }) => !texts.length || texts.some(text => !text.trim()))
            assert.deepEqual(empty, [], `${label}: no empty editor or missing editor frame after the file appears`)
          }
          const markdown = page.locator('.ProseMirror')

          await open('slow.md')
          await markdown.filter({ hasText: bodies['slow.md'] }).waitFor()
          await frames(16)
          assert.ok(pendingSync.has('slow.md'), 'the slow room has not supplied its first document response')
          assert.equal(updates.length, 0, 'loading a file cannot seed a room before its first document response')
          assert.deepEqual(writes, [], 'loading and waiting for collaboration never autosaves a blank document')
          assert.equal(await markdown.getAttribute('contenteditable'), 'false', 'the visible local copy stays read-only until collaboration is synchronized')
          await markdown.click()
          await page.keyboard.type(' ignored while syncing')
          assert.equal(await page.evaluate('window.tabs.activeTab.content'), bodies['slow.md'], 'pending synchronization cannot accept edits that a later remote document would overwrite')
          pendingSync.get('slow.md')!()
          await markdown.filter({ hasText: bodies['slow.md'] }).waitFor()
          await page.locator('.ProseMirror[contenteditable="true"]').waitFor()
          await frames(16)
          assert.ok(updates.includes('slow.md'), 'the verified file seeds the synchronized empty room')
          await assertVisibleFrames('slow empty room')

          await open('fast.md')
          await page.waitForFunction('window.tabs.activeTab.revalidating === true')
          await frames(16)
          assert.ok(syncRequests.includes('fast.md'), 'collaboration starts alongside the held file request')
          assert.equal(updates.filter(file => file === 'fast.md').length, 0, 'fast synchronization cannot seed an unverified file')
          releaseFile!()
          await markdown.filter({ hasText: bodies['fast.md'] }).waitFor()
          await frames(16)
          assert.ok(updates.includes('fast.md'))
          await assertVisibleFrames('fast empty room')

          await open('shared.md')
          await markdown.filter({ hasText: bodies['shared.md'] }).waitFor()
          await frames(16)
          assert.ok(pendingSync.has('shared.md'))
          pendingSync.get('shared.md')!()
          await frames(16)
          await markdown.filter({ hasText: bodies['shared.md'] }).waitFor()
          assert.equal(updates.filter(file => file === 'shared.md').length, 0, 'existing remote paragraphs are not seeded again')
          await assertVisibleFrames('populated room')

          pendingSync.delete('slow.md')
          await open('slow.md')
          await markdown.filter({ hasText: bodies['slow.md'] }).waitFor()
          await frames(16)
          assert.ok(pendingSync.has('slow.md'), 'reopening a cached file waits for its new collaboration session')
          const seeded = updates.filter(file => file === 'slow.md').length
          pendingSync.get('slow.md')!()
          await frames(16)
          await markdown.filter({ hasText: bodies['slow.md'] }).waitFor()
          assert.equal(updates.filter(file => file === 'slow.md').length, seeded, 'reopening does not duplicate the existing document')
          await assertVisibleFrames('reopened cached document')
          assert.deepEqual(writes, [], 'initialization and collaboration handoff never autosave the document')
          await markdown.click()
          await markdown.press('End')
          await page.keyboard.type(' User edit')
          await markdown.filter({ hasText: 'User edit' }).waitFor()
          await page.waitForFunction("window.tabs.activeTab.savedContent.includes('User edit')")
          assert.equal(writes.length, 1, 'typing after synchronization resumes normal automatic saving')
          assert.equal(JSON.parse(writes[0]).path, 'slow.md')
          assert.match(JSON.parse(writes[0]).content, /User edit/)
          assert.deepEqual(errors, [])
        } finally {
          releaseFile!()
          await page.close()
          rooms.forEach(doc => doc.destroy())
        }
      })
    }
  } finally { await browser.close() }
})
