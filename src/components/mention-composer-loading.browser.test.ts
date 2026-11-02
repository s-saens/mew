import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'rolldown'
import { chromium } from 'playwright-core'
import { domBrowserExecutable } from '../../server/browser-dom-executable.ts'

test('native mentions avoid the composer engine and delayed rich input preserves the latest draft and focus', { skip: !domBrowserExecutable(), timeout: 30_000 }, async () => {
  const source = `
import React from ${JSON.stringify(import.meta.resolve('react'))};
import {createRoot} from ${JSON.stringify(import.meta.resolve('react-dom/client'))};
import {MentionTextarea} from ${JSON.stringify(new URL('./MentionTextarea.tsx', import.meta.url).pathname)};
function Fixture(){
  const [rich,setRich]=React.useState(false),[value,setValue]=React.useState('original draft');
  const input=React.useRef(null);window.input=input;
  return <><button onClick={()=>setRich(true)}>Rich</button><button onClick={()=>setRich(false)}>Native</button>
    <button onClick={()=>setValue('latest controlled draft')}>Update</button>
    <div style={{display:'flex',height:120}}><MentionTextarea value={value} onChange={setValue} options={[]} imageCapable={rich} autoFocus inputRef={input} submitHint="Draft" /></div>
    <output>{value}</output></>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);`
  const result = await build({
    input: 'virtual:mention-loading.tsx', write: false, platform: 'browser', output: { format: 'esm' },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('production') } },
    onwarn(warning, warn) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning) },
    plugins: [{ name: 'mention-loading', resolveId(id) {
      if (id === 'virtual:mention-loading.tsx') return id
      if (id.endsWith('.css')) return 'virtual:style'
    }, load(id) {
      if (id === 'virtual:mention-loading.tsx') return source
      if (id === 'virtual:style') return ''
    } }],
  })
  const chunks = result.output.filter(item => item.type === 'chunk')
  const entry = chunks.find(item => item.isEntry)!
  const composer = chunks.find(item => Object.keys(item.modules).includes(new URL('./agent-composer-input.tsx', import.meta.url).pathname))!
  assert.notEqual(entry.fileName, composer.fileName)
  let release!: () => void, requested!: () => void
  const held = new Promise<void>(resolve => { release = resolve })
  const requestedComposer = new Promise<void>(resolve => { requested = resolve })
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 800 } })
    page.setDefaultTimeout(5000)
    const requests: string[] = [], errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('http://mention-loading.test/**', async route => {
      const pathname = new URL(route.request().url()).pathname
      requests.push(pathname)
      const chunk = chunks.find(item => pathname === `/${item.fileName}`)
      if (chunk) {
        if (chunk === composer) { requested(); await held }
        return route.fulfill({ contentType: 'text/javascript', body: chunk.code })
      }
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><div id="root"></div><script type="module" src="/${entry.fileName}"></script>` })
    })
    await page.goto('http://mention-loading.test/')
    await page.locator('textarea').fill('native draft')
    assert.equal(requests.includes(`/${composer.fileName}`), false, 'ordinary mention fields never request the image composer')
    await page.getByRole('button', { name: 'Rich', exact: true }).click()
    await requestedComposer
    assert.equal(await page.locator('.cm-content').count(), 0)
    assert.equal(await page.locator('[role="status"][aria-busy="true"]').getAttribute('aria-busy'), 'true')
    await page.getByRole('button', { name: 'Update', exact: true }).click()
    await page.getByRole('button', { name: 'Native', exact: true }).click()
    release()
    await page.waitForFunction('window.input.current?.value === "latest controlled draft"')
    assert.equal(await page.locator('.cm-content').count(), 0, 'a canceled rich import cannot replace the current native input')
    await page.getByRole('button', { name: 'Rich', exact: true }).click()
    const editor = page.locator('.cm-content[contenteditable=true]')
    await editor.waitFor()
    assert.equal(await editor.innerText(), 'latest controlled draft')
    assert.equal(await editor.evaluate(element => element.contains(element.ownerDocument.activeElement)), true, 'autofocus runs when the actual editing host mounts')
    await page.evaluate('window.input.current.setSelectionRange(window.input.current.value.length, window.input.current.value.length)')
    await page.keyboard.type('!')
    await page.waitForFunction('document.querySelector("output").textContent === "latest controlled draft!"')
    await page.keyboard.press('Control+z')
    await page.waitForFunction('document.querySelector("output").textContent === "latest controlled draft"')
    assert.deepEqual(errors, [])
    await page.close()
  } finally { release(); await browser.close() }
})
