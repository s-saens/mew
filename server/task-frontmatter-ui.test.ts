import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { parse } from 'yaml'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { chromium } from 'playwright-core'
import { domBrowserExecutable } from './browser-dom-executable.ts'

test('untyped task selections render as tags and survive edits, clearing and document replacement', { skip: !domBrowserExecutable(), timeout: 45_000 }, async () => {
  const root = path.resolve(import.meta.dirname, '..')
  const initial = '---\ntitle: 기존 태스크\ntags:\n  - 기능 # preserve\n  - 검증\nassignees: "[\\"alice@example.test\\",\\"bob@example.test\\"]"\ndone: false\n---\n\nBody'
  const created = '---\ntitle: 새 태스크\ndone: false\ntags: [새태그]\nassignees:\n  - carol@example.test\n---\n\nNew body'
  const source = `
import React from ${JSON.stringify(import.meta.resolve('react'))};
import {createRoot} from ${JSON.stringify(import.meta.resolve('react-dom/client'))};
import {FrontmatterPanel} from ${JSON.stringify(path.join(root, 'packages/editor/src/editor/FrontmatterPanel.tsx'))};
import {splitFrontmatter,joinFrontmatter} from ${JSON.stringify(path.join(root, 'packages/editor/src/utils/frontmatter.ts'))};
function Fixture(){
 const [value,setValue]=React.useState(${JSON.stringify(initial)}), [readOnly,setReadOnly]=React.useState(false);
 const {frontmatter}=splitFrontmatter(value); window.saved=value;
 return <><button onClick={()=>setValue(${JSON.stringify(created)})}>New task</button>
 <button onClick={()=>setValue('')}>Remove task</button><button onClick={()=>setReadOnly(r=>!r)}>Read-only</button>
 {frontmatter && <div className="editor-root"><FrontmatterPanel data={frontmatter} docPath="docs/tasks/task.md" readOnly={readOnly}
 onChange={next=>setValue(joinFrontmatter(next,'Body'))}/></div>}</>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);`
  const candidates = [source]
  const bundle = await build({ input: 'virtual:task-frontmatter.tsx', write: false, platform: 'browser', output: { format: 'esm' },
    checks: { moduleLevelDirective: false },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } }, plugins: [{
      name: 'task-frontmatter-fixture', resolveId(id) { if (id === 'virtual:task-frontmatter.tsx') return id },
      async load(id) {
        if (id === 'virtual:task-frontmatter.tsx') return source
        if (id.endsWith('.css')) return { code: '', moduleType: 'js' }
        if (id.endsWith('.tsx')) candidates.push(await fs.readFile(id, 'utf8'))
      },
    }] })
  const compiler = await compile(await fs.readFile(path.join(root, 'src/index.css'), 'utf8'), { base: path.join(root, 'src'), onDependency() {} })
  const css = compiler.build([...new Set(candidates.join('\n').match(/[A-Za-z0-9_@!:/.[\]()%,-]+/g))])
  const chunk = bundle.output.find(item => item.type === 'chunk')!
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  try {
    for (const width of [1280, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 844 }, hasTouch: width < 500, isMobile: width < 500 })
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('http://mew-task-properties.test/**', route => route.fulfill(route.request().url().endsWith('/app.js')
        ? { contentType: 'text/javascript', body: chunk.code }
        : { contentType: 'text/html', body: `<!doctype html><html class="dark"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script type="module" src="/app.js"></script></html>` }))
      await page.goto('http://mew-task-properties.test/')
      const tags = page.getByRole('button', { name: 'tags', exact: true })
      const assignees = page.getByRole('button', { name: 'assignees', exact: true })
      await tags.waitFor()
      assert.equal(await tags.textContent(), '기능검증')
      assert.equal(await assignees.textContent(), 'alice@example.testbob@example.test')
      assert.equal(await page.getByRole('textbox', { name: 'tags', exact: true }).count(), 0)
      assert.equal(await page.evaluate('window.saved'), initial, 'viewing does not migrate or rewrite existing files')
      await tags.click()
      const choices = page.getByRole('dialog', { name: 'tags', exact: true })
      await choices.getByRole('option', { name: '기능', exact: true }).click()
      assert.equal(await choices.getByRole('option', { name: '검증', exact: true }).getAttribute('aria-selected'), 'true')
      await page.keyboard.press('Escape')
      assert.equal(await tags.textContent(), '검증')
      await assignees.click()
      const people = page.getByRole('dialog', { name: 'assignees', exact: true })
      await people.getByRole('option', { name: 'alice@example.test', exact: true }).click()
      await people.getByRole('option', { name: 'bob@example.test', exact: true }).click()
      await page.keyboard.press('Escape')
      const saved = parse((await page.evaluate('window.saved') as string).split('---')[1])
      assert.deepEqual(JSON.parse(saved.tags), ['검증'])
      assert.deepEqual(JSON.parse(saved.assignees), [])
      await page.getByRole('button', { name: 'New task', exact: true }).click()
      assert.equal(await tags.textContent(), '새태그')
      assert.equal(await assignees.textContent(), 'carol@example.test')
      await page.getByRole('button', { name: 'Read-only', exact: true }).click()
      assert.equal(await tags.isDisabled(), true)
      assert.equal(await assignees.isDisabled(), true)
      for (const theme of ['dark', 'light']) {
        await page.locator('html').evaluate((el, theme) => { el.className = theme }, theme)
        assert.equal(await page.locator('.frontmatter-panel').evaluate(el => el.scrollWidth <= el.clientWidth), true)
      }
      await page.getByRole('button', { name: 'Remove task', exact: true }).click()
      assert.equal(await page.locator('.frontmatter-panel').count(), 0)
      assert.deepEqual(errors, [])
      await page.close()
    }
  } finally { await browser.close() }
})
