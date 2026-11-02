import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'rolldown'
import { chromium } from 'playwright-core'
import { domBrowserExecutable } from '../../server/browser-dom-executable.ts'

test('cold comment popup preparation preserves overlay history and cancels outside clicks without a late popup', { skip: !domBrowserExecutable(), timeout: 15_000 }, async t => {
  const deferred = new URL('./deferred-editor-comments.tsx', import.meta.url).pathname
  const comments = new URL('./Comments.tsx', import.meta.url).pathname
  const react = import.meta.resolve('react'), reactDom = import.meta.resolve('react-dom/client')
  const source = `import React from ${JSON.stringify(react)};import{createRoot}from ${JSON.stringify(reactDom)};import{useOverlayDismiss}from '@mew/ui';import{CommentListPopover}from ${JSON.stringify(deferred)};
function Existing({close}){useOverlayDismiss(close);return <div role="dialog" aria-label="Existing annotation">annotation</div>}
function Fixture(){const[mode,setMode]=React.useState('old');window.popupMode=mode;return <><button onClick={()=>setMode('comments')}>Comments</button><button>Outside</button>{mode==='old'&&<Existing close={()=>setMode('off')}/>}{mode==='comments'&&<CommentListPopover threads={[]} onPick={()=>{}} onClose={()=>setMode('off')}/>}</>};createRoot(document.getElementById('root')).render(<Fixture/>);`
  const result = await build({ input: 'virtual:popup.tsx', write: false, platform: 'browser', onwarn(warning, warn) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning) }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('production') } }, output: { format: 'esm' }, plugins: [{
    name: 'cold-comment-popup', resolveId(id) { if (id.startsWith('virtual:')) return id; if (id.endsWith('.css')) return 'virtual:style' },
    load(id) {
      if (id === 'virtual:style') return ''
      if (id === 'virtual:popup.tsx') return source
      if (id === comments) return `import React from ${JSON.stringify(react)};import{useOverlayDismiss}from '@mew/ui';export function CommentListPopover({onClose}){useOverlayDismiss(onClose);return <div role="dialog" aria-label="Loaded comments">comments</div>}export const CommentComposer=CommentListPopover,CommentPopover=CommentListPopover,CommentThreadView=CommentListPopover;`
    },
  }] })
  const chunks = result.output.filter(chunk => chunk.type === 'chunk'), entry = chunks.find(chunk => chunk.isEntry)!
  const commentsChunk = chunks.find(chunk => comments in chunk.modules)!, scripts = new Map(chunks.map(chunk => ['/' + chunk.fileName, chunk.code]))
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  t.after(() => browser.close())
  for (const cancel of [false, true]) {
    const page = await browser.newPage(), errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    let requested!: () => void, release!: () => void
    const started = new Promise<void>(resolve => { requested = resolve }), held = new Promise<void>(resolve => { release = resolve })
    await page.route('http://comment-popup.test/**', async route => {
      const file = new URL(route.request().url()).pathname
      if (file === '/' + commentsChunk.fileName) { requested(); await held }
      const script = scripts.get(file)
      await route.fulfill(script === undefined ? { contentType: 'text/html', body: `<div id="root"></div><script type="module" src="/${entry.fileName}"></script>` } : { contentType: 'text/javascript', body: script })
    })
    await page.goto('http://comment-popup.test/')
    await page.getByRole('dialog', { name: 'Existing annotation' }).waitFor()
    await page.getByRole('button', { name: 'Comments', exact: true }).click()
    await started
    await page.waitForTimeout(100)
    assert.equal(await page.evaluate('window.popupMode'), 'comments', 'the old history guard cannot dismiss the pending replacement')
    if (cancel) await page.getByRole('button', { name: 'Outside', exact: true }).click()
    release()
    if (cancel) {
      await page.waitForTimeout(100)
      assert.equal(await page.evaluate('window.popupMode'), 'off')
      assert.equal(await page.getByRole('dialog').count(), 0)
    } else {
      await page.getByRole('dialog', { name: 'Loaded comments' }).waitFor()
      await page.keyboard.press('Escape')
      await page.getByRole('dialog').waitFor({ state: 'detached' })
      assert.equal(await page.evaluate('window.popupMode'), 'off')
    }
    assert.deepEqual(errors, [])
    await page.close()
  }
})
