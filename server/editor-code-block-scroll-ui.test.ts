import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { chromium } from 'playwright-core'
import { domBrowserExecutable } from './browser-dom-executable.ts'

const repo = new URL('..', import.meta.url).pathname

test('Hotview code blocks preserve lines and scroll internally on desktop/mobile', { skip: !domBrowserExecutable(), timeout: 60_000 }, async t => {
  const code = `npm run dev     # ${'Private development UI, port 4999; '.repeat(8)}\n\t${'unbroken_identifier_'.repeat(30)}`
  const prose = 'Ordinary document text should still wrap at the editor width. '.repeat(8)
  const markdown = `${prose}\n\n\`\`\`bash\n${code}\n\`\`\`\n\nInline \`npm ci\` remains inline.\n`
  const source = `import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {Editor} from '${repo}packages/editor/src/Editor.tsx';
    function Fixture(){const [readonly,setReadonly]=React.useState(false);
      return <><button onClick={()=>setReadonly(v=>!v)}>Readonly</button>
        <Editor value={${JSON.stringify(markdown)}} onChange={()=>{}} readOnly={readonly}
          api={{db:{},fetchFile:async()=>({content:''})}} path="code.md"/></>}
    createRoot(document.getElementById('root')).render(<Fixture/>);`
  const candidates = [source], styles: string[] = []
  const bundle = await build({ input: 'virtual:code-scroll.tsx', write: false, platform: 'browser',
    onLog(level, log, handler) { if (log.code !== 'MODULE_LEVEL_DIRECTIVE') handler(level, log) },
    output: { format: 'iife' }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
    plugins: [{ name: 'code-scroll-fixture', resolveId(id) { if (id === 'virtual:code-scroll.tsx') return id },
      load(id) {
        if (id === 'virtual:code-scroll.tsx') return source
        if (id.endsWith('.tsx')) candidates.push(fs.readFileSync(id, 'utf8'))
        if (id.endsWith('.css')) { styles.push(fs.readFileSync(id, 'utf8')); return { code: '', moduleType: 'js' } }
      },
    }],
  })
  const chunk = bundle.output.find(item => item.type === 'chunk')!
  const compiler = await compile(fs.readFileSync(`${repo}src/index.css`, 'utf8'), { base: `${repo}src`, onDependency() {} })
  const css = compiler.build([...new Set(candidates.join('\n').match(/[A-Za-z0-9_@!:/.[\]()%,-]+/g))]) + styles.join('\n')
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  t.after(() => browser.close())
  for (const width of [1100, 390]) {
    for (const theme of ['dark', 'light']) {
      const page = await browser.newPage({ viewport: { width, height: 800 }, hasTouch: width === 390 })
      page.setDefaultTimeout(5000)
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('http://mew-code-scroll.test/**', route => {
        const url = new URL(route.request().url())
        if (url.pathname.startsWith('/api/')) return route.fulfill({ json: [] })
        return route.fulfill(url.pathname === '/app.js'
          ? { contentType: 'text/javascript', body: chunk.code }
          : { contentType: 'text/html', body: `<!doctype html><html class="${theme}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script src="/app.js"></script></html>` })
      })
      await page.goto('http://mew-code-scroll.test/')
      const pre = page.locator('.tiptap pre')
      await pre.waitFor()
      const assertScroll = async () => {
        assert.equal(await pre.locator('code').textContent(), code)
        const geometry = await pre.evaluate(el => {
          const win = el.ownerDocument.defaultView!
          const code = el.querySelector('code')!
          const range = el.ownerDocument.createRange()
          range.selectNodeContents(code)
          const lines = new Set([...range.getClientRects()].filter(rect => rect.width > 0).map(rect => rect.top))
          const root = el.closest('.editor-root')!
          return { whiteSpace: win.getComputedStyle(el).whiteSpace, lines: lines.size,
            overflow: el.scrollWidth > el.clientWidth, pageOverflow: root.scrollWidth - root.clientWidth }
        })
        assert.equal(geometry.whiteSpace, 'pre')
        assert.equal(geometry.lines, 2)
        assert.equal(geometry.overflow, true)
        assert.ok(geometry.pageOverflow <= 1)
        const copy = page.locator('.code-block-copy')
        const before = await copy.boundingBox()
        await pre.evaluate(el => { el.scrollLeft = 150 })
        assert.ok(await pre.evaluate(el => el.scrollLeft) > 0)
        assert.deepEqual(await copy.boundingBox(), before)
      }
      await assertScroll()
      assert.ok(await page.locator('.tiptap p').first().evaluate(el => {
        const range = el.ownerDocument.createRange()
        range.selectNodeContents(el)
        return range.getClientRects().length
      }) > 1)
      await pre.evaluate(el => { el.scrollLeft = 0 })
      await page.screenshot({ path: `/tmp/mew-code-scroll-${width}-${theme}.png` })
      await page.getByRole('button', { name: 'Readonly', exact: true }).click()
      await assertScroll()
      assert.deepEqual(errors, [])
      await page.close()
    }
  }
})
