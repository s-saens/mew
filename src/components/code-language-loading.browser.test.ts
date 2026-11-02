import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'rolldown'
import { chromium } from 'playwright-core'
import { domBrowserExecutable } from '../../server/browser-dom-executable.ts'

test('Plain waits for the selected parser, ignores late files, and preserves first-keystroke behavior, undo, refs and JSON lint', { skip: !domBrowserExecutable(), timeout: 30_000 }, async t => {
  const pane = new URL('./CodePane.tsx', import.meta.url).pathname
  const result = await build({ input: 'virtual:language-fixture.tsx', write: false, platform: 'browser', output: { format: 'esm' }, onwarn() {}, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': '"production"' } }, plugins: [{
    name: 'language-fixture', resolveId(id) { if (id.startsWith('virtual:')) return id; if (id.endsWith('.css')) return 'virtual:style' },
    load(id) {
      if (id === 'virtual:style') return ''
      if (id === 'virtual:language-fixture.tsx') return `import React from ${JSON.stringify(import.meta.resolve('react'))};import{createRoot}from ${JSON.stringify(import.meta.resolve('react-dom/client'))};import{CodePane}from ${JSON.stringify(pane)};
function Fixture(){const[path,setPath]=React.useState('first.py'),[value,setValue]=React.useState('old Python'),[readOnly,setReadOnly]=React.useState(false),[mounted,setMounted]=React.useState(true),ref=React.useRef(null);window.currentHandle=()=>ref.current;window.openFixture=(path,value)=>{setPath(path);setValue(value)};window.setReadonly=setReadOnly;window.closeFixture=()=>setMounted(false);window.edits??=[];return <main style={{height:600}} data-value={value}>{mounted&&<CodePane ref={ref} path={path} value={value} readOnly={readOnly} onChange={value=>{window.edits.push(value);setValue(value)}}/>}</main>};createRoot(document.getElementById('root')).render(<Fixture/>);`
    },
  }] })
  const chunks = result.output.filter(chunk => chunk.type === 'chunk'), scripts = new Map(chunks.map(chunk => ['/' + chunk.fileName, chunk.code]))
  const parserChunk = (name: string) => '/' + chunks.find(chunk => Object.keys(chunk.modules).some(id => id.includes('/@codemirror/lang-' + name + '/')))?.fileName
  const python = parserChunk('python'), markdown = parserChunk('markdown'), json = parserChunk('json'), rust = parserChunk('rust')
  assert.ok(![python, markdown, json, rust].some(file => file.endsWith('undefined')))
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  t.after(() => browser.close())
  const page = await browser.newPage(), requested: string[] = [], releases = new Map<string, () => void>(), errors: string[] = []
  page.setDefaultTimeout(5000)
  page.on('pageerror', error => errors.push(error.message))
  await page.route('http://code-language.test/**', async route => {
    const path = new URL(route.request().url()).pathname
    requested.push(path)
    if ([python, markdown, rust].includes(path)) await new Promise<void>(resolve => releases.set(path, resolve))
    if (page.isClosed()) return
    const script = scripts.get(path)
    await route.fulfill(script === undefined ? { contentType: 'text/html', body: `<div id="root"></div><script type="module" src="/${chunks.find(chunk => chunk.isEntry)!.fileName}"></script>` } : { contentType: 'text/javascript', body: script })
  })
  const pythonRequest = page.waitForRequest(request => new URL(request.url()).pathname === python)
  await page.goto('http://code-language.test/', { waitUntil: 'domcontentloaded' }); await pythonRequest
  await page.locator('[data-editor-body] [role="status"][aria-busy="true"]').waitFor({ state: 'attached' })
  assert.equal(await page.locator('.cm-editor').count(), 0, 'no incomplete editor is mounted before its parser')
  assert.equal(await page.evaluate('window.currentHandle()'), null)
  const markdownRequest = page.waitForRequest(request => new URL(request.url()).pathname === markdown)
  await page.evaluate('window.openFixture("current.md", "- one")'); await markdownRequest
  releases.get(python)!()
  await page.waitForTimeout(30)
  assert.equal(await page.locator('.cm-editor').count(), 0, 'a late parser cannot mount the previous file')
  await page.evaluate('window.setReadonly(true)'); releases.get(markdown)!()
  await page.locator('.cm-content[contenteditable="false"]').waitFor()
  assert.deepEqual(await page.evaluate('window.edits'), [], 'parser preparation never edits the document')
  await page.evaluate('window.setReadonly(false)')
  const editor = page.locator('.cm-content[contenteditable="true"]'); await editor.waitFor(); await editor.click(); await editor.press('ControlOrMeta+End'); await editor.press('Enter')
  await page.waitForFunction(() => document.querySelector('main')?.getAttribute('data-value') === '- one\n- ')
  await page.keyboard.insertText('two'); await editor.press('ControlOrMeta+z')
  await page.waitForFunction(() => !document.querySelector('main')?.getAttribute('data-value')?.includes('two'))
  assert.equal(await page.evaluate('!!window.currentHandle()?.getSelectedLineRange()'), true)
  await page.evaluate('window.openFixture("broken.json", "{broken}")')
  await page.locator('.cm-lintPoint-error').waitFor({ state: 'attached', timeout: 5000 })
  await page.evaluate('window.setReadonly(true)')
  await page.locator('.cm-content[contenteditable="false"]').waitFor()
  assert.equal(await page.locator('.cm-lintPoint-error').count(), 0, 'readonly JSON preserves the existing no-linter gate')
  assert.ok(requested.includes(json))
  assert.equal(requested.includes(rust), false, 'unrelated parsers stay unloaded')
  const rustRequest = page.waitForRequest(request => new URL(request.url()).pathname === rust)
  await page.evaluate('window.openFixture("closed.rs", "fn main() {}")'); await rustRequest
  await page.evaluate('window.closeFixture()'); releases.get(rust)!()
  await page.waitForTimeout(30)
  assert.equal(await page.locator('.cm-editor').count(), 0, 'an unmounted pending parser cannot create a late view')
  assert.deepEqual(errors, [])
  await page.close()
})
