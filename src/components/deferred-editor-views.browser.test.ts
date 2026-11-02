import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'rolldown'
import { chromium } from 'playwright-core'
import { domBrowserExecutable } from '../../server/browser-dom-executable.ts'

test('delayed editor views preserve current-file props and imperative refs and cannot mount a cancelled view', { skip: !domBrowserExecutable(), timeout: 15_000 }, async t => {
  const views = new URL('./deferred-editor-views.tsx', import.meta.url).pathname
  const plain = new URL('./CodePane.tsx', import.meta.url).pathname
  const react = import.meta.resolve('react'), reactDom = import.meta.resolve('react-dom/client')
  const component = (name: string, kind: string) => `import React from ${JSON.stringify(react)};export const ${name}=React.forwardRef((props,ref)=>{React.useImperativeHandle(ref,()=>({getSelectedText:()=>props.path}));React.useEffect(()=>{window.mountedViews.push(${JSON.stringify(kind)}+':'+props.path)},[]);return <textarea data-editor-view=${JSON.stringify(kind)} value={props.value} onChange={event=>props.onChange(event.target.value)}/>});`
  const result = await build({ input: 'virtual:editor-views.tsx', write: false, platform: 'browser', onwarn(warning, warn) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning) }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('production') } }, output: { format: 'esm' }, plugins: [{
    name: 'delayed-editor-views',
    resolveId(id) { if (id.startsWith('virtual:')) return id; if (id === '@mew/editor') return 'virtual:hotview.tsx'; if (id.endsWith('.css')) return 'virtual:style' },
    load(id) {
      if (id === 'virtual:style') return ''
      if (id === plain) return component('CodePane', 'plain')
      if (id === 'virtual:hotview.tsx') return component('Editor', 'hotview')
      if (id === 'virtual:editor-views.tsx') return `import React from ${JSON.stringify(react)};import{createRoot}from ${JSON.stringify(reactDom)};import{DeferredCodePane,DeferredHotviewEditor,prepareEditorView}from ${JSON.stringify(views)};
window.mountedViews=[];window.editorChanges=[];
function Fixture(){const[view,setView]=React.useState('plain'),[path,setPath]=React.useState('first.md'),[open,setOpen]=React.useState(true);const ref=React.useRef(null);React.useLayoutEffect(()=>{window.initialCommitReady=!!document.querySelector('[data-editor-view="plain"]')},[]);window.currentEditor=()=>ref.current?.getSelectedText()??null;const Editor=view==='plain'?DeferredCodePane:DeferredHotviewEditor;return <><button onClick={()=>setPath('second.md')}>Other file</button><button onClick={()=>setView('hotview')}>Hotview</button><button onClick={()=>setView('plain')}>Plain</button><button onClick={()=>setOpen(false)}>Close</button>{open&&<Editor key={view} ref={ref} path={path} value={path} readOnly={false} api={{}} onChange={value=>window.editorChanges.push({path,value})}/>}</>};if(location.search)await prepareEditorView('plain','first.md');createRoot(document.getElementById('root')).render(<Fixture/>);`
    },
  }] })
  const chunks = result.output.filter(chunk => chunk.type === 'chunk'), entry = chunks.find(chunk => chunk.isEntry)!
  const plainChunk = chunks.find(chunk => plain in chunk.modules)!
  const scripts = new Map(chunks.map(chunk => ['/' + chunk.fileName, chunk.code]))
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  t.after(() => browser.close())
  const page = await browser.newPage(), errors: string[] = []
  page.setDefaultTimeout(3000)
  page.on('pageerror', error => errors.push(error.message))
  let releasePlain!: () => void, startedPlain!: () => void
  const requested = new Promise<void>(resolve => { startedPlain = resolve })
  const held = new Promise<void>(resolve => { releasePlain = resolve })
  await page.route('http://editor-views.test/**', async route => {
    const file = new URL(route.request().url()).pathname
    if (file === '/' + plainChunk.fileName) { startedPlain(); await held }
    const script = scripts.get(file)
    await route.fulfill(script === undefined ? { contentType: 'text/html', body: `<div id="root"></div><script type="module" src="/${entry.fileName}"></script>` } : { contentType: 'text/javascript', body: script })
  })
  await page.goto('http://editor-views.test/', { waitUntil: 'domcontentloaded' })
  await requested
  await page.getByRole('status').waitFor({ state: 'attached' })
  assert.equal(await page.evaluate('window.currentEditor()'), null)
  await page.getByRole('button', { name: 'Other file', exact: true }).click()
  await page.getByRole('button', { name: 'Hotview', exact: true }).click()
  await page.locator('[data-editor-view="hotview"]').waitFor()
  assert.equal(await page.evaluate('window.currentEditor()'), 'second.md')
  releasePlain()
  await page.locator('body').evaluate(element => new Promise<void>(resolve => element.ownerDocument.defaultView!.requestAnimationFrame(() => resolve())))
  assert.equal(await page.locator('[data-editor-view="plain"]').count(), 0)
  assert.deepEqual(await page.evaluate('window.mountedViews'), ['hotview:second.md'])
  await page.getByRole('button', { name: 'Plain', exact: true }).click()
  await page.locator('[data-editor-view="plain"]').fill('current file edit')
  assert.equal(await page.evaluate('window.currentEditor()'), 'second.md')
  assert.deepEqual(await page.evaluate('window.editorChanges'), [{ path: 'second.md', value: 'current file edit' }])
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  assert.equal(await page.evaluate('window.currentEditor()'), null)
  await page.goto('http://editor-views.test/?prepared=1')
  await page.locator('[data-editor-view="plain"]').waitFor()
  assert.equal(await page.evaluate('window.initialCommitReady'), true, 'an externally prepared engine mounts in the first commit without a loading pass')
  assert.deepEqual(errors, [])
})
