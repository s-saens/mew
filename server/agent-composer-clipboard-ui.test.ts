import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { build } from 'rolldown'
import { chromium, type Page } from 'playwright-core'
import { domBrowserExecutable } from './browser-dom-executable.ts'

const root = path.resolve(import.meta.dirname, '..')
async function rawDocument(page: Page): Promise<string> {
  return page.evaluate('window.composerFixture.raw()')
}
async function reset(page: Page, text: string): Promise<void> {
  await page.evaluate(`window.composerFixture.reset(${JSON.stringify(text)})`)
  await page.getByRole('textbox').evaluate(element => new Promise<void>(resolve =>
    element.ownerDocument.defaultView!.requestAnimationFrame(() => resolve())))
}
async function select(page: Page, from: number): Promise<void> {
  await page.evaluate(`window.composerFixture.select(${from})`)
}

test('agent composer accepts keyboard clipboard images and plain text', { skip: !domBrowserExecutable(), timeout: 30_000 }, async t => {
  const source = `
import React from '${root}/node_modules/react/index.js';
import {createRoot} from '${root}/node_modules/react-dom/client.js';
import {AgentComposerInput} from '${root}/src/components/agent-composer-input.tsx';
window.pastedImages=[];
function Fixture(){
  const [value,setValue]=React.useState('');
  const input=React.useRef(null);
  window.composerFixture={
    raw:()=>input.current.value,
    reset:text=>setValue(text),
    select:from=>{input.current.focus();input.current.setSelectionRange(from,from)},
  };
  return <AgentComposerInput value={value} onChange={next=>setValue(next)} onKeyDown={()=>{}}
    inputRef={input} label="Clipboard input" style={{height:160}}
    onImagesPasted={files=>window.pastedImages.push(files.map(file=>({name:file.name,type:file.type})))}/>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);`
  const bundle = await build({
    input: 'virtual:clipboard.tsx', write: false, platform: 'browser',
    output: { format: 'iife', codeSplitting: false },
    onwarn(warning, warn) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning) },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
    plugins: [{
      name: 'clipboard-fixture',
      resolveId(id) { if (id === 'virtual:clipboard.tsx') return id; if (id.endsWith('.css')) return 'virtual:css' },
      load(id) { if (id === 'virtual:clipboard.tsx') return source; if (id === 'virtual:css') return '' },
    }],
  })
  const chunk = bundle.output.find(item => item.type === 'chunk')
  assert.ok(chunk)
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  t.after(() => browser.close())
  for (const width of [1100, 390]) for (const dark of [true, false]) {
    await t.test(`${width}px ${dark ? 'dark' : 'light'}`, async matrix => {
      const page = await browser.newPage({ viewport: { width, height: 844 }, hasTouch: width === 390 })
      matrix.after(() => page.close())
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('http://mew-clipboard.test/**', route => route.fulfill(new URL(route.request().url()).pathname === '/app.js'
        ? { contentType: 'text/javascript', body: chunk.code }
        : { contentType: 'text/html', body: `<!doctype html><html class="${dark ? 'dark' : ''}"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="background:${dark ? '#161616' : '#fff'};color:${dark ? '#eee' : '#111'}"><div id="root"></div><script src="/app.js"></script></body></html>` }))
      await page.goto('http://mew-clipboard.test/')
      const input = page.getByRole('textbox', { name: 'Clipboard input', exact: true })
      await input.waitFor()
      await matrix.test('keyboard image input is rich-editable and delivered once without replacing text', async () => {
        await reset(page, 'before after')
        await select(page, 7)
        assert.equal(await input.evaluate(element => element.ownerDocument.defaultView!.getComputedStyle(element).getPropertyValue('-webkit-user-modify')), 'read-write', 'the OS keyboard must see an image-capable editor, not plaintext-only')
        assert.equal(await input.evaluate(element => element.ownerDocument.queryCommandEnabled('insertImage')), true, 'the focused browser editing host permits image insertion')
        for (const eventType of ['paste', 'beforeinput']) {
          const previous = await page.evaluate<number>('window.pastedImages.length')
          const prevented = await input.evaluate((element, eventType) => {
            const browserWindow = element.ownerDocument.defaultView!
            const data = new browserWindow.DataTransfer()
            data.items.add(new browserWindow.File(['image'], 'keyboard.png', { type: 'image/png' }))
            const event = eventType === 'paste'
              ? new browserWindow.ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
              : new browserWindow.InputEvent('beforeinput', { inputType: 'insertFromPaste', dataTransfer: data, bubbles: true, cancelable: true })
            element.dispatchEvent(event)
            return event.defaultPrevented
          }, eventType)
          assert.equal(prevented, true)
          assert.equal(await page.evaluate<number>('window.pastedImages.length'), previous + 1)
          assert.deepEqual(await page.evaluate('window.pastedImages.at(-1)'), [{ name: 'keyboard.png', type: 'image/png' }])
          assert.equal(await rawDocument(page), 'before after')
        }
        await input.evaluate(element => {
          const browserWindow = element.ownerDocument.defaultView!
          const data = new browserWindow.DataTransfer()
          data.setData('text/html', '<b>plain</b>')
          data.setData('text/plain', 'plain')
          element.dispatchEvent(new browserWindow.ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
        })
        assert.equal(await rawDocument(page), 'before plainafter', 'formatted text is still pasted as plain text at the caret')
        assert.equal(await input.locator('b,strong,img').count(), 0)
        assert.deepEqual(errors, [])
      })

    })
  }
})
