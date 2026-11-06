import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { connectTestBrowser } from './test-browser.ts'

const root = path.resolve(import.meta.dirname, '..')

test('execution toggles leave closed mobile keyboards closed and preserve existing editing focus', { timeout: 60_000 }, async t => {
  const source = `import React, {useState} from '${root}/node_modules/react/index.js';
import {createRoot} from '${root}/node_modules/react-dom/client.js';
import {AgentExecutionToggles} from '${root}/src/components/agent-execution-toggles.tsx';
import {I18nProvider} from '${root}/src/i18n.tsx';
localStorage.setItem('mew:locale','ko');
window.changes=[];window.inputFocusRequests=[];
const nativeFocus=HTMLElement.prototype.focus;
HTMLElement.prototype.focus=function(...args){
  if(this.matches('textarea,[contenteditable="true"]'))window.inputFocusRequests.push(this.getAttribute('data-test-input'));
  return nativeFocus.apply(this,args);
};
function Fixture(){
  const [value,setValue]=useState({build:true,deploy:false});
  return <I18nProvider><div className="flex flex-col gap-2 p-2">
    <textarea data-test-input="textarea" aria-label="Plain input" />
    <div contentEditable suppressContentEditableWarning data-test-input="contenteditable" aria-label="Rich input" role="textbox" className="min-h-8">Draft</div>
    <AgentExecutionToggles value={value} onChange={next=>{window.changes.push(next);setValue(next)}} />
  </div></I18nProvider>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);`
  const bundle = await build({
    input: 'virtual:execution-keyboard.tsx', write: false, platform: 'browser',
    output: { format: 'iife' },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
    onwarn(warning, warn) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning) },
    plugins: [{
      name: 'execution-keyboard-fixture',
      resolveId(id) {
        if (id === 'virtual:execution-keyboard.tsx') return id
        if (id.endsWith('.css')) return 'virtual:style'
      },
      load(id) {
        if (id === 'virtual:execution-keyboard.tsx') return source
        if (id === 'virtual:style') return ''
      },
    }],
  })
  const chunk = bundle.output.find(item => item.type === 'chunk')!
  const compiler = await compile(await fs.readFile(`${root}/src/index.css`, 'utf8'), { base: `${root}/src`, onDependency() {} })
  const content = (await Promise.all(['src/components/agent-execution-toggles.tsx', 'packages/ui/src/Toast.tsx'].map(file => fs.readFile(`${root}/${file}`, 'utf8')))).join('\n')
  const css = compiler.build([...new Set((source + content).match(/[A-Za-z0-9_@!:/.[\]()%,-]+/g))])
  const browser = await connectTestBrowser()
  t.after(() => browser.close())

  for (const width of [1100, 390, 320]) for (const dark of [true, false]) {
    await t.test(`${width}px ${dark ? 'dark' : 'light'}`, async scene => {
      const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: width < 768 })
      scene.after(() => context.close())
      const page = await context.newPage()
      page.setDefaultTimeout(5000)
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('http://mew-execution-keyboard.test/**', route => new URL(route.request().url()).pathname === '/app.js'
        ? route.fulfill({ contentType: 'text/javascript', body: chunk.code })
        : route.fulfill({ contentType: 'text/html', body: `<!doctype html><html class="${dark ? 'dark' : ''}" lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}html,body{margin:0}</style><div id="root"></div><script src="/app.js"></script></html>` }))
      await page.goto('http://mew-execution-keyboard.test/')
      const buildButton = page.getByRole('button', { name: '빌드', exact: true })
      const deployButton = page.getByRole('button', { name: '배포', exact: true })
      await buildButton.waitFor()

      for (const kind of ['textarea', 'contenteditable']) {
        const input = page.locator(`[data-test-input="${kind}"]`)
        for (const button of [buildButton, deployButton]) {
          const activate = async (focused: boolean, description: string) => {
            const before = await button.getAttribute('aria-pressed')
            const changes = await page.evaluate<number>('window.changes.length')
            await page.evaluate('window.inputFocusRequests=[]')
            if (width < 768) await button.tap()
            else await button.click()
            assert.equal(await input.evaluate(element => element.ownerDocument.activeElement === element), focused, `${kind}: ${description}`)
            assert.equal(await button.getAttribute('aria-pressed'), before === 'true' ? 'false' : 'true', 'one activation toggles the selected option')
            assert.equal(await page.evaluate<number>('window.changes.length'), changes + 1, 'one touch or click produces exactly one change')
            assert.deepEqual(await page.evaluate('window.inputFocusRequests'), [], 'toggle must not request native editing focus')
          }

          await input.evaluate(element => element.blur())
          await activate(false, 'an unfocused input remains unfocused')
          await input.focus()
          await activate(width >= 768, 'a touch releases retained focus when the keyboard is closed; a mouse preserves it')

          if (width < 768) {
            await input.focus()
            await input.evaluate(element => {
              const win = element.ownerDocument.defaultView!
              Object.defineProperty(win.visualViewport!, 'height', { configurable: true, value: 440 })
              win.visualViewport!.dispatchEvent(new win.Event('resize'))
              return new Promise<void>(resolve => win.requestAnimationFrame(() => win.requestAnimationFrame(() => resolve())))
            })
            await activate(true, 'an already open keyboard keeps its editing focus')
            await input.evaluate(element => {
              const win = element.ownerDocument.defaultView!
              Reflect.deleteProperty(win.visualViewport!, 'height')
              win.visualViewport!.dispatchEvent(new win.Event('resize'))
              return new Promise<void>(resolve => win.requestAnimationFrame(() => win.requestAnimationFrame(() => resolve())))
            })
            await activate(false, 'closing the keyboard while retaining focus does not reopen it on the next touch')
          }
        }
      }

      for (const button of [buildButton, deployButton]) {
        const before = await button.getAttribute('aria-pressed')
        const changes = await page.evaluate<number>('window.changes.length')
        await button.focus()
        await button.press('Space')
        assert.equal(await button.getAttribute('aria-pressed'), before === 'true' ? 'false' : 'true')
        assert.equal(await page.evaluate<number>('window.changes.length'), changes + 1, 'keyboard activation remains available')
        assert.equal(await button.evaluate(element => element.ownerDocument.activeElement === element), true, 'keyboard activation retains button focus')
      }
      assert.deepEqual(errors, [])
    })
  }
})
