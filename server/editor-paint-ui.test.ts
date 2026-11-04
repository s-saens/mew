import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { connectTestBrowser } from './test-browser.ts'

const repo = path.resolve(import.meta.dirname, '..')

test('Hotview drawing commands preserve insertion, retries, cancellation and document scope', { timeout: 60_000 }, async t => {
  const source = `
    import React from 'react';import {createRoot} from 'react-dom/client';
    import {Editor} from '${repo}/packages/editor/src/Editor.tsx';
    function Drawing({onSave,onClose}) {
      const [busy,setBusy]=React.useState(false),[error,setError]=React.useState('');
      return <div role="dialog" aria-label="Drawing fixture" style={{position:'fixed',right:8,bottom:60,zIndex:2000,background:'var(--color-surface-raised)',padding:8}}>
        <button disabled={busy} onClick={async()=>{setBusy(true);setError('');try{await onSave(new File(['drawing'],'drawing [draft].png',{type:'image/png'}));onClose()}catch(error){setError(error.message)}finally{setBusy(false)}}}>Save drawing</button>
        <button disabled={busy} onClick={onClose}>Cancel drawing</button>{error&&<span role="alert">{error}</span>}
      </div>
    }
    function Fixture(){
      const [project,setProject]=React.useState('docs'),[file,setFile]=React.useState('first.md'),[readOnly,setReadOnly]=React.useState(false),[enabled,setEnabled]=React.useState(true);
      const [documents,setDocuments]=React.useState({}),identity=project+':'+file;
      const api=React.useMemo(()=>({
        fetchFile:async()=>({path:'',content:'',editable:true}),fetchLinkPreview:async()=>({title:null,description:null}),db:{},
        uploadAsset:async file=>{const response=await fetch('/upload?project='+project,{method:'POST',body:file});const body=await response.json();if(!response.ok)throw Error(body.error);return body}
      }),[project]);
      return <div style={{height:'100dvh',display:'flex',flexDirection:'column'}}>
        <nav><button onClick={()=>setFile(file==='first.md'?'second.md':'first.md')}>Switch file</button>
          <button onClick={()=>setProject(project==='docs'?'.workspace':'docs')}>Switch project</button>
          <button onClick={()=>setReadOnly(value=>!value)}>Readonly</button><button onClick={()=>setEnabled(value=>!value)}>Drawing available</button>
          <button onClick={()=>setDocuments(previous=>({...previous,[identity]:'Before drawing\\n\\nAfter drawing'}))}>Reset</button></nav>
        <div style={{flex:1,minHeight:0}}><Editor path={file} api={api} readOnly={readOnly} showMobileKeyBar={false}
          value={documents[identity]??'Before drawing\\n\\nAfter drawing'}
          onChange={value=>setDocuments(previous=>({...previous,[identity]:value}))}
          renderDrawingEditor={enabled?options=><Drawing {...options}/>:undefined}/></div>
        <output data-markdown style={{display:'none'}}>{documents[identity]??''}</output>
      </div>
    }
    createRoot(document.getElementById('root')).render(<Fixture/>);
  `
  const candidates = [source], styles: string[] = []
  const bundle = await build({
    onLog(level, log, handler) { if (log.code !== 'MODULE_LEVEL_DIRECTIVE') handler(level, log) },
    input: 'virtual:editor-paint.tsx', write: false, platform: 'browser', output: { format: 'esm' },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
    plugins: [{ name: 'editor-paint-fixture', resolveId(id) { if (id === 'virtual:editor-paint.tsx') return id }, load(id) {
      if (id === 'virtual:editor-paint.tsx') return source
      if (id.endsWith('.tsx')) candidates.push(fs.readFileSync(id, 'utf8'))
      if (id.endsWith('.css')) { styles.push(fs.readFileSync(id, 'utf8')); return { code: '', moduleType: 'js' } }
    } }],
  })
  const chunks = bundle.output.filter(item => item.type === 'chunk'), entry = chunks.find(item => item.isEntry)!
  const scripts = new Map(chunks.map(item => [`/${item.fileName}`, item.code]))
  const compiler = await compile(fs.readFileSync(path.join(repo, 'src/index.css'), 'utf8'), { base: path.join(repo, 'src'), onDependency() {} })
  const css = compiler.build([...new Set(candidates.join('\n').match(/[A-Za-z0-9_@!:/.[\]()%,-]+/g))]) + styles.join('\n')
  const browser = await connectTestBrowser()
  t.after(() => browser.close())
  for (const width of [1100, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 800 }, hasTouch: width < 768 })
    page.setDefaultTimeout(5000)
    const errors: string[] = [], uploads: string[] = []
    let deny = false, hold = false
    const pendingUploads: (() => void)[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('http://mew-editor-paint.test/**', async route => {
      const url = new URL(route.request().url())
      if (url.pathname === '/upload') {
        uploads.push(url.searchParams.get('project')!)
        if (hold) { hold = false; await new Promise<void>(resolve => { pendingUploads.push(resolve) }) }
        return deny ? route.fulfill({ status: 503, json: { error: 'Drawing upload unavailable' } })
          : route.fulfill({ json: { url: `/asset?project=${url.searchParams.get('project')}`, name: 'drawing [draft].png', mimetype: 'image/png' } })
      }
      if (url.pathname === '/asset') return route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg==', 'base64') })
      if (scripts.has(url.pathname)) return route.fulfill({ contentType: 'text/javascript', body: scripts.get(url.pathname)! })
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html class="dark"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script type="module" src="/${entry.fileName}"></script></html>` })
    })
    await page.goto('http://mew-editor-paint.test/')
    const editor = page.locator('.tiptap'), dialog = page.getByRole('dialog', { name: 'Drawing fixture' })
    await editor.getByText('Before drawing', { exact: true }).waitFor()
    const placeCaret = async (text: string, start = false) => {
      const paragraph = editor.getByText(text, { exact: true })
      await paragraph.click()
      await paragraph.evaluate((el, atStart) => {
        const range = el.ownerDocument.createRange(), selection = el.ownerDocument.getSelection()!
        el.parentElement?.focus()
        range.selectNodeContents(el); range.collapse(atStart)
        selection.removeAllRanges(); selection.addRange(range)
        return new Promise<void>(resolve => el.ownerDocument.defaultView!.requestAnimationFrame(() => resolve()))
      }, start)
    }
    const openDrawing = async (alias = '/paint') => {
      await placeCaret('Before drawing')
      await page.keyboard.press('Enter'); await page.keyboard.insertText(alias)
      const command = page.getByRole('button', { name: '그림판 그림을 그려 이미지로 삽입', exact: true })
      await command.waitFor()
      if (width > 768) await page.keyboard.press('Enter')
      else await command.tap()
      await dialog.waitFor()
    }
    await openDrawing()
    assert.equal(uploads.length, 0, 'opening the drawing does not upload an attachment')
    assert.doesNotMatch(await page.locator('[data-markdown]').textContent() ?? '', /\/paint/)
    await page.getByRole('button', { name: 'Cancel drawing', exact: true }).click()
    await dialog.waitFor({ state: 'hidden' })
    assert.equal(await editor.locator('img').count(), 0)
    assert.equal(await editor.evaluate(el => el.ownerDocument.activeElement === el), true, 'cancel restores editor focus')

    await page.getByRole('button', { name: 'Reset', exact: true }).click()
    await openDrawing('/그림')
    await placeCaret('Before drawing', true)
    await page.keyboard.insertText('Edited ')
    hold = true
    await page.getByRole('button', { name: 'Save drawing', exact: true }).click()
    await placeCaret('After drawing')
    await page.keyboard.insertText(' during upload')
    while (!pendingUploads.length) await page.waitForTimeout(10)
    pendingUploads.shift()!()
    await dialog.waitFor({ state: 'hidden' })
    const image = editor.getByRole('img', { name: 'drawing [draft]', exact: true })
    await image.waitFor()
    const markdown = await page.locator('[data-markdown]').textContent() ?? ''
    const imageOffset = markdown.indexOf('![drawing \\[draft\\]](/asset?project=docs)')
    assert.ok(imageOffset > markdown.indexOf('Edited Before drawing'), markdown)
    assert.ok(markdown.indexOf('After drawing during upload') > imageOffset, markdown)
    assert.equal(await editor.evaluate(el => el.ownerDocument.activeElement === el), true, 'successful insertion restores editor focus')
    assert.deepEqual(uploads, ['docs'])

    await page.getByRole('button', { name: 'Reset', exact: true }).click()
    await openDrawing()
    deny = true
    await page.getByRole('button', { name: 'Save drawing', exact: true }).click()
    await page.getByText('Drawing upload unavailable', { exact: true }).waitFor()
    assert.equal(await dialog.count(), 1, 'failed upload keeps the drawing available for retry')
    assert.equal(await editor.locator('img').count(), 0, 'failed upload leaves the document unchanged')
    deny = false
    await page.getByRole('button', { name: 'Save drawing', exact: true }).click()
    await dialog.waitFor({ state: 'hidden' })
    await image.waitFor()

    for (const boundary of ['Switch file', 'Switch project', 'Readonly', 'Drawing available']) {
      await page.getByRole('button', { name: 'Reset', exact: true }).click()
      await openDrawing()
      hold = true
      const before: number = uploads.length
      await page.getByRole('button', { name: 'Save drawing', exact: true }).click()
      while (!pendingUploads.length) await page.waitForTimeout(10)
      await page.getByRole('button', { name: boundary, exact: true }).click()
      await dialog.waitFor({ state: 'hidden' })
      pendingUploads.shift()!()
      await page.waitForTimeout(50)
      assert.equal(await editor.locator('img').count(), 0, `${boundary} rejects a late drawing insertion`)
      assert.equal(uploads.length, before + 1)
      if (boundary === 'Readonly' || boundary === 'Drawing available') {
        if (boundary === 'Readonly') assert.equal(await editor.getAttribute('contenteditable'), 'false')
        await page.getByRole('button', { name: boundary, exact: true }).click()
      }
    }
    await page.getByRole('button', { name: 'Reset', exact: true }).click()
    await page.getByRole('button', { name: 'Drawing available', exact: true }).click()
    await placeCaret('Before drawing')
    await page.keyboard.press('Enter'); await page.keyboard.type('/paint')
    await page.getByText('일치하는 명령 없음', { exact: true }).waitFor()
    assert.equal(await dialog.count(), 0, 'hosts without a drawing renderer do not expose the command')
    assert.deepEqual(errors, [])
    await page.close()
  }
})
