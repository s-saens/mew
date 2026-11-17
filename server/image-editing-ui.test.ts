import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { connectTestBrowser } from './test-browser.ts'

const root = path.resolve(import.meta.dirname, '..')
const initialMarkdown = 'Before image\n\n<img src="/original.png" alt="Sample photo" title="Original title" width="180">\n\nAfter image'

test('attachment editing uses the real drawing canvas, preserves image attributes and rejects stale saves', { timeout: 90_000 }, async t => {
  const source = `
import React from 'react';import {createRoot} from 'react-dom/client';
import {Editor} from '${root}/packages/editor/src/Editor.tsx';
import {DrawingEditor} from '${root}/src/components/drawing/DrawingEditor.tsx';
import {I18nProvider} from '${root}/src/i18n.tsx';
localStorage.setItem('mew:locale','ko');
const initial=${JSON.stringify(initialMarkdown)};
function Fixture(){
 const [file,setFile]=React.useState('first.md'),[readOnly,setReadOnly]=React.useState(false),[documents,setDocuments]=React.useState({});
 const api=React.useMemo(()=>({
  fetchFile:async()=>({path:'',content:'',editable:true}),fetchLinkPreview:async()=>({title:null,description:null}),db:{},
  uploadAsset:async file=>{const response=await fetch('/upload',{method:'POST',body:file});const body=await response.json();if(!response.ok)throw Error(body.error);return body}
 }),[]);
 return <div style={{height:'100dvh',display:'flex',flexDirection:'column'}}>
  <nav><button onClick={()=>setReadOnly(value=>!value)}>Readonly</button><button onClick={()=>setFile(value=>value==='first.md'?'second.md':'first.md')}>Switch file</button>
  <button onClick={()=>setDocuments({})}>Reset</button><output data-file>{file}</output></nav>
  <div style={{flex:1,minHeight:0}}><Editor path={file} api={api} readOnly={readOnly} showMobileKeyBar={false}
   value={documents[file]??initial} onChange={value=>setDocuments(previous=>({...previous,[file]:value}))}
   renderDrawingEditor={options=><DrawingEditor {...options} context="document" projectRoot="/workspace"/>}/></div>
  <output data-markdown style={{display:'none'}}>{documents[file]??initial}</output>
 </div>
}
createRoot(document.getElementById('root')).render(<I18nProvider><Fixture/></I18nProvider>);`
  const candidates = [source], styles: string[] = []
  const bundle = await build({
    onLog(level, log, handler) { if (log.code !== 'MODULE_LEVEL_DIRECTIVE') handler(level, log) },
    input: 'virtual:image-editing.tsx', write: false, platform: 'browser', output: { format: 'esm' },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
    plugins: [{ name: 'image-editing-fixture', resolveId(id) { if (id === 'virtual:image-editing.tsx') return id }, async load(id) {
      if (id === 'virtual:image-editing.tsx') return source
      if (id.endsWith('.tsx')) candidates.push(await fs.readFile(id, 'utf8'))
      if (id.endsWith('.css')) { styles.push(await fs.readFile(id, 'utf8')); return { code: '', moduleType: 'js' } }
    } }],
  })
  const chunks = bundle.output.filter(item => item.type === 'chunk'), entry = chunks.find(item => item.isEntry)!
  const scripts = new Map(chunks.map(item => [`/${item.fileName}`, item.code]))
  const compiler = await compile(await fs.readFile(`${root}/src/index.css`, 'utf8'), { base: `${root}/src`, onDependency() {} })
  const css = compiler.build([...new Set(candidates.join('\n').match(/[A-Za-z0-9_@!&:/.[\]()%,-]+/g) ?? [])]) + styles.join('\n')
  const browser = await connectTestBrowser()
  t.after(() => browser.close())

  for (const width of [1100, 390]) await t.test(`${width}px`, async () => {
    const page = await browser.newPage({ viewport: { width, height: 844 }, hasTouch: width === 390, locale: 'ko-KR', reducedMotion: 'reduce' })
    page.setDefaultTimeout(5000)
    const errors: string[] = [], uploads: Buffer[] = [], drawingRequests: string[] = []
    let deny = false, hold = false, releaseUpload: (() => void) | undefined
    page.on('pageerror', error => errors.push(error.message))
    await page.setContent('<div id="png-fixture"></div>')
    const png = Buffer.from(await page.locator('#png-fixture').evaluate(element => {
      const canvas = element.ownerDocument.createElement('canvas')
      canvas.width = 240; canvas.height = 160
      const context = canvas.getContext('2d')!
      context.fillStyle = '#e53935'; context.fillRect(0, 0, 120, 160)
      context.fillStyle = '#1e88e5'; context.fillRect(120, 0, 120, 160)
      return canvas.toDataURL('image/png').split(',')[1]
    }), 'base64')
    await page.route('https://mew-image-editing.test/**', async route => {
      const url = new URL(route.request().url())
      if (url.pathname === '/upload') {
        uploads.push(route.request().postDataBuffer()!)
        if (hold) { hold = false; await new Promise<void>(resolve => { releaseUpload = resolve }) }
        return deny ? route.fulfill({ status: 503, json: { error: 'Photo upload unavailable' } })
          : route.fulfill({ json: { url: `/edited.png?attempt=${uploads.length}`, name: 'edited.png', mimetype: 'image/png' } })
      }
      if (url.pathname === '/original.png') return route.fulfill({ contentType: 'image/png', body: png })
      if (url.pathname === '/edited.png') return route.fulfill({ contentType: 'image/png', body: uploads[Number(url.searchParams.get('attempt')) - 1] })
      if (scripts.has(url.pathname)) return route.fulfill({ contentType: 'text/javascript', body: scripts.get(url.pathname)! })
      if (url.pathname.startsWith('/api/')) {
        if (url.pathname.startsWith('/api/agent/drawings')) drawingRequests.push(url.pathname)
        return route.fulfill({ json: { drawings: [], projectRoot: '/workspace' } })
      }
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html class="dark" lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}\nhtml,body,#root{height:100%;margin:0}</style><div id="root"></div><script type="module" src="/${entry.fileName}"></script></html>` })
    })
    const editor = page.locator('.tiptap'), image = editor.getByRole('img', { name: 'Sample photo', exact: true })
    const preview = page.getByRole('dialog', { name: 'Sample photo 사진 미리보기', exact: true })
    const drawing = page.getByRole('dialog', { name: '그림판', exact: true }), canvas = drawing.locator('[data-drawing-canvas]')
    const enlarge = page.getByRole('button', { name: '사진 확대', exact: true })
    const openDrawing = async () => {
      await enlarge.click(); await preview.waitFor()
      await preview.getByRole('button', { name: '사진 편집', exact: true }).click()
      await drawing.waitFor()
      await canvas.locator('[data-drawing-object] image').waitFor()
      await drawing.getByRole('button', { name: '저장', exact: true }).waitFor({ state: 'visible' })
    }
    const closePreview = async () => {
      await preview.waitFor()
      await preview.getByRole('button', { name: '사진 미리보기 닫기', exact: true }).click()
      await preview.waitFor({ state: 'detached' })
    }
    try {
      await page.goto('https://mew-image-editing.test/')
      await image.waitFor()
      await page.getByRole('button', { name: 'Readonly', exact: true }).click()
      assert.equal(await editor.getAttribute('contenteditable'), 'false')
      await enlarge.click(); await preview.waitFor()
      assert.equal(await preview.getByRole('button', { name: '사진 편집', exact: true }).count(), 0)
      await closePreview()
      await page.getByRole('button', { name: 'Readonly', exact: true }).click()

      await openDrawing()
      const bounds = canvas.locator('[data-canvas-bounds]')
      assert.deepEqual(await bounds.evaluate(element => Object.fromEntries(['x', 'y', 'width', 'height'].map(key => [key, Number(element.getAttribute(key))]))), { x: -120, y: -80, width: 240, height: 160 })
      assert.equal(await canvas.locator('[data-drawing-object] image').getAttribute('width'), '240')
      assert.equal(await canvas.locator('[data-drawing-object] image').getAttribute('height'), '160')
      assert.match(await canvas.locator('[data-drawing-object] image').getAttribute('href') ?? '', /^data:image\/png;base64,/)
      await drawing.getByRole('button', { name: '닫기', exact: true }).click()
      await drawing.waitFor({ state: 'detached' })
      assert.equal(await image.getAttribute('src'), '/original.png')
      assert.equal(uploads.length, 0)
      await closePreview()

      await openDrawing()
      await canvas.press('b')
      const box = await bounds.boundingBox(); assert.ok(box)
      await page.mouse.move(box.x + 30, box.y + 30); await page.mouse.down()
      await page.mouse.move(box.x + 90, box.y + 60, { steps: 8 }); await page.mouse.up()
      assert.equal(await canvas.locator('[data-drawing-object]').count(), 2)
      await page.screenshot({ path: `/tmp/mew-image-editing-${width}.png` })
      await drawing.getByRole('button', { name: '저장', exact: true }).click()
      await drawing.waitFor({ state: 'detached' })
      await closePreview()
      assert.equal(await image.getAttribute('src'), '/edited.png?attempt=1')
      assert.equal(await image.getAttribute('alt'), 'Sample photo')
      assert.equal(await image.getAttribute('title'), 'Original title')
      assert.equal(await image.evaluate(element => (element as unknown as { style: { width: string } }).style.width), '180px')
      assert.equal(uploads[0].readUInt32BE(16), 480, 'PNG export uses the source canvas width at scale 2 without padding')
      assert.equal(uploads[0].readUInt32BE(20), 320, 'PNG export uses the source canvas height at scale 2 without padding')
      const markdown = await page.locator('[data-markdown]').textContent() ?? ''
      assert.match(markdown, /<img src="\/edited\.png\?attempt=1" alt="Sample photo" title="Original title" width="180">/)

      await page.getByRole('button', { name: 'Reset', exact: true }).click()
      await openDrawing()
      deny = true
      await drawing.getByRole('button', { name: '저장', exact: true }).click()
      await drawing.getByRole('alert').getByText('Photo upload unavailable', { exact: true }).waitFor()
      assert.equal(await drawing.count(), 1)
      assert.equal(await image.getAttribute('src'), '/original.png')
      assert.equal(await canvas.locator('[data-drawing-object]').count(), 1)
      deny = false
      await drawing.getByRole('button', { name: '저장', exact: true }).click()
      await drawing.waitFor({ state: 'detached' })
      await closePreview()
      assert.equal(await image.getAttribute('src'), '/edited.png?attempt=3')

      await page.getByRole('button', { name: 'Reset', exact: true }).click()
      await openDrawing()
      hold = true
      const requested = page.waitForRequest('**/upload')
      await drawing.getByRole('button', { name: '저장', exact: true }).click()
      await requested
      await page.getByRole('button', { name: 'Switch file', exact: true }).evaluate(element => (element as unknown as { click: () => void }).click())
      await drawing.waitFor({ state: 'detached' })
      assert.equal(await page.locator('[data-file]').textContent(), 'second.md')
      const completed = page.waitForResponse('**/upload')
      assert.ok(releaseUpload); releaseUpload()
      await completed
      await page.waitForTimeout(50)
      assert.equal(await image.getAttribute('src'), '/original.png', 'a late upload cannot replace an image in the next file with the same stable API')
      await page.getByRole('button', { name: 'Switch file', exact: true }).click()
      assert.equal(await image.getAttribute('src'), '/original.png', 'the stale upload also leaves the original file unchanged')
      assert.deepEqual(drawingRequests, [], 'document attachment editing never uses agent drawing history')
      assert.deepEqual(errors, [])
    } catch (error) {
      await page.screenshot({ path: `/tmp/mew-image-editing-failure-${width}.png` })
      throw error
    } finally { releaseUpload?.(); await page.close() }
  })
})
