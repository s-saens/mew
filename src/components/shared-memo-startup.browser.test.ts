import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'rolldown'
import { chromium } from 'playwright-core'
import { domBrowserExecutable } from '../../server/browser-dom-executable.ts'

test('memo preserves focus and content while initial connection and recovery show only an indicator', { skip: !domBrowserExecutable(), timeout: 15_000 }, async t => {
  const memo = new URL('./shared-memo.tsx', import.meta.url).pathname
  const hook = new URL('../hooks/use-shared-memo.ts', import.meta.url).pathname
  const deferred = new URL('./deferred-component.tsx', import.meta.url).pathname
  const i18n = new URL('../i18n.tsx', import.meta.url).pathname
  const code = new URL('./CodePane.tsx', import.meta.url).pathname
  const react = import.meta.resolve('react'), reactDom = import.meta.resolve('react-dom/client')
  const result = await build({
    input: 'virtual:memo.tsx', write: false, platform: 'browser', output: { format: 'esm' },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('production') } },
    plugins: [{
      name: 'delayed-memo',
      resolveId(id) {
        if (id.startsWith('virtual:')) return id
        if (id === '@mew/editor') return 'virtual:editor.tsx'
        if (id.endsWith('.css')) return 'virtual:style'
      },
      load(id) {
        if (id === 'virtual:style') return ''
        if (id === code) return 'export function CodePane(){return null}'
        if (id === 'virtual:editor.tsx') return `import React from ${JSON.stringify(react)}; export const Editor=React.forwardRef(({readOnly})=> <div contentEditable={!readOnly} className="tiptap"/>);`
        if (id === 'virtual:memo.tsx') return `
          import React from ${JSON.stringify(react)};
          import {createRoot} from ${JSON.stringify(reactDom)};
          import {useSharedMemo} from ${JSON.stringify(hook)};
          import {deferredComponent} from ${JSON.stringify(deferred)};
          import {I18nProvider} from ${JSON.stringify(i18n)};
          const SharedMemo=deferredComponent(async()=>({default:(await import(${JSON.stringify(memo)})).SharedMemo}));
          localStorage.setItem('mew:locale','ko');
          window.WebSocket=class {static OPEN=1;readyState=0;send(){}close(){this.readyState=3}};
          function Fixture(){
            const [open,setOpen]=React.useState(false);
            const [connected,setConnected]=React.useState(false),[synced,setSynced]=React.useState(false);
            const session=useSharedMemo({authEmail:'fixture@test',open,onOpenChange:setOpen});
            const memoSession={...session,collab:session.collab&&{...session.collab,connected,synced}};
            const mounted=React.useRef(false);if(open)mounted.current=true;
            return <><textarea aria-label="Existing editor" defaultValue="Keep this text"/><textarea aria-label="Other editor"/><button onMouseDown={event=>event.preventDefault()} onClick={()=>setOpen(true)}>Open memo</button><button onClick={()=>{setConnected(true);setSynced(true)}}>Connect memo</button><button onClick={()=>setConnected(false)}>Recover memo</button>{mounted.current && <div hidden={!open}><SharedMemo session={memoSession} open={open}/></div>}</>;
          }
          createRoot(document.getElementById('root')).render(<I18nProvider><Fixture/></I18nProvider>);`
      },
    }],
  })
  const chunks = result.output.filter(chunk => chunk.type === 'chunk')
  const entry = chunks.find(chunk => chunk.isEntry)!
  const memoChunk = chunks.find(chunk => memo in chunk.modules)!
  const scripts = new Map(chunks.map(chunk => [`/${chunk.fileName}`, chunk.code]))
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  t.after(() => browser.close())
  const page = await browser.newPage({ locale: 'ko-KR' })
  page.setDefaultTimeout(3000)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  let releaseMemo: (() => void) | undefined, onMemoRequest: (() => void) | undefined
  const memoRequested = new Promise<void>(resolve => { onMemoRequest = resolve })
  await page.route('http://memo-focus.test/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path === `/${memoChunk.fileName}`) await new Promise<void>(resolve => { releaseMemo = resolve; onMemoRequest!() })
    const script = scripts.get(path)
    await route.fulfill(script !== undefined ? { contentType: 'text/javascript', body: script }
      : { contentType: 'text/html', body: `<html><body><div id="root"></div><script type="module" src="/${entry.fileName}"></script></body></html>` })
  })
  await page.goto('http://memo-focus.test/')
  const existing = page.getByRole('textbox', { name: 'Existing editor' })
  await existing.focus()
  await existing.press('Control+m')
  await memoRequested
  await page.getByRole('status').waitFor({ state: 'attached' })
  await existing.evaluate(el => new Promise<void>(resolve => el.ownerDocument.defaultView!.requestAnimationFrame(() => el.ownerDocument.defaultView!.requestAnimationFrame(() => resolve()))))
  assert.equal(await existing.evaluate(el => el === el.ownerDocument.activeElement), true, 'the pre-download focus attempt has finished while the memo is still absent')
  assert.ok(releaseMemo)
  releaseMemo()
  const region = page.getByRole('region', { name: '메모', exact: true })
  await region.waitFor()
  await region.evaluate(el => new Promise<void>(resolve => el.ownerDocument.defaultView!.requestAnimationFrame(() => resolve())))
  assert.equal(await region.evaluate(el => el === el.ownerDocument.activeElement), true, 'module completion moves focus into the memo panel')
  assert.equal(await region.locator('.tiptap').evaluate(el => el === el.ownerDocument.activeElement), false, 'opening a memo does not force focus into its text input')
  await page.keyboard.type('unrelated keystrokes')
  assert.equal(await existing.inputValue(), 'Keep this text', 'keystrokes cannot modify the previously focused editor')
  const loading = region.getByRole('status', { name: '불러오는 중…', exact: true })
  await loading.waitFor({ state: 'attached' })
  assert.equal(await loading.innerText(), '', 'initial connection uses only the loading indicator')
  assert.equal(await loading.locator('.mew-loading-dots').count(), 1)
  assert.equal(await region.locator('.tiptap').getAttribute('contenteditable'), 'false', 'the memo remains read-only until connected')
  await page.getByRole('button', { name: 'Connect memo', exact: true }).click()
  await loading.waitFor({ state: 'detached' })
  await region.locator('.tiptap[contenteditable=true]').fill('Keep this memo')
  await page.getByRole('button', { name: 'Recover memo', exact: true }).click()
  await loading.waitFor({ state: 'attached' })
  assert.equal(await loading.innerText(), '', 'automatic recovery does not ask the user to reconnect')
  assert.equal(await region.locator('.tiptap').getAttribute('contenteditable'), 'false')
  assert.equal(await region.locator('.tiptap').innerText(), 'Keep this memo', 'recovery preserves the visible memo')
  await page.getByRole('button', { name: 'Connect memo', exact: true }).click()
  await loading.waitFor({ state: 'detached' })
  assert.equal(await region.locator('.tiptap').innerText(), 'Keep this memo')
  await region.getByRole('button', { name: '닫기', exact: true }).click()
  await region.waitFor({ state: 'hidden' })
  assert.equal(await existing.evaluate(el => el === el.ownerDocument.activeElement), true)
  const other = page.getByRole('textbox', { name: 'Other editor' })
  await other.focus()
  await page.getByRole('button', { name: 'Open memo', exact: true }).click()
  await region.waitFor()
  await region.evaluate(el => new Promise<void>(resolve => el.ownerDocument.defaultView!.requestAnimationFrame(() => resolve())))
  assert.equal(await region.evaluate(el => el === el.ownerDocument.activeElement), true)
  await region.getByRole('button', { name: '닫기', exact: true }).click()
  await region.waitFor({ state: 'hidden' })
  assert.equal(await other.evaluate(el => el === el.ownerDocument.activeElement), true, 'a reopened memo restores the current opener instead of the first editor')
  assert.deepEqual(errors, [])
})
